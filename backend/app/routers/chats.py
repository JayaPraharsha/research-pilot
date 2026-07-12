import json

from bson import ObjectId
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.config import settings
from app.db.mongo import chats, folders, papers
from app.models.chat import (
    AddSourceRequest,
    ChatCreate,
    ChatRename,
    ChatType,
    DeepResearchMode,
    DeepResearchScope,
    MessageCreate,
    SearchScope,
)
from app.models.common import serialize_doc, utcnow
from app.services.deep_research import run_openai_deep_research
from app.services.deep_research import run_pipeline as run_deep_research_pipeline
from app.services.rag import build_context, build_messages, run_library_search
from app.services.search_providers import run_search
from app.services.search_summary import build_search_summary_messages
from app.services.streaming import stream_chat_completion

router = APIRouter()


async def _paper_titles(paper_ids: list[ObjectId]) -> list[dict]:
    if not paper_ids:
        return []
    docs = await papers.find({"_id": {"$in": paper_ids}}, {"title": 1}).to_list(length=len(paper_ids))
    by_id = {str(d["_id"]): d["title"] for d in docs}
    return [{"id": str(pid), "title": by_id.get(str(pid), "Untitled")} for pid in paper_ids]


async def _folder_summaries(folder_ids: list[ObjectId]) -> list[dict]:
    if not folder_ids:
        return []
    docs = await folders.find({"_id": {"$in": folder_ids}}, {"name": 1}).to_list(length=len(folder_ids))
    result = []
    for d in docs:
        count = await papers.count_documents({"folderId": d["_id"]})
        result.append({"id": str(d["_id"]), "name": d["name"], "paperCount": count})
    return result


async def _sources_payload(chat_doc: dict) -> dict:
    return {
        "folders": await _folder_summaries(chat_doc.get("sourceFolderIds", [])),
        "papers": await _paper_titles(chat_doc.get("sourcePaperIds", [])),
    }


@router.post("", status_code=201)
async def create_chat(body: ChatCreate):
    if body.type == ChatType.chat_with_pdf and not body.sourceFolderIds and not body.sourcePaperIds:
        raise HTTPException(400, "At least one source folder or paper is required")
    if body.type == ChatType.deep_research:
        if body.deepResearchScope == DeepResearchScope.folder and not body.sourceFolderIds:
            raise HTTPException(400, "A folder is required for folder-scoped Deep Research")

    source_folder_oids = [ObjectId(fid) for fid in body.sourceFolderIds]
    source_paper_oids = [ObjectId(pid) for pid in body.sourcePaperIds]

    title = body.title
    if not title:
        if body.type == ChatType.chat_with_pdf:
            papers_preview = await _paper_titles(source_paper_oids or source_folder_oids[:1])
            title = papers_preview[0]["title"] if papers_preview else "New Chat"
        else:
            title = "New Chat"

    now = utcnow()
    doc = {
        "type": body.type.value,
        "title": title,
        "sourceFolderIds": source_folder_oids,
        "sourcePaperIds": source_paper_oids,
        "deepResearchScope": body.deepResearchScope.value if body.deepResearchScope else None,
        "deepResearchMode": body.deepResearchMode.value if body.deepResearchMode else None,
        "searchScope": body.searchScope.value if body.searchScope else None,
        "deepResearchStages": None,
        "messages": [],
        "createdAt": now,
        "updatedAt": now,
    }
    result = await chats.insert_one(doc)
    doc["_id"] = result.inserted_id
    out = serialize_doc(doc)
    out["sources"] = await _sources_payload(doc)
    return out


@router.get("")
async def list_chats(type: str | None = None):
    query = {"type": type} if type else {}
    result = []
    async for c in chats.find(query).sort("updatedAt", -1):
        out = serialize_doc(c)
        out["sources"] = await _sources_payload(c)
        out.pop("messages", None)
        result.append(out)
    return result


@router.get("/{chat_id}")
async def get_chat(chat_id: str):
    doc = await chats.find_one({"_id": ObjectId(chat_id)})
    if not doc:
        raise HTTPException(404, "Chat not found")
    out = serialize_doc(doc)
    out["sources"] = await _sources_payload(doc)
    return out


@router.patch("/{chat_id}")
async def rename_chat(chat_id: str, body: ChatRename):
    await chats.update_one({"_id": ObjectId(chat_id)}, {"$set": {"title": body.title}})
    doc = await chats.find_one({"_id": ObjectId(chat_id)})
    if not doc:
        raise HTTPException(404, "Chat not found")
    return serialize_doc(doc)


@router.delete("/{chat_id}", status_code=204)
async def delete_chat(chat_id: str):
    await chats.delete_one({"_id": ObjectId(chat_id)})


