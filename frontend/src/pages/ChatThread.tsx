import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { NotebookPen, ArrowLeft, Check } from 'lucide-react'
import { chatsApi } from '../api/chats'
import { referencesApi } from '../api/references'
import type { Chat, ChatMessage, DeepResearchStage, MessageOutput } from '../api/types'
import { ReferencePickerModal, type ReferencePickerSelection } from '../components/ReferencePickerModal'
import { Markdown } from '../components/Markdown'
import { NotebooksPanel } from '../components/NotebooksPanel'
import { SaveToNotebookModal } from '../components/SaveToNotebookModal'
import { SaveToFolderModal } from '../components/SaveToFolderModal'

const QUICK_ACTIONS = [
  'Summarize the paper(s)',
  'Compare key claims across papers',
  'Find evidence for a claim',
  'Extract the study population',
  'Get a brief overview of the topic',
  'Extract numbers & metrics',
]

const TYPE_LABEL: Record<Chat['type'], string> = {
  chat_with_pdf: 'Chat with PDF',
  search: 'AI Search',
  deep_research: 'Deep Research Report',
}

const STAGE_LABEL: Record<string, string> = {
  plan: 'Planning research angles',
  search: 'Searching for papers',
  screen: 'Screening candidates',
  extract: 'Extracting findings',
  synthesize: 'Writing report',
  planning: 'Expanding your question',
  research: 'Researching',
}

