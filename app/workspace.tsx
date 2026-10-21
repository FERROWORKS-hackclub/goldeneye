'use client';

import {useEffect, useRef, useState} from 'react';
import {Eye, Activity, ArrowDownLeft, ArrowUpRight, Boxes, Check, ChevronRight, Download, ExternalLink, FolderKanban, Hexagon, LayoutDashboard, Loader2, LogOut, Menu, Pencil, Plus, Search, Trash2, Users, Wallet, X} from 'lucide-react';
import {can} from '../lib/policy.mjs';
import Invitations from './invitations';
import Operations, {ProjectFinance, Due} from './operations';

type Row = {id: string; [key: string]: any};
type State = {filament: Row[]; jobs: Row[]; quotes: Row[]; orders: Row[]; allocations: Row[]; bom:Row[]; changes:Row[]; me: Row; projects: Row[]; tasks: Row[]; transactions: Row[]; links: Row[]; users: Row[]; audit: Row[]};
type Hcb = {organization: {name: string; url: string; balanceCents: number; incomingCents: number; raisedCents: number}; transactions: Row[]; page: number; hasMore: boolean; updatedAt: string};
const usd = (cents: number) => new Intl.NumberFormat('en-AU', {style: 'currency', currency: 'USD'}).format(cents / 100);
type Kind = 'projects' | 'tasks' | 'transactions' | 'links' | 'users' | 'filament' | 'jobs' | 'quotes' | 'orders' | 'allocations' | 'bom' | 'changes';
type Modal = {kind: Kind; row?: Row};
const money = (cents: number) => new Intl.NumberFormat('en-AU', {style: 'currency', currency: 'AUD'}).format(cents / 100);
const today = () => new Date().toISOString().slice(0, 10);
const dateLabel = (value: string) => value ? new Date(value + 'T12:00:00').toLocaleDateString('en-AU', {day: 'numeric', month: 'short'}) : '—';
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
const singular: Record<Kind, string> = {projects: 'project', tasks: 'task', transactions: 'transaction', links: 'website', users: 'user', filament:'spool',jobs:'job estimate',quotes:'quote',orders:'order',allocations:'HCB link',bom:'BOM item',changes:'design change'};
const navigation = [
  ['overview', 'Overview', LayoutDashboard], ['links', 'Apps', Boxes], ['projects', 'Projects', FolderKanban],
  ['transactions', 'Money', Wallet], ['deadlines','Due dates',Check], ['bom','Printer BOM',Boxes], ['changes','Design changes',FolderKanban], ['filament','Filament',Boxes], ['jobs','Job costs',Wallet], ['quotes','Quotes',FolderKanban], ['orders','Orders',FolderKanban], ['users', 'People', Users], ['audit', 'Activity', Activity],
] as const;

