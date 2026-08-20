import React, { useCallback, useEffect, useMemo, useState } from 'react'

import oceanBackground from './assets/harbor-ocean.jpg'

const NS = 'harbor-evolution'
const API = '/_dsh/harbor-evolution'

const dictionaries = {
  zh: {
    tab: 'Harbor', settings: 'Harbor 自进化', eyebrow: 'EVALUATION WORKBENCH',
    heroTitle: '稳定地看见 Agent 是否真的进步', heroBody: 'Evaluation Stack 固定评测含义，Context v2 固定可比较性，Promotion Gate 只接受有证据且无回归的 Candidate。',
    refresh: '刷新', jobs: '评测批次', jobsHint: '轻量总览；点击 Job 打开完整评测工作台。', empty: '还没有 Context v2 Job。先调用官方 Skill 完成架构澄清和初始化。',
    completed: '完成', partial: '带异常', failed: '失败', pending: '运行中', candidate: 'Candidate', context: 'Context v2', trials: 'Trials', exceptions: '异常', mode: '模式',
    result: '结果摘要', process: '评测过程', contract: '评测契约', stack: 'Evaluation Stack', dataset: 'Dataset', assessments: 'Trial 评测', reasons: '原因与证据', optimization: '优化建议', promotion: '晋级决策', audit: '审计产物',
    close: '关闭', search: '搜索 Trial', all: '全部', assessed: '已评测', infra: '基础设施异常', previous: '上一页', next: '下一页', noData: '暂无产物', validation: '产物校验', ready: '可用于正式评测', blocked: '存在阻断项',
    doctor: 'Architecture Doctor', primaryMetric: '主指标', population: '样本分布', component: '组件', version: '版本', digest: 'Digest', source: '证据', findings: 'Findings', output: '输出与中间结果',
    setupDoctor: '安装与架构检查', setupHint: '这里仅展示状态，不会从浏览器改写 Cordis 配置。', retry: '重试', loading: '正在读取…',
  },
  en: {
    tab: 'Harbor', settings: 'Harbor Evolution', eyebrow: 'EVALUATION WORKBENCH',
    heroTitle: 'See whether the Agent actually improved', heroBody: 'Evaluation Stack fixes meaning, Context v2 fixes comparability, and the Promotion Gate accepts only evidenced, non-regressing Candidates.',
    refresh: 'Refresh', jobs: 'Evaluation jobs', jobsHint: 'Lightweight overview; open a Job for the full workbench.', empty: 'No Context v2 Jobs yet. Use the official Skill to clarify and initialize the architecture.',
    completed: 'Completed', partial: 'Partial', failed: 'Failed', pending: 'Running', candidate: 'Candidate', context: 'Context v2', trials: 'Trials', exceptions: 'Exceptions', mode: 'Mode',
    result: 'Outcome', process: 'Evaluation process', contract: 'Evaluation contract', stack: 'Evaluation Stack', dataset: 'Dataset', assessments: 'Trial assessments', reasons: 'Reasons and evidence', optimization: 'Optimization', promotion: 'Promotion', audit: 'Audit artifacts',
    close: 'Close', search: 'Search trials', all: 'All', assessed: 'Assessed', infra: 'Infrastructure error', previous: 'Previous', next: 'Next', noData: 'No artifact', validation: 'Artifact validation', ready: 'Promotion ready', blocked: 'Blocked',
    doctor: 'Architecture Doctor', primaryMetric: 'Primary metric', population: 'Population', component: 'Component', version: 'Version', digest: 'Digest', source: 'Evidence', findings: 'Findings', output: 'Output and intermediate results',
    setupDoctor: 'Installation and architecture checks', setupHint: 'Read-only status; the browser never rewrites Cordis configuration.', retry: 'Retry', loading: 'Loading…',
  },
}

