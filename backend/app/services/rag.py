from dataclasses import dataclass

from bson import ObjectId

from app.config import settings
from app.db.mongo import VECTOR_INDEX_NAME, folders, paper_chunks, papers
from app.services.ingestion import embed_texts

SYSTEM_PROMPT = """You are a research assistant helping a user understand academic papers.
Answer ONLY using the provided source excerpts below. Every factual claim must cite its
source using the bracketed label shown with the excerpt, e.g. [Paper 1, p.3]. If the
excerpts do not contain enough information to answer, say so explicitly rather than
guessing or using outside knowledge."""


@dataclass
class SourcePaper:
    id: str
    label: str  # "Paper 1", "Paper 2", ...
    title: str


async def resolve_source_paper_ids(source_folder_ids: list[str], source_paper_ids: list[str]) -> list[str]:
    """Resolve a chat's flexible sourcing (whole folders + individual papers) into the
    effective, de-duplicated list of paper ids, evaluated live (not a stored snapshot).
    """
    resolved: list[str] = []
    seen: set[str] = set()

    if source_folder_ids:
        cursor = papers.find(
            {"folderId": {"$in": [ObjectId(fid) for fid in source_folder_ids]}}, {"_id": 1}
        )
        async for doc in cursor:
            pid = str(doc["_id"])
            if pid not in seen:
                seen.add(pid)
                resolved.append(pid)

    for pid in source_paper_ids:
        if pid not in seen:
            seen.add(pid)
            resolved.append(pid)

    return resolved


async def resolve_folder_names(folder_ids: list[str]) -> list[dict]:
    if not folder_ids:
        return []
    docs = await folders.find(
        {"_id": {"$in": [ObjectId(fid) for fid in folder_ids]}}, {"name": 1}
    ).to_list(length=len(folder_ids))
    return [{"id": str(d["_id"]), "name": d["name"]} for d in docs]


async def _paper_full_text(paper_id: ObjectId) -> str:
    cursor = paper_chunks.find({"paperId": paper_id}).sort("chunkIndex", 1)
    texts = [doc["text"] async for doc in cursor]
    return "\n\n".join(texts)


async def _paper_vector_search(paper_id: ObjectId, query_embedding: list[float], top_k: int) -> list[dict]:
    pipeline = [
        {
            "$vectorSearch": {
                "index": VECTOR_INDEX_NAME,
                "path": "embedding",
                "queryVector": query_embedding,
                "filter": {"paperId": paper_id},
                "limit": top_k,
                "numCandidates": max(top_k * 10, 50),
            }
        },
        {"$project": {"text": 1, "startPage": 1, "endPage": 1, "chunkIndex": 1}},
    ]
    return [doc async for doc in paper_chunks.aggregate(pipeline)]


async def _global_vector_search(paper_ids: list[ObjectId], query_embedding: list[float], top_n: int) -> list[dict]:
    pipeline = [
        {
            "$vectorSearch": {
                "index": VECTOR_INDEX_NAME,
                "path": "embedding",
                "queryVector": query_embedding,
                "filter": {"paperId": {"$in": paper_ids}},
                "limit": top_n,
                "numCandidates": max(top_n * 10, 200),
            }
        },
        {"$project": {"text": 1, "startPage": 1, "endPage": 1, "chunkIndex": 1, "paperId": 1}},
    ]
    return [doc async for doc in paper_chunks.aggregate(pipeline)]


def _page_label(chunk: dict) -> str:
    return (
        f"p.{chunk['startPage']}"
        if chunk["startPage"] == chunk["endPage"]
        else f"pp.{chunk['startPage']}-{chunk['endPage']}"
    )


async def build_context(
    source_folder_ids: list[str], source_paper_ids: list[str], query: str
) -> tuple[str, list[SourcePaper]]:
    """Retrieve grounding context for a query across a chat's flexible sources (whole
    folders + individual papers, resolved live).

    - Small resolved paper counts (<= settings.per_paper_retrieval_max_papers): per-paper
      top-k retrieval (or full text for short papers), so every source paper is guaranteed
      to contribute — matters for explicit cross-paper comparison questions.
    - Large resolved paper counts (e.g. a big folder): a single global vector search
      across all their chunks combined, returning the overall top-N by relevance —
      standard large-scale RAG behavior, avoids stuffing 100+ chunks into one prompt.
    """
    resolved_ids = await resolve_source_paper_ids(source_folder_ids, source_paper_ids)

    paper_docs = await papers.find({"_id": {"$in": [ObjectId(pid) for pid in resolved_ids]}}).to_list(
        length=len(resolved_ids)
    )
    papers_by_id = {str(p["_id"]): p for p in paper_docs}

    sources = [
        SourcePaper(id=pid, label=f"Paper {i + 1}", title=papers_by_id[pid].get("title", "Untitled"))
        for i, pid in enumerate(resolved_ids)
        if pid in papers_by_id
    ]

    if not sources:
        return "", sources

    blocks: list[str] = []

    if len(sources) <= settings.per_paper_retrieval_max_papers:
        within_paper_count_budget = len(sources) <= settings.full_text_fallback_max_papers
        use_full_text_for = {
            s.id: within_paper_count_budget
            and papers_by_id[s.id].get("totalTokens", float("inf"))
            <= settings.full_text_fallback_token_threshold
            for s in sources
        }

        query_embedding = None
        if not all(use_full_text_for.values()):
            (query_embedding,) = await embed_texts([query])

        for source in sources:
            paper_oid = ObjectId(source.id)
            if use_full_text_for[source.id]:
                text = await _paper_full_text(paper_oid)
                blocks.append(f"[{source.label} - {source.title}, full text]:\n{text}")
            else:
                chunks = await _paper_vector_search(paper_oid, query_embedding, settings.top_k_per_paper)
                for chunk in chunks:
                    blocks.append(f"[{source.label}, {_page_label(chunk)}]:\n{chunk['text']}")
    else:
        (query_embedding,) = await embed_texts([query])
        label_by_id = {s.id: s.label for s in sources}
        chunks = await _global_vector_search(
            [ObjectId(pid) for pid in resolved_ids], query_embedding, settings.global_retrieval_top_n
        )
        for chunk in chunks:
            label = label_by_id.get(str(chunk["paperId"]), "Unknown source")
            blocks.append(f"[{label}, {_page_label(chunk)}]:\n{chunk['text']}")

    return "\n\n---\n\n".join(blocks), sources


def build_messages(
    context: str,
    sources: list[SourcePaper],
    history: list[dict],
    user_message: str,
) -> list[dict]:
    source_list = "\n".join(f"- {s.label}: {s.title}" for s in sources)
    system_content = (
        f"{SYSTEM_PROMPT}\n\nSources in this conversation:\n{source_list}\n\n"
        f"Relevant excerpts:\n\n{context}"
    )
    messages = [{"role": "system", "content": system_content}]
    messages.extend({"role": m["role"], "content": m["content"]} for m in history)
    messages.append({"role": "user", "content": user_message})
    return messages
