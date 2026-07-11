import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { chatsApi } from '../api/chats'
import { notebooksApi } from '../api/notebooks'
import type { ChatSummary, Notebook } from '../api/types'
import { ReferencePickerModal } from '../components/ReferencePickerModal'

export function Dashboard() {
  const navigate = useNavigate()
  const [question, setQuestion] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [selectedCount, setSelectedCount] = useState(0)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [recentChats, setRecentChats] = useState<ChatSummary[]>([])
  const [recentNotebooks, setRecentNotebooks] = useState<Notebook[]>([])
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    chatsApi.list().then((chats) => setRecentChats(chats.slice(0, 5)))
    notebooksApi.list().then((nbs) => setRecentNotebooks(nbs.slice(0, 5)))
  }, [])

  function handleSubmit() {
    if (!question.trim()) return
    setShowPicker(true)
  }

  async function handlePickerConfirm(paperIds: string[]) {
    setSelectedIds(paperIds)
    setSelectedCount(paperIds.length)
    setShowPicker(false)
    setCreating(true)
    try {
      const chat = await chatsApi.create(paperIds, question.slice(0, 80))
      navigate(`/chats/${chat.id}`, { state: { initialMessage: question } })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="dashboard">
      <h1 className="dashboard-heading serif">Hello Johnson, what would you like to research today?</h1>

      <div className="ask-box">
        <textarea
          placeholder="Ask a research question about your saved papers..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <div className="ask-box-controls">
          <div className="ask-box-controls-left">
            <button className="btn btn-pill" onClick={() => setShowPicker(true)}>
              📁 {selectedCount > 0 ? `${selectedCount} References` : 'Choose References'}
            </button>
          </div>
          <button className="btn btn-primary btn-icon" onClick={handleSubmit} disabled={creating}>
            →
          </button>
        </div>
      </div>

      <div className="section-title">Recent Chats</div>
      <div className="card-list">
        {recentChats.length === 0 && <div className="empty-state">No chats yet.</div>}
        {recentChats.map((c) => (
          <div key={c.id} className="list-card" onClick={() => navigate(`/chats/${c.id}`)}>
            <span className="list-card-title">{c.title}</span>
            <span className="list-card-meta">{c.sources.length} source(s)</span>
          </div>
        ))}
      </div>

      <div className="section-title">Recent Notebooks</div>
      <div className="card-list">
        {recentNotebooks.length === 0 && <div className="empty-state">No notebooks yet.</div>}
        {recentNotebooks.map((n) => (
          <div key={n.id} className="list-card" onClick={() => navigate(`/my-notebooks`)}>
            <span className="list-card-title">{n.title}</span>
            <span className="list-card-meta">{new Date(n.createdAt).toLocaleDateString()}</span>
          </div>
        ))}
      </div>

      {showPicker && (
        <ReferencePickerModal
          title="Choose references to research"
          excludeIds={selectedIds}
          onClose={() => setShowPicker(false)}
          onConfirm={handlePickerConfirm}
        />
      )}
    </div>
  )
}
