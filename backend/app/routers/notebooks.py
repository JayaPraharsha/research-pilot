from bson import ObjectId
from fastapi import APIRouter, HTTPException

from app.db.mongo import chats, notebooks
from app.models.common import serialize_doc, utcnow
from app.models.notebook import NotebookCreate, NotebookRename

router = APIRouter()


@router.post("", status_code=201)
async def create_notebook(body: NotebookCreate):
    chat_doc = await chats.find_one({"_id": ObjectId(body.chatId)})
    if not chat_doc:
        raise HTTPException(404, "Chat not found")

    doc = {
        "title": body.title,
        "chatId": ObjectId(body.chatId),
        "messagesSnapshot": chat_doc.get("messages", []),
        "sourcePaperIds": chat_doc.get("sourcePaperIds", []),
        "createdAt": utcnow(),
    }
    result = await notebooks.insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize_doc(doc)


@router.get("")
async def list_notebooks():
    result = []
    async for n in notebooks.find({}).sort("createdAt", -1):
        out = serialize_doc(n)
        out.pop("messagesSnapshot", None)
        result.append(out)
    return result


@router.get("/{notebook_id}")
async def get_notebook(notebook_id: str):
    doc = await notebooks.find_one({"_id": ObjectId(notebook_id)})
    if not doc:
        raise HTTPException(404, "Notebook not found")
    return serialize_doc(doc)


@router.patch("/{notebook_id}")
async def rename_notebook(notebook_id: str, body: NotebookRename):
    await notebooks.update_one({"_id": ObjectId(notebook_id)}, {"$set": {"title": body.title}})
    doc = await notebooks.find_one({"_id": ObjectId(notebook_id)})
    if not doc:
        raise HTTPException(404, "Notebook not found")
    return serialize_doc(doc)


@router.delete("/{notebook_id}", status_code=204)
async def delete_notebook(notebook_id: str):
    await notebooks.delete_one({"_id": ObjectId(notebook_id)})