const CSS = `
.hse-root{--blue:#2769ff;--cyan:#44d9ff;--deep:#061b44;height:100%;min-height:0;overflow:auto;color:var(--dsw-alias-label-primary,#172033);background:var(--dsw-alias-bg-layer-1,#f4f7fc);font-family:inherit}.hse-page{width:min(1240px,calc(100% - 36px));margin:auto;padding:24px 0 56px}
.hse-hero{position:relative;isolation:isolate;overflow:hidden;min-height:230px;padding:30px;border-radius:24px;color:#fff;background:#061b44 var(--ocean) center/cover no-repeat;box-shadow:0 20px 60px rgba(4,27,74,.23)}.hse-hero:before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(90deg,rgba(3,17,48,.96),rgba(4,31,79,.82) 52%,rgba(4,31,79,.2))}.hse-hero h1{max-width:650px;margin:16px 0 10px;font-size:clamp(28px,4vw,45px);line-height:1.08;letter-spacing:-.04em}.hse-hero p{max-width:670px;margin:0;color:#dceeff;font-size:14px;line-height:1.7}.hse-eyebrow{color:#76e4ff;font-size:11px;font-weight:800;letter-spacing:.17em}.hse-refresh{position:absolute;right:22px;top:22px;padding:8px 12px;border:1px solid #ffffff4a;border-radius:999px;color:#fff;background:#06245e99;cursor:pointer}
.hse-stats{display:flex;gap:9px;margin-top:25px;flex-wrap:wrap}.hse-stat{min-width:125px;padding:11px 13px;border:1px solid #ffffff26;border-radius:13px;background:#031a41a3;backdrop-filter:blur(8px)}.hse-stat span{display:block;color:#cde5fa;font-size:10px}.hse-stat b{display:block;margin-top:4px;font-size:20px}.hse-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin:28px 0 12px}.hse-head h2{margin:0;font-size:18px}.hse-head p{margin:4px 0 0;color:#748096;font-size:12px}
.hse-list{display:grid;gap:10px}.hse-job{display:block;width:100%;padding:0;border:1px solid var(--dsw-alias-border-l1,#dce4f0);border-radius:16px;color:inherit;background:var(--dsw-alias-bg-layer-2,#fff);text-align:left;cursor:pointer;overflow:hidden;box-shadow:0 5px 18px #1b365d0d}.hse-job:hover{border-color:#78a3ff;transform:translateY(-1px)}.hse-job-body{padding:16px 18px}.hse-job-top{display:flex;justify-content:space-between;gap:14px}.hse-job-title{min-width:0}.hse-job-title strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.hse-job-title small{display:block;margin-top:4px;color:#7b879c;font-size:10px}.hse-status{flex:none;padding:5px 9px;border-radius:999px;color:#126d50;background:#23ba8318;font-size:10px;font-weight:700}.hse-status[data-status=failed]{color:#b5283d;background:#ed5b6c18}.hse-status[data-status=partial]{color:#9c620e;background:#f1a23c1c}.hse-status[data-status=pending]{color:#225cce;background:#2769ff18}.hse-meta-grid{display:grid;grid-template-columns:1.5fr 1.2fr .55fr .55fr .8fr;gap:7px;margin-top:13px}.hse-meta{min-width:0;padding:8px 9px;border-radius:9px;background:var(--dsw-alias-bg-layer-1,#f4f7fb)}.hse-meta span{display:block;color:#7b879c;font-size:9px}.hse-meta b,.hse-meta code{display:block;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}.hse-metrics{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.hse-pill{padding:5px 7px;border:1px solid var(--dsw-alias-border-l1,#dce4f0);border-radius:7px;font-size:10px}.hse-pill b{margin-left:5px;color:var(--blue)}
.hse-empty,.hse-error{padding:34px;border:1px dashed #cbd6e6;border-radius:16px;text-align:center;background:var(--dsw-alias-bg-layer-2,#fff);color:#748096;font-size:12px}.hse-spin{width:25px;height:25px;margin:0 auto 10px;border:3px solid #2769ff22;border-top-color:var(--blue);border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.hse-overlay{position:fixed;inset:0;z-index:1000;display:flex;justify-content:flex-end;background:#06142c7a;backdrop-filter:blur(3px)}.hse-drawer{width:min(1040px,94vw);height:100%;overflow:auto;background:var(--dsw-alias-bg-layer-1,#f4f7fc);box-shadow:-24px 0 70px #04142c52}.hse-drawer-head{position:sticky;top:0;z-index:3;display:flex;justify-content:space-between;gap:15px;padding:18px 22px;border-bottom:1px solid var(--dsw-alias-border-l1,#dce4f0);background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,#fff) 92%,transparent);backdrop-filter:blur(12px)}.hse-drawer-head h2{margin:0;font-size:18px}.hse-drawer-head p{margin:5px 0 0;color:#748096;font-size:10px}.hse-close,.hse-button{border:0;border-radius:9px;padding:8px 11px;color:#fff;background:var(--blue);cursor:pointer}.hse-close{align-self:flex-start;background:#142a4f}.hse-workbench{padding:18px 22px 45px}.hse-section{margin-bottom:14px;padding:16px;border:1px solid var(--dsw-alias-border-l1,#dce4f0);border-radius:14px;background:var(--dsw-alias-bg-layer-2,#fff)}.hse-section h3{margin:0 0 11px;font-size:14px}.hse-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.hse-kpi{padding:11px;border-radius:10px;background:linear-gradient(135deg,#2769ff12,#44d9ff0a)}.hse-kpi span{display:block;color:#748096;font-size:9px}.hse-kpi b{display:block;margin-top:4px;font-size:17px}.hse-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.hse-card{min-width:0;padding:11px;border-radius:10px;background:var(--dsw-alias-bg-layer-1,#f4f7fb)}.hse-card span,.hse-card b,.hse-card code{display:block}.hse-card span{color:#748096;font-size:9px}.hse-card b,.hse-card code{margin-top:4px;overflow-wrap:anywhere;font-size:10px}.hse-findings{display:grid;gap:6px}.hse-finding{padding:9px 10px;border-left:3px solid #6d9cff;border-radius:7px;background:#2769ff0c;font-size:10px}.hse-finding[data-level=error]{border-color:#e75267;background:#e752670c}.hse-finding[data-level=warning]{border-color:#e6a036;background:#e6a0360c}.hse-finding b{margin-right:7px}.hse-components{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.hse-component{padding:9px;border-radius:9px;background:#0b2e6421}.hse-component span{display:block;color:#748096;font-size:9px}.hse-component b,.hse-component code{display:block;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px}
.hse-trial-tools{display:flex;gap:7px;margin-bottom:9px}.hse-input,.hse-select{min-width:0;padding:8px 9px;border:1px solid #cad6e7;border-radius:8px;color:inherit;background:transparent;font:inherit;font-size:10px}.hse-input{flex:1}.hse-table{width:100%;border-collapse:collapse;font-size:10px}.hse-table th,.hse-table td{padding:8px;border-bottom:1px solid #e4eaf2;text-align:left}.hse-table button{border:0;color:var(--blue);background:none;cursor:pointer;font:inherit}.hse-pager{display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:9px;font-size:10px}.hse-pager button{padding:5px 8px;border:1px solid #cad6e7;border-radius:7px;background:transparent;color:inherit;cursor:pointer}.hse-trial-detail{margin-top:10px;padding:12px;border-radius:10px;background:#071d48;color:#dcecff}.hse-trial-detail pre,.hse-audit pre{max-height:340px;overflow:auto;margin:8px 0 0;white-space:pre-wrap;word-break:break-word;font-size:9px;line-height:1.5}.hse-reasons{margin:0;padding-left:18px;font-size:10px;line-height:1.6}.hse-audit summary{cursor:pointer;font-size:11px;font-weight:700}.hse-valid{color:#14815d}.hse-invalid{color:#c33148}
.hse-settings{width:min(850px,calc(100% - 32px));margin:auto;padding:28px 0}.hse-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:16px}.hse-check{padding:12px;border:1px solid #dce4f0;border-radius:10px;background:var(--dsw-alias-bg-layer-2,#fff)}.hse-check b,.hse-check small{display:block}.hse-check small{margin-top:4px;color:#748096}.hse-tool{border:1px solid #dce4f0;border-radius:11px;background:var(--dsw-alias-bg-layer-2,#fff);overflow:hidden}.hse-tool button{display:flex;gap:8px;width:100%;padding:10px;border:0;color:inherit;background:transparent;text-align:left;cursor:pointer}.hse-tool strong{font-size:11px}.hse-tool small{margin-left:auto}.hse-tool pre{max-height:260px;overflow:auto;margin:0;padding:11px;border-top:1px solid #e3e9f1;white-space:pre-wrap;font-size:9px}
@media(max-width:800px){.hse-page{width:calc(100% - 20px)}.hse-hero{padding:24px 18px}.hse-meta-grid,.hse-kpis{grid-template-columns:repeat(2,1fr)}.hse-components{grid-template-columns:repeat(2,1fr)}.hse-grid,.hse-checks{grid-template-columns:1fr}.hse-drawer{width:100vw}.hse-workbench{padding:12px}.hse-drawer-head{padding:14px}.hse-table th:nth-child(3),.hse-table td:nth-child(3){display:none}}
@media(prefers-reduced-motion:reduce){.hse-spin{animation:none}.hse-job:hover{transform:none}}
`

