from enum import Enum

from pydantic import BaseModel


class IngestionStatus(str, Enum):
    pending = "pending"
    ready = "ready"
    no_pdf = "no_pdf"
    failed = "failed"


class PaperSource(str, Enum):
    upload = "upload"
    url = "url"
    manual = "manual"


class ManualPaperCreate(BaseModel):
    title: str
    authors: list[str] = []
    year: int | None = None
    venue: str | None = None
    doi: str | None = None
    folderId: str | None = None


class UrlPaperCreate(BaseModel):
    url: str | None = None
    doi: str | None = None
    folderId: str | None = None


class PaperUpdate(BaseModel):
    folderId: str | None = None
    tagIds: list[str] | None = None
    title: str | None = None
