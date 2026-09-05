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
