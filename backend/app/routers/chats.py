import json

from bson import ObjectId
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.db.mongo import chats, papers
from app.models.chat import AddSourceRequest, ChatCreate, ChatRename, MessageCreate
from app.models.common import serialize_doc, utcnow
from app.services.rag import build_context, build_messages
from app.services.streaming import stream_chat_completion

router = APIRouter()


async def _paper_titles(paper_ids: list[ObjectId]) -> list[dict]:
    docs = await papers.find({"_id": {"$in": paper_ids}}, {"title": 1}).to_list(length=len(paper_ids))
    by_id = {str(d["_id"]): d["title"] for d in docs}
    return [{"id": str(pid), "title": by_id.get(str(pid), "Untitled")} for pid in paper_ids]


@router.post("", status_code=201)
async def create_chat(body: ChatCreate):
    if not body.sourcePaperIds:
        raise HTTPException(400, "At least one source paper is required")
    source_oids = [ObjectId(pid) for pid in body.sourcePaperIds]
    sources = await _paper_titles(source_oids)
    title = body.title or (sources[0]["title"] if sources else "New Chat")

    now = utcnow()
    doc = {
        "title": title,
        "sourcePaperIds": source_oids,
        "messages": [],
        "createdAt": now,
        "updatedAt": now,
    }
    result = await chats.insert_one(doc)
    doc["_id"] = result.inserted_id
    out = serialize_doc(doc)
    out["sources"] = sources
    return out


@router.get("")
async def list_chats():
    result = []
    async for c in chats.find({}).sort("updatedAt", -1):
        out = serialize_doc(c)
        out["sources"] = await _paper_titles(c["sourcePaperIds"])
        out.pop("messages", None)
        result.append(out)
    return result


@router.get("/{chat_id}")
async def get_chat(chat_id: str):
    doc = await chats.find_one({"_id": ObjectId(chat_id)})
    if not doc:
        raise HTTPException(404, "Chat not found")
    out = serialize_doc(doc)
    out["sources"] = await _paper_titles(doc["sourcePaperIds"])
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
    await chats.update_one(
        {"_id": ObjectId(chat_id)}, {"$addToSet": {"sourcePaperIds": ObjectId(body.paperId)}}
    )
    doc = await chats.find_one({"_id": ObjectId(chat_id)})
    if not doc:
        raise HTTPException(404, "Chat not found")
    out = serialize_doc(doc)
    out["sources"] = await _paper_titles(doc["sourcePaperIds"])
    return out


@router.post("/{chat_id}/messages")
async def send_message(chat_id: str, body: MessageCreate):
    chat_doc = await chats.find_one({"_id": ObjectId(chat_id)})
    if not chat_doc:
        raise HTTPException(404, "Chat not found")

    source_paper_ids = [str(pid) for pid in chat_doc["sourcePaperIds"]]
    history = chat_doc.get("messages", [])

    user_message = {"role": "user", "content": body.content, "createdAt": utcnow()}
    await chats.update_one(
        {"_id": ObjectId(chat_id)},
        {"$push": {"messages": user_message}, "$set": {"updatedAt": utcnow()}},
    )

    context, sources = await build_context(source_paper_ids, body.content)
    messages = build_messages(context, sources, history, body.content)

    async def event_stream():
        async for event in stream_chat_completion(messages):
            payload = json.loads(event[len("data: ") : -2])
            if payload.get("done"):
                assistant_message = {
                    "role": "assistant",
                    "content": payload["content"],
                    "createdAt": utcnow(),
                }
                await chats.update_one(
                    {"_id": ObjectId(chat_id)},
                    {"$push": {"messages": assistant_message}, "$set": {"updatedAt": utcnow()}},
                )
            yield event

    return StreamingResponse(event_stream(), media_type="text/event-stream")
