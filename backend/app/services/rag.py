from dataclasses import dataclass

from bson import ObjectId

from app.config import settings
from app.db.mongo import VECTOR_INDEX_NAME, paper_chunks, papers
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


async def build_context(source_paper_ids: list[str], query: str) -> tuple[str, list[SourcePaper]]:
    """Retrieve grounding context for a query across one or more source papers.

    Each paper gets its own top-k retrieval (or full text, if short enough and few
    enough papers are selected) so every source has a chance to contribute to a
    cross-document answer rather than one paper dominating a global top-k.
    """
    paper_docs = await papers.find({"_id": {"$in": [ObjectId(pid) for pid in source_paper_ids]}}).to_list(
        length=len(source_paper_ids)
    )
    papers_by_id = {str(p["_id"]): p for p in paper_docs}

    sources = [
        SourcePaper(id=pid, label=f"Paper {i + 1}", title=papers_by_id[pid].get("title", "Untitled"))
        for i, pid in enumerate(source_paper_ids)
        if pid in papers_by_id
    ]

    # Per paper: use full text if the paper set is small enough and this paper is
    # short enough to fit comfortably in context; otherwise fall back to retrieval.
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

    blocks: list[str] = []
    for source in sources:
        paper_oid = ObjectId(source.id)

        if use_full_text_for[source.id]:
            text = await _paper_full_text(paper_oid)
            blocks.append(f"[{source.label} - {source.title}, full text]:\n{text}")
        else:
            chunks = await _paper_vector_search(paper_oid, query_embedding, settings.top_k_per_paper)
            for chunk in chunks:
                page_label = (
                    f"p.{chunk['startPage']}"
                    if chunk["startPage"] == chunk["endPage"]
                    else f"pp.{chunk['startPage']}-{chunk['endPage']}"
                )
                blocks.append(f"[{source.label}, {page_label}]:\n{chunk['text']}")

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
