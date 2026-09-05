import assert from 'node:assert/strict'
import test from 'node:test'
import { TrialSelectionRegistry } from '../lib/trial-selection.js'
import { attentionCounts, jobAttention, matchesJobFilter } from '../lib/workbench-health.js'

const owner = { sessionId: 'session-a', projectRoot: '/test/project', workspace: 'workspace-a', job: 'job-a' }
const trials = [{ id: 'trial-1', score: { valid: true, value: 0 } }, { id: 'trial-2', score: { valid: false } }]

for (const mode of ['explicit', 'query-snapshot']) test(`${mode} freezes identities and revision without putting query/evidence in the reference`, () => {
  const registry = new TrialSelectionRegistry()
  const selection = registry.issue({ ...owner, mode, filters: { query: 'private query' }, trials })
  assert.equal(selection.count, 2)
  assert.doesNotMatch(JSON.stringify(selection), /private query|score|trial-1/)
  const value = registry.resolve(selection.ref, owner, trials).value
  assert.deepEqual(value.members.map(member => member.id), ['trial-1', 'trial-2'])
  assert.throws(() => registry.resolve(selection.ref, { ...owner, sessionId: 'session-b' }, trials), /DENIED/)
  assert.throws(() => registry.resolve({ ...selection.ref, job: 'other' }, owner, trials), /DENIED/)
  assert.throws(() => registry.resolve(selection.ref, owner, [trials[0]]), /STALE_SELECTION/)
  assert.throws(() => registry.resolve(selection.ref, owner, [{ ...trials[0], score: { valid: true, value: 1 } }, trials[1]]), /STALE_SELECTION/)
  assert.equal(registry.resolve(selection.ref, owner, [...trials, { id: 'new-trial' }]).value.count, 2)
})

test('selection TTL and capacity are enforced without evicting active selections', () => {
  let now = 1000
  const registry = new TrialSelectionRegistry({ now: () => now, ttlMs: 100, maxEntries: 1 })
  const issue = () => registry.issue({ ...owner, mode: 'explicit', trials })
  const first = issue()
  assert.throws(issue, /LIMIT/)
  now += 101
  assert.throws(() => registry.resolve(first.ref, owner, trials), /EXPIRED/)
  assert.equal(issue().count, 2)
})

test('attention priority and KPI filters retain valid business zeroes', () => {
  const jobs = [{ nTrials: 2, nInfrastructureExceptions: 2 }, { nTrials: 2, progress: { health: 'stalled', active: true } }, { nTrials: 2, nInvalidScores: 1 }, { nTrials: 2, metrics: { reward: 0 }, nValidScores: 2 }]
  assert.deepEqual(jobs.map(job => jobAttention(job).kind), ['blocked', 'stalled', 'invalid', 'healthy'])
  assert.equal(matchesJobFilter(jobs[0], 'infrastructure'), true)
  assert.equal(attentionCounts(jobs).invalid, 1)
  assert.equal(attentionCounts(jobs).running, 1)
})
