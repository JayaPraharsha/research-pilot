import { useEffect, useMemo, useState } from 'react'
import { referencesApi } from '../api/references'
import type { Folder, Paper } from '../api/types'

interface Props {
  title?: string
  excludeIds?: string[]
  onClose: () => void
  onConfirm: (paperIds: string[]) => void
}

export function ReferencePickerModal({ title = 'Select papers from Reference Manager', excludeIds = [], onClose, onConfirm }: Props) {
  const [folders, setFolders] = useState<Folder[]>([])
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [papers, setPapers] = useState<Paper[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    referencesApi.listFolders().then(setFolders).catch(() => setFolders([]))
  }, [])

  useEffect(() => {
    setLoading(true)
    referencesApi
      .listPapers({ folderId: activeFolderId ?? undefined, search: search || undefined })
      .then(setPapers)
      .catch(() => setPapers([]))
      .finally(() => setLoading(false))
  }, [activeFolderId, search])

  const visiblePapers = useMemo(() => papers.filter((p) => !excludeIds.includes(p.id)), [papers, excludeIds])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 700 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          {title}
          <button className="btn btn-icon" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body" style={{ display: 'flex', gap: 16, padding: 0 }}>
          <div style={{ width: 200, borderRight: '1px solid var(--border)', padding: 16, overflowY: 'auto' }}>
            <div
              className={`ref-tree-item${activeFolderId === null ? ' active' : ''}`}
              onClick={() => setActiveFolderId(null)}
            >
              All Papers
            </div>
            {folders.map((f) => (
              <div
                key={f.id}
                className={`ref-tree-item${activeFolderId === f.id ? ' active' : ''}`}
                onClick={() => setActiveFolderId(f.id)}
              >
                {f.name}
              </div>
            ))}
          </div>
          <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
            <input
              className="ref-search"
              style={{ width: '100%', marginBottom: 8 }}
              placeholder="Search references..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {loading && <div className="empty-state">Loading...</div>}
            {!loading && visiblePapers.length === 0 && <div className="empty-state">No papers found.</div>}
            {visiblePapers.map((p) => (
              <label key={p.id} className="checkbox-row">
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                <div style={{ flex: 1 }}>
                  <div className="paper-row-title">
                    {p.title} {p.ingestionStatus === 'ready' && <span className="status-badge status-ready">PDF</span>}
                  </div>
                  <div className="paper-row-meta">
                    {p.type} · {p.year ?? '—'} · {p.authors.slice(0, 2).join(', ')}
                    {p.authors.length > 2 ? ` +${p.authors.length - 2} more` : ''}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
        <div className="modal-footer" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{selected.size} paper(s) selected</span>
          <button
            className="btn btn-primary"
            disabled={selected.size === 0}
            onClick={() => onConfirm(Array.from(selected))}
          >
            Continue →
          </button>
        </div>
      </div>
    </div>
  )
}
