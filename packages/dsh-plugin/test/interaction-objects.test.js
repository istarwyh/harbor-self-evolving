import assert from 'node:assert/strict'
import test from 'node:test'
import { interactionObjectCatalog, resolveCatalogSelection } from '../lib/interaction-objects.js'
import { normalizeHarborUiContext } from '../lib/ui-context.js'

test('local artifact selectors are content-bound and never include prose or paths', () => {
  const state = { artifacts: { optimization: { hypotheses: [{ id: 'h1', root_cause: 'Important source text' }] }, promotion: { reasons: ['quality regression'] } } }
  const catalog = interactionObjectCatalog('job-1', state)
  assert.deepEqual(catalog.map(item => item.ref.kind), ['hypothesis', 'gate-reason'])
  assert.doesNotMatch(JSON.stringify(catalog.map(item => item.ref)), /Important|quality regression/)
  const ref = catalog[0].ref
  assert.deepEqual(resolveCatalogSelection(ref, catalog).value, state.artifacts.optimization.hypotheses[0])
  state.artifacts.optimization.hypotheses[0].root_cause = 'Changed diagnosis'
  assert.throws(() => resolveCatalogSelection(ref, interactionObjectCatalog('job-1', state)), /STALE_SELECTION/)
  assert.throws(() => resolveCatalogSelection({ ...ref, id: 'guessed' }, catalog), /STALE_SELECTION/)
})

test('saved source selection is role-, revision-, and line-bound', () => {
  const governance = { components: { rubric: { source: { text: 'first\nsecond\nthird' } } } }
  const catalog = interactionObjectCatalog('job-1', undefined, undefined, governance)
  const ref = { ...catalog[0].ref, startLine: 2, endLine: 3 }
  assert.equal(resolveCatalogSelection(ref, catalog).value.text, 'second\nthird')
  assert.throws(() => resolveCatalogSelection({ ...ref, sourceRole: 'evaluator' }, catalog), /STALE_SELECTION/)
  assert.throws(() => resolveCatalogSelection({ ...ref, endLine: 4 }, catalog), /CONTEXT_INVALID/)
  const context = { schema: 'harbor-ui-context/v1', sessionId: 'session-1', pageSessionId: 'page-1', generation: 1, workspace: 'workspace-1', route: { name: 'harbor.evaluator', params: { job: 'job-1', stage: 'judge' } }, object: { kind: 'job', id: 'job-1', job: 'job-1', stage: 'judge' }, selection: [ref], observedAt: new Date().toISOString() }
  assert.deepEqual(normalizeHarborUiContext(context).selection[0], ref)
  for (const startLine of ['2', -1, 1.5, 10001]) assert.throws(() => normalizeHarborUiContext({ ...context, selection: [{ ...ref, startLine }] }), /CONTEXT_INVALID/)
})

test('attempt and finding selectors remain bound to the exact Trial', () => {
  const catalog = interactionObjectCatalog('job-1', undefined, { trial: 'trial-1', lifecycle: { id: 'trial-1', attempt: 2, status: 'failed' }, assessment: { findings: [{ code: 'NO_SCORE', message: 'Infrastructure failed' }] } })
  assert.equal(catalog.length, 2)
  for (const { ref } of catalog) assert.throws(() => resolveCatalogSelection({ ...ref, trial: 'trial-2' }, catalog), /STALE_SELECTION/)
})

test('score validity reasons and infrastructure exceptions have separate Trial-bound selectors', () => {
  const state = { trial: 'trial-1', lifecycle: { id: 'trial-1', exception: { type: 'SetupError', classification: 'infrastructure-error' } }, assessment: { score: { valid: false, invalid_reasons: ['missing-evidence'] } } }
  const catalog = interactionObjectCatalog('job-1', undefined, state)
  const issues = catalog.filter(item => item.ref.kind === 'exception')
  assert.equal(issues.length, 2)
  assert.equal(issues[0].value.reason, 'missing-evidence')
  assert.equal(issues[1].value.classification, 'infrastructure-error')
  for (const { ref } of issues) {
    assert.equal(ref.trial, 'trial-1')
    assert.throws(() => resolveCatalogSelection({ ...ref, trial: 'trial-2' }, catalog), /STALE_SELECTION/)
  }
})
