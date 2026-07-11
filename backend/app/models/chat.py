from pydantic import BaseModel


class ChatCreate(BaseModel):
    sourcePaperIds: list[str]
    title: str | None = None


class MessageCreate(BaseModel):
    content: str


class AddSourceRequest(BaseModel):
    paperId: str


class ChatRename(BaseModel):
    title: str
