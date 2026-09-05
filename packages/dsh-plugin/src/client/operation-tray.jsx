import React, { useEffect, useRef, useState } from 'react'
import { actionDraftDiagnosticSummary, actionOperationActive, actionOperationFailure } from './action-draft-state.js'
import { operationNeedsRecovery, operationResultTarget, pollOperationList } from './operation-tray-state.js'

const PHASES = {
  zh: { queued: '排队', 'preparing-environment': '准备运行环境', 'preparing-agent': '准备 Candidate', 'loading-observation': '读取观察记录', 'running-agent': 'Candidate 运行', 'running-adapter': '适配器运行', 'running-integration': '业务集成', rendering: '生成产物', evaluating: '评分中', completed: '已完成', 'completed-unscored': '完成未评分', 'candidate-quality-failed': '质量未通过', 'infrastructure-error': '基础设施异常', 'evaluation-error': '评分异常', cancelled: '已取消' },
  en: { queued: 'Queued', 'preparing-environment': 'Preparing environment', 'preparing-agent': 'Preparing Candidate', 'loading-observation': 'Loading observation', 'running-agent': 'Candidate running', 'running-adapter': 'Adapter running', 'running-integration': 'Integration', rendering: 'Rendering', evaluating: 'Scoring', completed: 'Completed', 'completed-unscored': 'Completed without score', 'candidate-quality-failed': 'Quality failed', 'infrastructure-error': 'Infrastructure error', 'evaluation-error': 'Scoring error', cancelled: 'Cancelled' },
}

export const OPERATION_TRAY_MESSAGES = {
  zh: {
    tasks: '后台任务', taskHint: '任务独立于当前讨论；收起面板不会停止。只有点击结果才会切换页面。',
    empty: '本会话尚未确认诊断任务', loading: '正在恢复任务记录…', refresh: '重新读取', stale: '任务状态读取失败；保留的是上次记录，不能据此确认任务已停止。',
    active: '运行中', attention: '待核查', records: '条记录', more: '仅显示最近任务；较早记录保留在审计日志中。',
    SCHEDULED: '已接受', EXECUTING: '启动中', ACTIVE: '运行中', CANCELLING: '正在停止', CANCELLED: '已取消', FAILED: '执行失败', INTERRUPTED: '运行归属待核查', COMPLETED: '诊断已结束',
    result: '查看诊断结果', partial: '查看运行／部分证据', noResult: '尚无可打开的 Job 证据；不会替换成历史结果。', cancel: '停止这项诊断', inspect: '核查运行与资源', inspectHint: '只读核查，不删除容器、不重跑任务。确认运行已停止且资源已清理后，才能解除诊断锁。',
    release: '确认解除这项诊断锁', releaseReview: '我已核对本次检查；仅解锁，不重试，不删除结果。', released: '已解除诊断锁；原运行结果保留，未自动重试。', blocked: '尚不能安全解锁。请按检查结果处理后重新核查。', checking: '正在核查…', saving: '正在确认…',
    progress: '已结束任务', requests: '模型请求', lastUpdate: '最近进展', unknownProgress: '尚未收到可验证进度；不会推测完成百分比。', budgetBoundary: '请求数不是 Token 或金额；外部业务／Verifier API 不在此预算内。',
    detail: '任务与审计身份', failedSummary: '含运行异常；不是质量通过', noScore: '尚无有效分；不是质量通过', loadMore: '显示更多任务', process: '执行进程', resources: '运行资源', stopped: '已停止', running: '仍在运行', unknown: '无法确认', clean: '已清理', remaining: '尚有残留',
  },
  en: {
    tasks: 'Background tasks', taskHint: 'Tasks remain independent of this discussion. Collapsing does not stop them. Only View results navigates.',
    empty: 'No confirmed diagnostics in this session', loading: 'Recovering task records…', refresh: 'Read again', stale: 'Status unavailable. Retained records are stale and do not prove the task stopped.',
    active: 'running', attention: 'need inspection', records: 'records', more: 'Only recent tasks are shown; older records remain in the audit journal.',
    SCHEDULED: 'Accepted', EXECUTING: 'Starting', ACTIVE: 'Running', CANCELLING: 'Stopping', CANCELLED: 'Cancelled', FAILED: 'Failed', INTERRUPTED: 'Ownership unknown', COMPLETED: 'Diagnostic ended',
    result: 'View diagnostic results', partial: 'View run / partial evidence', noResult: 'No accessible Job evidence yet. Historical results will not be substituted.', cancel: 'Stop this diagnostic', inspect: 'Inspect run and resources', inspectHint: 'Read-only: no container deletion or retry. Unlock is possible only after the run is stopped and resources are clean.',
    release: 'Confirm release of this diagnostic lock', releaseReview: 'I reviewed this inspection. Unlock only; do not retry or delete results.', released: 'Diagnostic lock released. Original results retained; no automatic retry.', blocked: 'Cannot safely unlock yet. Resolve these checks and inspect again.', checking: 'Inspecting…', saving: 'Confirming…',
    progress: 'Finished tasks', requests: 'Model requests', lastUpdate: 'Latest progress', unknownProgress: 'No verified progress yet; no completion percentage is inferred.', budgetBoundary: 'Request counts are not token or currency costs; external business / verifier APIs are outside this quota.',
    detail: 'Task and audit identity', failedSummary: 'Execution errors; not a quality pass', noScore: 'No valid score; not a quality pass', loadMore: 'Show more tasks', process: 'Process', resources: 'Resources', stopped: 'Stopped', running: 'Still running', unknown: 'Unknown', clean: 'Clean', remaining: 'Resources remain',
  },
}
for (const locale of ['zh', 'en']) Object.assign(OPERATION_TRAY_MESSAGES[locale], Object.fromEntries(Object.entries(PHASES[locale]).map(([key, value]) => [`phase_${key}`, value])))

