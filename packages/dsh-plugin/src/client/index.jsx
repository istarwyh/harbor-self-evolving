import React, { useCallback, useEffect, useMemo, useState } from 'react'

import oceanBackground from './assets/harbor-ocean.jpg'

const NS = 'harbor-evolution'
const ROUTE = '/_dsh/harbor-evolution/dashboard'

const dictionaries = {
  zh: {
    tab: 'Harbor',
    settings: 'Harbor 自进化',
    eyebrow: 'HARBOR SELF-EVOLVING',
    heroTitle: '让每次 Agent 改动都有证据',
    heroBody: 'Candidate 固化能力，Job 保存实验，Promotion Gate 只让可比较、无回归的版本靠岸。',
    refresh: '刷新',
    refreshed: '最近刷新',
    totalJobs: '评测批次',
    completedJobs: '已完成',
    activeJobs: '进行中',
    failedJobs: '失败',
    latestMetric: '最新指标',
    jobs: '最近的 Harbor Jobs',
    jobsHint: '最多展示最近 50 个批次。结果直接读取稳定的 evaluation-summary.json。',
    emptyTitle: '还没有评测结果',
    emptyBody: '让 Agent 调用官方 Skill，先澄清 Candidate、Dataset 与 Promotion Policy，再启动第一个 Job。',
    startStep1: '1. 固化 Candidate',
    startStep2: '2. 运行 Harbor Job',
    startStep3: '3. 比较并决定晋级',
    candidate: 'Candidate',
    context: '评测上下文',
    trials: 'Trials',
    exceptions: 'Exceptions',
    metrics: '指标',
    pending: '下潜中',
    completed: '已靠岸',
    partial: '带异常完成',
    failed: '遇到风暴',
    promote: '晋级',
    reject: '拒绝晋级',
    noMetrics: '暂无指标',
    loading: '正在读取 Harbor 航线…',
    loadError: '无法读取 Harbor 状态',
    retry: '重试',
    doctorTitle: '安装与运行检查',
    doctorBody: '这里检查 DSH Plugin 到 Harbor Runtime 的关键路径。配置仍由 Cordis Profile 管理，不会被浏览器静默改写。',
    ready: '可以开始评测',
    attention: '需要处理',
    projectRoot: '项目根目录',
    jobsDir: 'Jobs 目录',
    harbor: 'Harbor CLI',
    harborDsh: 'Promotion CLI',
    runtime: '运行契约',
    dshVersion: 'DSH 版本',
    agentImport: 'Agent 入口',
    pluginImport: 'Harbor Plugin',
    skillGuide: '如何开始',
    skillBody: '在对话中说明“请用 Harbor 自进化 Skill 初始化并评测我的 Agent”。Skill 会先补齐需求，而不是直接执行高成本 Job。',
    toolSnapshot: '固化 Candidate',
    toolRun: '运行 Harbor 评测',
    toolResult: '读取评测结果',
    toolCompare: '执行 Promotion Gate',
    running: '执行中',
    toolFailed: '工具调用失败',
    noResult: '没有可解析的结构化结果',
    digest: 'Digest',
    version: '版本',
    job: 'Job',
    decision: '决策',
    reasons: 'Gate 原因',
    comparable: '同一评测上下文',
    changed: 'Candidate 已改变',
  },
  en: {
    tab: 'Harbor',
    settings: 'Harbor Evolution',
    eyebrow: 'HARBOR SELF-EVOLVING',
    heroTitle: 'Make every Agent change evidence-based',
    heroBody: 'Candidates freeze capabilities, Jobs preserve experiments, and the Promotion Gate admits only comparable, non-regressing versions.',
    refresh: 'Refresh',
    refreshed: 'Last refreshed',
    totalJobs: 'Evaluation jobs',
    completedJobs: 'Completed',
    activeJobs: 'Active',
    failedJobs: 'Failed',
    latestMetric: 'Latest metric',
    jobs: 'Recent Harbor Jobs',
    jobsHint: 'Shows up to 50 recent jobs from stable evaluation-summary.json files.',
    emptyTitle: 'No evaluation results yet',
    emptyBody: 'Ask the official Skill to clarify the Candidate, Dataset, and Promotion Policy before starting the first Job.',
    startStep1: '1. Freeze Candidate',
    startStep2: '2. Run Harbor Job',
    startStep3: '3. Compare and promote',
    candidate: 'Candidate',
    context: 'Evaluation context',
    trials: 'Trials',
    exceptions: 'Exceptions',
    metrics: 'Metrics',
    pending: 'Diving',
    completed: 'Landed',
    partial: 'Completed with exceptions',
    failed: 'Storm',
    promote: 'Promote',
    reject: 'Reject',
    noMetrics: 'No metrics',
    loading: 'Reading Harbor routes…',
    loadError: 'Could not read Harbor status',
    retry: 'Retry',
    doctorTitle: 'Installation and runtime checks',
    doctorBody: 'Checks the critical path from the DSH Plugin to the Harbor Runtime. Cordis Profile remains the configuration owner.',
    ready: 'Ready to evaluate',
    attention: 'Needs attention',
    projectRoot: 'Project root',
    jobsDir: 'Jobs directory',
    harbor: 'Harbor CLI',
    harborDsh: 'Promotion CLI',
    runtime: 'Runtime contract',
    dshVersion: 'DSH version',
    agentImport: 'Agent entry',
    pluginImport: 'Harbor plugin',
    skillGuide: 'How to start',
    skillBody: 'Say “use the Harbor self-evolution Skill to initialize and evaluate my Agent”. The Skill clarifies requirements before launching an expensive Job.',
    toolSnapshot: 'Freeze Candidate',
    toolRun: 'Run Harbor evaluation',
    toolResult: 'Read evaluation result',
    toolCompare: 'Run Promotion Gate',
    running: 'Running',
    toolFailed: 'Tool call failed',
    noResult: 'No structured result could be parsed',
    digest: 'Digest',
    version: 'Version',
    job: 'Job',
    decision: 'Decision',
    reasons: 'Gate reasons',
    comparable: 'Same evaluation context',
    changed: 'Candidate changed',
  },
}