function installStyles() {
  const id = 'dsh-harbor-evolution/client'
  if (document.querySelector(`style[data-plugin-css="${id}"]`)) return () => {}
  const style = document.createElement('style')
  style.dataset.pluginCss = id
  style.textContent = CSS
  document.head.appendChild(style)
  return () => style.remove()
}

function isRecord(value) { return value && typeof value === 'object' && !Array.isArray(value) }
function format(value) { return typeof value === 'number' ? value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : String(value ?? '—') }
function short(value) { return typeof value === 'string' && value.length > 22 ? `${value.slice(0, 15)}…${value.slice(-5)}` : value ?? '—' }
function reasonText(reason) { return isRecord(reason) ? `${reason.code}: ${reason.message}` : String(reason) }

async function api(route, params = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== ''))
  const response = await fetch(`${API}/${route}${query.size ? `?${query}` : ''}`, { credentials: 'same-origin', cache: 'no-store' })
  const body = await response.json()
  if (!response.ok || !body?.ok) throw new Error(body?.error?.message ?? `HTTP ${response.status}`)
  return body.value
}

function useDashboard(poll = true) {
  const [state, setState] = useState({ status: 'loading' })
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setState(current => ({ ...current, status: current.value ? 'refreshing' : 'loading' }))
    try { setState({ status: 'ready', value: await api('dashboard') }) }
    catch (error) { setState(current => ({ ...current, status: 'error', error: error.message })) }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!poll || !state.value) return undefined
    const interval = state.value.overview?.activeJobs ? 3_000 : 15_000
    const timer = window.setTimeout(() => void load(true), interval)
    return () => window.clearTimeout(timer)
  }, [load, poll, state.value])
  return { ...state, load }
}

