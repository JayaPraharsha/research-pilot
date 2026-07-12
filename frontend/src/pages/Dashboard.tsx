import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { chatsApi } from '../api/chats'
import { notebooksApi } from '../api/notebooks'
import { referencesApi } from '../api/references'
import type { ChatSummary, ChatType, DeepResearchMode, NotebookSummary } from '../api/types'
import { SourceScopeDropdown, type SourceScopeValue } from '../components/SourceScopeDropdown'

const AGENTS: { type: ChatType; label: string; icon: string; description: string }[] = [
  { type: 'search', label: 'AI Search', icon: '🔍', description: 'Search papers and get cited answers.' },
  { type: 'chat_with_pdf', label: 'Chat with PDF', icon: '💬', description: 'Ask questions and get cited answers from PDFs.' },
  { type: 'deep_research', label: 'Deep Research Report', icon: '📄', description: 'Generate a detailed, cited report from papers.' },
]

const TYPE_LABEL: Record<ChatType, string> = {
  chat_with_pdf: 'Chat with PDF',
  search: 'AI Search',
  deep_research: 'Deep Research',
}

const CHAT_WITH_PDF_SUGGESTIONS = [
  { icon: '📝', label: 'Summarize a research paper' },
  { icon: '📑', label: 'Compare key claims across papers' },
  { icon: '❓', label: 'Find evidence for a claim' },
  { icon: '📖', label: 'Extract the study population' },
  { icon: '🔎', label: 'Get a brief overview of the topic' },
  { icon: '🔢', label: 'Extract numbers & metrics' },
]

const SEARCH_SUGGESTIONS: { category: string; icon: string; questions: string[] }[] = [
  {
    category: 'Environment',
    icon: '🌍',
    questions: [
      'What is the association between long-term PM2.5 exposure and cardiovascular mortality?',
      'How does climate change affect the frequency and intensity of heatwaves globally?',
      'Do microplastics in drinking water pose measurable risks to human health?',
      'How effective is carbon capture and storage at reducing industrial CO2 emissions at scale?',
      'What are the biodiversity impacts of renewable energy expansion (wind/solar) on local ecosystems?',
    ],
  },
  {
    category: 'Technology',
    icon: '💻',
    questions: [
      'How reliable are common LLM evaluation benchmarks at predicting real-world performance?',
      'How accurate are AI models for detecting breast cancer on mammography?',
      'Do wearables reliably detect atrial fibrillation compared to clinical ECG?',
      'What techniques best reduce hallucinations in medical or scientific LLM outputs?',
    ],
  },
  {
    category: 'Fitness & Nutrition',
    icon: '🍎',
    questions: [
      'Do ultra-processed foods increase risk of cardiovascular disease and mortality?',
      'Is intermittent fasting more effective than daily calorie restriction for fat loss and metabolic health?',
      'Does resistance training reduce depression and anxiety symptoms compared to no exercise?',
      'How does sleep duration and quality affect body composition and appetite regulation?',
      'Are plant-based diets associated with lower risk of type 2 diabetes and heart disease?',
    ],
  },
  {
    category: 'Clinical Medicine',
    icon: '🩺',
    questions: [
      'Are GLP-1 receptor agonists effective and safe for long-term weight loss?',
      'Does metformin reduce progression from prediabetes to type 2 diabetes in real-world studies?',
      'Is early physical therapy effective for reducing pain and disability in low back pain?',
      'Are proton pump inhibitors associated with increased risk of kidney disease?',
      'What is the comparative effectiveness of CBT vs SSRIs for generalized anxiety disorder?',
    ],
  },
  {
    category: 'Healthcare',
    icon: '🏃',
    questions: [
      'Does long-term PM2.5 exposure increase risk of dementia?',
      'What is the association between heat exposure and cardiovascular mortality among outdoor workers?',
      'Does night shift work increase risk of type 2 diabetes and metabolic syndrome?',
      'How strongly is alcohol consumption linked to all-cause mortality across dose ranges?',
    ],
  },
]

