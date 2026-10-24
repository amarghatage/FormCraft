import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, BarChart3, Check, ChevronDown, CircleHelp, ClipboardList, Copy, FilePlus2, Eye, GripVertical, House, ImagePlus, LayoutDashboard, Link2, List, ListChecks, LoaderCircle, LogOut, Mail, Menu, MoreHorizontal, Plus, Search, Send, Sparkles, Trash2, Type, UserRound, Video, X } from 'lucide-react'

const API_BASES = import.meta.env.VITE_API_URL
  ? [import.meta.env.VITE_API_URL]
  : ['http://127.0.0.1:8000/api', 'http://127.0.0.1:8017/api']
const blankQuestion = (type = 'short_text') => ({ id: crypto.randomUUID(), title: type === 'image' ? 'Image' : type === 'video' ? 'Video' : 'Untitled question', type, required: false, options: ['Option 1', 'Option 2'], media_url: '' })
const FORM_THEMES = [
  { id: 'violet', name: 'Violet', accent: '#6254d9', tint: '#efedff', banner: 'linear-gradient(115deg,#e9e7ff,#f6f2ff 58%,#eaf3ff)' },
  { id: 'ocean', name: 'Ocean', accent: '#167b9b', tint: '#e5f5fa', banner: 'linear-gradient(115deg,#ddf2f7,#eefafd 58%,#e4f3ff)' },
  { id: 'forest', name: 'Forest', accent: '#25835c', tint: '#e7f5ed', banner: 'linear-gradient(115deg,#e0f2e7,#f2faf4 58%,#e7f5ee)' },
  { id: 'sunset', name: 'Sunset', accent: '#c25b3b', tint: '#fff0e8', banner: 'linear-gradient(115deg,#ffeadf,#fff6ef 58%,#fff0e5)' },
  { id: 'slate', name: 'Slate', accent: '#475569', tint: '#edf1f5', banner: 'linear-gradient(115deg,#e8edf2,#f6f8fa 58%,#e8edf2)' },
]
const SHARED_FORM_ID = new URLSearchParams(window.location.search).get('form')
const readSession = () => { try { return JSON.parse(localStorage.getItem('formbuilder_session') || 'null') } catch { return null } }

