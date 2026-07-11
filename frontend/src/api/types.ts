export type IngestionStatus = 'pending' | 'ready' | 'no_pdf' | 'failed'

export interface Folder {
  id: string
  name: string
  parentId: string | null
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface Paper {
  id: string
  title: string
  authors: string[]
  year: number | null
  venue: string | null
  doi: string | null
  type: string
  folderId: string | null
  tagIds: string[]
  source: 'upload' | 'url' | 'manual'
  ingestionStatus: IngestionStatus
  pageCount?: number
  createdAt: string
}

export interface ChatSourceRef {
  id: string
  title: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface Chat {
  id: string
  title: string
  sourcePaperIds: string[]
  sources: ChatSourceRef[]
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

export interface ChatSummary {
  id: string
  title: string
  sourcePaperIds: string[]
  sources: ChatSourceRef[]
  createdAt: string
  updatedAt: string
}

export interface Notebook {
  id: string
  title: string
  chatId: string
  sourcePaperIds: string[]
  createdAt: string
}
