// The Host owns snapshot membership. Never infer "all selected" from a page's
// current filter: new results must not enter an already frozen selection.
export function trialSelectionMemberIds(value, ref = value?.ref) {
  const members = value?.members
  if (!ref || value?.ref?.id !== ref.id || value.ref.sourceDigest !== ref.sourceDigest || value.ref.job !== ref.job || value.ref.selectionCount !== ref.selectionCount || !Array.isArray(members) || members.length < 1 || members.length > 1000 || members.length !== value.count || members.length !== ref.selectionCount) {
    throw new Error('HARBOR_SELECTION_INVALID: The Host selection membership could not be verified. Select the Trials again.')
  }
  const ids = members.map(member => member?.id)
  if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) throw new Error('HARBOR_SELECTION_INVALID: The Host selection contains invalid or duplicate Trial IDs.')
  return ids
}

export function trialSelectionScope(workspace, job, filters, sessionId) {
  // Pagination and sort order only rearrange rows; neither changes membership.
  return JSON.stringify([workspace, job, filters?.query ?? '', filters?.status ?? '', filters?.validity ?? '', sessionId ?? ''])
}