@router.post("/{chat_id}/sources", status_code=201)
async def add_source(chat_id: str, body: AddSourceRequest):
    if not body.paperId and not body.folderId:
        raise HTTPException(400, "Either paperId or folderId is required")
    update: dict = {}
    if body.paperId:
        update.setdefault("$addToSet", {})["sourcePaperIds"] = ObjectId(body.paperId)
    if body.folderId:
        update.setdefault("$addToSet", {})["sourceFolderIds"] = ObjectId(body.folderId)
    await chats.update_one({"_id": ObjectId(chat_id)}, update)
    doc = await chats.find_one({"_id": ObjectId(chat_id)})
    if not doc:
        raise HTTPException(404, "Chat not found")
    out = serialize_doc(doc)
    out["sources"] = await _sources_payload(doc)
    return out


async def _stream_chat_with_pdf(chat_doc: dict, content: str, history: list[dict]):
    source_folder_ids = [str(fid) for fid in chat_doc.get("sourceFolderIds", [])]
    source_paper_ids = [str(pid) for pid in chat_doc.get("sourcePaperIds", [])]
    context, sources = await build_context(source_folder_ids, source_paper_ids, content)
    messages = build_messages(context, sources, history, content)

    async for event in stream_chat_completion(messages):
        payload = json.loads(event[len("data: ") : -2])
        if payload.get("done"):
            await _append_message(chat_doc["_id"], {"role": "assistant", "content": payload["content"]})
        yield event


async def _stream_search(chat_doc: dict, content: str):
    search_scope = chat_doc.get("searchScope")
    if search_scope == SearchScope.reference_manager.value:
        source_folder_ids = [str(fid) for fid in chat_doc.get("sourceFolderIds", [])]
        source_paper_ids = [str(pid) for pid in chat_doc.get("sourcePaperIds", [])]
        results = await run_library_search(source_folder_ids, source_paper_ids, content, settings.search_result_limit)
    elif search_scope == SearchScope.arxiv.value:
        results = await run_search(content, providers=["arxiv"])
    else:
        results = await run_search(content)
    results_payload = [
        {
            "title": r.title,
            "authors": r.authors,
            "year": r.year,
            "venue": r.venue,
            "abstract": r.abstract,
            "doi": r.doi,
            "url": r.url,
            "pdfUrl": r.pdfUrl,
            "citationCount": r.citationCount,
            "source": r.source,
        }
        for r in results
    ]
    yield f"data: {json.dumps({'output': {'kind': 'papers', 'results': results_payload}})}\n\n"

    messages = build_search_summary_messages(content, results)
    async for event in stream_chat_completion(messages):
        payload = json.loads(event[len("data: ") : -2])
        if payload.get("done"):
            await _append_message(
                chat_doc["_id"],
                {
                    "role": "assistant",
                    "content": payload["content"],
                    "output": {"kind": "papers", "results": results_payload},
                },
            )
        yield event


async def _stream_deep_research_followup(chat_doc: dict, content: str, history: list[dict]):
    report_markdown = None
    for msg in reversed(chat_doc.get("messages", [])):
        output = msg.get("output")
        if output and output.get("kind") == "document":
            report_markdown = output["markdown"]
            break

    system_content = (
        "Answer the user's question using only the Deep Research Report below.\n\n"
        f"{report_markdown or 'No report content available.'}"
    )
    messages = [{"role": "system", "content": system_content}]
    messages.extend({"role": m["role"], "content": m["content"]} for m in history)
    messages.append({"role": "user", "content": content})

    async for event in stream_chat_completion(messages):
        payload = json.loads(event[len("data: ") : -2])
        if payload.get("done"):
            await _append_message(chat_doc["_id"], {"role": "assistant", "content": payload["content"]})
        yield event


async def _append_message(chat_id: ObjectId, message: dict) -> None:
    message["createdAt"] = utcnow()
    await chats.update_one(
        {"_id": chat_id}, {"$push": {"messages": message}, "$set": {"updatedAt": utcnow()}}
    )


@router.post("/{chat_id}/messages")
async def send_message(chat_id: str, body: MessageCreate):
    chat_doc = await chats.find_one({"_id": ObjectId(chat_id)})
    if not chat_doc:
        raise HTTPException(404, "Chat not found")

    history = chat_doc.get("messages", [])
    is_first_message = len(history) == 0
    await _append_message(chat_doc["_id"], {"role": "user", "content": body.content})

    chat_type = chat_doc.get("type", ChatType.chat_with_pdf.value)

    if chat_type == ChatType.deep_research.value and is_first_message:
        if chat_doc.get("deepResearchMode") == DeepResearchMode.openai.value:
            event_stream = run_openai_deep_research(chat_id, body.content)
        else:
            scope = DeepResearchScope(chat_doc["deepResearchScope"])
            folder_ids = chat_doc.get("sourceFolderIds", [])
            folder_id = str(folder_ids[0]) if folder_ids else None
            event_stream = run_deep_research_pipeline(chat_id, body.content, scope, folder_id)
    elif chat_type == ChatType.deep_research.value:
        event_stream = _stream_deep_research_followup(chat_doc, body.content, history)
    elif chat_type == ChatType.search.value:
        event_stream = _stream_search(chat_doc, body.content)
    else:
        event_stream = _stream_chat_with_pdf(chat_doc, body.content, history)

    return StreamingResponse(event_stream, media_type="text/event-stream")
