import { acceptActionOperation, actionOperationActive } from './action-draft-state.js'

const DIAGNOSTIC_KINDS = new Set(['diagnostic-evaluation', 'retry-infrastructure'])
export const operationNeedsRecovery = operation => !operation?.recovery?.released && (operation?.cleanupRequired === true || operation?.recoveryRequired === true || operation?.status === 'INTERRUPTED')

export function operationResultTarget(operation) {
  const result = operation?.resultRef
  if (result?.verified !== true || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(result.jobName ?? '') || !operation.target?.workspace) return undefined
  return { workspace: operation.target.workspace, jobName: result.jobName, partial: operation.status !== 'COMPLETED' }
}

export function acceptOperationList(value, sessionId, current = []) {
  if (!Array.isArray(value?.items)) throw new Error('Invalid operation list; retained states are not current.')
  const seen = new Set()
  return value.items.map(item => {
    if (item?.sessionId !== sessionId || !/^hop_[a-f0-9-]{36}$/.test(item.operationId ?? '') || !DIAGNOSTIC_KINDS.has(item.kind) || seen.has(item.operationId)) throw new Error('Operation ownership or identity mismatch.')
    seen.add(item.operationId)
    const previous = current.find(operation => operation.operationId === item.operationId)
    const next = acceptActionOperation({ operationId: item.operationId, draftId: item.draftId }, previous, item)
    // Inspection/progress are read projections, not lifecycle transitions. A
    // terminal sequence stays immutable while fresh evidence can be attached.
    return { ...next, resultRef: item.resultRef, progress: item.progress, recovery: item.recovery }
  })
}

export function pollOperationList({ request, sessionId, limit = 20, getCurrent, onList, onError, schedule = setTimeout, unschedule = clearTimeout }) {
  let alive = true
  let timer
  let controller
  const read = async () => {
    controller = new AbortController()
    let delay = 5000
    try {
      const value = await request('action-operations', { limit }, { signal: controller.signal })
      if (!alive) return
      const items = acceptOperationList(value, sessionId, getCurrent?.())
      onList({ ...value, items })
      if (items.some(actionOperationActive)) delay = 1500
    } catch (error) { if (alive) onError(error) }
    if (alive) timer = schedule(read, delay)
  }
  void read()
  return () => { alive = false; controller?.abort(); if (timer !== undefined) unschedule(timer) }
}