const DEEP_RESEARCH_SUGGESTIONS = [
  {
    icon: '🌐',
    title: 'Social media and mental health',
    question: 'How does daily social media use relate to anxiety, depression, or self-esteem in young adults?',
  },
  {
    icon: '🎓',
    title: 'AI in education',
    question: 'Does personalized learning with AI tools improve student outcomes compared to traditional instruction?',
  },
  {
    icon: '🧠',
    title: 'Sleep and academic performance',
    question: 'How does sleep duration/quality predict grades, attention, and memory in students?',
  },
  {
    icon: '⚖️',
    title: 'Bias and fairness in AI',
    question: 'Which bias-mitigation methods most effectively reduce unfair outcomes without hurting performance?',
  },
  {
    icon: '🧪',
    title: 'Reproducibility in science',
    question: 'What are the most common causes of failed replication, and which interventions improve reproducibility?',
  },
  {
    icon: '🏙️',
    title: 'Urban green spaces and wellbeing',
    question: 'Do nearby parks and green spaces measurably improve mental wellbeing and stress levels in cities?',
  },
  {
    icon: '🏠',
    title: 'Remote work and productivity',
    question: 'What impact does remote work have on productivity and job satisfaction across different roles?',
  },
  {
    icon: '🔒',
    title: 'Data privacy and user trust',
    question: 'How do privacy policies and consent prompts influence user trust and willingness to share data?',
  },
]

