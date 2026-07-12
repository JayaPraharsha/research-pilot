from enum import Enum

from pydantic import BaseModel


class ChatType(str, Enum):
    chat_with_pdf = "chat_with_pdf"
    search = "search"
    deep_research = "deep_research"


class DeepResearchScope(str, Enum):
    external = "external"
    arxiv = "arxiv"
    folder = "folder"


class DeepResearchMode(str, Enum):
    standard = "standard"
    openai = "openai"


class SearchScope(str, Enum):
    all_papers = "all_papers"
    arxiv = "arxiv"
    reference_manager = "reference_manager"


class ChatCreate(BaseModel):
    type: ChatType = ChatType.chat_with_pdf
    sourceFolderIds: list[str] = []
    sourcePaperIds: list[str] = []
    title: str | None = None
    deepResearchScope: DeepResearchScope | None = None
    deepResearchMode: DeepResearchMode | None = None
    searchScope: SearchScope | None = None


class MessageCreate(BaseModel):
    content: str


class AddSourceRequest(BaseModel):
    paperId: str | None = None
    folderId: str | None = None


class ChatRename(BaseModel):
    title: str