const CSS = `
.hse-root{--hse-blue:#2769ff;--hse-cyan:#3ed8ff;--hse-deep:#071d48;color:var(--dsw-alias-label-primary,#172033);height:100%;min-height:0;overflow:auto;background:var(--dsw-alias-bg-layer-1,#f5f8ff);font-family:inherit}
.hse-page{width:min(1180px,calc(100% - 40px));margin:0 auto;padding:28px 0 56px}
.hse-hero{position:relative;isolation:isolate;overflow:hidden;min-height:270px;border-radius:24px;padding:34px;color:#fff;background:#071d48 var(--hse-ocean) center/cover no-repeat;box-shadow:0 20px 60px rgba(4,27,74,.25)}
.hse-hero:before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(90deg,rgba(3,19,53,.96) 0%,rgba(4,28,75,.83) 45%,rgba(5,33,82,.24) 78%,rgba(2,19,48,.12) 100%)}
.hse-hero:after{content:"";position:absolute;width:340px;height:340px;left:-120px;bottom:-250px;border-radius:50%;border:1px solid rgba(98,222,255,.3);box-shadow:0 0 0 38px rgba(80,196,255,.06),0 0 0 84px rgba(80,196,255,.035)}
.hse-hero-copy{position:relative;z-index:1;max-width:610px}
.hse-eyebrow{display:flex;align-items:center;gap:9px;font-size:11px;font-weight:800;letter-spacing:.16em;color:#79e1ff}
.hse-eyebrow:before{content:"";width:22px;height:2px;border-radius:2px;background:#53d6ff;box-shadow:0 0 12px #53d6ff}
.hse-hero h1{margin:18px 0 12px;font-size:clamp(27px,4vw,44px);line-height:1.08;letter-spacing:-.035em;max-width:540px}
.hse-hero p{margin:0;max-width:570px;color:rgba(235,247,255,.82);font-size:15px;line-height:1.75}
.hse-refresh{position:absolute;z-index:2;top:24px;right:24px;display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(255,255,255,.3);border-radius:999px;padding:8px 13px;background:rgba(3,21,55,.4);color:#fff;font:inherit;font-size:12px;cursor:pointer;backdrop-filter:blur(10px);transition:.18s ease}
.hse-refresh:hover{background:rgba(34,112,235,.55);transform:translateY(-1px)}
.hse-refresh:disabled{opacity:.55;cursor:wait}
.hse-stats{position:relative;z-index:2;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:30px;max-width:670px}
.hse-stat{min-height:64px;padding:12px 14px;border:1px solid rgba(255,255,255,.16);border-radius:14px;background:rgba(4,27,65,.42);backdrop-filter:blur(8px)}
.hse-stat span{display:block;font-size:11px;color:rgba(225,243,255,.68)}
.hse-stat strong{display:block;margin-top:4px;font-size:22px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hse-section{margin-top:28px}
.hse-section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:13px}
.hse-section h2,.hse-doctor h2{margin:0;font-size:18px;letter-spacing:-.01em}
.hse-section-head p,.hse-doctor-intro{margin:4px 0 0;color:var(--dsw-alias-label-secondary,#67728a);font-size:12px;line-height:1.55}
.hse-job-list{display:grid;gap:12px}
.hse-job{position:relative;padding:18px;border:1px solid var(--dsw-alias-border-l1,#dde5f2);border-radius:17px;background:var(--dsw-alias-bg-layer-2,#fff);box-shadow:var(--dsw-shadow-lv1,0 5px 18px rgba(27,54,93,.06));overflow:hidden}
.hse-job:before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:#5e8cff}
.hse-job[data-status="completed"]:before{background:#23ba83}.hse-job[data-status="partial"]:before{background:#f1a23c}.hse-job[data-status="failed"]:before{background:#ed5b6c}
.hse-job-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.hse-job-title{min-width:0}.hse-job-title strong{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hse-job-title small{display:block;margin-top:5px;color:var(--dsw-alias-label-secondary,#748096);font-size:11px}
.hse-status{flex:none;display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 9px;background:rgba(39,105,255,.1);color:#2769e8;font-size:11px;font-weight:700}
.hse-status:before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 0 3px currentColor;opacity:.7}
.hse-status[data-status="completed"]{color:#12835d;background:rgba(35,186,131,.11)}.hse-status[data-status="partial"]{color:#b36a08;background:rgba(241,162,60,.13)}.hse-status[data-status="failed"]{color:#ca3145;background:rgba(237,91,108,.12)}
.hse-job-meta{display:grid;grid-template-columns:1.4fr 1.4fr .55fr .55fr;gap:8px;margin-top:15px}
.hse-meta{min-width:0;padding:9px 10px;border-radius:10px;background:var(--dsw-alias-bg-layer-1,#f5f8fc)}.hse-meta span{display:block;color:var(--dsw-alias-label-secondary,#748096);font-size:10px}.hse-meta code,.hse-meta strong{display:block;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:inherit}
.hse-metrics{display:flex;flex-wrap:wrap;gap:7px;margin-top:11px}.hse-metric{display:inline-flex;gap:6px;align-items:center;border:1px solid var(--dsw-alias-border-l1,#dde5f2);border-radius:8px;padding:6px 8px;font-size:11px}.hse-metric b{color:#2769e8}
.hse-promotion{margin-top:11px;padding:10px 12px;border-radius:10px;background:rgba(39,105,255,.07);font-size:11px}.hse-promotion[data-decision="PROMOTE"]{background:rgba(35,186,131,.1);color:#08734e}.hse-promotion[data-decision="REJECT"]{background:rgba(237,91,108,.09);color:#a92135}.hse-promotion strong{margin-right:8px}
.hse-empty,.hse-error{padding:34px;border:1px dashed var(--dsw-alias-border-l1,#cfd9e8);border-radius:18px;text-align:center;background:var(--dsw-alias-bg-layer-2,#fff)}.hse-empty h3,.hse-error h3{margin:10px 0 7px}.hse-empty p,.hse-error p{max-width:600px;margin:0 auto;color:var(--dsw-alias-label-secondary,#748096);font-size:13px;line-height:1.6}
.hse-steps{display:flex;justify-content:center;flex-wrap:wrap;gap:8px;margin-top:19px}.hse-steps span{padding:8px 11px;border-radius:9px;background:rgba(39,105,255,.08);color:#2769e8;font-size:11px;font-weight:700}
.hse-spinner{width:28px;height:28px;margin:0 auto 12px;border:3px solid rgba(39,105,255,.14);border-top-color:#2769ff;border-radius:50%;animation:hse-spin .8s linear infinite}@keyframes hse-spin{to{transform:rotate(360deg)}}
.hse-button{margin-top:13px;border:0;border-radius:9px;padding:8px 13px;background:#2769ff;color:#fff;font:inherit;font-size:12px;cursor:pointer}
.hse-doctor{width:min(860px,calc(100% - 40px));margin:0 auto;padding:30px 0 54px}
.hse-doctor-banner{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:20px 0;padding:17px 19px;border-radius:15px;background:linear-gradient(135deg,rgba(39,105,255,.12),rgba(62,216,255,.08));border:1px solid rgba(39,105,255,.18)}
.hse-doctor-banner strong{font-size:14px}.hse-doctor-banner span{font-size:12px;color:var(--dsw-alias-label-secondary,#748096)}
.hse-checks{display:grid;grid-template-columns:1fr 1fr;gap:10px}.hse-check{display:flex;align-items:center;gap:11px;padding:13px;border:1px solid var(--dsw-alias-border-l1,#dde5f2);border-radius:12px;background:var(--dsw-alias-bg-layer-2,#fff)}
.hse-check-dot{width:9px;height:9px;border-radius:50%;background:#27bb83;box-shadow:0 0 0 4px rgba(39,187,131,.12)}.hse-check[data-status="warning"] .hse-check-dot{background:#e6a036;box-shadow:0 0 0 4px rgba(230,160,54,.12)}.hse-check[data-status="error"] .hse-check-dot{background:#ed5b6c;box-shadow:0 0 0 4px rgba(237,91,108,.12)}
.hse-check div{min-width:0}.hse-check strong,.hse-check small{display:block}.hse-check strong{font-size:12px}.hse-check small{margin-top:3px;color:var(--dsw-alias-label-secondary,#748096);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hse-contract{margin-top:20px;padding:18px;border:1px solid var(--dsw-alias-border-l1,#dde5f2);border-radius:15px;background:var(--dsw-alias-bg-layer-2,#fff)}.hse-contract h3{margin:0 0 12px;font-size:14px}.hse-contract dl{display:grid;grid-template-columns:130px minmax(0,1fr);gap:8px;margin:0;font-size:11px}.hse-contract dt{color:var(--dsw-alias-label-secondary,#748096)}.hse-contract dd{margin:0;overflow-wrap:anywhere}.hse-contract code{font-size:10px}
.hse-skill-guide{margin-top:20px;padding:18px;border-radius:15px;color:#dff7ff;background:linear-gradient(135deg,#08275b,#0b4381);box-shadow:0 14px 35px rgba(5,39,91,.15)}.hse-skill-guide h3{margin:0 0 7px;font-size:14px}.hse-skill-guide p{margin:0;color:rgba(223,247,255,.78);font-size:12px;line-height:1.65}
.hse-tool{border:1px solid var(--dsw-alias-border-l1,#dce4f1);border-radius:13px;background:var(--dsw-alias-bg-layer-2,#fff);overflow:hidden}.hse-tool-head{display:flex;align-items:center;gap:10px;width:100%;padding:11px 13px;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}.hse-tool-icon{display:grid;place-items:center;width:27px;height:27px;border-radius:9px;color:#2769ff;background:rgba(39,105,255,.1)}.hse-tool-title{font-size:12px;font-weight:700}.hse-tool-summary{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary,#748096);font-size:11px}.hse-tool-state{margin-left:auto;font-size:10px;color:#238260}.hse-tool[data-state="running"] .hse-tool-state{color:#2769ff}.hse-tool[data-state="error"] .hse-tool-state{color:#cf3549}.hse-tool-body{display:grid;gap:8px;padding:0 13px 13px}.hse-tool-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.hse-tool-field{min-width:0;padding:8px 9px;border-radius:9px;background:var(--dsw-alias-bg-layer-1,#f5f8fc)}.hse-tool-field span,.hse-tool-field strong,.hse-tool-field code{display:block}.hse-tool-field span{font-size:9px;color:var(--dsw-alias-label-secondary,#748096)}.hse-tool-field strong,.hse-tool-field code{margin-top:3px;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hse-reasons{margin:0;padding-left:18px;color:var(--dsw-alias-label-secondary,#748096);font-size:10px;line-height:1.5}
@media(max-width:760px){.hse-page,.hse-doctor{width:min(100% - 24px,1180px);padding-top:12px}.hse-hero{padding:26px 20px;min-height:310px}.hse-refresh{top:14px;right:14px}.hse-hero-copy{padding-top:28px}.hse-stats{grid-template-columns:repeat(2,1fr)}.hse-job-meta{grid-template-columns:1fr 1fr}.hse-checks{grid-template-columns:1fr}.hse-contract dl{grid-template-columns:1fr}.hse-contract dd{margin-bottom:5px}}
@media(prefers-reduced-motion:reduce){.hse-spinner{animation:none}.hse-refresh{transition:none}}
`