function MetricPills({ metrics }) {
  return <div className="hse-metrics">{Object.entries(metrics ?? {}).map(([key, value]) => <span className="hse-pill" key={key}>{key}<b>{format(value)}</b></span>)}</div>
}

function JobCard({ job, t, open }) {
  const candidate = job.candidate ?? {}
  const context = job.evaluationContext ?? {}
  return <button type="button" className="hse-job" onClick={() => open(job.name)}>
    <div className="hse-job-body"><div className="hse-job-top"><div className="hse-job-title"><strong>{job.name}</strong><small>{new Date(job.updatedAt).toLocaleString()}</small></div><span className="hse-status" data-status={job.status}>{t(job.status)}</span></div>
      <div className="hse-meta-grid"><div className="hse-meta"><span>{t('candidate')}</span><b>{candidate.candidate_id ?? '—'} · {candidate.version ?? '—'}</b></div><div className="hse-meta"><span>{t('context')}</span><code title={context.digest}>{short(context.digest)}</code></div><div className="hse-meta"><span>{t('trials')}</span><b>{job.nTrials}</b></div><div className="hse-meta"><span>{t('exceptions')}</span><b>{job.nExceptions}</b></div><div className="hse-meta"><span>{t('mode')}</span><b>{job.mode ?? '—'}</b></div></div>
      <MetricPills metrics={job.metrics}/>
    </div>
  </button>
}

