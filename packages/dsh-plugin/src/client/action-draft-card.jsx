import React, { useEffect, useState } from 'react'
import {
  actionDraftAuthorizationExpired, actionDraftCanConfirm, actionDraftComparison,
  actionDraftErrorCode, actionDraftExpiry, actionDraftNeedsReprepare,
} from './action-draft-state.js'

export const ACTION_CARD_MESSAGES = {
  zh: {
    actionSuggestion: 'AI 建议', actionReviewSource: '审阅并修改',
    actionSourceBoundary: '只在编辑器中打开修改建议，不会改动文件。审阅后保存才会创建新版本。',
    actionSourceBaseline: '修改评测规则后，需要使用新规则建立新的基线，旧结果不会被覆盖。',
    actionKind_candidate: 'Candidate 修改建议', actionKind_evaluator: '评测规则修改建议',
    actionKind_compare: '结果对比', actionKind_diagnostic: '诊断评测建议', actionKind_retry: '基础设施重试建议',
    actionKind_gate: 'Gate 申请建议', actionKind_handoff: '部署交接建议',
    actionStateDraft: '等待你审阅', actionStateChecking: '正在检查', actionStateReady: '可以确认',
    actionStateBlocked: '暂时不能执行', actionStateExecuting: '处理中', actionStateFailed: '未完成',
    actionStateExpired: '需要刷新依据', actionStateSaved: '建议已保存，尚未应用', actionStateCompared: '对比完成',
    actionExpiredHint: '原授权已过期或服务已重启，建议文字仍保留。重新准备会把问题放入输入框，由你确认发送，不会自动执行。',
    actionStaleHint: '建议依据已经变化。请按最新对象重新准备问题，旧建议和你的编辑内容不会被清除。',
    actionReprepare: '按最新对象重新准备', actionPrepared: '问题已放入输入框；请检查后发送。',
    actionContinueSuggestion: '继续完善建议', actionSaveSuggestion: '确认保存建议', actionConfirmComparison: '确认只读对比',
    actionOnlyDraft: '确认仅保存建议记录，不会修改资源、启动评测、通过 Gate 或部署。',
    actionReadOnly: '只读取这两个批次的已有结果，不会启动评测、通过 Gate 或部署。',
    actionUnavailableRunner: '当前尚未接通安全的诊断执行器；此处只能保留建议，不能启动任务。',
    actionCandidateNext: '下一步：先审阅 Candidate 修改方案。此卡片不会把方案写入 Candidate，也不会启动验证。',
    actionGateNext: '下一步：核对对比证据，再通过独立的 Gate 审批流程处理；此卡片没有通过 Gate。',
    actionHandoffNext: '下一步：将审阅后的交接方案用于独立部署流程；此卡片没有触发部署。',
    actionCollapse: '收起建议', actionCollapsed: '建议已收起；未改变执行状态', actionExpand: '展开建议',
    actionDetails: '目标与安全信息', actionTarget: '目标批次', actionSource: '源文件', actionScope: '选中范围',
    actionIdentity: '资源版本', actionRisk: '风险与修改范围', actionRevision: '依据版本', actionContext: '引用快照',
    actionBefore: '原内容', actionAfter: '建议内容', actionDiff: '查看建议差异', actionAudit: '查看操作记录',
    actionCheck: '检查并预览', actionReviewConfirmation: '我已检查这份预览的目标、版本、范围和影响。',
    actionPreview: '本次预览', actionNoExternalRequests: '不会产生外部模型或评测请求。',
    actionPreviewDetails: '查看预览校验信息', actionExpires: '授权有效至',
    actionReadReceipt: '正在恢复操作状态…', actionReceiptRetry: '重新读取操作状态',
    actionReceiptFailure: '暂时无法读取已有操作状态；确认前请先恢复状态，避免误以为从未执行。',
    actionFailedReceipt: '已有一次操作未完成。请先检查操作记录；系统不会自动重试或重复提交。',
    actionViewComparison: '查看完整对比', actionComparable: '具备可比性', actionNotComparable: '当前结果不可直接比较',
    actionComparabilityUnknown: '可比性信息缺失，请查看完整证据', actionMetric: '指标', actionBaseline: '基线',
    actionCandidate: '候选', actionDelta: '变化', actionImproved: '改善', actionRegressed: '回归', actionInvalid: '无效分',
    actionMinimize: '越低越好', actionMaximize: '越高越好', actionBusy: '正在打开…',
  },
  en: {
    actionSuggestion: 'AI suggestion', actionReviewSource: 'Review and edit',
    actionSourceBoundary: 'Opens the suggestion in the editor without changing files. Only your reviewed save creates a new version.',
    actionSourceBaseline: 'Changing evaluation rules requires a fresh baseline. Historical results remain unchanged.',
    actionKind_candidate: 'Candidate change suggestion', actionKind_evaluator: 'Evaluation rule suggestion',
    actionKind_compare: 'Result comparison', actionKind_diagnostic: 'Diagnostic evaluation suggestion', actionKind_retry: 'Infrastructure retry suggestion',
    actionKind_gate: 'Gate request suggestion', actionKind_handoff: 'Deployment handoff suggestion',
    actionStateDraft: 'Ready for your review', actionStateChecking: 'Checking', actionStateReady: 'Ready to confirm',
    actionStateBlocked: 'Cannot execute yet', actionStateExecuting: 'Processing', actionStateFailed: 'Not completed',
    actionStateExpired: 'Refresh the evidence', actionStateSaved: 'Suggestion saved, not applied', actionStateCompared: 'Comparison complete',
    actionExpiredHint: 'The authorization expired or the service restarted. Your suggestion remains available. Prepare a new question, then review and send it yourself; nothing runs automatically.',
    actionStaleHint: 'The underlying evidence changed. Prepare a question against the latest object. The old suggestion and your edits will remain available.',
    actionReprepare: 'Prepare with the latest object', actionPrepared: 'The question is in the input. Review it before sending.',
    actionContinueSuggestion: 'Refine this suggestion', actionSaveSuggestion: 'Confirm and save suggestion', actionConfirmComparison: 'Confirm read-only comparison',
    actionOnlyDraft: 'Confirmation saves a suggestion record only. It does not modify resources, start evaluation, approve Gate, or deploy.',
    actionReadOnly: 'Reads existing results for these two jobs only. It does not run evaluation, approve Gate, or deploy.',
    actionUnavailableRunner: 'A safe bounded diagnostic runner is not connected. This suggestion cannot start a job.',
    actionCandidateNext: 'Next: review the Candidate change plan. This card does not write Candidate source or start validation.',
    actionGateNext: 'Next: inspect comparison evidence and use the separate Gate approval workflow. This card did not approve Gate.',
    actionHandoffNext: 'Next: use the reviewed handoff plan in the separate deployment workflow. This card did not deploy anything.',
    actionCollapse: 'Collapse suggestion', actionCollapsed: 'Suggestion collapsed; execution state is unchanged', actionExpand: 'Expand suggestion',
    actionDetails: 'Target and safety details', actionTarget: 'Target job', actionSource: 'Source file', actionScope: 'Selection',
    actionIdentity: 'Resource versions', actionRisk: 'Risk and mutation surface', actionRevision: 'Evidence revision', actionContext: 'Reference snapshot',
    actionBefore: 'Original', actionAfter: 'Suggested', actionDiff: 'View suggested changes', actionAudit: 'View operation record',
    actionCheck: 'Check and preview', actionReviewConfirmation: 'I reviewed the exact target, revision, scope, and impact of this preview.',
    actionPreview: 'This preview', actionNoExternalRequests: 'No external model or evaluation requests.',
    actionPreviewDetails: 'Preview verification details', actionExpires: 'Authorization expires',
    actionReadReceipt: 'Recovering operation state…', actionReceiptRetry: 'Read operation state again',
    actionReceiptFailure: 'The previous operation state is unavailable. Recover it before confirming so an existing operation is not mistaken for an unexecuted draft.',
    actionFailedReceipt: 'An existing operation did not complete. Inspect its record first; nothing is retried or resubmitted automatically.',
    actionViewComparison: 'View full comparison', actionComparable: 'Results are comparable', actionNotComparable: 'Results are not directly comparable',
    actionComparabilityUnknown: 'Comparability is unavailable; inspect the full evidence', actionMetric: 'Metric', actionBaseline: 'Baseline',
    actionCandidate: 'Candidate', actionDelta: 'Change', actionImproved: 'Improved', actionRegressed: 'Regressed', actionInvalid: 'Invalid scores',
    actionMinimize: 'Lower is better', actionMaximize: 'Higher is better', actionBusy: 'Opening…',
  },
}

