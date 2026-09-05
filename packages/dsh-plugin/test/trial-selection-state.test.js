import assert from 'node:assert/strict'
import test from 'node:test'
import { trialSelectionMemberIds, trialSelectionScope } from '../src/client/trial-selection-state.js'

const ref = { id: 'selection-a', job: 'job-a', sourceDigest: 'digest-a', selectionCount: 2 }
const membership = () => ({ ref: { ...ref }, count: 2, members: [{ id: 'trial-1' }, { id: 'trial-2' }] })

test('selection checkboxes require exact Host-owned member IDs, never a page approximation', () => {
  assert.deepEqual(trialSelectionMemberIds(membership(), ref), ['trial-1', 'trial-2'])
  for (const change of [
    value => { value.ref.id = 'another-selection' },
    value => { value.ref.job = 'another-job' },
    value => { value.ref.sourceDigest = 'different-revision' },
    value => { value.ref.selectionCount = 3 },
    value => { value.count = 3 },
    value => { value.members.pop() },
    value => { value.members[1].id = 'trial-1' },
    value => { value.members[1].id = '' },
    value => { value.members[1].id = 2 },
  ]) {
    const value = membership()
    change(value)
    assert.throws(() => trialSelectionMemberIds(value, ref), /HARBOR_SELECTION_INVALID/)
  }
  assert.throws(() => trialSelectionMemberIds(undefined), /HARBOR_SELECTION_INVALID/)
})

test('only membership filters or owner changes invalidate selection, not sorting or pagination', () => {
  const scope = trialSelectionScope('workspace-a', 'job-a', {})
  assert.notEqual(trialSelectionScope('workspace-a', 'job-a', {}, 'other-session'), scope)
  assert.equal(trialSelectionScope('workspace-a', 'job-a', { sort: 'lowest-score', offset: 100 }), scope)
  for (const [workspace, job, filters] of [
    ['workspace-b', 'job-a', {}], ['workspace-a', 'job-b', {}],
    ['workspace-a', 'job-a', { query: 'failed' }], ['workspace-a', 'job-a', { status: 'completed' }], ['workspace-a', 'job-a', { validity: 'false' }],
  ]) assert.notEqual(trialSelectionScope(workspace, job, filters), scope)
})