export function OperationTray({ sessionId, scopeKey, request, update, onViewResult, t }) {
  const label = key => t?.(key) ?? OPERATION_TRAY_MESSAGES.zh[key] ?? key
  const ownerKey = `${sessionId}\n${scopeKey ?? ''}`
  const [stored, setStored] = useState({ ownerKey, items: [], loading: true })
  const state = stored.ownerKey === ownerKey ? stored : { ownerKey, items: [], loading: true }
  const [expanded, setExpanded] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [limit, setLimit] = useState(20)
  const live = useRef({ ownerKey, state })
  live.current = { ownerKey, state }
  useEffect(() => {
    setStored(current => current.ownerKey === ownerKey ? { ...current, loading: !current.items.length } : { ownerKey, items: [], loading: true })
    return pollOperationList({ request, sessionId, limit, getCurrent: () => live.current.state.items,
      onList: value => { if (live.current.ownerKey === ownerKey) setStored({ ...value, ownerKey, loading: false }) },
      onError: error => { if (live.current.ownerKey === ownerKey) setStored(current => ({ ...current, ownerKey, loading: false, error })) },
    })
  }, [sessionId, scopeKey, request, attempt, limit])
  const active = state.items.filter(actionOperationActive).length
  const attention = state.items.filter(operationNeedsRecovery).length
  return <section className="hse-operation-tray" aria-label={label('tasks')}>
    <button type="button" className="hse-operation-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
      {label('tasks')} · <span role="status">{state.loading ? label('loading') : `${active} ${label('active')} · ${attention} ${label('attention')} · ${state.items.length} ${label('records')}`}</span>{expanded ? ' −' : ' +'}
    </button>
    {state.error ? <p role="alert">{label('stale')}<button type="button" onClick={() => setAttempt(value => value + 1)}>{label('refresh')}</button></p> : null}
    {expanded ? <div className="hse-operation-list"><p>{label('taskHint')}</p>{!state.loading && !state.items.length && !state.error ? <p>{label('empty')}</p> : null}
      {state.items.map(operation => <OperationItem key={`${ownerKey}:${operation.operationId}`} {...{ operation, request, update, onViewResult, label }} stale={Boolean(state.error)} onChanged={() => setAttempt(value => value + 1)}/>)}
      {state.nextCursor && limit < 100 ? <button type="button" onClick={() => setLimit(value => Math.min(100, value + 20))}>{label('loadMore')}</button> : state.truncated || state.nextCursor ? <p>{label('more')}</p> : null}
    </div> : null}
  </section>
}