export default function Workspace({configured, signedIn, loginUrl='/auth/login', logoutUrl='/auth/logout'}: {configured: boolean; signedIn: boolean;loginUrl?:string;logoutUrl?:string}) {
  const [state, setState] = useState<State | null>(null);
  const [page, setPage] = useState('overview');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [projectFilter, setProjectFilter] = useState('All');
  const [modal, setModal] = useState<Modal | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice,setNotice]=useState('');
  const [mobile, setMobile] = useState(false);
  const [source, setSource] = useState('hcb');
  const [hcb, setHcb] = useState<Hcb | null>(null);
  const [hcbBusy, setHcbBusy] = useState(false);
  const [hcbError, setHcbError] = useState('');
  const content = useRef<HTMLElement>(null);

  async function animateRemoval(id: string) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const card = content.current?.querySelector<HTMLElement>(`[data-record-id="${CSS.escape(id)}"]`);
    if (!card) return;
    // Run only after the server confirms deletion; rejected deletes remain visible.
    const animation = card.animate([
      {opacity: 1, transform: 'scale(1)', filter: 'blur(0px)'},
      {opacity: .65, transform: 'scale(1.035)', filter: 'blur(1px)', offset: .25},
      {opacity: 0, transform: 'translateY(-8px) scale(.82)', filter: 'blur(7px)'}
    ], {duration: 320, easing: 'cubic-bezier(.22,.7,.3,1)', fill: 'forwards'});
    await animation.finished.catch(() => {});
  }
  async function loadHcb(pageNumber = 1) {
    setHcbBusy(true); setHcbError('');
    try {
      const response = await fetch(`/api/hcb?page=${pageNumber}`, {cache: 'no-store'});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setHcb(previous => ({...data, transactions: pageNumber === 1 ? data.transactions : Array.from(new Map([...(previous?.transactions || []), ...data.transactions].map(row => [row.id, row])).values())}));
    } catch (e) {setHcbError((e as Error).message);} finally {setHcbBusy(false);}
  }
  useEffect(() => {if (page === 'transactions' && state && can(state.me.role, 'transactions') && !hcb) void loadHcb();}, [page, state?.me.role]);

  async function load() {
    try {
      const response = await fetch('/api/workspace', {cache: 'no-store'});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setState({filament:[],jobs:[],quotes:[],orders:[],allocations:[],bom:[],changes:[],...data, users: data.users || [], audit: data.audit || []});
      setError('');
      return true;
    } catch (e) {setError((e as Error).message); return false;}
  }
  useEffect(() => {if (signedIn) void load();}, [signedIn]);

  async function mutate(kind: Kind, action: string, data: Record<string, unknown>, id?: string) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/workspace', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({kind, action, data, id})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (action === 'delete' && id) {
        await animateRemoval(id);
        setState(previous => previous ? {...previous, [kind]: previous[kind].filter((row: Row) => row.id !== id)} : previous);
      }
      setNotice(result.notice || (action==='delete'?'Deleted':action==='onboard'?'Welcome to Goldeneye':action==='convert'?'Order created':'Saved'));
      setModal(null);
      await load(); return true;
    } catch (e) {setError((e as Error).message);return false;} finally {setBusy(false);}
  }

  if (!state) return <main className="signin-page">
    <section className="signin-card">
      <div className="brand"><Hexagon size={27}/>GOLDENEYE</div>
      {signedIn ? error ? <><p role="alert" className="error">{error}</p><button className="primary" onClick={() => void load()}>Retry</button><a className="quiet-link" href={logoutUrl}>Sign out</a></> : <div className="loading" role="status"><Loader2 className="spin" size={20}/>Loading workspace</div> : <>
        <h1>Sign in</h1>
        {configured ? <a className="primary" href={loginUrl}>Continue <ArrowUpRight size={17}/></a> : <p>Setup incomplete.</p>}
      </>}
    </section>
  </main>;

  const role = state.me.role;
  const canWrite = (kind: Kind) => can(role, kind, true);
  const permitted = (id: string) => id === 'users' ? ['admin','manager'].includes(role) : id === 'audit' ? role === 'admin' : ['transactions','filament','jobs','quotes','orders','bom','changes'].includes(id) ? can(role, id) : true;
  const matches = (row: Row) => Object.values(row).join(' ').toLowerCase().includes(query.toLowerCase());
  const filtered = (rows: Row[]) => rows.filter(matches).filter(row => filter === 'All' || row.status === filter || row.type === filter);
  const openTasks = state.tasks.filter(task => task.status !== 'Done');
  const activeProjects = state.projects.filter(project => project.status !== 'Completed');
  const income = state.transactions.filter(row => row.type === 'Income' && row.status === 'Paid').reduce((sum, row) => sum + row.amountCents, 0);
  const expense = state.transactions.filter(row => row.type === 'Expense' && row.status === 'Paid').reduce((sum, row) => sum + row.amountCents, 0);
  const pending = state.transactions.filter(row => row.status === 'Pending').length;
  const boardTasks = state.tasks.filter(matches).filter(task => projectFilter === 'All' || task.projectId === projectFilter);
  const currentTitle = navigation.find(item => item[0] === page)?.[1] || 'Overview';

  function go(next: string) {setPage(next); setQuery(''); setFilter('All'); setProjectFilter('All'); setMobile(false); setError('');}
  function add(kind: Kind) {setError(''); setModal({kind});}
  function exportCSV() {
    const fields = ['date', 'name', 'type', 'amount', 'currency', 'category', 'status', 'reference'];
    const isHcb = source === 'hcb';
    const cell = (value: unknown) => '"' + String(value ?? '').replace(/^[\s]*[=+@-]/, "'$&").replaceAll('"', '""') + '"';
    const content = [fields.join(','), ...filtered(isHcb ? hcb?.transactions || [] : state!.transactions).map(row => fields.map(field => cell(field === 'currency' ? isHcb ? 'USD' : 'AUD' : field === 'amount' ? (row.amountCents / 100).toFixed(2) : row[field])).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([content], {type: 'text/csv;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = `goldeneye-${source}-transactions.csv`; link.click(); URL.revokeObjectURL(url);
  }
  const actions = (kind: Kind, row: Row) => canWrite(kind) && <div className="row-actions">
    <button title="Edit" aria-label={`Edit ${row.name}`} onClick={() => {setError(''); setModal({kind, row});}}><Pencil size={15}/></button>
    <button title="Delete" aria-label={`Delete ${row.name}`} onClick={() => {if (confirm(`Delete ${row.name}?`)) void mutate(kind, 'delete', {}, row.id);}} disabled={busy}><Trash2 size={15}/></button>
  </div>;
  const recordName = (id: string) => [...state.projects, ...state.tasks, ...state.transactions, ...state.links, ...state.users].find(row => row.id === id)?.name || 'Removed record';
  const activityName = (action: string) => {const [kind, verb] = action.split('.'); return `${singular[kind as Kind] || kind} ${{create: 'created', update: 'updated', delete: 'deleted'}[verb] || verb}`;};

  return <div className="shell">
    {mobile && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobile(false)}/>}
    <aside className={mobile ? 'open' : ''}>
      <button className="brand goldeneye-brand" onClick={() => go('overview')}><Eye size={26}/>GOLDENEYE</button>
      <nav aria-label="Main navigation">{navigation.filter(([id]) => permitted(id)).map(([id, label, Icon]) => <button className={`${page === id ? 'active' : ''} ${id === 'users' ? 'nav-divider' : ''}`} aria-current={page === id ? 'page' : undefined} key={id} onClick={() => go(id)}><Icon size={19}/><span>{label}</span>{id === 'projects' && <small>{state.projects.length}</small>}</button>)}<a className="tool-nav" href="https://printerlab.ferroworks.org"><Boxes size={19}/><span>Printer Lab</span><ArrowUpRight size={14}/></a><a className="tool-nav" href="https://ferroai.ferroworks.org"><Eye size={19}/><span>FerroAI</span><ArrowUpRight size={14}/></a></nav>
      <div className="profile"><span className="avatar">{initials(state.me.name)}</span><div><b>{state.me.name}</b><small>{role}</small></div><a href={logoutUrl} title="Sign out" aria-label="Sign out"><LogOut size={17}/></a></div>
    </aside>
    <main className="main page-enter" key={page} ref={content}>
      <div className="page-heading"><div className="heading-title"><button className="mobile-button icon-button" aria-label="Open navigation" onClick={() => setMobile(true)}><Menu size={22}/></button><h1>{currentTitle}</h1></div><div className="heading-actions">
        {page === 'overview' && canWrite('projects') && <button className="primary" onClick={() => add('projects')}><Plus size={17}/>New project</button>}
        {(['projects', 'transactions', 'links', 'users'] as string[]).includes(page) && canWrite(page as Kind) && (page !== 'transactions' || source === 'manual') && <button className="primary" onClick={() => add(page as Kind)}><Plus size={17}/>{{projects: 'New project', transactions: 'Add transaction', links: 'Add website', users: 'Create user'}[page]}</button>}
      </div></div>
      {notice&&<div className="notice" role="status">{notice}<button className="icon-button" aria-label="Dismiss message" onClick={()=>setNotice('')}><X size={16}/></button></div>}
      {error && !modal && <div className="error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={16}/></button></div>}

      {page === 'overview' && <>
        {!state.me.onboarding_completed&&<section className="panel welcome-panel"><h2>Welcome to Goldeneye</h2><p>Your account is ready. Find shared websites in Apps, manage work in Projects, and track deadlines in Due dates.</p><button className="primary" disabled={busy} onClick={()=>void mutate('users','onboard',{},state.me.id)}>Get started <ArrowUpRight size={16}/></button></section>}
        <div className="stats"><Stat label="Active projects" value={String(activeProjects.length)} icon={<FolderKanban/>}/><Stat label="Open tasks" value={String(openTasks.length)} icon={<Check/>}/>{can(role, 'transactions') && <><Stat label="Net cash flow" value={money(income - expense)} note="Paid · AUD" icon={<Wallet/>}/><Stat label="Pending payments" value={String(pending)} icon={<ArrowUpRight/>}/></>}</div>
        <div className="dashboard-grid">
          <section className="panel"><div className="section-head"><h2>Projects</h2><button className="quiet-link" onClick={() => go('projects')}>View all <ChevronRight size={16}/></button></div>
            {state.projects.length ? <div className="project-list">{[...activeProjects, ...state.projects.filter(row => row.status === 'Completed')].slice(0, 5).map(project => {const tasks = state.tasks.filter(task => task.projectId === project.id); const progress = tasks.length ? Math.round(tasks.filter(task => task.status === 'Done').length / tasks.length * 100) : 0; return <button key={project.id} className="project-list-row" onClick={() => go('projects')}><span className="project-glyph"><FolderKanban size={19}/></span><span className="project-list-name"><b>{project.name}</b><small>{project.owner} <span>·</span> {dateLabel(project.due)}</small></span><span className="progress" aria-label={`${progress}% complete`}><span style={{width: progress + '%'}}/></span><Badge value={project.status}/></button>;})}</div> : <Empty text="No projects"/>}
          </section>
          <section className="panel"><div className="section-head"><h2>Open tasks <span className="count">{openTasks.length}</span></h2><button className="icon-button" aria-label="Open task board" onClick={() => go('projects')}><ArrowUpRight size={18}/></button></div>
            {openTasks.length ? <div className="task-list">{openTasks.slice(0, 5).map(task => <button key={task.id} onClick={() => go('projects')}><span className={`priority-dot ${task.priority.toLowerCase()}`}/><span><b>{task.name}</b><small>{state.projects.find(project => project.id === task.projectId)?.name}</small></span><Due date={task.due} status={task.status}/></button>)}</div> : <Empty text="All caught up" icon={<Check size={22}/>}/>}
          </section>
        </div>
        <section className="panel app-section"><div className="section-head"><h2>Apps</h2><button className="quiet-link" onClick={() => go('links')}>View all <ChevronRight size={16}/></button></div><div className="quick-apps"><a href="https://printerlab.ferroworks.org"><span className="app-monogram">P</span><span><b>Printer Lab</b><small>Firmware · prototypes · issues</small></span><ArrowUpRight size={15}/></a><a href="https://ferroai.ferroworks.org"><span className="app-monogram">F</span><span><b>FerroAI</b><small>Chat · advanced models · live web</small></span><ArrowUpRight size={15}/></a>{state.links.slice(0, 5).map(link => <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"><span className="app-monogram">{link.name.slice(0, 1)}</span><span><b>{link.name}</b><small>{link.category}</small></span><ExternalLink size={15}/></a>)}</div></section>
      </>}

      {page === 'transactions' && <div className="money-source" role="group" aria-label="Money source"><button className={source === 'hcb' ? 'selected' : ''} onClick={() => {setSource('hcb'); setFilter('All'); setQuery('');}}>HCB · USD</button><button className={source === 'manual' ? 'selected' : ''} onClick={() => {setSource('manual'); setFilter('All'); setQuery('');}}>Manual ledger · AUD</button></div>}

      {page !== 'overview' && page !== 'audit' && <div className="toolbar"><label className="search"><Search size={18}/><input aria-label="Search" placeholder={`Search ${{links: 'apps', transactions: 'transactions', users: 'people', projects: 'projects and tasks',filament:'filament',jobs:'job estimates',quotes:'quotes',orders:'orders',deadlines:'deadlines',bom:'BOM parts',changes:'design changes'}[page]}…`} value={query} onChange={event => setQuery(event.target.value)}/></label>{['projects', 'transactions'].includes(page) && <select aria-label="Filter records" value={filter} onChange={event => setFilter(event.target.value)}>{(page === 'projects' ? ['All', 'Planning', 'In progress', 'Completed'] : ['All', 'Income', 'Expense', 'Pending', source === 'hcb' ? 'Settled' : 'Paid']).map(option => <option key={option}>{option}</option>)}</select>}{page === 'transactions' && <button className="secondary" onClick={exportCSV}><Download size={16}/>Export CSV</button>}</div>}

      {['filament','jobs','quotes','orders','deadlines','bom','changes'].includes(page)&&<Operations key={page} page={page} state={state} busy={busy} query={query} save={async(kind,action,data,id)=>{if(!await mutate(kind,action,data,id))throw new Error('Could not save. Check the message above and try again.');}}/>}

      {page === 'links' && <><div className="app-grid">{filtered(state.links).map(link => <article className="app-card" data-record-id={link.id} key={link.id}><div className="section-head"><span className="app-monogram">{link.name.slice(0, 1)}</span>{actions('links', link)}</div><a className="app-title" href={link.url} target="_blank" rel="noopener noreferrer"><h2>{link.name}</h2><ArrowUpRight size={18}/></a><span className="muted">{link.category}</span>{link.description && <p>{link.description}</p>}<span className="website-domain">{new URL(link.url).hostname}</span></article>)}</div>{!filtered(state.links).length && <Empty text="No websites found"/>}</>}

      {page === 'projects' && <>
        <div className="project-grid">{filtered(state.projects).map(project => {const tasks = state.tasks.filter(task => task.projectId === project.id); const completed = tasks.filter(task => task.status === 'Done').length; return <article className="panel project-card" data-record-id={project.id} key={project.id}><div className="section-head"><Badge value={project.status}/>{actions('projects', project)}</div><h2>{project.name}</h2>{project.description && <p>{project.description}</p>}<div className="project-meta"><span>{project.owner}</span><Due date={project.due} status={project.status}/></div><div className="project-card-progress"><span className="progress"><span style={{width: tasks.length ? `${completed / tasks.length * 100}%` : '0%'}}/></span><small>{completed}/{tasks.length} tasks</small></div>{can(role,'transactions')&&<ProjectFinance project={project} state={state}/>}<div className="project-footer"><span>Budget <b>{money(project.budget * 100)}</b></span>{canWrite('tasks') && <button className="quiet-link" onClick={() => {setError(''); setModal({kind: 'tasks', row: {id: '', projectId: project.id}});}}><Plus size={15}/>Task</button>}</div></article>;})}</div>
        {!filtered(state.projects).length && <Empty text="No projects found"/>}
        <div className="section-head board-heading"><h2>Tasks</h2><div className="board-actions"><select aria-label="Filter tasks by project" value={projectFilter} onChange={event => setProjectFilter(event.target.value)}><option value="All">All projects</option>{state.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select>{canWrite('tasks') && state.projects.length > 0 && <button className="secondary" onClick={() => add('tasks')}><Plus size={16}/>New task</button>}</div></div>
        <div className="kanban">{['To do', 'In progress', 'Done'].map(status => <section className="lane" key={status}><h3><span className={`status-dot ${status.toLowerCase().replaceAll(' ', '-')}`}/>{status}<span className="count">{boardTasks.filter(task => task.status === status).length}</span></h3>{boardTasks.filter(task => task.status === status).map(task => <article className="task" data-record-id={task.id} key={task.id}><span className="task-project">{state.projects.find(project => project.id === task.projectId)?.name}</span><h3>{task.name}</h3><div className="task-details"><Badge value={task.priority}/><Due date={task.due} status={task.status}/></div><div className="task-footer"><span className="assignee">{task.assignee}</span>{actions('tasks', task)}</div>{canWrite('tasks') && <select aria-label={`Status of ${task.name}`} value={task.status} disabled={busy} onChange={event => {const {id, ...data} = task; void mutate('tasks', 'update', {...data, status: event.target.value}, id);}}>{['To do', 'In progress', 'Done'].map(option => <option key={option}>{option}</option>)}</select>}</article>)}{!boardTasks.some(task => task.status === status) && <div className="lane-empty">No tasks</div>}</section>)}</div>
      </>}

      {page === 'transactions' && source === 'manual' && <><div className="stats finance-stats"><Stat label="Income" value={money(income)} note="Paid · AUD" icon={<ArrowDownLeft/>}/><Stat label="Expenses" value={money(expense)} note="Paid · AUD" icon={<ArrowUpRight/>}/><Stat label="Net cash flow" value={money(income - expense)} note="Paid · AUD" icon={<Wallet/>}/></div><div className="panel table-wrap"><table><thead><tr>{['Transaction', 'Project', 'Category', 'Date', 'Status', 'Amount', ''].map(title => <th key={title}>{title}</th>)}</tr></thead><tbody>{filtered(state.transactions).map(row => <tr data-record-id={row.id} key={row.id}><td><b>{row.name}</b>{row.reference && <small>{row.reference}</small>}</td><td>{state.projects.find(p=>p.id===row.projectId)?.name||'—'}</td><td>{row.category}</td><td>{dateLabel(row.date)}</td><td><Badge value={row.status}/></td><td className={`amount ${row.type === 'Income' ? 'positive' : ''}`}>{row.type === 'Income' ? '+' : '−'}{money(row.amountCents)}</td><td>{actions('transactions', row)}</td></tr>)}</tbody></table>{!filtered(state.transactions).length && <Empty text="No transactions"/>}</div></>}

      {page === 'transactions' && source === 'hcb' && <>
        <div className="hcb-status"><span><b>{hcb?.organization.name || 'HCB'}</b> <span className="muted">Read-only · USD{hcb && ` · Updated ${new Date(hcb.updatedAt).toLocaleTimeString('en-AU', {hour: 'numeric', minute: '2-digit'})}`}</span></span><div className="heading-actions"><button className="secondary" disabled={hcbBusy} onClick={() => void loadHcb()}>{hcbBusy ? 'Refreshing…' : 'Refresh'}</button><a className="secondary" href={hcb?.organization.url || 'https://hcb.hackclub.com/ferroworks'} target="_blank" rel="noopener noreferrer">Open HCB <ExternalLink size={15}/></a></div></div>
        {hcbError && <div className="error" role="alert">{hcbError}</div>}
        {!hcb && hcbBusy && <div className="empty" role="status"><Loader2 className="spin" size={20}/>Loading HCB</div>}
        {hcb && <><div className="stats finance-stats"><Stat label="Available balance" value={usd(hcb.organization.balanceCents)} note="USD" icon={<Wallet/>}/><Stat label="Incoming" value={usd(hcb.organization.incomingCents)} note="USD" icon={<ArrowDownLeft/>}/><Stat label="Total raised" value={usd(hcb.organization.raisedCents)} note="USD" icon={<ArrowUpRight/>}/></div>
          <div className="panel table-wrap"><table><thead><tr><th>Transaction</th><th>Type</th><th>Date</th><th>Status</th><th>Amount (USD)</th><th>Project</th></tr></thead><tbody>{filtered(hcb.transactions).map(row => <tr data-record-id={row.id} key={row.id}><td><b>{row.name}</b></td><td className="activity-name">{row.category}</td><td>{dateLabel(row.date)}</td><td><Badge value={row.status}/></td><td className={`amount ${row.amountCents >= 0 ? 'positive' : ''}`}>{row.amountCents >= 0 ? '+' : '−'}{usd(Math.abs(row.amountCents))}</td><td><select aria-label={`Project for ${row.name}`} disabled={busy} value={state.allocations.find(a=>a.transactionId===row.id)?.projectId||''} onChange={event=>{const existing=state.allocations.find(a=>a.transactionId===row.id);if(!event.target.value){if(existing)void mutate('allocations','delete',{},existing.id);}else void mutate('allocations',existing?'update':'create',{name:row.name,projectId:event.target.value,transactionId:row.id},existing?.id);}}><option value="">Unassigned</option>{state.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></td></tr>)}</tbody></table>{!filtered(hcb.transactions).length && <Empty text="No transactions found"/>}</div>
          <div className="load-more"><span className="muted">{hcb.transactions.length} transactions loaded</span>{hcb.hasMore && <button className="secondary" disabled={hcbBusy} onClick={() => void loadHcb(hcb.page + 1)}>{hcbBusy ? 'Loading…' : 'Load more'}</button>}</div>
        </>}
      </>}

      {page === 'users' && <div className="panel table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Status</th><th/></tr></thead><tbody>{filtered(state.users).map(user => <tr key={user.id}><td><div className="person-cell"><span className="avatar">{initials(user.name)}</span><span><b>{user.name}</b><small>{user.email}</small><small>{user.onboarding_completed?'Onboarded':user.invited_at?'Setup email requested':'Not yet invited'}</small></span></div></td><td><Badge value={user.role}/></td><td><Badge value={user.active ? 'Active' : 'Inactive'}/></td><td>{role==='admin'&&<><button className="secondary" disabled={busy||!user.active} onClick={()=>void mutate('users','invite',{},user.id)}>Send setup email</button> <button className="secondary" onClick={() => {setError(''); setModal({kind: 'users', row: user});}}><Pencil size={14}/>Edit access</button></>}</td></tr>)}</tbody></table>{!filtered(state.users).length && <Empty text="No people found"/>}</div>}

      {page === 'users' && <Invitations role={role} onReview={load}/>}

      {page === 'audit' && <div className="panel table-wrap"><table><thead><tr><th>Action</th><th>Record</th><th>By</th><th>Time</th></tr></thead><tbody>{state.audit.map(row => <tr key={row.id}><td className="activity-name">{activityName(row.action)}</td><td>{recordName(row.target)}</td><td>{state.users.find(user => user.id === row.actor)?.name || 'User'}</td><td>{new Date(row.created_at).toLocaleString('en-AU', {day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'})}</td></tr>)}</tbody></table>{!state.audit.length && <Empty text="No activity"/>}</div>}
    </main>
    {modal && <Editor modal={modal} state={state} busy={busy} error={error} close={() => {setModal(null); setError('');}} save={async data => {await mutate(modal.kind, modal.row?.id ? 'update' : 'create', data, modal.row?.id);}}/>}
  </div>;
}

function Stat({label, value, note, icon}: {label: string; value: string; note?: string; icon: React.ReactNode}) {return <article className="stat"><div><span>{label}</span>{icon}</div><strong>{value}</strong>{note && <small>{note}</small>}</article>;}
function Badge({value}: {value: string}) {return <span className={`badge ${value.toLowerCase().replaceAll(' ', '-')}`}>{value}</span>;}
function Empty({text, icon}: {text: string; icon?: React.ReactNode}) {return <div className="empty">{icon}<span>{text}</span></div>;}

function Editor({modal, state, busy, error, close, save}: {modal: Modal; state: State; busy: boolean; error: string; close: () => void; save: (data: Record<string, unknown>) => Promise<void>}) {
  const {kind, row} = modal;
  const edit = !!row?.id;
  const dialog = useRef<HTMLElement>(null);
  const restoreFocus = useRef<Element | null>(null);
  useEffect(() => {
    restoreFocus.current = document.activeElement;
    dialog.current?.querySelector<HTMLInputElement>('input, select')?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {document.body.style.overflow = previousOverflow; if (restoreFocus.current instanceof HTMLElement) restoreFocus.current.focus();};
  }, []);
  const field = (name: string, label: string, type = 'text', options?: string[]) => <label key={name}>{label}{options ? <select name={name} defaultValue={row?.[name] ?? options[0]}>{options.map(option => <option key={option} value={option}>{name === 'projectId' ? state.projects.find(project => project.id === option)?.name : option}</option>)}</select> : <input name={name} type={type} required={!['description', 'reference'].includes(name)} min={type === 'number' ? kind === 'transactions' ? '0.01' : '0' : undefined} max={type === 'number' ? '1000000000' : undefined} step={type === 'number' ? '0.01' : undefined} maxLength={type === 'text' ? name === 'description' ? 500 : 200 : undefined} defaultValue={name === 'amount' ? ((row?.amountCents || 0) / 100 || '') : row?.[name] ?? (type === 'date' ? today() : '')}/>}</label>;
  return <div className="modal-overlay" onClick={event => {if (event.target === event.currentTarget && !busy) close();}} onKeyDown={event => {
    if (event.key === 'Escape' && !busy) close();
    if (event.key === 'Tab') {const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]') || []); const first = elements[0], last = elements[elements.length - 1]; if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();} else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}}
  }}><section ref={dialog} className="modal" role="dialog" aria-modal="true" aria-labelledby="editor-title"><div className="section-head"><h2 id="editor-title">{edit ? 'Edit' : 'New'} {singular[kind]}</h2><button className="icon-button" onClick={close} disabled={busy} aria-label="Close dialog"><X size={20}/></button></div>
    <form onSubmit={event => {event.preventDefault(); const data: Record<string, unknown> = Object.fromEntries(new FormData(event.currentTarget)); if (kind === 'projects') {data.budget = Number(data.budget);data.budgetUsd=Number(data.budgetUsd);} if (kind === 'transactions') data.amount = Number(data.amount); if (kind === 'users' && edit) data.active = data.active === 'Active'; void save(data);}}>
      {kind === 'users' ? <>{!edit && <>{field('name', 'Full name')}{field('email', 'Email', 'email')}</>}{field('role', 'Role', 'text', ['member', 'manager', 'finance', 'viewer', 'admin'])}{edit && <label>Status<select name="active" defaultValue={row?.active ? 'Active' : 'Inactive'}><option>Active</option><option>Inactive</option></select></label>}{!edit && <p className="form-note">Ferrowork Identity emails a secure password-setup link.</p>}</> : <>{field('name', kind === 'links' ? 'Website name' : 'Name')}
        {kind === 'projects' && <>{field('description', 'Description')}{field('owner', 'Owner')}{field('status', 'Status', 'text', ['Planning', 'In progress', 'Completed'])}{field('due', 'Due date', 'date')}{field('budget', 'Budget (AUD)', 'number')}{field('budgetUsd','HCB budget (USD)','number')}</>}
        {kind === 'tasks' && <>{field('projectId', 'Project', 'text', state.projects.map(project => project.id))}{field('assignee', 'Assignee')}{field('priority', 'Priority', 'text', ['Medium', 'High', 'Low'])}{field('status', 'Status', 'text', ['To do', 'In progress', 'Done'])}{field('due', 'Due date', 'date')}</>}
        {kind === 'transactions' && <>{field('type', 'Type', 'text', ['Expense', 'Income'])}{field('amount', 'Amount (AUD)', 'number')}{field('category', 'Category')}{field('date', 'Date', 'date')}{field('status', 'Status', 'text', ['Pending', 'Paid'])}{field('reference', 'Reference')}<label>Project<select name="projectId" defaultValue={row?.projectId||''}><option value="">None</option>{state.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></>}
        {kind === 'links' && <>{field('url', 'URL', 'url')}{field('category', 'Category')}{field('description', 'Description')}</>}
      </>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions"><button className="secondary" type="button" onClick={close} disabled={busy}>Cancel</button><button className="primary" type="submit" disabled={busy}>{busy ? <><Loader2 className="spin" size={16}/>Saving</> : edit ? 'Save changes' : `Create ${singular[kind]}`}</button></div>
    </form>
  </section></div>;
}
