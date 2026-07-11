import { useEffect, useState } from 'react'
import { notebooksApi } from '../api/notebooks'
import type { Notebook } from '../api/types'
import { Markdown } from '../components/Markdown'

export function MyNotebooks() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<{ role: string; content: string }[]>([])

  function refresh() {
    notebooksApi.list().then(setNotebooks)
  }

  useEffect(refresh, [])

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    const full = await notebooksApi.get(id)
    setSnapshot(full.messagesSnapshot)
    setExpandedId(id)
  }

  async function handleRename(id: string, currentTitle: string) {
    const title = prompt('Rename notebook', currentTitle)
    if (title && title.trim()) {
      await notebooksApi.rename(id, title.trim())
      refresh()
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this notebook?')) return
    await notebooksApi.remove(id)
    if (expandedId === id) setExpandedId(null)
    refresh()
  }

  return (
    <div className="dashboard" style={{ maxWidth: 860 }}>
      <h2 style={{ marginBottom: 16 }}>My Notebooks</h2>
      <div className="card-list">
        {notebooks.length === 0 && (
          <div className="empty-state">
            Notebooks will appear here once you save a Chat with PDF conversation ("Save to Notebook").
          </div>
        )}
        {notebooks.map((n) => (
          <div key={n.id}>
            <div className="list-card" onClick={() => toggleExpand(n.id)}>
              <span className="list-card-title">{n.title}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                <span className="list-card-meta">{new Date(n.createdAt).toLocaleDateString()}</span>
                <button className="btn btn-icon" onClick={() => handleRename(n.id, n.title)}>
                  ✎
                </button>
                <button className="btn btn-icon" onClick={() => handleDelete(n.id)}>
                  🗑
                </button>
              </div>
            </div>
            {expandedId === n.id && (
              <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: 16 }}>
                {snapshot.map((m, i) => (
                  <div key={i} className={`chat-bubble ${m.role}`} style={{ marginBottom: 10 }}>
                    {m.role === 'assistant' ? <Markdown>{m.content}</Markdown> : m.content}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
