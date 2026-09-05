export function actionDraftErrorCode(error) {
  return typeof error?.code === 'string'
    ? error.code
    : String(error?.message ?? error ?? '').match(/\b(HARBOR_[A-Z0-9_]+)\b/)?.[1] ?? ''
}

export function actionDraftExpiry(draft, state = {}) {
  // A reviewed preview has its own authorization lifetime. A completed journal
  // is a historical receipt, not an expiring capability that may be replayed.
  if (state.operation) return undefined
  const expiry = Date.parse(state.preview?.expiresAt ?? draft?.expiresAt)
  return Number.isFinite(expiry) ? expiry : undefined
}

export function actionDraftAuthorizationExpired(draft, state = {}, now = Date.now()) {
  if (state.operation) return false
  if (/ACTION_EXPIRED|CONTEXT_EXPIRED|SELECTION_EXPIRED/.test(actionDraftErrorCode(state.error))) return true
  const expiry = actionDraftExpiry(draft, state)
  return expiry !== undefined && expiry <= now
}

export function actionDraftNeedsReprepare(draft, state = {}, now = Date.now()) {
  if (state.operation) return false
  return actionDraftAuthorizationExpired(draft, state, now)
    || /REVISION_CONFLICT|STALE_SELECTION|BINDING_STALE/.test(actionDraftErrorCode(state.error))
    || state.preview?.blocking?.some(item => /REVISION_CONFLICT|STALE_SELECTION/.test(item.code)) === true
}

export function actionDraftCanConfirm(draft, state, reviewed, now = Date.now()) {
  const preview = state?.preview
  return reviewed === true && state?.status === 'READY_FOR_REVIEW'
    && !state.operation && !state.error && !actionDraftAuthorizationExpired(draft, state, now)
    && preview?.status === 'READY_FOR_REVIEW'
    && Array.isArray(preview.blocking) && preview.blocking.length === 0
    && ['previewId', 'contentHash', 'baseRevision'].every(key => typeof preview[key] === 'string' && preview[key].length > 0)
    && (preview.execution !== 'bounded-diagnostic' && !['diagnostic-evaluation', 'retry-infrastructure'].includes(draft?.kind) || Boolean(actionDraftDiagnosticPreview(preview)))
}

const ACTIVE_OPERATION_STATES = new Set(['SCHEDULED', 'EXECUTING', 'ACTIVE', 'CANCELLING'])
const TERMINAL_OPERATION_STATES = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'INTERRUPTED'])

export function actionOperationActive(operation) {
  return operation?.recoveryRequired !== true && ACTIVE_OPERATION_STATES.has(operation?.status)
}

export function actionDraftDiagnosticPreview(preview) {
  if (preview?.execution !== 'bounded-diagnostic' || preview?.diagnosticOnly !== true) return undefined
  const { limits, trialCount } = preview
  if (!limits || !Number.isSafeInteger(trialCount) || trialCount < 1) return undefined
  if (!['maxTrials', 'concurrency', 'wallTimeoutMs', 'maxResponseBytes'].every(key => Number.isSafeInteger(limits[key]) && limits[key] > 0)) return undefined
  if (!Number.isSafeInteger(limits.maxModelRequests) || limits.maxModelRequests < 0 || trialCount > limits.maxTrials || limits.concurrency > limits.maxTrials) return undefined
  return { trialCount, limits: { maxTrials: limits.maxTrials, concurrency: limits.concurrency, wallTimeoutMs: limits.wallTimeoutMs, maxModelRequests: limits.maxModelRequests, maxResponseBytes: limits.maxResponseBytes } }
}

export function actionOperationSequence(operation) {
  if (!Array.isArray(operation?.events) || !operation.events.length) return undefined
  let sequence = 0
  for (const event of operation.events) {
    if (!Number.isSafeInteger(event?.sequence) || event.sequence <= sequence) return undefined
    sequence = event.sequence
  }
  return sequence
}

export function acceptActionOperation(draft, current, incoming) {
  const invalid = message => { throw Object.assign(new Error(message), { code: 'HARBOR_ACTION_OPERATION_MISMATCH' }) }
  if (!incoming || (!ACTIVE_OPERATION_STATES.has(incoming.status) && !TERMINAL_OPERATION_STATES.has(incoming.status))) invalid('The operation returned an unknown state. Recover its status before continuing.')
  if (draft?.operationId && incoming.operationId !== draft.operationId) invalid('The operation does not belong to this suggestion.')
  if (incoming.draftId && draft?.draftId && incoming.draftId !== draft.draftId) invalid('The operation belongs to another suggestion.')
  const nextSequence = actionOperationSequence(incoming)
  if (draft?.operationId && nextSequence === undefined) invalid('The operation returned an invalid event sequence.')
  if (!current) return incoming
  if (current.operationId && incoming.operationId !== current.operationId) invalid('The operation identity changed while tracking it.')
  const previousSequence = actionOperationSequence(current)
  // A late read must not regress an acknowledged cancellation or completion.
  if (previousSequence !== undefined && nextSequence !== undefined && nextSequence <= previousSequence) return current
  if (TERMINAL_OPERATION_STATES.has(current.status) || current.recoveryRequired === true) return current
  return incoming
}