async function api(path, options = {}) {
  let response
  for (const apiBase of API_BASES) {
    try {
      const session = readSession()
      response = await fetch(`${apiBase}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}), ...options.headers } })
      break
    } catch (error) {
      // Try the alternate default port when the first backend address is offline.
    }
  }
  if (!response) throw new Error(`Cannot reach the API at ${API_BASES.join(' or ')}. Start the backend on port 8000 or 8017, or set VITE_API_URL in frontend/.env.`)
  if (!response.ok) { let message = 'Something went wrong.'; try { message = (await response.json()).detail || message } catch {} throw new Error(message) }
  if (response.status === 204) return null
  return response.json()
}

function App() {
  const [session, setSession] = useState(readSession)
  const [forms, setForms] = useState([])
  const [selected, setSelected] = useState(null)
  const [activeTab, setActiveTab] = useState('Questions')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState(false)
  const [responses, setResponses] = useState([])
  const [search, setSearch] = useState('')
  const [formView, setFormView] = useState('grid')
  const [aiOpen, setAiOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiQuestionCount, setAiQuestionCount] = useState(6)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const [sharedForm, setSharedForm] = useState(null)
  const [sharedLoading, setSharedLoading] = useState(Boolean(SHARED_FORM_ID))
  const [sharedError, setSharedError] = useState('')

  const refresh = async () => { if (!session?.access_token) { setForms([]); setLoading(false); return }; setLoading(true); try { setForms(await api('/forms')); setError('') } catch (e) { setError(e.message) } finally { setLoading(false) } }
  useEffect(() => { refresh() }, [session?.access_token])
  useEffect(() => {
    if (!SHARED_FORM_ID) return
    api(`/public/forms/${SHARED_FORM_ID}`).then(setSharedForm).catch(e => setSharedError(e.message)).finally(() => setSharedLoading(false))
  }, [])
  useEffect(() => { if (session && selected?.id && activeTab === 'Responses') api(`/forms/${selected.id}/responses`).then(setResponses).catch(e => setError(e.message)) }, [session, selected?.id, activeTab])

  const acceptSession = (result) => { localStorage.setItem('formbuilder_session', JSON.stringify(result)); setSession(result) }
  const logout = () => { localStorage.removeItem('formbuilder_session'); setSession(null); setSelected(null); setForms([]); setResponses([]); setNotice('') }
  const goHome = () => { setSelected(null); setActiveTab('Questions'); setPreview(false); setResponses([]) }

  const createForm = async () => {
    setBusy(true)
    try { const form = await api('/forms', { method: 'POST', body: JSON.stringify({ title: 'Untitled form', description: '', questions: [blankQuestion()] }) }); setForms(prev => [form, ...prev]); setSelected(form); setActiveTab('Questions'); setNotice('Form created') }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const generateWithAI = async () => {
    setAiBusy(true)
    setAiError('')
    try {
      const draft = await api('/ai/generate-form', { method: 'POST', body: JSON.stringify({ prompt: aiPrompt, question_count: aiQuestionCount }) })
      setSelected({ ...draft, theme: 'violet', id: null, created_at: new Date().toISOString(), response_count: 0 })
      setActiveTab('Questions')
      setPreview(false)
      setAiOpen(false)
      setNotice('AI draft ready. Review it, then save your form.')
    } catch (e) { setAiError(e.message) } finally { setAiBusy(false) }
  }
  const updateSelected = (patch) => setSelected(prev => ({ ...prev, ...patch }))
  const save = async () => {
    if (!selected) return
    setBusy(true)
    try { const isNew = !selected.id; const saved = await api(isNew ? '/forms' : `/forms/${selected.id}`, { method: isNew ? 'POST' : 'PUT', body: JSON.stringify({ title: selected.title || 'Untitled form', description: selected.description || '', questions: selected.questions, theme: selected.theme || 'violet' }) }); setSelected(saved); setForms(prev => isNew ? [saved, ...prev] : prev.map(f => f.id === saved.id ? { ...f, ...saved } : f)); setNotice(isNew ? 'Form saved to your workspace' : 'All changes saved') }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const removeForm = async (form) => { if (!window.confirm(`Delete “${form.title}”? Its responses will also be removed.`)) return; try { await api(`/forms/${form.id}`, { method: 'DELETE' }); setForms(prev => prev.filter(f => f.id !== form.id)); if (selected?.id === form.id) setSelected(null); setNotice('Form deleted') } catch (e) { setError(e.message) } }
  const patchQuestion = (id, patch) => updateSelected({ questions: selected.questions.map(q => q.id === id ? { ...q, ...patch } : q) })
  const reorderQuestion = (sourceId, targetId, after = false) => {
    const questions = [...selected.questions]
    const sourceIndex = questions.findIndex(q => q.id === sourceId)
    const targetIndex = questions.findIndex(q => q.id === targetId)
    if (sourceIndex < 0 || targetIndex < 0) return
    const [question] = questions.splice(sourceIndex, 1)
    const boundary = targetIndex + (after ? 1 : 0)
    questions.splice(boundary - (sourceIndex < boundary ? 1 : 0), 0, question)
    updateSelected({ questions })
  }
  const moveQuestionBy = (id, offset) => {
    const questions = [...selected.questions]
    const from = questions.findIndex(q => q.id === id)
    const to = Math.max(0, Math.min(questions.length - 1, from + offset))
    if (from < 0 || from === to) return
    const [question] = questions.splice(from, 1)
    questions.splice(to, 0, question)
    updateSelected({ questions })
  }
  const addQuestion = (type = 'short_text') => { const q = blankQuestion(type); updateSelected({ questions: [...selected.questions, q] }); setNotice(type === 'image' ? 'Image block added' : type === 'video' ? 'Video block added' : 'Question added') }
  const filteredForms = useMemo(() => forms.filter(f => f.title.toLowerCase().includes(search.toLowerCase())), [forms, search])
  const answerQuestions = selected?.questions.filter(q => !['image', 'video'].includes(q.type)) || []

  const copyLink = async () => { if (!selected?.id) { setNotice('Save the form before sharing it'); return }; const url = `${location.origin}/?form=${selected.id}`; try { await navigator.clipboard.writeText(url); setNotice('Form link copied') } catch { setNotice(url) } }
  const exportCsv = () => {
    const headers = ['Submitted at', ...answerQuestions.map(q => q.title)]
    const rows = responses.map(r => [r.submitted_at, ...answerQuestions.map(q => r.answers[q.id] ?? '')])
    const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n')
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = `${selected.title || 'responses'}.csv`; link.click(); URL.revokeObjectURL(link.href)
  }

  if (SHARED_FORM_ID) {
    if (sharedLoading) return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Loading form…</div>
    if (sharedForm) return <div className="min-h-screen bg-slate-50 px-4 py-8"><Preview form={sharedForm} onClose={() => window.location.assign('/')} /></div>
    return <div className="grid min-h-screen place-items-center bg-slate-50 p-6"><div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><h1 className="text-xl font-semibold text-slate-900">This form is unavailable</h1><p className="mt-2 text-sm text-slate-500">{sharedError || 'The link may be invalid or the form may have been deleted.'}</p></div></div>
  }
  if (!session) return <AuthScreen onAuthenticated={acceptSession} />

  return <div className="app-shell min-h-screen bg-slate-50 text-slate-800">
    <aside className="sidebar fixed inset-y-0 left-0 z-10 flex w-64 flex-col border-r border-slate-200 bg-white px-4 py-5">
      <div className="brand flex items-center gap-2.5 pb-6 font-bold tracking-tight"><div className="brand-mark grid size-8 place-items-center rounded-xl bg-violet-600 text-white"><ClipboardList size={19} /></div><span>formcraft</span></div>
      <button className="workspace mb-6 flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 text-left"><div className="workspace-avatar">S</div><span><b>Studio workspace</b><small>Free plan</small></span><ChevronDown size={16} /></button>
      <div className="nav-label">WORKSPACE</div>
      <button className={`nav-item ${selected ? '' : 'active'}`} onClick={goHome}><LayoutDashboard size={17} /> All forms <span className="nav-count">{forms.length}</span></button>
      <button className="nav-item" onClick={() => selected && setActiveTab('Responses')}><BarChart3 size={17} /> Results</button>
      <div className="side-section"><div className="side-section-head"><span>YOUR FORMS</span><button aria-label="Create form" onClick={createForm}><Plus size={15} /></button></div>
        {forms.slice(0, 5).map(f => <button className={`side-form ${selected?.id === f.id ? 'selected' : ''}`} key={f.id} onClick={() => { setSelected(f); setActiveTab('Questions'); setPreview(false) }}><span className="form-dot" />{f.title || 'Untitled form'}</button>)}
        {!forms.length && <p className="side-empty">Your forms will appear here</p>}
      </div>
      <div className="sidebar-bottom"><div className="profile"><div className="profile-avatar">{session.user.name.slice(0, 2).toUpperCase()}</div><div><b>{session.user.name}</b><small>{session.user.email}</small></div><button className="logout-btn" onClick={logout} aria-label="Log out" title="Log out"><LogOut size={16}/></button></div></div>
    </aside>

    <main className="main-area ml-64 min-h-screen">
      <header className="topbar sticky top-0 z-[4] flex h-16 items-center justify-between border-b border-slate-200 bg-white px-9"><div className="breadcrumb"><span>Workspace</span><span className="slash">/</span><b>{selected?.title || 'All forms'}</b></div><div className="top-actions flex items-center gap-4"><button className="icon-btn mobile-menu"><Menu size={19}/></button><div className="top-avatar">{session.user.name.slice(0, 2).toUpperCase()}</div></div></header>
      {error && <div className="alert error"><span>{error}</span><button onClick={() => setError('')}><X size={15}/></button></div>}
      {notice && <div className="toast"><Check size={15}/>{notice}<button onClick={() => setNotice('')}><X size={14}/></button></div>}
      {aiOpen && <AIGenerator prompt={aiPrompt} setPrompt={setAiPrompt} questionCount={aiQuestionCount} setQuestionCount={setAiQuestionCount} busy={aiBusy} error={aiError} onClose={() => setAiOpen(false)} onGenerate={generateWithAI}/>}
      {!selected ? <section className="dashboard page-wrap">
        <div className="welcome-row flex items-center justify-between gap-6"><div><div className="eyebrow"><Sparkles size={14}/> YOUR WORKSPACE</div><h1>Welcome back, {session.user.name}</h1><p>Ready to collect some great answers?</p></div><div className="flex flex-wrap gap-2"><button className="outline-btn" onClick={() => setAiOpen(true)}><Sparkles size={16}/> Generate with AI</button><button className="primary-btn" onClick={createForm} disabled={busy}><Plus size={17}/> Create a form</button></div></div>
        <div className="stats-grid my-8 grid grid-cols-3 gap-4"><div className="stat-card grid min-h-24 grid-cols-[2.5rem_1fr] items-center gap-x-3 rounded-xl border border-slate-200 bg-white p-4"><div className="stat-icon lilac"><ClipboardList size={18}/></div><div><span>Total forms</span><strong>{forms.length}</strong></div><small>in your workspace</small></div><div className="stat-card grid min-h-24 grid-cols-[2.5rem_1fr] items-center gap-x-3 rounded-xl border border-slate-200 bg-white p-4"><div className="stat-icon mint"><ListChecks size={18}/></div><div><span>Responses</span><strong>{forms.reduce((sum, f) => sum + (f.response_count || 0), 0)}</strong></div><small>across all forms</small></div><div className="stat-card grid min-h-24 grid-cols-[2.5rem_1fr] items-center gap-x-3 rounded-xl border border-slate-200 bg-white p-4"><div className="stat-icon peach"><BarChart3 size={18}/></div><div><span>Active forms</span><strong>{forms.length}</strong></div><small>accepting responses</small></div></div>
        <div className="section-heading mb-4 flex items-end justify-between gap-4"><div><h2>Your forms</h2><p>Manage and keep track of your forms</p></div><div className="list-tools flex items-center gap-2"><label className="search-box"><Search size={16}/><input placeholder="Search forms..." value={search} onChange={e => setSearch(e.target.value)}/></label><div className="view-switch" role="group" aria-label="Form display mode"><button type="button" className={formView === 'grid' ? 'active' : ''} aria-label="Grid view" aria-pressed={formView === 'grid'} onClick={() => setFormView('grid')}><LayoutDashboard size={16}/></button><button type="button" className={formView === 'list' ? 'active' : ''} aria-label="List view" aria-pressed={formView === 'list'} onClick={() => setFormView('list')}><List size={17}/></button></div></div></div>
        {loading ? <div className="loading"><LoaderCircle className="spin"/> Loading your forms…</div> : filteredForms.length ? <div className={`forms-grid ${formView === 'list' ? 'list-view' : ''}`}>{filteredForms.map((form, i) => <article className="form-card overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md" key={form.id}><div className={`card-art art-${i % 4}`}><div className="art-paper"><span/><span/><span/><i/></div><span className="art-badge">{['Feedback','Survey','Registration','Quiz'][i % 4]}</span></div><div className="card-content p-4"><button className="card-title" onClick={() => { setSelected(form); setActiveTab('Questions') }}>{form.title}</button><p>{form.description || 'No description yet'}</p><div className="card-meta"><span><ListChecks size={14}/>{form.response_count || 0} responses</span><span>{new Date(form.created_at).toLocaleDateString()}</span></div><div className="card-actions"><button onClick={() => { setSelected(form); setActiveTab('Questions') }}><Type size={14}/> Update form</button><button onClick={() => { setSelected(form); setActiveTab('Responses') }}><BarChart3 size={14}/> Results</button><button className="delete-action" onClick={() => removeForm(form)}><Trash2 size={14}/> Delete</button></div></div></article>)}<button className="new-card" onClick={createForm}><div><Plus size={21}/></div><b>Create a new form</b><span>Start from a blank canvas</span></button></div> : <div className="empty-state"><div className="empty-icon"><FilePlus2 size={27}/></div><h3>{search ? 'No forms found' : 'Your next great form starts here'}</h3><p>{search ? 'Try another search term.' : 'Create a form to start collecting responses from your audience.'}</p>{!search && <button className="primary-btn" onClick={createForm}><Plus size={16}/> Create your first form</button>}</div>}
      </section> : <section className="editor page-wrap">
        <div className="editor-header flex items-center justify-between gap-4 pb-5"><div><button className="back-link flex items-center gap-1.5" onClick={goHome}><House size={14}/> Home · All forms</button><div className="editor-title-row"><input className="title-input" value={selected.title} onChange={e => updateSelected({ title: e.target.value })}/><span className="saved-label"><span/> Draft</span></div><p className="editor-subtitle">Last edited just now</p></div><div className="editor-buttons flex items-center gap-2"><button className="outline-btn" onClick={() => setPreview(!preview)}><Eye size={16}/>{preview ? 'Close preview' : 'Preview'}</button><button className="outline-btn share-btn" onClick={copyLink} disabled={!selected.id}><Link2 size={16}/> Share</button><button className="outline-btn delete-editor-btn" onClick={() => removeForm(selected)} aria-label="Delete form" disabled={!selected.id}><Trash2 size={15}/> Delete</button><button className="primary-btn save-btn" onClick={save} disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>} Save changes</button></div></div>
        <div className="tabs flex h-11 items-center gap-5 border-b border-slate-200"><button className={activeTab === 'Questions' ? 'tab active' : 'tab'} onClick={() => setActiveTab('Questions')}><ListChecks size={16}/> Questions <span>{selected.questions.length}</span></button><button className={activeTab === 'Responses' ? 'tab active' : 'tab'} onClick={() => setActiveTab('Responses')} disabled={!selected.id}><BarChart3 size={16}/> Responses <span>{responses.length}</span></button><div className="tab-spacer flex-1"/><button className="icon-btn"><MoreHorizontal size={18}/></button></div>
        {activeTab === 'Questions' && (preview ? <Preview form={selected} onClose={() => setPreview(false)} allowSubmit={Boolean(selected.id)} /> : <div className="builder-layout grid grid-cols-[minmax(0,1fr)_14rem] items-start gap-5 pt-5"><div className="builder-main grid gap-3"><div className="form-cover overflow-hidden rounded-xl border border-slate-200 bg-white" data-theme={selected.theme || 'violet'} style={{ '--theme-accent': FORM_THEMES.find(t => t.id === selected.theme)?.accent || FORM_THEMES[0].accent, '--theme-tint': FORM_THEMES.find(t => t.id === selected.theme)?.tint || FORM_THEMES[0].tint, '--theme-banner': FORM_THEMES.find(t => t.id === selected.theme)?.banner || FORM_THEMES[0].banner }}><div className="cover-art"><Sparkles size={20}/><span>FORMCRAFT</span></div><div className="form-details"><input className="form-name" value={selected.title} onChange={e => updateSelected({ title: e.target.value })} placeholder="Form title"/><textarea value={selected.description} onChange={e => updateSelected({ description: e.target.value })} placeholder="Add a short description to your form..." rows="2"/></div></div>
          <div className="theme-picker"><div className="theme-picker-copy"><b>Form theme</b><span>Choose a color style for your form and shared page.</span></div><div className="theme-options" role="group" aria-label="Form theme">{FORM_THEMES.map(theme => <button type="button" key={theme.id} className={`theme-option ${selected.theme === theme.id ? 'active' : ''}`} aria-pressed={selected.theme === theme.id} onClick={() => updateSelected({ theme: theme.id })}><span className="theme-swatch" style={{ background: theme.accent }}/>{theme.name}</button>)}</div></div>
          {selected.questions.map((q, index) => <QuestionCard key={q.id} question={q} index={index} update={patch => patchQuestion(q.id, patch)} remove={() => updateSelected({ questions: selected.questions.filter(item => item.id !== q.id) })} onMove={(sourceId, after) => reorderQuestion(sourceId, q.id, after)} moveUp={() => moveQuestionBy(q.id, -1)} moveDown={() => moveQuestionBy(q.id, 1)} isFirst={index === 0} isLast={index === selected.questions.length - 1}/>)}
          <div className="content-insert-toolbar"><button className="add-question flex h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white text-slate-600 transition hover:border-violet-400 hover:text-violet-700" onClick={() => addQuestion()}><span><Plus size={17}/></span> Add a question</button><button className="add-media-button" onClick={() => addQuestion('image')}><ImagePlus size={17}/> Add image</button><button className="add-media-button" onClick={() => addQuestion('video')}><Video size={17}/> Add video</button></div><div className="builder-foot"><span>✨ Made with FormCraft</span><button onClick={save}>Save changes <Check size={14}/></button></div></div>
          <aside className="builder-aside grid gap-3"><div className="aside-tip"><div className="tip-icon"><Sparkles size={17}/></div><b>Make it yours</b><p>A great form is clear, focused, and easy to complete. Keep it short for the best results.</p><button onClick={addQuestion}>Add a question <span>→</span></button></div><div className="aside-tip progress-tip"><div className="tip-icon"><ListChecks size={17}/></div><b>Your form checklist</b><div className="checkline"><Check size={14}/> Add a title</div><div className="checkline"><Check size={14}/> Add your questions</div><div className="checkline muted"><span/> Share with your audience</div><div className="progress-track"><span style={{width: selected.questions.length ? '66%' : '33%'}}/></div><small>{selected.questions.length ? '2 of 3' : '1 of 3'} steps complete</small></div></aside></div>)}
        {activeTab === 'Responses' && <div className="responses-panel pt-5"><div className="response-heading mb-4 flex items-center justify-between"><div><h2>Responses</h2><p>See what people have shared with you.</p></div><button className="outline-btn" onClick={exportCsv} disabled={!responses.length}><Copy size={15}/> Export CSV</button></div><div className="response-summary flex h-16 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4"><div className="summary-icon"><BarChart3 size={18}/></div><div><span>Total responses</span><b>{responses.length}</b></div><div className="summary-note">{responses.length ? 'Your form is collecting answers' : 'Share your form to get your first response'}</div></div>{responses.length ? <div className="response-table mt-4 overflow-auto rounded-xl border border-slate-200 bg-white"><div className="response-table-head"><span>SUBMISSION</span>{answerQuestions.map(q => <span key={q.id}>{q.title.toUpperCase()}</span>)}</div>{responses.map((r, i) => <div className="response-row" key={r.id}><span className="submission-id">#{String(responses.length - i).padStart(3, '0')}<small>{new Date(r.submitted_at).toLocaleString()}</small></span>{answerQuestions.map(q => <span key={q.id}>{String(r.answers[q.id] ?? '')}</span>)}</div>)}</div> : <div className="empty-state response-empty"><div className="empty-icon"><Send size={24}/></div><h3>No responses yet</h3><p>Once someone submits your form, their response will show up here.</p><button className="outline-btn" onClick={copyLink}><Link2 size={15}/> Copy form link</button></div>}</div>}
      </section>}
    </main>
  </div>
}

function getVideoSource(rawUrl) {
  try {
    const parsed = new URL(rawUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase()
    let id = ''
    if (host === 'youtu.be') id = parsed.pathname.slice(1).split('/')[0]
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      id = parsed.searchParams.get('v') || parsed.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1] || ''
    }
    if (id) return { kind: 'embed', src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` }
    if (host === 'vimeo.com') {
      const vimeoId = parsed.pathname.match(/\/(\d+)/)?.[1]
      if (vimeoId) return { kind: 'embed', src: `https://player.vimeo.com/video/${vimeoId}` }
    }
    return { kind: 'file', src: parsed.href }
  } catch { return null }
}

function QuestionCard({ question, index, update, remove, onMove, moveUp, moveDown, isFirst, isLast }) {
  const choice = ['multiple_choice', 'checkboxes', 'dropdown'].includes(question.type)
  const media = ['image', 'video'].includes(question.type)
  const video = question.type === 'video' && question.media_url ? getVideoSource(question.media_url) : null
  return <div className="question-card rounded-xl border border-slate-200 bg-white" onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over') }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('drag-over') }} onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('drag-over'); const sourceId = e.dataTransfer.getData('text/plain'); if (sourceId && sourceId !== question.id) onMove(sourceId, e.clientY > e.currentTarget.getBoundingClientRect().top + e.currentTarget.offsetHeight / 2) }}>
    <div className="question-top flex items-center gap-2"><button type="button" className="drag-handle" draggable="true" aria-label={`Drag to reorder ${media ? 'media block' : 'question'} ${index + 1}`} title="Drag to reorder" onDragStart={e => { e.dataTransfer.setData('text/plain', question.id); e.dataTransfer.effectAllowed = 'move'; e.currentTarget.closest('.question-card')?.classList.add('dragging') }} onDragEnd={e => { e.currentTarget.closest('.question-card')?.classList.remove('dragging'); document.querySelectorAll('.question-card.drag-over').forEach(card => card.classList.remove('drag-over')) }}><GripVertical size={17}/></button><span className="question-number">{media ? 'MEDIA' : 'QUESTION'} {String(index + 1).padStart(2, '0')}</span><div className="question-tools"><button type="button" title="Move up" aria-label="Move up" onClick={moveUp} disabled={isFirst}><ArrowUp size={15}/></button><button type="button" title="Move down" aria-label="Move down" onClick={moveDown} disabled={isLast}><ArrowDown size={15}/></button><button type="button" aria-label="Duplicate question" onClick={() => navigator.clipboard?.writeText(question.title)}><Copy size={15}/></button><button type="button" aria-label="Delete question" onClick={remove}><Trash2 size={15}/></button></div></div>
    <div className="question-edit-row flex gap-3"><input className="question-title" value={question.title} placeholder={media ? 'Add a caption' : 'Question text'} onChange={e => update({ title: e.target.value })}/><label className="type-select"><Type size={15}/><select value={question.type} onChange={e => update({ type: e.target.value, required: false })}><option value="short_text">Short answer</option><option value="long_text">Paragraph</option><option value="multiple_choice">Multiple choice</option><option value="checkboxes">Checkboxes</option><option value="dropdown">Dropdown</option><option value="image">Image block</option><option value="video">Video block</option></select><ChevronDown size={14}/></label></div>
    {media ? <div className="media-editor"><label>{question.type === 'image' ? 'Image URL' : 'Video URL'}<input type="url" value={question.media_url || ''} onChange={e => update({ media_url: e.target.value })} placeholder={question.type === 'image' ? 'https://example.com/image.jpg' : 'YouTube, Vimeo, or a direct video URL'}/></label><div className="media-hint">{question.type === 'image' ? 'Use a public image link that can be opened in a browser.' : 'YouTube and Vimeo links embed automatically; direct video links play inline.'}</div>{question.type === 'image' && question.media_url && <img className="media-editor-image" src={question.media_url} alt={question.title || 'Form image'} onError={e => { e.currentTarget.style.display = 'none' }}/>}{question.type === 'video' && video && (video.kind === 'embed' ? <iframe className="media-editor-video" src={video.src} title={question.title || 'Form video'} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen loading="lazy"/> : <video className="media-editor-video" src={video.src} controls preload="metadata"/>)}</div> : choice ? <div className="options-list">{question.options.map((option, i) => <div className="option-row" key={i}><span className={question.type === 'checkboxes' ? 'check-shape' : 'radio-shape'}/><input value={option} onChange={e => update({ options: question.options.map((o, n) => n === i ? e.target.value : o) })}/><button onClick={() => update({ options: question.options.filter((_, n) => n !== i) })}><X size={14}/></button></div>)}<button className="add-option" onClick={() => update({ options: [...question.options, `Option ${question.options.length + 1}`] })}><Plus size={14}/> Add option</button></div> : <div className="answer-placeholder">{question.type === 'long_text' ? 'Long answer text' : 'Short answer text'}<span/></div>}
    {!media && <div className="question-bottom flex h-10 items-center gap-3 border-t border-slate-100"><label><input type="checkbox" checked={question.required} onChange={e => update({ required: e.target.checked })}/> Required</label><span className="bottom-divider"/><button onClick={remove}><Trash2 size={14}/> Delete question</button></div>}
  </div>
}

function Preview({ form, onClose, allowSubmit = true }) {
  const [answers, setAnswers] = useState({})
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const submit = async e => { e.preventDefault(); if (!allowSubmit) return; try { await api(`/public/forms/${form.id}/responses`, { method: 'POST', body: JSON.stringify({ answers }) }); setSent(true); setError('') } catch (err) { setError(err.message) } }
  if (sent) return <div className="preview-page px-1 py-4"><div className="preview-success"><div className="success-mark"><Check size={24}/></div><h2>Response recorded</h2><p>Thanks for sharing your thoughts.</p><button className="outline-btn" onClick={onClose}>Back to editor</button></div></div>
  const theme = FORM_THEMES.find(t => t.id === form.theme) || FORM_THEMES[0]
  return <div className="preview-page px-1 py-4"><div className="preview-label"><Eye size={15}/> PREVIEW MODE <button onClick={onClose}>Back to editor <X size={15}/></button></div><form className="respondent-form mx-auto max-w-2xl" data-theme={theme.id} style={{ '--theme-accent': theme.accent, '--theme-tint': theme.tint, '--theme-banner': theme.banner }} onSubmit={submit}>
    <div className="respondent-cover mb-3 overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="respondent-banner"><Sparkles size={19}/></div><div className="respondent-title"><h1>{form.title || 'Untitled form'}</h1><p>{form.description || 'Please fill out the form below.'}</p></div></div>
    {form.questions.map(q => {
      const media = q.type === 'image' || q.type === 'video'
      const video = q.type === 'video' && q.media_url ? getVideoSource(q.media_url) : null
      return <div className={`respondent-question mb-3 rounded-xl border border-slate-200 bg-white p-5 ${media ? 'respondent-media' : ''}`} key={q.id}>
        {media ? <>{q.title && <p className="media-caption">{q.title}</p>}{q.type === 'image' ? q.media_url ? <img className="respondent-image" src={q.media_url} alt={q.title || 'Form image'}/> : <p className="media-placeholder">Image URL has not been added.</p> : video?.kind === 'embed' ? <iframe className="respondent-video" src={video.src} title={q.title || 'Form video'} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen loading="lazy"/> : video ? <video className="respondent-video" src={video.src} controls preload="metadata"/> : <p className="media-placeholder">Video URL has not been added or is invalid.</p>}</> : <><label>{q.title}{q.required && <span> *</span>}</label>{q.type === 'long_text' ? <textarea required={q.required} placeholder="Your answer" value={answers[q.id] || ''} onChange={e => setAnswers({...answers, [q.id]: e.target.value})}/> : q.type === 'multiple_choice' || q.type === 'checkboxes' || q.type === 'dropdown' ? q.type === 'dropdown' ? <select required={q.required} value={answers[q.id] || ''} onChange={e => setAnswers({...answers, [q.id]: e.target.value})}><option value="">Choose an option</option>{q.options.map(o => <option key={o}>{o}</option>)}</select> : q.options.map(o => <label className="choice-answer" key={o}><input type={q.type === 'checkboxes' ? 'checkbox' : 'radio'} name={q.id} value={o} required={q.required && q.type === 'multiple_choice'} onChange={e => setAnswers({...answers, [q.id]: q.type === 'checkboxes' ? [...(answers[q.id] || []).filter(v => v !== o), o] : o})}/>{o}</label>) : <input required={q.required} placeholder="Your answer" value={answers[q.id] || ''} onChange={e => setAnswers({...answers, [q.id]: e.target.value})}/>}</>}
      </div>
    })}
    {error && <div className="inline-error">{error}</div>}{allowSubmit ? <button className="primary-btn submit-btn" type="submit"><Send size={15}/> Submit response</button> : <p className="text-sm text-slate-500">Save this form before sharing or collecting responses.</p>}<div className="respondent-footer">FormCraft - Create forms that feel good to fill out.</div>
  </form></div>
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const register = mode === 'register'
  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await api(`/auth/${register ? 'register' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify(register ? { name, email, password } : { email, password }),
      })
      onAuthenticated(result)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <main className="grid min-h-screen place-items-center bg-gradient-to-br from-violet-50 via-slate-50 to-indigo-50 px-4 py-10">
    <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5 sm:p-10">
      <div className="mb-8 flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-600/20"><ClipboardList size={22}/></span><span className="text-xl font-bold tracking-tight text-slate-900">formcraft</span></div>
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-violet-600">Your forms, in one place</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{register ? 'Create your account' : 'Welcome back'}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">{register ? 'Sign up to create and manage your own forms.' : 'Sign in to continue to your workspace.'}</p>
      <form className="mt-7 space-y-4" onSubmit={submit}>
        {register && <label className="block text-sm font-medium text-slate-700">Full name<div className="relative mt-1.5"><UserRound className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17}/><input className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100" autoComplete="name" required minLength={1} maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder="Jamie Davis"/></div></label>}
        <label className="block text-sm font-medium text-slate-700">Email address<div className="relative mt-1.5"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17}/><input className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"/></div></label>
        <label className="block text-sm font-medium text-slate-700">Password<div className="relative mt-1.5"><input className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 8 : 1} value={password} onChange={e => setPassword(e.target.value)} placeholder={register ? 'At least 8 characters' : 'Enter your password'}/></div></label>
        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-violet-600/20 transition hover:bg-violet-700 disabled:cursor-wait disabled:opacity-60" type="submit" disabled={busy}>{busy && <LoaderCircle className="animate-spin" size={16}/>} {busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">{register ? 'Already have an account?' : 'New to FormCraft?'} <button className="font-semibold text-violet-700 hover:text-violet-800" onClick={() => { setMode(register ? 'login' : 'register'); setError('') }}>{register ? 'Sign in' : 'Create an account'}</button></p>
    </section>
  </main>
}

function AIGenerator({ prompt, setPrompt, questionCount, setQuestionCount, busy, error, onClose, onGenerate }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-sm" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
    <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8" role="dialog" aria-modal="true" aria-labelledby="ai-form-title">
      <div className="flex items-start justify-between gap-4"><div><div className="mb-3 grid size-11 place-items-center rounded-xl bg-violet-100 text-violet-700"><Sparkles size={20}/></div><h2 id="ai-form-title" className="text-xl font-semibold text-slate-900">Generate a form with AI</h2><p className="mt-1 text-sm text-slate-500">Describe who it is for and what you want to learn.</p></div><button className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={onClose} disabled={busy} aria-label="Close"><X size={18}/></button></div>
      <label className="mt-6 block text-sm font-medium text-slate-700">Form brief<textarea className="mt-2 min-h-32 w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-sm leading-6 outline-none placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100" minLength={8} maxLength={2000} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Example: Create a short customer feedback form for people who recently purchased a coffee machine. Ask about setup, product quality, and what we could improve."/></label>
      <label className="mt-4 block text-sm font-medium text-slate-700">Number of questions<select className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100" value={questionCount} onChange={e => setQuestionCount(Number(e.target.value))}>{[3,4,5,6,7,8,10,12,15].map(count => <option key={count} value={count}>{count} questions</option>)}</select></label>
      {error && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <p className="mt-4 text-xs leading-5 text-slate-500">AI creates an editable draft. Review the questions and save when you’re ready.</p>
      <div className="mt-6 flex justify-end gap-2"><button className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50" onClick={onClose} disabled={busy}>Cancel</button><button className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-wait disabled:opacity-60" onClick={onGenerate} disabled={busy || prompt.trim().length < 8}>{busy ? <LoaderCircle className="animate-spin" size={16}/> : <Sparkles size={16}/>} {busy ? 'Generating…' : 'Generate draft'}</button></div>
    </section>
  </div>
}

export default App
