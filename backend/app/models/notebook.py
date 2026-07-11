from pydantic import BaseModel


class NotebookCreate(BaseModel):
    chatId: str
    title: str


class NotebookRename(BaseModel):
    title: str