export function actionDraftDiagnosticResult(operation) {
  const result = operation?.events?.at(-1)?.result
  if (operation?.status !== 'COMPLETED' || result?.diagnosticOnly !== true || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(result?.jobName ?? '')) return undefined
  return result
}

export function actionDraftDiagnosticSummary(operation) {
  const result = operation?.events?.at(-1)?.result
  if (operation?.status !== 'COMPLETED' || result?.diagnosticOnly !== true) return undefined
  const source = result.summary
  const count = key => Number.isSafeInteger(source?.[key]) && source[key] >= 0 ? source[key] : undefined
  const counts = {
    trials: count('n_trials'), validScores: count('n_valid_scores'), invalidScores: count('n_invalid_scores'),
    exceptions: count('n_exceptions'), unscored: count('n_unscored_trials'), discovered: count('n_discovered_trials'),
  }
  const artifactValid = typeof source?.artifact_validation?.valid === 'boolean' ? source.artifact_validation.valid : undefined
  // Process completion is not an assertion about Candidate quality. In
  // particular, an absent count is unknown rather than an invented zero.
  const inconsistent = counts.trials !== undefined && [counts.validScores, counts.invalidScores, counts.unscored].some(value => value !== undefined && value > counts.trials)
  const status = counts.exceptions > 0 ? 'exceptions'
    : counts.validScores === 0 ? 'no-valid-scores'
      : artifactValid === false || inconsistent ? 'unverified'
        : counts.invalidScores > 0 || counts.unscored > 0 || counts.validScores < counts.trials ? 'partial'
          : [counts.trials, counts.validScores, counts.exceptions].some(value => value === undefined) || artifactValid !== true ? 'unverified' : 'finished'
  return { counts, artifactValid, status, warning: status !== 'finished' }
}

export function actionOperationFailure(operation) {
  const result = operation?.events?.at(-1)?.result
  const message = result?.message ?? result?.error?.message ?? operation?.error?.message
  const code = result?.code ?? result?.error?.code ?? operation?.error?.code
  return [code, message].filter(value => typeof value === 'string').join(' · ').slice(0, 2000)
}

// One sequential, abortable reader survives a collapsed card. Its disposer is
// also a generation boundary: a late response cannot enter a remounted card.
// Missing-before-confirm is not a failure; missing-after-acceptance is unknown,
// never permission to submit the same action again.
export function pollActionOperation({ draft, request, initialOperation, getCurrent, onOperation, onError, onAbsent, intervalMs = 1500, schedule = setTimeout, unschedule = clearTimeout }) {
  if (!draft?.operationId) return () => {}
  let alive = true
  let current = initialOperation
  let timer
  let controller
  const poll = async () => {
    if (!alive) return
    controller = new AbortController()
    try {
      const incoming = await request('action-operation', { operationId: draft.operationId }, { signal: controller.signal })
      if (!alive) return
      current = acceptActionOperation(draft, getCurrent?.() ?? current, incoming)
      onOperation(current)
      if (actionOperationActive(current)) timer = schedule(poll, Math.min(2000, Math.max(100, intervalMs)))
    } catch (error) {
      if (!alive) return
      current = getCurrent?.() ?? current
      const absent = /ACTION_DENIED|ENOENT|NOT_FOUND/.test(actionDraftErrorCode(error) || error?.code || String(error?.message))
      if (!current && absent) onAbsent?.()
      else {
        onError?.(error)
        if (actionOperationActive(current)) timer = schedule(poll, Math.min(2000, Math.max(100, intervalMs)))
      }
    }
  }
  void poll()
  return () => { alive = false; controller?.abort(); if (timer !== undefined) unschedule(timer) }
}

export function actionDraftComparison(result) {
  if (result?.schema !== 'harbor-readonly-comparison/v1' || !result.data || typeof result.data !== 'object') return undefined
  const data = result.data
  const count = key => Array.isArray(data[key]) ? data[key].length : undefined
  return {
    comparable: typeof data.comparable === 'boolean' ? data.comparable : undefined,
    baseline: typeof data.baselineJob === 'string' ? data.baselineJob : undefined,
    candidate: typeof data.candidateJob === 'string' ? data.candidateJob : undefined,
    metrics: Object.entries(data.metrics ?? {}).slice(0, 6).map(([name, value]) => ({
      name,
      baseline: Number.isFinite(value?.baseline) ? value.baseline : undefined,
      candidate: Number.isFinite(value?.candidate) ? value.candidate : undefined,
      delta: Number.isFinite(value?.delta) ? value.delta : undefined,
      direction: value?.direction === 'minimize' ? 'minimize' : 'maximize',
    })),
    improved: count('improvedTrials'), regressed: count('regressedTrials'), invalid: count('invalidTrials'),
    reasons: (Array.isArray(data.comparabilityReasons) ? data.comparabilityReasons : [])
      .slice(0, 8).map(item => typeof item === 'string' ? item : item?.message).filter(item => typeof item === 'string'),
  }
}