export function OperationItem({ operation, request, update, onViewResult, onChanged, label, stale }) {
  const [inspection, setInspection] = useState()
  const [reviewed, setReviewed] = useState(false)
  const [pending, setPending] = useState('')
  const [error, setError] = useState()
  const lock = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const run = async (kind, action) => {
    if (lock.current || stale) return
    lock.current = true; setPending(kind); setError(undefined)
    try { await action() } catch (cause) { if (mounted.current) { setError(cause); setInspection(undefined); setReviewed(false) } }
    finally { lock.current = false; if (mounted.current) setPending('') }
  }
  const inspect = () => run('inspect', async () => {
    const value = await request('action-inspect', { operationId: operation.operationId })
    if (value?.operationId !== operation.operationId) throw new Error('Inspection identity mismatch')
    if (mounted.current) { setInspection(value); setReviewed(false) }
  })
  const release = () => {
    if (!reviewed || inspection?.canRecover !== true || !inspection.inspectionId || !inspection.contentHash) return
    return run('release', async () => {
      await update('action-recover', { operationId: operation.operationId, inspectionId: inspection.inspectionId, contentHash: inspection.contentHash, confirmed: true })
      if (mounted.current) { setReviewed(false); setInspection(undefined); onChanged?.() }
    })
  }
  const result = operationResultTarget(operation)
  const active = actionOperationActive(operation)
  const needsRecovery = operationNeedsRecovery(operation)
  const summary = actionDraftDiagnosticSummary(operation)
  const progress = operation.progress
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : '—'
  return <article className="hse-operation-item" data-operation-id={operation.operationId} data-operation-status={operation.status}>
    <header><strong>{operation.target?.job ?? operation.operationId}</strong><span role="status">{label(operation.status)}</span></header>
    {summary?.counts?.exceptions > 0 ? <p role="alert">{label('failedSummary')}</p> : summary?.counts?.validScores === 0 ? <p role="alert">{label('noScore')}</p> : null}
    {active ? progress ? <div className="hse-operation-progress"><p>{label('progress')}: {count(progress.completed)} / {count(progress.total)}</p>{Object.entries(progress.counts ?? {}).filter(([phase, value]) => Object.hasOwn(PHASES.en, phase) && Number.isSafeInteger(value) && value > 0).map(([phase, value]) => <p key={phase}>{label(`phase_${phase}`)}: {value}</p>)}<p>{label('requests')}: {count(progress.modelRequests)} / {count(progress.maxModelRequests ?? operation.limits?.maxModelRequests)}</p>{progress.updatedAt ? <p>{label('lastUpdate')}: {progress.updatedAt}</p> : null}<small>{label('budgetBoundary')}</small></div> : <p>{label('unknownProgress')}</p> : null}
    {actionOperationFailure(operation) ? <p>{actionOperationFailure(operation)}</p> : null}
    {operation.recovery?.released ? <p role="status">{label('released')}</p> : null}
    <div className="hse-local-actions">
      {result && onViewResult ? <button type="button" onClick={() => onViewResult(operation, result)}>{label(result.partial ? 'partial' : 'result')}</button> : <small>{label('noResult')}</small>}
      {active ? <button type="button" disabled={stale || Boolean(pending) || operation.status === 'CANCELLING'} onClick={() => void run('cancel', async () => { await update('action-cancel', { operationId: operation.operationId }); if (mounted.current) onChanged?.() })}>{label(operation.status === 'CANCELLING' || pending === 'cancel' ? 'CANCELLING' : 'cancel')}</button> : null}
      {needsRecovery ? <button type="button" disabled={stale || Boolean(pending)} onClick={() => void inspect()}>{label(pending === 'inspect' ? 'checking' : 'inspect')}</button> : null}
    </div>
    {needsRecovery ? <p>{label('inspectHint')}</p> : null}
    {inspection ? <section className="hse-operation-inspection"><p>{label(inspection.canRecover ? 'releaseReview' : 'blocked')}</p><p>{label('process')}: {label(inspection.process?.state ?? 'unknown')} · {label('resources')}: {label(inspection.resources?.state ?? 'unknown')}</p>{inspection.process?.pid ? <code>PID {inspection.process.pid} · PGID {inspection.process.groupId ?? '—'}</code> : null}{(inspection.resources?.items ?? []).map(resource => <p key={`${resource.kind}:${resource.id}`}><code>{resource.kind} · {resource.id}<br/>Compose: {resource.project}</code></p>)}{(inspection.blockers ?? []).map((check, index) => <p key={index}>{check.message ?? check.code}</p>)}{inspection.canRecover ? <><label><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)}/>{label('releaseReview')}</label><button type="button" disabled={stale || !reviewed || Boolean(pending)} onClick={() => void release()}>{label(pending === 'release' ? 'saving' : 'release')}</button></> : null}</section> : null}
    {error ? <p role="alert">{String(error?.message ?? error)}</p> : null}
    <details><summary>{label('detail')}</summary><code>{operation.operationId}</code><p>{operation.createdAt}</p></details>
  </article>
}
