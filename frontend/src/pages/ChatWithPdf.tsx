import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { chatsApi } from '../api/chats'
import { notebooksApi } from '../api/notebooks'
import type { Chat, ChatMessage } from '../api/types'
import { ReferencePickerModal } from '../components/ReferencePickerModal'

const QUICK_ACTIONS = [
  'Summarize the paper(s)',
  'Compare key claims across papers',
  'Find evidence for a claim',
  'Extract the study population',
  'Get a brief overview of the topic',
  'Extract numbers & metrics',
]

export function ChatWithPdf() {
  const { chatId } = useParams<{ chatId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [chat, setChat] = useState<Chat | null>(null)
  const [input, setInput] = useState('')
  const [streamingText, setStreamingText] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [showAddSource, setShowAddSource] = useState(false)
  const [savingNotebook, setSavingNotebook] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const sentInitialRef = useRef(false)

  function load() {
    if (!chatId) return
    chatsApi.get(chatId).then(setChat)
  }

  useEffect(load, [chatId])

  useEffect(() => {
    const initialMessage = (location.state as { initialMessage?: string } | null)?.initialMessage
    if (initialMessage && chat && chat.messages.length === 0 && !sentInitialRef.current) {
      sentInitialRef.current = true
      send(initialMessage)
      navigate(location.pathname, { replace: true, state: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat?.messages, streamingText])

  function send(content: string) {
    if (!chatId || !content.trim() || pending) return
    setPending(true)
    setInput('')
    setChat((prev) =>
      prev ? { ...prev, messages: [...prev.messages, { role: 'user', content, createdAt: new Date().toISOString() }] } : prev,
    )
    setStreamingText('')
    chatsApi.streamMessage(chatId, content, {
      onDelta: (delta) => setStreamingText((prev) => (prev ?? '') + delta),
      onDone: () => {
        setStreamingText(null)
        setPending(false)
        load()
      },
      onError: () => {
        setStreamingText(null)
        setPending(false)
      },
    })
  }

  async function handleAddSources(paperIds: string[]) {
    if (!chatId) return
    for (const paperId of paperIds) {
      await chatsApi.addSource(chatId, paperId)
    }
    setShowAddSource(false)
    load()
  }

  async function handleSaveToNotebook() {
    if (!chatId || !chat) return
    setSavingNotebook(true)
    try {
      await notebooksApi.create(chatId, chat.title)
      alert('Saved to My Notebooks')
    } finally {
      setSavingNotebook(false)
    }
  }

  if (!chat) return <div className="empty-state" style={{ margin: 40 }}>Loading...</div>

  return (
    <div className="chat-page">
      <div className="chat-breadcrumb">
        <span>Chat with PDF / {chat.title}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={handleSaveToNotebook} disabled={savingNotebook}>
            📓 Save to Notebook
          </button>
          <button className="btn" onClick={() => navigate('/')}>
            + New Chat
          </button>
        </div>
      </div>

      <div className="chat-body">
        <div className="chat-sources">
          <div className="chat-sources-header">
            <span>Sources ({chat.sources.length} files)</span>
            <button className="btn" onClick={() => setShowAddSource(true)}>
              + Add File
            </button>
          </div>
          {chat.sources.map((s) => (
            <div key={s.id} className="source-card">
              <div className="source-card-title">📄 {s.title}</div>
              <div className="source-card-meta">
                <a href="#" onClick={(e) => e.preventDefault()}>
                  Cite
                </a>
                {'  '}
                <a href="#" onClick={(e) => e.preventDefault()}>
                  @Mention
                </a>
              </div>
            </div>
          ))}
        </div>

        <div className="chat-thread">
          <div className="chat-messages">
            {chat.messages.length === 0 && (
              <div className="empty-state">Ask a question about the source paper(s) below.</div>
            )}
            {chat.messages.map((m: ChatMessage, i: number) => (
              <div key={i} className={`chat-bubble ${m.role}`}>
                {m.content}
              </div>
            ))}
            {streamingText !== null && (
              <div className="chat-bubble assistant">
                {streamingText || <span className="chat-loading">Analyzing relevant sections...</span>}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="quick-actions">
            {QUICK_ACTIONS.map((qa) => (
              <button key={qa} className="btn btn-pill" onClick={() => send(qa)} disabled={pending}>
                {qa}
              </button>
            ))}
          </div>

          <div className="chat-input-bar">
            <div className="chat-input-row">
              <textarea
                placeholder="Ask a follow-up..."
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
          excludeIds={chat.sourcePaperIds}
          onClose={() => setShowAddSource(false)}
          onConfirm={handleAddSources}
        />
      )}
    </div>
  )
}
