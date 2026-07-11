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
  abstract?: string | null
  citationCount?: number | null
  sourceUrl?: string | null
  type: string
  folderId: string | null
  tagIds: string[]
  source: 'upload' | 'url' | 'manual'
  ingestionStatus: IngestionStatus
  pageCount?: number
  createdAt: string
}

export type ChatType = 'chat_with_pdf' | 'search' | 'deep_research'
export type DeepResearchScope = 'external' | 'folder'

export interface ChatFolderRef {
  id: string
  name: string
  paperCount: number
}

export interface ChatPaperRef {
  id: string
  title: string
}

export interface ChatSources {
  folders: ChatFolderRef[]
  papers: ChatPaperRef[]
}

export interface SearchResult {
  title: string
  authors: string[]
  year: number | null
  venue: string | null
  abstract: string | null
  doi: string | null
  url: string | null
  pdfUrl: string | null
  citationCount: number | null
  source: 'semantic_scholar' | 'arxiv'
}

export interface ReportReference {
  index: number
  title: string
  authors: string[]
  year: number | null
  url: string | null
  paperId: string | null
}

export type MessageOutput =
  | { kind: 'papers'; results: SearchResult[] }
  | { kind: 'document'; markdown: string; references: ReportReference[] }

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  output?: MessageOutput
}

export interface DeepResearchStage {
  name: 'plan' | 'search' | 'screen' | 'extract' | 'synthesize'
  status: 'pending' | 'running' | 'done'
  detail?: string
}

export interface Chat {
  id: string
  type: ChatType
  title: string
  sourceFolderIds: string[]
  sourcePaperIds: string[]
  deepResearchScope: DeepResearchScope | null
  deepResearchStages: DeepResearchStage[] | null
  sources: ChatSources
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

export interface ChatSummary {
  id: string
  type: ChatType
  title: string
  sourceFolderIds: string[]
  sourcePaperIds: string[]
  sources: ChatSources
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
