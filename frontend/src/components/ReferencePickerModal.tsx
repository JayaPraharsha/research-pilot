import { useEffect, useMemo, useState } from 'react'
import { referencesApi } from '../api/references'
import type { Folder, Paper } from '../api/types'

export interface ReferencePickerSelection {
  folderIds: string[]
  paperIds: string[]
}

interface Props {
  title?: string
  excludePaperIds?: string[]
  excludeFolderIds?: string[]
  initialSelection?: ReferencePickerSelection
  /** Restrict to picking exactly one folder as a whole (no individual papers) — used by Deep Research. */
  singleFolder?: boolean
  onClose: () => void
  onConfirm: (selection: ReferencePickerSelection) => void
}

export function ReferencePickerModal({
  title = 'Select papers from Reference Manager',
  excludePaperIds = [],
  excludeFolderIds = [],
  initialSelection,
  singleFolder = false,
  onClose,
  onConfirm,
}: Props) {
  const [folders, setFolders] = useState<Folder[]>([])
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [papers, setPapers] = useState<Paper[]>([])
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(
    () => new Set(initialSelection?.folderIds ?? []),
  )
  const [selectedPaperIds, setSelectedPaperIds] = useState<Set<string>>(
    () => new Set(initialSelection?.paperIds ?? []),
  )
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

  const visiblePapers = useMemo(() => papers.filter((p) => !excludePaperIds.includes(p.id)), [papers, excludePaperIds])
  const visibleFolders = useMemo(() => folders.filter((f) => !excludeFolderIds.includes(f.id)), [folders, excludeFolderIds])

  function togglePaper(id: string) {
    setSelectedPaperIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleFolder(id: string) {
    if (singleFolder) {
      setSelectedFolderIds((prev) => (prev.has(id) ? new Set() : new Set([id])))
      return
    }
    setSelectedFolderIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalSelected = singleFolder ? selectedFolderIds.size : selectedFolderIds.size + selectedPaperIds.size

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
          <div style={{ width: 230, borderRight: '1px solid var(--border)', padding: 16, overflowY: 'auto' }}>
            <div
              className={`ref-tree-item${activeFolderId === null ? ' active' : ''}`}
              onClick={() => setActiveFolderId(null)}
            >
              All Papers
            </div>
            {visibleFolders.map((f) => (
              <div key={f.id} className={`ref-tree-item${activeFolderId === f.id ? ' active' : ''}`}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer' }}>
                  <input
                    type={singleFolder ? 'radio' : 'checkbox'}
                    checked={selectedFolderIds.has(f.id)}
                    onChange={() => toggleFolder(f.id)}
                  />
                  <span onClick={() => setActiveFolderId(f.id)} style={{ flex: 1 }}>
                    {f.name}
                  </span>
                </label>
              </div>
            ))}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '10px 8px 0' }}>
              {singleFolder
                ? 'Pick one folder — its entire contents (resolved live) will be used as the research scope.'
                : 'Check a folder to use its entire contents as a source. Click the name to browse and pick individual papers instead.'}
            </div>
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
              <label key={p.id} className="checkbox-row" style={singleFolder ? { cursor: 'default' } : undefined}>
                {singleFolder ? (
                  <span style={{ width: 16, textAlign: 'center', color: 'var(--text-muted)' }}>·</span>
                ) : (
                  <input type="checkbox" checked={selectedPaperIds.has(p.id)} onChange={() => togglePaper(p.id)} />
                )}
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
            {singleFolder && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0 0' }}>
                Browsing preview only — papers here aren't individually selectable for Deep Research; pick the whole
                folder on the left.
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {singleFolder
              ? `${selectedFolderIds.size} folder selected`
              : `${selectedFolderIds.size} folder(s), ${selectedPaperIds.size} paper(s) selected`}
          </span>
          <button
            className="btn btn-primary"
            disabled={totalSelected === 0}
            onClick={() =>
              onConfirm({ folderIds: Array.from(selectedFolderIds), paperIds: Array.from(selectedPaperIds) })
            }
          >
            Continue →
          </button>
        </div>
      </div>
    </div>
  )
}