export function ChatThread() {
  const { chatId } = useParams<{ chatId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [chat, setChat] = useState<Chat | null>(null)
  const [input, setInput] = useState('')
  const [streamingText, setStreamingText] = useState<string | null>(null)
  const [liveOutput, setLiveOutput] = useState<MessageOutput | null>(null)
  const [liveStages, setLiveStages] = useState<DeepResearchStage[] | null>(null)
  const [pending, setPending] = useState(false)
  const [showAddSource, setShowAddSource] = useState(false)
  const [selectedOutputIdx, setSelectedOutputIdx] = useState<number | null>(null)
  const [showNotesPanel, setShowNotesPanel] = useState(false)
  const [saveTarget, setSaveTarget] = useState<{ messageIdx: number; text: string } | null>(null)
  const [savedMessageIdx, setSavedMessageIdx] = useState<number | null>(null)
  const [noteUpdateSignal, setNoteUpdateSignal] = useState<{ noteId: string; version: number } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const sentInitialRef = useRef(false)

  function load() {
    if (!chatId) return
    chatsApi.get(chatId).then((c) => {
      setChat(c)
      setSelectedOutputIdx(null)
    })
  }

  useEffect(load, [chatId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat?.messages, streamingText, liveStages])

  const outputs = useMemo(() => {
    if (!chat) return []
    return chat.messages
      .map((m, idx) => ({ idx, message: m }))
      .filter((x) => x.message.output)
      .map((x, i) => ({
        index: i,
        messageIdx: x.idx,
        label: chat.messages[x.idx - 1]?.content?.slice(0, 60) || `Output ${i + 1}`,
        output: x.message.output as MessageOutput,
      }))
  }, [chat])

  const activeOutput = liveOutput ?? (selectedOutputIdx !== null ? outputs[selectedOutputIdx]?.output : outputs.at(-1)?.output) ?? null

  function send(content: string) {
    if (!chatId || !content.trim() || pending) return
    setPending(true)
    setInput('')
    setChat((prev) =>
      prev ? { ...prev, messages: [...prev.messages, { role: 'user', content, createdAt: new Date().toISOString() }] } : prev,
    )
    setStreamingText('')
    setLiveOutput(null)
    setLiveStages(
      chat?.type === 'deep_research' && chat.messages.length === 0
        ? chat.deepResearchMode === 'openai'
          ? [
              { name: 'planning', status: 'pending' },
              { name: 'research', status: 'pending' },
            ]
          : [
              { name: 'plan', status: 'pending' },
              { name: 'search', status: 'pending' },
              { name: 'screen', status: 'pending' },
              { name: 'extract', status: 'pending' },
              { name: 'synthesize', status: 'pending' },
            ]
        : null,
    )

    chatsApi.streamMessage(chatId, content, {
      onOutput: (output) => setLiveOutput(output),
      onStage: ({ stage, status, detail }) => {
        setLiveStages((prev) => {
          const list = prev ?? []
          const existing = list.find((s) => s.name === stage)
          if (!existing) {
            return [...list, { name: stage, status: status as DeepResearchStage['status'], detail }]
          }
          return list.map((s) => (s.name === stage ? { ...s, status: status as DeepResearchStage['status'], detail } : s))
        })
      },
      onDelta: (delta) => setStreamingText((prev) => (prev ?? '') + delta),
      onDone: () => {
        setStreamingText(null)
        setLiveStages(null)
        setPending(false)
        load()
      },
      onError: () => {
        setStreamingText(null)
        setLiveStages(null)
        setPending(false)
      },
    })
  }

  useEffect(() => {
    const initialMessage = (location.state as { initialMessage?: string } | null)?.initialMessage
    if (initialMessage && chat && chat.messages.length === 0 && !sentInitialRef.current) {
      sentInitialRef.current = true
      send(initialMessage)
      navigate(location.pathname, { replace: true, state: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat])

  async function handleAddSources(selection: ReferencePickerSelection) {
    if (!chatId) return
    for (const folderId of selection.folderIds) {
      await chatsApi.addSource(chatId, { folderId })
    }
    for (const paperId of selection.paperIds) {
      await chatsApi.addSource(chatId, { paperId })
    }
    setShowAddSource(false)
    load()
  }

  function downloadMarkdown(markdown: string, filename: string) {
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!chat) return <div className="empty-state" style={{ margin: 40 }}>Loading...</div>

  return (
    <div className="chat-page">
      <div className="chat-breadcrumb">
        <span>
          {TYPE_LABEL[chat.type]} / {chat.title}
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {outputs.length > 0 && (
            <select
              className="btn"
              value={selectedOutputIdx ?? outputs.length - 1}
              onChange={(e) => setSelectedOutputIdx(Number(e.target.value))}
            >
              {outputs.map((o) => (
                <option key={o.index} value={o.index}>
                  Output {o.index + 1}: {o.label}
                </option>
              ))}
            </select>
          )}
          <button className="btn" onClick={() => setShowNotesPanel((v) => !v)}>
            {showNotesPanel ? (
              <>
                <ArrowLeft size={14} /> Back
              </>
            ) : (
              <>
                <NotebookPen size={14} /> Notes
              </>
            )}
          </button>
          <button className="btn" onClick={() => navigate('/')}>
            + New Chat
          </button>
        </div>
      </div>

      <div className="chat-body">
        {showNotesPanel ? (
          <NotebooksPanel variant="panel" externalUpdateSignal={noteUpdateSignal} />
        ) : (
          <>
            {chat.type === 'chat_with_pdf' && (
              <div className="chat-sources">
                <div className="chat-sources-header">
                  <span>
                    Sources ({chat.sources.folders.length + chat.sources.papers.length})
                  </span>
                  <button className="btn" onClick={() => setShowAddSource(true)}>
                    + Add File
                  </button>
                </div>
                {chat.sources.folders.map((f) => (
                  <div key={f.id} className="source-card">
                    <div className="source-card-title">📁 {f.name}</div>
                    <div className="source-card-meta">{f.paperCount} paper(s) — whole folder</div>
                  </div>
                ))}
                {chat.sources.papers.map((p) => (
                  <div key={p.id} className="source-card">
                    <div className="source-card-title">📄 {p.title}</div>
                  </div>
                ))}
              </div>
            )}

            {(chat.type === 'search' || chat.type === 'deep_research') && (
              <OutputPanel output={activeOutput} onDownload={downloadMarkdown} onSaved={load} />
            )}
          </>
        )}

        <div className="chat-thread">
          <div className="chat-messages">
            {chat.messages.length === 0 && !liveStages && (
              <div className="empty-state">
                {chat.type === 'chat_with_pdf' && 'Ask a question about the source paper(s).'}
                {chat.type === 'search' && 'Ask a research question to search papers.'}
                {chat.type === 'deep_research' && 'Describe the topic for your Deep Research Report.'}
              </div>
            )}
            {chat.messages.map((m: ChatMessage, i: number) => (
              <div key={i} className={`chat-bubble ${m.role}`}>
                {m.role === 'assistant' ? <Markdown>{m.content}</Markdown> : m.content}
                {m.role === 'assistant' && (
                  <div className="chat-bubble-actions">
                    <button
                      className="btn btn-pill btn-save-note"
                      onClick={() =>
                        setSaveTarget({
                          messageIdx: i,
                          text: m.output?.kind === 'document' ? m.output.markdown : m.content,
                        })
                      }
                    >
                      {savedMessageIdx === i ? (
                        <>
                          <Check size={13} /> Saved
                        </>
                      ) : (
                        <>
                          <NotebookPen size={13} /> Save to Notes
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))}
            {liveStages && (
              <div className="chat-bubble assistant">
                <div className="dr-stages">
                  {liveStages.map((s, idx) => (
                    <div key={s.name} className={`dr-stage dr-stage--${s.status}`}>
                      <div className="dr-stage-rail">
                        <span className="dr-stage-icon">{s.status === 'done' && '✓'}</span>
                        {idx < liveStages.length - 1 && <span className="dr-stage-line" />}
                      </div>
                      <div className="dr-stage-text">
                        <span className="dr-stage-label">{STAGE_LABEL[s.name]}</span>
                        {s.detail && <span className="dr-stage-detail"> — {s.detail}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {streamingText !== null && (
              <div className="chat-bubble assistant">
                {streamingText ? (
                  <Markdown>{streamingText}</Markdown>
                ) : (
                  <span className="chat-loading-dots">
                    <span />
                    <span />
                    <span />
                  </span>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {chat.type === 'chat_with_pdf' && (
            <div className="quick-actions">
              {QUICK_ACTIONS.map((qa) => (
                <button key={qa} className="btn btn-pill" onClick={() => send(qa)} disabled={pending}>
                  {qa}
                </button>
              ))}
            </div>
          )}

          <div className="chat-input-bar">
            <div className="chat-input-row">
              <textarea
                placeholder={chat.type === 'search' ? 'Ask another research question...' : 'Ask a follow-up...'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send(input)
                  }
                }}
              />
              <button className="btn btn-primary btn-icon" onClick={() => send(input)} disabled={pending}>
                ↑
              </button>
            </div>
          </div>
        </div>
      </div>

      {showAddSource && (
        <ReferencePickerModal
          title="Add sources to this chat"
          excludePaperIds={chat.sourcePaperIds}
          excludeFolderIds={chat.sourceFolderIds}
          onClose={() => setShowAddSource(false)}
          onConfirm={handleAddSources}
        />
      )}

      {saveTarget && (
        <SaveToNotebookModal
          text={saveTarget.text}
          onClose={() => setSaveTarget(null)}
          onSaved={(noteId, mode) => {
            setSavedMessageIdx(saveTarget.messageIdx)
            setTimeout(() => setSavedMessageIdx(null), 2000)
            setSaveTarget(null)
            if (mode === 'append') setNoteUpdateSignal({ noteId, version: Date.now() })
          }}
        />
      )}
    </div>
  )
}

function OutputPanel({
  output,
  onDownload,
  onSaved,
}: {
  output: MessageOutput | null
  onDownload: (markdown: string, filename: string) => void
  onSaved: () => void
}) {
  if (!output) {
    return <div className="chat-sources empty-state">No output yet — ask a question to get started.</div>
  }

  if (output.kind === 'papers') {
    return (
      <div className="chat-sources" style={{ width: 380 }}>
        <div className="chat-sources-header">
          <span>Papers ({output.results.length})</span>
        </div>
        {output.results.map((r, i) => (
          <SearchResultCard key={i} rank={i + 1} result={r} onSaved={onSaved} />
        ))}
      </div>
    )
  }

  return (
    <div className="chat-sources" style={{ width: 420 }}>
      <div className="chat-sources-header">
        <span>Report</span>
        <button className="btn" onClick={() => onDownload(output.markdown, 'deep-research-report.md')}>
          ⬇ Download .md
        </button>
      </div>
      <Markdown>{output.markdown}</Markdown>
    </div>
  )
}

function SearchResultCard({
  rank,
  result,
  onSaved,
}: {
  rank: number
  result: import('../api/types').SearchResult
  onSaved: () => void
}) {
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showFolderModal, setShowFolderModal] = useState(false)
  const navigate = useNavigate()

  async function save(folderId?: string | null) {
    setSaving(true)
    try {
      const paper = await referencesApi.saveFromSearch({
        title: result.title,
        authors: result.authors,
        year: result.year,
        venue: result.venue,
        doi: result.doi,
        abstract: result.abstract,
        citationCount: result.citationCount,
        url: result.url,
        pdfUrl: result.pdfUrl,
        folderId,
      })
      setSaved(true)
      onSaved()
      return paper
    } finally {
      setSaving(false)
    }
  }

  async function saveToFolder(folderId: string | null) {
    await save(folderId)
    setShowFolderModal(false)
  }

  async function saveAndChat() {
    const paper = await save()
    if (!paper) return
    const chat = await chatsApi.create({ type: 'chat_with_pdf', sourcePaperIds: [paper.id] })
    navigate(`/chats/${chat.id}`)
  }

  return (
    <div className="source-card">
      <div className="source-card-meta">
        {rank}. 📖 {result.venue || result.source}
      </div>
      <div className="source-card-title">{result.title}</div>
      <div className="source-card-meta">
        {result.citationCount ?? 0} Citations · {result.year ?? 'n.d.'} · {result.authors.slice(0, 2).join(', ')}
        {result.authors.length > 2 ? ` +${result.authors.length - 2} more` : ''}
      </div>
      {result.abstract && (
        <div style={{ background: 'var(--bg-subtle)', padding: 8, borderRadius: 8, fontSize: 12, margin: '6px 0' }}>
          ✦ {result.abstract.slice(0, 220)}...
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn" disabled={saving || saved} onClick={() => setShowFolderModal(true)}>
          {saved ? '✓ Saved' : '+ My References'}
        </button>
        <button className="btn" disabled={saving} onClick={saveAndChat}>
          💬 Save & Chat
        </button>
        {result.pdfUrl && (
          <a className="btn" href={result.pdfUrl} target="_blank" rel="noreferrer">
            📄 PDF
          </a>
        )}
      </div>
      {showFolderModal && (
        <SaveToFolderModal onClose={() => setShowFolderModal(false)} onConfirm={saveToFolder} />
      )}
    </div>
  )
}