const kindKeys = {
  'candidate-draft': 'actionKind_candidate', 'evaluator-draft': 'actionKind_evaluator', compare: 'actionKind_compare',
  'diagnostic-evaluation': 'actionKind_diagnostic', 'retry-infrastructure': 'actionKind_retry',
  'gate-request': 'actionKind_gate', 'deployment-handoff': 'actionKind_handoff',
}
const format = value => Number.isFinite(value) ? Number(value.toFixed(4)).toLocaleString() : '—'
const pretty = value => JSON.stringify(value, null, 2)

export function ActionDraftCardView({ draft, onSourceDraft, onReprepare, onViewComparison, request, update, ErrorState, t }) {
  const label = key => { const value = t?.(key); return value && value !== key ? value : ACTION_CARD_MESSAGES.zh[key] ?? key }
  const [state, setState] = useState({ status: 'DRAFT' })
  const [reviewed, setReviewed] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [receipt, setReceipt] = useState({ loading: Boolean(draft.operationId) })
  const [receiptAttempt, setReceiptAttempt] = useState(0)
  const [clock, setClock] = useState(Date.now)
  const [opening, setOpening] = useState(false)
  const [prepared, setPrepared] = useState(false)
  const [interactionError, setInteractionError] = useState()
  const sourceDraft = draft.kind === 'evaluator-draft'

  useEffect(() => {
    if (!draft.operationId) return undefined
    let alive = true
    setReceipt({ loading: true })
    // Reconnection reads an existing receipt; it never repeats confirmation.
    void request('action-operation', { operationId: draft.operationId }).then(operation => {
      if (!alive) return
      setState({ status: operation.status, operation })
      setReceipt({ loading: false })
    }).catch(error => {
      if (!alive) return
      const absent = /ACTION_DENIED|ENOENT|NOT_FOUND/.test(actionDraftErrorCode(error) || error?.code || String(error?.message))
      setReceipt({ loading: false, ...(absent ? {} : { error }) })
    })
    return () => { alive = false }
  }, [draft.operationId, receiptAttempt, request])

  const expiresAt = actionDraftExpiry(draft, state)
  useEffect(() => {
    setClock(Date.now())
    if (expiresAt === undefined || expiresAt <= Date.now()) return undefined
    const timer = setTimeout(() => { setClock(Date.now()); setReviewed(false) }, Math.min(expiresAt - Date.now() + 1, 2_147_483_647))
    return () => clearTimeout(timer)
  }, [expiresAt])

  const expired = actionDraftAuthorizationExpired(draft, state, clock)
  const needsReprepare = actionDraftNeedsReprepare(draft, state, clock)
  const preview = state.preview
  const result = state.operation?.events?.at(-1)?.result
  const comparison = actionDraftComparison(result)
  const busy = state.status === 'VALIDATING' || state.status === 'EXECUTING'
  const canConfirm = !receipt.loading && !receipt.error && actionDraftCanConfirm(draft, state, reviewed, clock)
  const statusKey = comparison ? 'actionStateCompared'
    : state.status === 'COMPLETED' ? 'actionStateSaved'
      : needsReprepare ? 'actionStateExpired'
        : ({ VALIDATING: 'actionStateChecking', READY_FOR_REVIEW: 'actionStateReady', BLOCKED: 'actionStateBlocked', EXECUTING: 'actionStateExecuting', FAILED: 'actionStateFailed' })[state.status] ?? 'actionStateDraft'

  const check = async () => {
    if (busy || receipt.loading || receipt.error || sourceDraft || needsReprepare || state.operation) return
    setReviewed(false)
    setState({ status: 'VALIDATING' })
    try {
      const next = await update('action-preview', { draftId: draft.draftId })
      setClock(Date.now())
      setState({ status: next.status, preview: next })
    } catch (error) { setState({ status: 'FAILED', error }) }
  }
  const confirm = async () => {
    // Recheck time at the click boundary, not just at the last React render.
    if (sourceDraft || receipt.loading || receipt.error || !actionDraftCanConfirm(draft, state, reviewed)) return
    setState(current => ({ ...current, status: 'EXECUTING' }))
    try {
      const operation = await update('action-confirm', { previewId: preview.previewId, contentHash: preview.contentHash, expectedRevision: preview.baseRevision, confirmed: true })
      setState({ status: operation.status, preview, operation })
    } catch (error) { setState({ status: 'FAILED', preview, error }) }
  }
  const open = async (callback, isReprepare = false) => {
    if (!callback || opening) return
    setOpening(true)
    setPrepared(false)
    setInteractionError(undefined)
    try { const opened = await callback(draft, result); if (isReprepare && opened !== false) setPrepared(true) }
    catch (error) { setInteractionError(error) }
    finally { setOpening(false) }
  }
  const renderError = error => ErrorState
    ? <ErrorState error={error} t={t}/>
    : <p role="alert">{String(error?.message ?? error)}</p>

  if (collapsed) return <div className="hse-action-draft hse-action-collapsed"><span>{label('actionCollapsed')}</span><button type="button" onClick={() => setCollapsed(false)}>{label('actionExpand')}</button></div>

  return <section className="hse-action-draft" data-action-kind={draft.kind} data-action-status={needsReprepare ? 'EXPIRED' : state.status}>
    <header><strong>{label(kindKeys[draft.kind] ?? 'actionSuggestion')}</strong><span role="status">{label(statusKey)}</span></header>
    <p>{draft.proposal?.summary}</p>
    {sourceDraft ? <p className="hse-muted">{label('actionSourceBoundary')}</p>
      : <p className="hse-muted">{label(draft.kind === 'compare' ? 'actionReadOnly' : draft.execution === 'requires-registered-runner' ? 'actionUnavailableRunner' : 'actionOnlyDraft')}</p>}

    {sourceDraft && onSourceDraft ? <button className="hse-primary" type="button" disabled={opening} onClick={() => void open(onSourceDraft)}>{label(opening ? 'actionBusy' : 'actionReviewSource')}</button> : null}
    {sourceDraft && draft.freshBaselineRequired ? <p className="hse-muted">{label('actionSourceBaseline')}</p> : null}

    {needsReprepare ? <div className="hse-action-recovery" role="status">
      <p>{label(expired ? 'actionExpiredHint' : 'actionStaleHint')}</p>
      {onReprepare ? <button type="button" disabled={opening} onClick={() => void open(onReprepare, true)}>{label('actionReprepare')}</button> : null}
    </div> : null}
    {prepared ? <p role="status">{label('actionPrepared')}</p> : null}
    {interactionError ? renderError(interactionError) : null}

    {comparison ? <div className="hse-action-comparison">
      <b>{label(comparison.comparable === true ? 'actionComparable' : comparison.comparable === false ? 'actionNotComparable' : 'actionComparabilityUnknown')}</b>
      <p>{label('actionBaseline')}: {comparison.baseline ?? '—'}<br/>{label('actionCandidate')}: {comparison.candidate ?? '—'}</p>
      {comparison.reasons.map((reason, index) => <p className="hse-muted" key={index}>{reason}</p>)}
      {comparison.metrics.length ? <table><thead><tr><th>{label('actionMetric')}</th><th>{label('actionBaseline')}</th><th>{label('actionCandidate')}</th><th>{label('actionDelta')}</th></tr></thead><tbody>{comparison.metrics.map(metric => <tr key={metric.name}><th>{metric.name}<small> · {label(metric.direction === 'minimize' ? 'actionMinimize' : 'actionMaximize')}</small></th><td>{format(metric.baseline)}</td><td>{format(metric.candidate)}</td><td>{Number.isFinite(metric.delta) && metric.delta > 0 ? '+' : ''}{format(metric.delta)}</td></tr>)}</tbody></table> : null}
      <p>{label('actionImproved')}: {comparison.improved ?? '—'} · {label('actionRegressed')}: {comparison.regressed ?? '—'} · {label('actionInvalid')}: {comparison.invalid ?? '—'}</p>
      {onViewComparison ? <button type="button" disabled={opening} onClick={() => void open(onViewComparison)}>{label('actionViewComparison')}</button> : null}
    </div> : null}

    {state.status === 'COMPLETED' && !comparison && !sourceDraft ? <div className="hse-action-next-step">
      <p>{label(({ 'candidate-draft': 'actionCandidateNext', 'gate-request': 'actionGateNext', 'deployment-handoff': 'actionHandoffNext' })[draft.kind] ?? 'actionOnlyDraft')}</p>
      {onReprepare ? <button type="button" disabled={opening} onClick={() => void open(onReprepare, true)}>{label('actionContinueSuggestion')}</button> : null}
    </div> : null}

    {preview && !sourceDraft ? <div className="hse-action-preview">
      <b>{label('actionPreview')} · {label(preview.status === 'READY_FOR_REVIEW' ? 'actionStateReady' : 'actionStateBlocked')}</b>
      {preview.estimatedExternalRequests === 0 ? <p>{label('actionNoExternalRequests')}</p> : null}
      {(preview.blocking ?? []).map(item => <p key={item.code}>{item.message}</p>)}
      <details><summary>{label('actionPreviewDetails')}</summary><code>{preview.contentHash}</code><p>{preview.baseRevision}</p><small>{label('actionExpires')}: {preview.expiresAt}</small></details>
    </div> : null}
    {receipt.loading && !sourceDraft ? <p role="status">{label('actionReadReceipt')}</p> : null}
    {receipt.error ? <div role="alert"><p>{label('actionReceiptFailure')}</p><button type="button" onClick={() => setReceiptAttempt(value => value + 1)}>{label('actionReceiptRetry')}</button></div> : null}
    {state.error && !needsReprepare ? renderError(state.error) : null}
    {state.operation?.status === 'FAILED' ? <p role="alert">{label('actionFailedReceipt')}</p> : null}

    {!sourceDraft && !needsReprepare && !state.operation && state.status === 'READY_FOR_REVIEW' ? <label><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)}/>{label('actionReviewConfirmation')}</label> : null}
    <div className="hse-local-actions">
      {!sourceDraft && !needsReprepare && !state.operation && state.status !== 'READY_FOR_REVIEW' && state.status !== 'EXECUTING' ? <button type="button" disabled={busy || receipt.loading || Boolean(receipt.error)} onClick={() => void check()}>{label('actionCheck')}</button> : null}
      {!sourceDraft && !needsReprepare && !state.operation && state.status === 'READY_FOR_REVIEW' ? <button type="button" disabled={!canConfirm} onClick={() => void confirm()}>{label(draft.kind === 'compare' ? 'actionConfirmComparison' : 'actionSaveSuggestion')}</button> : null}
      <button type="button" disabled={busy || opening} onClick={() => setCollapsed(true)}>{label('actionCollapse')}</button>
    </div>

    {draft.proposal?.before !== undefined ? <details><summary>{label('actionDiff')}</summary><div className="hse-diff-grid"><div><b>{label('actionBefore')}</b><pre>{draft.proposal.before}</pre></div><div><b>{label('actionAfter')}</b><pre>{draft.proposal.replacement}</pre></div></div></details> : null}
    <details className="hse-action-identities"><summary>{label('actionDetails')}</summary>
      {draft.proposal?.rationale ? <p>{draft.proposal.rationale}</p> : null}
      <dl><dt>{label('actionTarget')}</dt><dd>{draft.target?.job ?? draft.target?.candidate ?? '—'}</dd>
        {draft.proposal?.sourceRef ? <><dt>{label('actionSource')}</dt><dd>{draft.proposal.sourceRef.relativePath ?? draft.proposal.sourceRef.path ?? draft.proposal.sourceRef.sourceRole ?? '—'} · L{draft.proposal.sourceRef.startLine ?? '—'}–{draft.proposal.sourceRef.endLine ?? '—'}</dd></> : null}
        <dt>{label('actionScope')}</dt><dd>{draft.selection?.find(ref => ref.selectionCount)?.selectionCount ?? (draft.target?.trial ? 1 : '—')}</dd>
        <dt>{label('actionRisk')}</dt><dd>{draft.risk} · {draft.mutationSurface}</dd>
        <dt>{label('actionRevision')}</dt><dd><code>{draft.baseRevision}</code></dd>
        <dt>{label('actionContext')}</dt><dd><code>{draft.contextSnapshotId}</code></dd></dl>
      {draft.identities ? <div><b>{label('actionIdentity')}</b>{Object.entries(draft.identities).map(([role, value]) => <p key={role}>{role}: {value?.id ?? '—'} {value?.version ? `@ ${value.version}` : ''}<br/><code>{value?.digest ?? '—'}</code></p>)}</div> : null}
    </details>
    {state.operation ? <details><summary>{label('actionAudit')}</summary><pre>{pretty(state.operation)}</pre></details> : null}
  </section>
}
