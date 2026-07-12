import { useEffect, useState } from 'react'
import { referencesApi } from '../api/references'
import type { ChatType, Folder } from '../api/types'
import { ReferencePickerModal, type ReferencePickerSelection } from './ReferencePickerModal'

export type SourceScopeValue =
  | { kind: 'all_papers' }
  | { kind: 'arxiv' }
  | { kind: 'reference_manager'; folderIds: string[]; paperIds: string[] }

interface Props {
  agent: ChatType
  value: SourceScopeValue
  onChange: (value: SourceScopeValue) => void
}

export function SourceScopeDropdown({ agent, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [folders, setFolders] = useState<Folder[]>([])

  useEffect(() => {
    referencesApi.listFolders().then(setFolders).catch(() => setFolders([]))
  }, [])

  // Chat with PDF can only ever work over already-ingested papers — no external database choice.
  const showDatabases = agent !== 'chat_with_pdf'
  // Deep Research only accepts a single whole folder as its scope (backend constraint).
  const singleFolder = agent === 'deep_research'

  function referenceLabel(): string {
    if (value.kind !== 'reference_manager') return singleFolder ? 'Choose Folder' : 'Choose References'
    if (singleFolder) {
      const folder = folders.find((f) => f.id === value.folderIds[0])
      return folder ? folder.name : 'Choose Folder'
    }
    const count = value.folderIds.length + value.paperIds.length
    return count > 0 ? `${count} reference(s)` : 'Choose References'
  }

  const triggerLabel =
    value.kind === 'all_papers' ? 'All Papers' : value.kind === 'arxiv' ? 'ArXiv' : referenceLabel()
  const triggerIcon = value.kind === 'reference_manager' ? '📁' : '📖'

  function handlePickerConfirm(sel: ReferencePickerSelection) {
    onChange({ kind: 'reference_manager', folderIds: sel.folderIds, paperIds: sel.paperIds })
    setShowPicker(false)
  }

  return (
    <>
      <div className="dropdown">
        <button className="btn btn-pill" onClick={() => setOpen((v) => !v)}>
          {triggerIcon} {triggerLabel} ▾
        </button>
        {value.kind === 'reference_manager' && (value.folderIds.length > 0 || value.paperIds.length > 0) && (
          <button
            className="btn btn-icon btn-icon-sm"
            title="Clear selection"
            style={{ marginLeft: 4 }}
            onClick={() => onChange({ kind: 'all_papers' })}
          >
            ✕
          </button>
        )}
        {open && (
          <div className="dropdown-menu">
            {showDatabases && (
              <>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', padding: '4px 10px' }}>Research Databases:</div>
                <div
                  className="dropdown-item"
                  onClick={() => {
                    onChange({ kind: 'all_papers' })
                    setOpen(false)
                  }}
                >
                  <span className="dropdown-item-label">📖 All Papers</span>
                  <span className="dropdown-item-sub">Search Semantic Scholar + arXiv</span>
                </div>
                <div
                  className="dropdown-item"
                  onClick={() => {
                    onChange({ kind: 'arxiv' })
                    setOpen(false)
                  }}
                >
                  <span className="dropdown-item-label">📦 ArXiv</span>
                  <span className="dropdown-item-sub">Explore research preprints from arXiv</span>
                </div>
              </>
            )}
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', padding: '4px 10px' }}>My References:</div>
            <div
              className="dropdown-item"
              onClick={() => {
                setShowPicker(true)
                setOpen(false)
              }}
            >
              <span className="dropdown-item-label">📁 Reference Manager</span>
              <span className="dropdown-item-sub">
                {singleFolder ? 'Pick one folder from your saved papers' : 'Papers you’ve saved in Reference Manager'}
              </span>
            </div>
          </div>
        )}
      </div>

      {showPicker && (
        <ReferencePickerModal
          title={singleFolder ? 'Choose a folder to research' : 'Choose references to research'}
          singleFolder={singleFolder}
          initialSelection={
            value.kind === 'reference_manager'
              ? { folderIds: value.folderIds, paperIds: value.paperIds }
              : { folderIds: [], paperIds: [] }
          }
          onClose={() => setShowPicker(false)}
          onConfirm={handlePickerConfirm}
        />
      )}
    </>
  )
}
