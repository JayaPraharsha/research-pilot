import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { chatsApi } from '../api/chats'
import type { ChatSummary, ChatType } from '../api/types'

const FILTERS: { value: ChatType | 'all'; label: string; icon: string }[] = [
  { value: 'all', label: 'All', icon: '☰' },
  { value: 'search', label: 'AI Search', icon: '🔍' },
  { value: 'chat_with_pdf', label: 'Chat with PDF', icon: '💬' },
  { value: 'deep_research', label: 'Deep Research', icon: '📄' },
]

const TYPE_LABEL: Record<ChatType, string> = {
  chat_with_pdf: 'Chat with PDF',
  search: 'AI Search',
  deep_research: 'Deep Research',
}

export function MyChats() {
  const navigate = useNavigate()
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ChatType | 'all'>('all')

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

  const filtered = chats
    .filter((c) => filter === 'all' || c.type === filter)
    .filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))

  function meta(c: ChatSummary): string {
    if (c.type === 'chat_with_pdf') {
      const folderNames = c.sources.folders.map((f) => f.name)
      const paperNames = c.sources.papers.map((p) => p.title)
      return [...folderNames, ...paperNames].join(', ') || 'No sources yet'
    }
    return TYPE_LABEL[c.type]
  }

  return (
    <div className="dashboard" style={{ maxWidth: 860 }}>
      <h2 style={{ marginBottom: 16 }}>My Chats</h2>
      <input
        className="ref-search"
        style={{ width: '100%', marginBottom: 12 }}
        placeholder="Search chats..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button
            key={f.value}
            className="btn btn-pill"
            style={filter === f.value ? { background: 'var(--accent-soft)', borderColor: 'var(--accent)' } : undefined}
            onClick={() => setFilter(f.value)}
          >
            {f.icon} {f.label}
          </button>
        ))}
      </div>
      <div className="card-list">
        {filtered.length === 0 && <div className="empty-state">No chats found.</div>}
        {filtered.map((c) => (
          <div key={c.id} className="list-card" onClick={() => navigate(`/chats/${c.id}`)}>
            <div style={{ minWidth: 0 }}>
              <div className="list-card-title">{c.title}</div>
              <div className="list-card-meta">{meta(c)}</div>
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