function ArtifactSection({ title, value, children }) {
  return <section className="hse-section"><h3>{title}</h3>{children ?? (value ? <pre>{JSON.stringify(value, null, 2)}</pre> : <span>—</span>)}</section>
}

function TrialTable({ job, t }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState()
  const [detail, setDetail] = useState()
  useEffect(() => {
    const timer = window.setTimeout(() => { void api('trials', { job, offset, limit: 50, query, status }).then(setPage) }, 180)
    return () => window.clearTimeout(timer)
  }, [job, offset, query, status])
  const choose = async (trial) => setDetail(await api('trial', { job, trial }))
  return <>
    <div className="hse-trial-tools"><input className="hse-input" value={query} placeholder={t('search')} onChange={event => { setQuery(event.target.value); setOffset(0) }}/><select className="hse-select" value={status} onChange={event => { setStatus(event.target.value); setOffset(0) }}><option value="">{t('all')}</option><option value="assessed">{t('assessed')}</option><option value="infrastructure-error">{t('infra')}</option></select></div>
    <table className="hse-table"><thead><tr><th>Trial</th><th>Status</th><th>Metrics</th></tr></thead><tbody>{page?.items?.map(trial => <tr key={trial.id}><td><button onClick={() => void choose(trial.id)}>{trial.name ?? trial.id}</button></td><td>{trial.status}</td><td>{Object.entries(trial.rewards ?? {}).map(([key, value]) => `${key} ${format(value)}`).join(' · ')}</td></tr>)}</tbody></table>
    <div className="hse-pager"><span>{offset + 1}–{Math.min(offset + (page?.items?.length ?? 0), page?.total ?? 0)} / {page?.total ?? 0}</span><button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 50))}>{t('previous')}</button><button disabled={!page?.hasMore} onClick={() => setOffset(offset + 50)}>{t('next')}</button></div>
    {detail ? <div className="hse-trial-detail"><b>{t('output')}</b><pre>{JSON.stringify(detail.assessment, null, 2)}</pre></div> : null}
  </>
}

