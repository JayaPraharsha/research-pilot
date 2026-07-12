import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { referencesApi } from '../api/references'
import { highlightsApi } from '../api/highlights'
import { chatsApi } from '../api/chats'
import type { ExcerptRef, Highlight, Paper } from '../api/types'
import { PdfViewer } from '../components/PdfViewer'
import { ChatPanel } from '../components/ChatPanel'

export function ReaderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [paper, setPaper] = useState<Paper | null>(null)
  const [chatId, setChatId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [askAiExcerpt, setAskAiExcerpt] = useState<ExcerptRef | null>(null)

  useEffect(() => {
    if (!id) return
    referencesApi.getPaper(id).then(setPaper)
    highlightsApi.list(id).then(setHighlights)
    chatsApi.getForPaper(id).then((c) => setChatId(c.id))
  }, [id])

  async function handleHighlight(h: { page: number; color: Highlight['color']; rects: Highlight['rects']; quote: string }) {
    if (!id) return
    const created = await highlightsApi.create(id, h)
    setHighlights((prev) => [...prev, created])
  }

  function handleAskAi(excerpt: { quote: string; page: number }) {
    if (!id) return
    setAskAiExcerpt({ paperId: id, ...excerpt })
  }

  if (!id) return <div className="empty-state" style={{ margin: 40 }}>Loading...</div>

  return (
    <div className="reader-page">
      <div className="chat-breadcrumb">
        <span className="reader-paper-title">📖 {paper ? paper.title : 'Loading...'}</span>
        <button className="btn" onClick={() => navigate('/references')}>
          Back to References
        </button>
      </div>

      <div className="reader-body">
        <PdfViewer
          paperId={id}
          page={page}
          onPageChange={setPage}
          existingHighlights={highlights}
          onHighlight={handleHighlight}
          onAskAi={handleAskAi}
        />

        <div className="reader-chat-pane">
          <div className="reader-chat-header">💬 Chat</div>
          {chatId ? (
            <ChatPanel chatId={chatId} askAiExcerpt={askAiExcerpt} />
          ) : (
            <div className="empty-state" style={{ margin: 40 }}>Loading...</div>
          )}
        </div>
      </div>
    </div>
  )
}
