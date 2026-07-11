import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { chatsApi } from '../api/chats'
import type { ChatSummary } from '../api/types'

export function MyChats() {
  const navigate = useNavigate()
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [search, setSearch] = useState('')

  function refresh() {
    chatsApi.list().then(setChats)
  }

  useEffect(refresh, [])

  async function handleRename(id: string, currentTitle: string) {
    const title = prompt('Rename chat', currentTitle)
    if (title && title.trim()) {
      await chatsApi.rename(id, title.trim())
      refresh()
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this chat?')) return
    await chatsApi.remove(id)
    refresh()
  }

  const filtered = chats.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="dashboard" style={{ maxWidth: 860 }}>
      <h2 style={{ marginBottom: 16 }}>My Chats</h2>
      <input
        className="ref-search"
        style={{ width: '100%', marginBottom: 16 }}
        placeholder="Search chats..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="card-list">
        {filtered.length === 0 && <div className="empty-state">No chats found.</div>}
        {filtered.map((c) => (
          <div key={c.id} className="list-card" onClick={() => navigate(`/chats/${c.id}`)}>
            <div style={{ minWidth: 0 }}>
              <div className="list-card-title">{c.title}</div>
              <div className="list-card-meta">{c.sources.map((s) => s.title).join(', ')}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
              <span className="list-card-meta">{new Date(c.updatedAt).toLocaleDateString()}</span>
              <button className="btn btn-icon" onClick={() => handleRename(c.id, c.title)}>
                ✎
              </button>
              <button className="btn btn-icon" onClick={() => handleDelete(c.id)}>
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