function Workbench({ job, close, t }) {
  const [state, setState] = useState({ status: 'loading' })
  useEffect(() => { let active = true; void api('job', { job }).then(value => active && setState({ status: 'ready', value }), error => active && setState({ status: 'error', error: error.message })); return () => { active = false } }, [job])
  const detail = state.value
  const a = detail?.artifacts ?? {}
  const summary = a.summary ?? {}
  const context = a.context ?? {}
  const doctor = a.doctor ?? {}
  const contract = a.contract ?? {}
  const stack = a.stack ?? {}
  const reasons = a.promotion?.reasons ?? summary.exceptions ?? []
  return <div className="hse-overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && close()}><aside className="hse-drawer" role="dialog" aria-modal="true" aria-label={job}>
    <header className="hse-drawer-head"><div><h2>{job}</h2><p>{summary.candidate?.candidate_id ?? '—'} · {summary.candidate?.version ?? '—'} · {context.mode ?? '—'}</p></div><button type="button" className="hse-close" onClick={close}>{t('close')}</button></header>
    <div className="hse-workbench">{state.status === 'loading' ? <div className="hse-empty"><div className="hse-spin"/>{t('loading')}</div> : state.status === 'error' ? <div className="hse-error">{state.error}</div> : <>
      <ArtifactSection title={t('result')}><div className="hse-kpis"><div className="hse-kpi"><span>{t('primaryMetric')}</span><b>{format(summary.metrics?.[contract.primary_metric])}</b></div><div className="hse-kpi"><span>{t('trials')}</span><b>{summary.n_trials ?? 0}</b></div><div className="hse-kpi"><span>{t('exceptions')}</span><b>{summary.n_exceptions ?? 0}</b></div><div className="hse-kpi"><span>{t('validation')}</span><b className={summary.artifact_validation?.valid ? 'hse-valid' : 'hse-invalid'}>{summary.artifact_validation?.valid ? 'VALID' : 'INVALID'}</b></div></div><MetricPills metrics={summary.metrics}/></ArtifactSection>
      <ArtifactSection title={t('process')}><div className="hse-grid"><div className="hse-card"><span>{t('doctor')}</span><b className={doctor.promotion_ready ? 'hse-valid' : 'hse-invalid'}>{doctor.promotion_ready ? t('ready') : t('blocked')}</b></div><div className="hse-card"><span>{t('context')}</span><code>{short(context.digest)}</code></div></div><div className="hse-findings">{doctor.findings?.map((finding, index) => <div className="hse-finding" data-level={finding.level} key={`${finding.code}-${index}`}><b>{finding.code}</b>{finding.message}</div>)}</div></ArtifactSection>
      <ArtifactSection title={t('contract')}><div className="hse-grid"><div className="hse-card"><span>ID / {t('version')}</span><b>{contract.contract_id ?? '—'} · {contract.version ?? '—'}</b></div><div className="hse-card"><span>{t('primaryMetric')}</span><b>{contract.primary_metric ?? '—'}</b></div></div><MetricPills metrics={Object.fromEntries((contract.metrics ?? []).map(metric => [metric.id, metric.direction ?? metric.label ?? 'metric']))}/></ArtifactSection>
      <ArtifactSection title={t('stack')}><div className="hse-components">{Object.entries(stack.components ?? {}).map(([role, component]) => <div className="hse-component" key={role}><span>{role}{component.reward_affecting ? ' · reward' : ''}</span><b>{component.id} · {component.version}</b><code title={component.digest}>{short(component.digest)}</code></div>)}</div></ArtifactSection>
      <ArtifactSection title={t('dataset')}><div className="hse-grid"><div className="hse-card"><span>ID / {t('version')}</span><b>{a.dataset?.dataset_id ?? '—'} · {a.dataset?.version ?? '—'}</b></div><div className="hse-card"><span>{t('population')}</span><b>{a.dataset?.task_count ?? 0} tasks · {a.dataset?.file_count ?? 0} files</b></div></div></ArtifactSection>
      <ArtifactSection title={t('assessments')}><TrialTable job={job} t={t}/></ArtifactSection>
      <ArtifactSection title={t('reasons')}><ul className="hse-reasons">{reasons.length ? reasons.map((reason, index) => <li key={index}>{reasonText(reason)}</li>) : <li>{t('noData')}</li>}</ul></ArtifactSection>
      <ArtifactSection title={t('optimization')} value={a.optimization}/>
      <ArtifactSection title={t('promotion')} value={a.promotion}/>
      <details className="hse-section hse-audit"><summary>{t('audit')}</summary><pre>{JSON.stringify({ validation: detail.validation, candidate: a.candidate, context: a.context, stack: a.stack, dataset: a.dataset, population: a.population }, null, 2)}</pre></details>
    </>}</div>
  </aside></div>
}