function installStyles() {
  const id = 'dsh-harbor-evolution/client'
  if (document.querySelector(`style[data-plugin-css="${id}"]`)) return () => {}
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-harbor-evolution'
  style.dataset.pluginCss = id
  style.textContent = CSS
  document.head.appendChild(style)
  return () => style.remove()
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function blockText(block) {
  if (!isRecord(block) || !('kind' in block) || !Array.isArray(block.content)) return ''
  return block.content.filter(entry => entry?.type === 'text').map(entry => entry.text).join('\n')
}

export function decodeToolResult(block) {
  if (!isRecord(block) || !('kind' in block) || block.isError) return undefined
  if (isRecord(block.meta)) return block.meta
  const text = blockText(block).trim()
  if (!text) return undefined
  try {
    const parsed = JSON.parse(text)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

async function fetchDashboard() {
  const response = await fetch(ROUTE, { credentials: 'same-origin', cache: 'no-store' })
  const body = await response.json()
  if (!response.ok || !body?.ok) throw new Error(body?.error?.message ?? `HTTP ${response.status}`)
  return body.value
}

function useDashboard(poll = true) {
  const [state, setState] = useState({ status: 'loading' })
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setState(current => ({ ...current, status: current.value ? 'refreshing' : 'loading', error: undefined }))
    try {
      const value = await fetchDashboard()
      setState({ status: 'ready', value })
    } catch (error) {
      setState(current => ({ ...current, status: 'error', error: error instanceof Error ? error.message : String(error) }))
    }
  }, [])
  useEffect(() => {
    void load()
    if (!poll) return undefined
    const timer = window.setInterval(() => { void load(true) }, 5000)
    return () => window.clearInterval(timer)
  }, [load, poll])
  return { ...state, load }
}

function WhaleIcon({ size = 18 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 13c2.1 3.8 6.4 5.2 10.1 3.7 2.4-1 3.9-3 4.3-5.1 1.3.2 2.7-.3 3.6-1.4-1.5-.2-2.3-1-2.8-2.2-.7.8-1.2 1.8-1.2 2.8-2.9-.1-4.4-2.2-7.7-2.2C6.5 8.6 4.3 10 3 13Z"/><path d="M7.2 12.3h.1"/></svg>
}

function formatValue(value) {
  if (typeof value !== 'number') return String(value ?? '—')
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
}

function shortDigest(value) {
  if (typeof value !== 'string') return '—'
  return value.length > 19 ? `${value.slice(0, 15)}…${value.slice(-4)}` : value
}

function statusLabel(status, t) {
  return t(status in dictionaries.zh ? status : 'pending')
}

function MetricPills({ metrics, t }) {
  const entries = Object.entries(isRecord(metrics) ? metrics : {})
  if (!entries.length) return <span className="hse-metric">{t('noMetrics')}</span>
  return entries.map(([name, value]) => <span className="hse-metric" key={name}>{name}<b>{formatValue(value)}</b></span>)
}

function JobCard({ job, t }) {
  const candidate = isRecord(job.candidate) ? job.candidate : {}
  const context = isRecord(job.evaluationContext) ? job.evaluationContext : {}
  return <article className="hse-job" data-status={job.status}>
    <div className="hse-job-top">
      <div className="hse-job-title"><strong>{job.name}</strong><small>{new Date(job.updatedAt).toLocaleString()}</small></div>
      <span className="hse-status" data-status={job.status}>{statusLabel(job.status, t)}</span>
    </div>
    <div className="hse-job-meta">
      <div className="hse-meta"><span>{t('candidate')}</span><strong>{candidate.candidate_id ?? '—'} · {candidate.version ?? '—'}</strong></div>
      <div className="hse-meta"><span>{t('context')}</span><code title={context.digest}>{shortDigest(context.digest)}</code></div>
      <div className="hse-meta"><span>{t('trials')}</span><strong>{job.nTrials}</strong></div>
      <div className="hse-meta"><span>{t('exceptions')}</span><strong>{job.nExceptions}</strong></div>
    </div>
    <div className="hse-metrics"><MetricPills metrics={job.metrics} t={t} /></div>
    {job.promotion ? <div className="hse-promotion" data-decision={job.promotion.decision}><strong>{job.promotion.decision === 'PROMOTE' ? t('promote') : t('reject')}</strong>{job.promotion.reasons?.[0] ?? ''}</div> : null}
  </article>
}

function EmptyState({ t }) {
  return <div className="hse-empty"><WhaleIcon size={34}/><h3>{t('emptyTitle')}</h3><p>{t('emptyBody')}</p><div className="hse-steps"><span>{t('startStep1')}</span><span>{t('startStep2')}</span><span>{t('startStep3')}</span></div></div>
}

function ErrorState({ error, retry, t }) {
  return <div className="hse-error"><h3>{t('loadError')}</h3><p>{error}</p><button className="hse-button" type="button" onClick={() => void retry()}>{t('retry')}</button></div>
}

function DashboardView({ t }) {
  const state = useDashboard(true)
  const snapshot = state.value
  const stats = [
    ['totalJobs', snapshot?.overview?.totalJobs ?? '—'],
    ['completedJobs', snapshot?.overview?.completedJobs ?? '—'],
    ['activeJobs', snapshot?.overview?.activeJobs ?? '—'],
    ['latestMetric', snapshot?.overview?.latestMetric ? `${snapshot.overview.latestMetric.name} ${formatValue(snapshot.overview.latestMetric.value)}` : '—'],
  ]
  return <main className="hse-root"><div className="hse-page">
    <section className="hse-hero" style={{ '--hse-ocean': `url(${oceanBackground})` }}>
      <button type="button" className="hse-refresh" disabled={state.status === 'loading' || state.status === 'refreshing'} onClick={() => void state.load()}><span>↻</span>{t('refresh')}</button>
      <div className="hse-hero-copy"><div className="hse-eyebrow">{t('eyebrow')}</div><h1>{t('heroTitle')}</h1><p>{t('heroBody')}</p></div>
      <div className="hse-stats">{stats.map(([label, value]) => <div className="hse-stat" key={label}><span>{t(label)}</span><strong>{value}</strong></div>)}</div>
    </section>
    <section className="hse-section">
      <div className="hse-section-head"><div><h2>{t('jobs')}</h2><p>{t('jobsHint')}</p></div>{snapshot?.generatedAt ? <p>{t('refreshed')} {new Date(snapshot.generatedAt).toLocaleTimeString()}</p> : null}</div>
      {state.status === 'loading' ? <div className="hse-empty"><div className="hse-spinner"/><p>{t('loading')}</p></div> : state.status === 'error' && !snapshot ? <ErrorState error={state.error} retry={state.load} t={t}/> : !snapshot?.jobs?.length ? <EmptyState t={t}/> : <div className="hse-job-list">{snapshot.jobs.map(job => <JobCard job={job} t={t} key={job.name}/>)}</div>}
    </section>
  </div></main>
}

function DoctorView({ t }) {
  const state = useDashboard(false)
  const snapshot = state.value
  const checks = snapshot?.checks ?? {}
  const allReady = Object.values(checks).every(check => check?.status === 'ok')
  const labels = { projectRoot: 'projectRoot', jobsDir: 'jobsDir', harbor: 'harbor', harborDsh: 'harborDsh' }
  return <main className="hse-root"><div className="hse-doctor">
    <h2>{t('doctorTitle')}</h2><p className="hse-doctor-intro">{t('doctorBody')}</p>
    {state.status === 'loading' ? <div className="hse-empty" style={{ marginTop: 20 }}><div className="hse-spinner"/><p>{t('loading')}</p></div> : state.status === 'error' && !snapshot ? <div style={{ marginTop: 20 }}><ErrorState error={state.error} retry={state.load} t={t}/></div> : <>
      <div className="hse-doctor-banner"><strong>{allReady ? t('ready') : t('attention')}</strong><span>Plugin v{snapshot?.pluginVersion ?? __HSE_VERSION__}</span></div>
      <div className="hse-checks">{Object.entries(labels).map(([key, label]) => <div className="hse-check" data-status={checks[key]?.status ?? 'error'} key={key}><span className="hse-check-dot"/><div><strong>{t(label)}</strong><small title={checks[key]?.detail}>{checks[key]?.detail ?? '—'}</small></div></div>)}</div>
      <section className="hse-contract"><h3>{t('runtime')}</h3><dl><dt>{t('projectRoot')}</dt><dd><code>{snapshot?.config?.projectRoot ?? '—'}</code></dd><dt>{t('jobsDir')}</dt><dd><code>{snapshot?.config?.jobsDir ?? '—'}</code></dd><dt>{t('dshVersion')}</dt><dd>{snapshot?.config?.dshVersion ?? '—'}</dd><dt>{t('agentImport')}</dt><dd><code>{snapshot?.config?.agentImportPath ?? '—'}</code></dd><dt>{t('pluginImport')}</dt><dd><code>{snapshot?.config?.pluginImportPath ?? '—'}</code></dd></dl></section>
      <section className="hse-skill-guide"><h3>{t('skillGuide')}</h3><p>{t('skillBody')}</p></section>
    </>}
  </div></main>
}

function ToolField({ label, value, code = false }) {
  return <div className="hse-tool-field"><span>{label}</span>{code ? <code title={String(value ?? '—')}>{String(value ?? '—')}</code> : <strong>{String(value ?? '—')}</strong>}</div>
}

function toolPresentation(toolName, value, t) {
  if (toolName === 'harbor_candidate_snapshot') {
    return { title: t('toolSnapshot'), summary: value ? `${value.candidate_id ?? '—'} · ${value.version ?? '—'}` : undefined, fields: [[t('candidate'), value?.candidate_id], [t('version'), value?.version], [t('digest'), shortDigest(value?.digest), true]] }
  }
  if (toolName === 'harbor_eval_run') {
    const summary = value?.summary
    return { title: t('toolRun'), summary: summary?.job ?? value?.jobDir, metrics: summary?.metrics, fields: [[t('job'), summary?.job ?? value?.jobDir, true], [t('trials'), summary?.n_trials], [t('exceptions'), summary?.n_exceptions], [t('digest'), shortDigest(value?.manifest?.digest), true]] }
  }
  if (toolName === 'harbor_eval_result') {
    return { title: t('toolResult'), summary: value?.job, metrics: value?.metrics, fields: [[t('job'), value?.job, true], [t('trials'), value?.n_trials], [t('exceptions'), value?.n_exceptions], [t('context'), shortDigest(value?.evaluation_context?.digest), true]] }
  }
  return { title: t('toolCompare'), summary: value?.decision, metrics: value?.candidate_metrics, fields: [[t('decision'), value?.decision], [t('candidate'), value?.candidate?.version ?? value?.candidate_job], [t('comparable'), value?.baseline_evaluation_context?.digest === value?.candidate_evaluation_context?.digest ? '✓' : '—'], [t('changed'), value?.baseline_candidate?.digest !== value?.candidate?.digest ? '✓' : '—']], reasons: value?.reasons }
}

function HarborToolView({ block, toolName, t }) {
  const [open, setOpen] = useState(true)
  const running = !isRecord(block) || !('kind' in block)
  const failed = !running && block.isError
  const value = decodeToolResult(block)
  const view = toolPresentation(toolName, value, t)
  return <section className="hse-tool" data-state={running ? 'running' : failed ? 'error' : 'success'}>
    <button className="hse-tool-head" type="button" aria-expanded={open} onClick={() => setOpen(current => !current)}><span className="hse-tool-icon"><WhaleIcon/></span><span className="hse-tool-title">{view.title}</span>{view.summary ? <span className="hse-tool-summary">· {view.summary}</span> : null}<span className="hse-tool-state">{running ? t('running') : failed ? t('toolFailed') : '✓'}</span></button>
    {open ? <div className="hse-tool-body">{failed ? <span className="hse-tool-summary">{blockText(block) || t('toolFailed')}</span> : !value ? <span className="hse-tool-summary">{running ? t('running') : t('noResult')}</span> : <><div className="hse-tool-grid">{view.fields?.map(([label, fieldValue, code], index) => <ToolField label={label} value={fieldValue} code={code} key={`${label}-${index}`}/>)}</div>{view.metrics ? <div className="hse-metrics"><MetricPills metrics={view.metrics} t={t}/></div> : null}{Array.isArray(view.reasons) && view.reasons.length ? <ul className="hse-reasons">{view.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul> : null}</>}</div> : null}
  </section>
}

export const name = 'dsh-harbor-evolution'
export const inject = ['slots', 'locale']

export function apply(ctx) {
  ctx.effect(installStyles, 'harbor-evolution: styles')
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'harbor-evolution: locale')
  const t = ctx.locale.bind(NS)
  const injected = () => ({ t })

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view', id: 'harbor-evolution', order: 30, locale: NS, label: () => t('tab'), inject: injected,
  }, DashboardView))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'harbor-evolution', order: 35, label: () => t('settings'), inject: injected,
  }, DoctorView))

  ctx.slots.inject('tool.call.toolview', function* registerTools() {
    for (const key of ['harbor_candidate_snapshot', 'harbor_eval_run', 'harbor_eval_result', 'harbor_candidate_compare']) {
      yield ctx.slots.register({ name: 'tool.call.toolview', key, inject: injected }, HarborToolView)
    }
  })
}

module.exports = { name, inject, apply }
