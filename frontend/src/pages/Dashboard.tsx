import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { chatsApi } from '../api/chats'
import { notebooksApi } from '../api/notebooks'
import { referencesApi } from '../api/references'
import type { ChatSummary, ChatType, Folder, Notebook } from '../api/types'
import { ReferencePickerModal, type ReferencePickerSelection } from '../components/ReferencePickerModal'

const AGENTS: { type: ChatType; label: string; icon: string }[] = [
  { type: 'search', label: 'AI Search', icon: '🔍' },
  { type: 'chat_with_pdf', label: 'Chat with PDF', icon: '💬' },
  { type: 'deep_research', label: 'Deep Research Report', icon: '📄' },
]

const TYPE_LABEL: Record<ChatType, string> = {
  chat_with_pdf: 'Chat with PDF',
  search: 'AI Search',
  deep_research: 'Deep Research',
}

export function Dashboard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialAgent = (searchParams.get('agent') as ChatType | null) ?? 'search'
  const [agent, setAgent] = useState<ChatType>(initialAgent)
  const [question, setQuestion] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [selection, setSelection] = useState<ReferencePickerSelection>({ folderIds: [], paperIds: [] })
  const [deepResearchScope, setDeepResearchScope] = useState<'external' | 'folder'>('external')
  const [folders, setFolders] = useState<Folder[]>([])
  const [deepResearchFolderId, setDeepResearchFolderId] = useState<string>('')
  const [showDrPicker, setShowDrPicker] = useState(false)
  const [recentChats, setRecentChats] = useState<ChatSummary[]>([])
  const [recentNotebooks, setRecentNotebooks] = useState<Notebook[]>([])
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    chatsApi.list().then((chats) => setRecentChats(chats.slice(0, 5)))
    notebooksApi.list().then((nbs) => setRecentNotebooks(nbs.slice(0, 5)))
    referencesApi.listFolders().then(setFolders)
  }, [])

  async function handleSubmit() {
    if (!question.trim()) return
    if (agent === 'chat_with_pdf' && selection.folderIds.length === 0 && selection.paperIds.length === 0) {
      setShowPicker(true)
      return
    }
    setCreating(true)
    try {
      const chat = await chatsApi.create({
        type: agent,
        sourceFolderIds: agent === 'chat_with_pdf' ? selection.folderIds : agent === 'deep_research' && deepResearchScope === 'folder' && deepResearchFolderId ? [deepResearchFolderId] : [],
        sourcePaperIds: agent === 'chat_with_pdf' ? selection.paperIds : [],
        title: question.slice(0, 80),
        deepResearchScope: agent === 'deep_research' ? deepResearchScope : undefined,
      })
      navigate(`/chats/${chat.id}`, { state: { initialMessage: question } })
    } finally {
      setCreating(false)
    }
  }

  function handlePickerConfirm(sel: ReferencePickerSelection) {
    setSelection(sel)
    setShowPicker(false)
  }

  const referenceCount = selection.folderIds.length + selection.paperIds.length

  return (
    <div className="dashboard">
      <h1 className="dashboard-heading serif">Hello Johnson, what would you like to research today?</h1>

      <div className="ask-box">
        <textarea
          placeholder={
            agent === 'search'
              ? 'Ask a research question or topic to find papers and answers...'
              : agent === 'deep_research'
                ? 'Describe the topic for your Deep Research Report...'
                : 'Ask a question about your saved papers...'
          }
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <div className="ask-box-controls">
          <div className="ask-box-controls-left">
            {agent === 'chat_with_pdf' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <button className="btn btn-pill" onClick={() => setShowPicker(true)}>
                  📁 {referenceCount > 0 ? `${referenceCount} reference(s)` : 'Choose References'}
                </button>
                {referenceCount > 0 && (
                  <button
                    className="btn btn-icon btn-icon-sm"
                    title="Clear references"
                    onClick={() => setSelection({ folderIds: [], paperIds: [] })}
                  >
                    ✕
                  </button>
                )}
              </span>
            )}
            {agent === 'deep_research' && (
              <>
                <div className="segmented">
                  <button
                    className={`segmented-option${deepResearchScope === 'external' ? ' active' : ''}`}
                    onClick={() => setDeepResearchScope('external')}
                  >
                    Search everything
                  </button>
                  <button
                    className={`segmented-option${deepResearchScope === 'folder' ? ' active' : ''}`}
                    onClick={() => setDeepResearchScope('folder')}
                  >
                    Use a folder
                  </button>
                </div>
                {deepResearchScope === 'folder' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <button className="btn btn-pill" onClick={() => setShowDrPicker(true)}>
                      📁{' '}
                      {deepResearchFolderId
                        ? (folders.find((f) => f.id === deepResearchFolderId)?.name ?? 'Folder selected')
                        : 'Choose Folder'}
                    </button>
                    {deepResearchFolderId && (
                      <button
                        className="btn btn-icon btn-icon-sm"
                        title="Clear folder"
                        onClick={() => setDeepResearchFolderId('')}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                )}
              </>
            )}
          </div>
          <button className="btn btn-primary btn-icon" onClick={handleSubmit} disabled={creating}>
            →
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', alignSelf: 'center' }}>Select the best agent:</span>
        {AGENTS.map((a) => (
          <button
            key={a.type}
            className="btn btn-pill"
            style={agent === a.type ? { background: 'var(--accent-soft)', borderColor: 'var(--accent)' } : undefined}
            onClick={() => setAgent(a.type)}
          >
            {a.icon} {a.label}
          </button>
        ))}
      </div>

      <div className="section-title">Recent Chats</div>
      <div className="card-list">
        {recentChats.length === 0 && <div className="empty-state">No chats yet.</div>}
        {recentChats.map((c) => (
          <div key={c.id} className="list-card" onClick={() => navigate(`/chats/${c.id}`)}>
            <span className="list-card-title">{c.title}</span>
            <span className="list-card-meta">{TYPE_LABEL[c.type]}</span>
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
          initialSelection={selection}
          onClose={() => setShowPicker(false)}
          onConfirm={handlePickerConfirm}
        />
      )}

      {showDrPicker && (
        <ReferencePickerModal
          title="Choose a folder to research"
          singleFolder
          initialSelection={{ folderIds: deepResearchFolderId ? [deepResearchFolderId] : [], paperIds: [] }}
          onClose={() => setShowDrPicker(false)}
          onConfirm={(sel) => {
            setDeepResearchFolderId(sel.folderIds[0] ?? '')
            setShowDrPicker(false)
          }}
        />
      )}
    </div>
  )
}