function DashboardView({ t }) {
  const state = useDashboard(true)
  const [selected, setSelected] = useState()
  const snapshot = state.value
  const stats = [[t('jobs'), snapshot?.overview?.totalJobs ?? '—'], [t('completed'), snapshot?.overview?.completedJobs ?? '—'], [t('pending'), snapshot?.overview?.activeJobs ?? '—'], [snapshot?.overview?.latestMetric?.name ?? t('primaryMetric'), format(snapshot?.overview?.latestMetric?.value)]]
  return <main className="hse-root"><div className="hse-page"><section className="hse-hero" style={{ '--ocean': `url(${oceanBackground})` }}><button className="hse-refresh" onClick={() => void state.load()}>{t('refresh')}</button><div className="hse-eyebrow">{t('eyebrow')}</div><h1>{t('heroTitle')}</h1><p>{t('heroBody')}</p><div className="hse-stats">{stats.map(([label, value]) => <div className="hse-stat" key={label}><span>{label}</span><b>{value}</b></div>)}</div></section><div className="hse-head"><div><h2>{t('jobs')}</h2><p>{t('jobsHint')}</p></div></div>{state.status === 'loading' ? <div className="hse-empty"><div className="hse-spin"/>{t('loading')}</div> : state.status === 'error' && !snapshot ? <div className="hse-error">{state.error}<br/><button className="hse-button" onClick={() => void state.load()}>{t('retry')}</button></div> : !snapshot?.jobs?.length ? <div className="hse-empty">{t('empty')}</div> : <div className="hse-list">{snapshot.jobs.map(job => <JobCard job={job} t={t} open={setSelected} key={job.name}/>)}</div>}</div>{selected ? <Workbench job={selected} close={() => setSelected(undefined)} t={t}/> : null}</main>
}

function DoctorView({ t }) {
  const state = useDashboard(false)
  return <main className="hse-root"><div className="hse-settings"><h2>{t('setupDoctor')}</h2><p>{t('setupHint')}</p><div className="hse-checks">{Object.entries(state.value?.checks ?? {}).map(([key, check]) => <div className="hse-check" key={key}><b className={check.status === 'ok' ? 'hse-valid' : 'hse-invalid'}>{key} · {check.status}</b><small>{check.detail}</small></div>)}</div></div></main>
}

function blockText(block) { return isRecord(block) && Array.isArray(block.content) ? block.content.filter(item => item?.type === 'text').map(item => item.text).join('\n') : '' }
export function decodeToolResult(block) { if (!isRecord(block) || block.isError) return undefined; if (isRecord(block.meta)) return block.meta; try { const value = JSON.parse(blockText(block)); return isRecord(value) ? value : undefined } catch { return undefined } }
function HarborToolView({ block, toolName }) {
  const [open, setOpen] = useState(true)
  const value = decodeToolResult(block)
  const running = !isRecord(block) || !('kind' in block)
  return <section className="hse-tool"><button type="button" onClick={() => setOpen(!open)}><strong>🐳 {toolName}</strong><small>{running ? 'running' : block.isError ? 'error' : '✓'}</small></button>{open ? <pre>{value ? JSON.stringify(value, null, 2) : blockText(block) || 'Running…'}</pre> : null}</section>
}

export const name = 'dsh-harbor-evolution'
export const inject = ['slots', 'locale']
export function apply(ctx) {
  ctx.effect(installStyles, 'harbor-evolution: styles')
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'harbor-evolution: locale')
  const t = ctx.locale.bind(NS)
  const injected = () => ({ t })
  ctx.slots.inject('conversation.view', () => ctx.slots.register({ name: 'conversation.view', id: 'harbor-evolution', order: 30, locale: NS, label: () => t('tab'), inject: injected }, DashboardView))
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'harbor-evolution', order: 35, label: () => t('settings'), inject: injected }, DoctorView))
  ctx.slots.inject('tool.call.toolview', function* registerTools() {
    for (const key of ['harbor_candidate_snapshot', 'harbor_evolution_init', 'harbor_evolution_doctor', 'harbor_dataset_validate', 'harbor_context_preview', 'harbor_eval_run', 'harbor_eval_result', 'harbor_candidate_compare']) yield ctx.slots.register({ name: 'tool.call.toolview', key, inject: injected }, HarborToolView)
  })
}

module.exports = { name, inject, apply }