export function Dashboard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialAgent = (searchParams.get('agent') as ChatType | null) ?? 'search'
  const [agent, setAgent] = useState<ChatType>(initialAgent)
  const [agentMenuOpen, setAgentMenuOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [sourceScope, setSourceScope] = useState<SourceScopeValue>(
    initialAgent === 'chat_with_pdf' ? { kind: 'reference_manager', folderIds: [], paperIds: [] } : { kind: 'all_papers' },
  )
  const [deepResearchMode, setDeepResearchMode] = useState<DeepResearchMode>('standard')
  const [recentChats, setRecentChats] = useState<ChatSummary[]>([])
  const [recentNotebooks, setRecentNotebooks] = useState<NotebookSummary[]>([])
  const [creating, setCreating] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    chatsApi.list().then((chats) => setRecentChats(chats.slice(0, 5)))
    notebooksApi.list().then((nbs) => setRecentNotebooks(nbs.slice(0, 5)))
  }, [])

  // Chat with PDF can only ever work over already-ingested papers — force that scope.
  useEffect(() => {
    if (agent === 'chat_with_pdf' && sourceScope.kind !== 'reference_manager') {
      setSourceScope({ kind: 'reference_manager', folderIds: [], paperIds: [] })
    }
  }, [agent, sourceScope])

  // Deep Research only accepts a single whole folder — drop an incompatible multi-paper/folder selection.
  useEffect(() => {
    if (
      agent === 'deep_research' &&
      sourceScope.kind === 'reference_manager' &&
      (sourceScope.paperIds.length > 0 || sourceScope.folderIds.length > 1)
    ) {
      setSourceScope({ kind: 'all_papers' })
    }
  }, [agent, sourceScope])

  // Deeper Search only makes sense against the open web, not ArXiv-only or a folder scope.
  useEffect(() => {
    if (agent === 'deep_research' && sourceScope.kind !== 'all_papers' && deepResearchMode === 'openai') {
      setDeepResearchMode('standard')
    }
  }, [agent, sourceScope, deepResearchMode])

  const canSubmit =
    question.trim().length > 0 &&
    !(agent === 'chat_with_pdf' && sourceScope.kind === 'reference_manager' && sourceScope.folderIds.length === 0 && sourceScope.paperIds.length === 0)

  async function handleSubmit() {
    if (!canSubmit) return
    setCreating(true)
    try {
      const isRefScope = sourceScope.kind === 'reference_manager'
      const deepResearchScope = isRefScope ? 'folder' : sourceScope.kind === 'arxiv' ? 'arxiv' : 'external'
      const chat = await chatsApi.create({
        type: agent,
        sourceFolderIds: isRefScope ? sourceScope.folderIds : [],
        sourcePaperIds: isRefScope ? sourceScope.paperIds : [],
        title: question.slice(0, 80),
        deepResearchScope: agent === 'deep_research' ? deepResearchScope : undefined,
        deepResearchMode: agent === 'deep_research' ? deepResearchMode : undefined,
        searchScope: agent === 'search' ? sourceScope.kind : undefined,
      })
      navigate(`/chats/${chat.id}`, { state: { initialMessage: question } })
    } finally {
      setCreating(false)
    }
  }

  async function handleAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const paper = await referencesApi.uploadFile(file)
    if (agent === 'deep_research') return // Deep Research only accepts a whole folder, not an individual paper
    setSourceScope((prev) => {
      const base = prev.kind === 'reference_manager' ? prev : { kind: 'reference_manager' as const, folderIds: [], paperIds: [] }
      return { ...base, paperIds: [...base.paperIds, paper.id] }
    })
  }

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
            <div className="dropdown">
              <button className="btn btn-pill" onClick={() => setAgentMenuOpen((v) => !v)}>
                {AGENTS.find((a) => a.type === agent)?.icon} {TYPE_LABEL[agent]} ▾
              </button>
              {agentMenuOpen && (
                <div className="dropdown-menu">
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', padding: '4px 10px' }}>Select Research Agent:</div>
                  {AGENTS.map((a) => (
                    <div
                      key={a.type}
                      className="dropdown-item"
                      style={agent === a.type ? { background: 'var(--accent-soft)' } : undefined}
                      onClick={() => {
                        setAgent(a.type)
                        setAgentMenuOpen(false)
                      }}
                    >
                      <span className="dropdown-item-label">
                        {a.icon} {a.label}
                      </span>
                      <span className="dropdown-item-sub">{a.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <SourceScopeDropdown agent={agent} value={sourceScope} onChange={setSourceScope} />

            {agent === 'deep_research' && (
              <div
                className="segmented"
                title={
                  sourceScope.kind !== 'all_papers'
                    ? "Deeper Search searches the open web and isn't compatible with ArXiv-only or folder scope"
                    : undefined
                }
              >
                <button
                  className={`segmented-option${deepResearchMode === 'standard' ? ' active' : ''}`}
                  onClick={() => setDeepResearchMode('standard')}
                >
                  Standard
                </button>
                <button
                  className={`segmented-option${deepResearchMode === 'openai' ? ' active' : ''}`}
                  disabled={sourceScope.kind !== 'all_papers'}
                  onClick={() => setDeepResearchMode('openai')}
                >
                  Deeper Search
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input ref={fileInputRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={handleAttach} />
            <button
              className="btn btn-icon"
              title={
                agent === 'deep_research'
                  ? 'Attach a PDF (added to Reference Manager — pick a folder above to use it)'
                  : 'Attach a PDF'
              }
              onClick={() => fileInputRef.current?.click()}
            >
              📎
            </button>
            <button className="btn btn-primary btn-icon" onClick={handleSubmit} disabled={creating || !canSubmit}>
              →
            </button>
          </div>
        </div>
      </div>

      {agent === 'chat_with_pdf' && (
        <div className="suggestions-section">
          <div className="suggestions-title">Ask your PDF/Papers anything</div>
          <div className="suggestions-grid-3col">
            {CHAT_WITH_PDF_SUGGESTIONS.map((s) => (
              <button key={s.label} className="suggestion-chip" onClick={() => setQuestion(s.label)}>
                <span>{s.icon}</span> {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {agent === 'search' && (
        <div className="suggestions-section">
          <div className="suggestions-title">Explore sample research questions</div>
          {SEARCH_SUGGESTIONS.map((cat) => (
            <div key={cat.category} className="suggestions-category">
              <div className="suggestions-category-label">
                {cat.icon} {cat.category}
              </div>
              <div className="suggestions-pill-row">
                {cat.questions.map((q) => (
                  <button key={q} className="suggestion-pill" onClick={() => setQuestion(q)}>
                    🔍 {q}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {agent === 'deep_research' && (
        <div className="suggestions-section">
          <div className="suggestions-title">Start a deep research report with</div>
          <div className="suggestions-card-grid">
            {DEEP_RESEARCH_SUGGESTIONS.map((s) => (
              <button key={s.title} className="suggestion-card" onClick={() => setQuestion(s.question)}>
                <div className="suggestion-card-title">
                  {s.icon} {s.title}
                </div>
                <div className="suggestion-card-desc">{s.question}</div>
              </button>
            ))}
          </div>
        </div>
      )}

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
            <span className="list-card-meta">{new Date(n.updatedAt).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
