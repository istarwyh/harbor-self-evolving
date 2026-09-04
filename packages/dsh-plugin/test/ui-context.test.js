import assert from 'node:assert/strict'
import test from 'node:test'

import {
  HarborUiContextRegistry,
  MAX_UI_CONTEXT_BYTES,
  harborNavigationTarget,
  normalizeHarborUiContext,
} from '../lib/ui-context.js'

const SHA_A = `sha256:${'a'.repeat(64)}`
const SHA_B = `sha256:${'b'.repeat(64)}`

function trialContext(overrides = {}) {
  return {
    schema: 'harbor-ui-context/v1',
    sessionId: 'session-1',
    pageSessionId: 'harbor-page-1',
    generation: 1,
    workspace: 'workspace-1',
    route: {
      name: 'harbor.trial.detail',
      params: { job: 'job-42', stage: 'judge', trial: 'trial-21', detailTab: 'evidence', criterion: 'D2_1' },
    },
    object: { kind: 'trial', id: 'trial-21', job: 'job-42', stage: 'judge', trial: 'trial-21' },
    selection: [{ kind: 'criterion', id: 'D2_1', job: 'job-42', stage: 'judge', trial: 'trial-21', criterion: 'D2_1' }],
    viewState: { detailTab: 'evidence', filters: { status: 'candidate-quality-failed', validity: 'false', segment: 'regression' }, sort: 'errors' },
    identities: { candidate: { id: 'search-agent', version: '2.4.2', digest: SHA_A }, context: { id: 'context-v2', digest: SHA_B } },
    flags: { legacy: false, comparable: true, scoreValid: false },
    artifactRevision: SHA_B,
    observedAt: '2026-09-04T10:31:00+08:00',
    ...overrides,
  }
}

function homeContext(overrides = {}) {
  return {
    schema: 'harbor-ui-context/v1',
    sessionId: 'session-1',
    pageSessionId: 'harbor-page-1',
    generation: 1,
    workspace: 'workspace-1',
    route: { name: 'harbor.home', params: {} },
    object: { kind: 'workspace', id: 'workspace-1' },
    observedAt: '2026-09-04T02:31:00.000Z',
    ...overrides,
  }
}

function errorCode(code) {
  return error => error?.code === code && error.message.startsWith(`${code}:`)
}

function deterministicRandom() {
  let counter = 0
  return size => Buffer.alloc(size, ++counter)
}

test('normalizes the strict allowlist and drops safe unknown keys at every level', () => {
  const input = trialContext({
    ignored: 'safe-debug-label',
    route: { ...trialContext().route, ignored: 'drop-me', params: { ...trialContext().route.params, ignored: 'drop-me' } },
    object: { ...trialContext().object, displayName: 'friendly-name' },
    viewState: { ...trialContext().viewState, ignored: true, filters: { ...trialContext().viewState.filters, query: 'safe-query' } },
    identities: { ...trialContext().identities, candidate: { ...trialContext().identities.candidate, displayName: 'Search Agent' }, ignored: { id: 'ignored' } },
    flags: { ...trialContext().flags, hidden: true },
  })
  const normalized = normalizeHarborUiContext(input, 'session-1')

  assert.equal(normalized.observedAt, '2026-09-04T02:31:00.000Z')
  assert.deepEqual(normalized.route.params, trialContext().route.params)
  assert.deepEqual(normalized.object, trialContext().object)
  assert.deepEqual(normalized.viewState.filters, trialContext().viewState.filters)
  assert.deepEqual(normalized.identities.candidate, trialContext().identities.candidate)
  assert.equal('ignored' in normalized, false)
  assert.equal('hidden' in normalized.flags, false)
  assert.deepEqual(harborNavigationTarget(normalized), {
    route: 'harbor.trial.detail', workspace: 'workspace-1', job: 'job-42', stage: 'judge', trial: 'trial-21', detailTab: 'evidence', criterion: 'D2_1',
    filters: { status: 'candidate-quality-failed', validity: 'false', segment: 'regression' }, sort: 'errors',
  })
})

test('requires the declared schema and each typed route required parameter', () => {
  assert.throws(() => normalizeHarborUiContext({ ...homeContext(), schema: undefined }), errorCode('HARBOR_CONTEXT_INVALID'))
  assert.throws(() => normalizeHarborUiContext({ ...homeContext(), schema: 'harbor-ui-context/v2' }), errorCode('HARBOR_CONTEXT_INVALID'))

  for (const name of ['harbor.job', 'harbor.evaluator', 'harbor.compare', 'harbor.gate']) {
    assert.throws(() => normalizeHarborUiContext({ ...homeContext(), route: { name, params: {} }, object: undefined }), errorCode('HARBOR_CONTEXT_INVALID'), name)
  }
  assert.throws(() => normalizeHarborUiContext({ ...homeContext(), route: { name: 'harbor.trial.detail', params: { job: 'job-42' } }, object: undefined }), errorCode('HARBOR_CONTEXT_INVALID'))
  assert.throws(() => normalizeHarborUiContext({ ...homeContext(), route: { name: 'harbor.home', params: { job: 'job-42' } } }), errorCode('HARBOR_CONTEXT_INVALID'))
})

test('Compare and Gate routes require exact concrete artifact identities', () => {
  const compare = {
    ...homeContext(),
    route: {
      name: 'harbor.compare',
      params: { job: 'candidate-job', stage: 'gate', baseline: 'baseline-job', candidate: 'candidate-job' },
    },
    object: {
      kind: 'compare', id: SHA_A, job: 'candidate-job', stage: 'gate',
      baseline: 'baseline-job', candidate: 'candidate-job', comparisonDigest: SHA_A,
    },
  }
  const normalizedCompare = normalizeHarborUiContext(compare, 'session-1')
  assert.deepEqual(normalizedCompare.object, compare.object)
  assert.deepEqual(harborNavigationTarget(normalizedCompare), {
    route: 'harbor.compare', workspace: 'workspace-1', job: 'candidate-job', stage: 'gate',
    baseline: 'baseline-job', candidate: 'candidate-job',
  })

  assert.throws(() => normalizeHarborUiContext({
    ...compare,
    route: { ...compare.route, params: { ...compare.route.params, baseline: undefined } },
  }), errorCode('HARBOR_CONTEXT_INVALID'))
  assert.throws(() => normalizeHarborUiContext({
    ...compare,
    object: { ...compare.object, id: SHA_B },
  }), errorCode('HARBOR_CONTEXT_INVALID'))
  assert.throws(() => normalizeHarborUiContext({
    ...compare,
    object: { ...compare.object, candidate: 'other-candidate' },
  }), errorCode('HARBOR_CONTEXT_INVALID'))

  const gateIdentity = {
    baseline: 'baseline-job', candidate: 'candidate-job', policy: 'quality-policy', policyVersion: '2.0.0',
    policyDigest: SHA_A, reportDigest: SHA_B,
  }
  const gate = {
    ...homeContext(),
    route: { name: 'harbor.gate', params: { job: 'candidate-job', stage: 'gate', ...gateIdentity } },
    object: { kind: 'gate', id: SHA_B, job: 'candidate-job', stage: 'gate', ...gateIdentity },
  }
  const normalizedGate = normalizeHarborUiContext(gate, 'session-1')
  assert.deepEqual(normalizedGate.object, gate.object)
  assert.deepEqual(harborNavigationTarget(normalizedGate), {
    route: 'harbor.gate', workspace: 'workspace-1', job: 'candidate-job', stage: 'gate', ...gateIdentity,
  })

  for (const field of ['baseline', 'candidate', 'policy', 'policyVersion', 'policyDigest', 'reportDigest']) {
    assert.throws(() => normalizeHarborUiContext({
      ...gate,
      route: { ...gate.route, params: { ...gate.route.params, [field]: undefined } },
    }), errorCode('HARBOR_CONTEXT_INVALID'), field)
  }
  assert.throws(() => normalizeHarborUiContext({
    ...gate,
    route: { ...gate.route, params: { ...gate.route.params, policy: 'other-policy' } },
  }), errorCode('HARBOR_CONTEXT_INVALID'))
  assert.throws(() => normalizeHarborUiContext({
    ...gate,
    object: { ...gate.object, id: SHA_A },
  }), errorCode('HARBOR_CONTEXT_INVALID'))
})

test('enforces route, object, selection, and detail-tab consistency', () => {
  assert.throws(() => normalizeHarborUiContext(trialContext({ object: { ...trialContext().object, job: 'job-other' } })), errorCode('HARBOR_CONTEXT_INVALID'))
  assert.throws(() => normalizeHarborUiContext(trialContext({ selection: [{ ...trialContext().selection[0], trial: 'trial-other' }] })), errorCode('HARBOR_CONTEXT_INVALID'))
  assert.throws(() => normalizeHarborUiContext(trialContext({ selection: [] })), errorCode('HARBOR_CONTEXT_INVALID'))
  assert.throws(() => normalizeHarborUiContext(trialContext({ viewState: { ...trialContext().viewState, detailTab: 'scores' } })), errorCode('HARBOR_CONTEXT_INVALID'))
  assert.throws(() => normalizeHarborUiContext({ ...homeContext(), object: { kind: 'job', id: 'job-42', job: 'job-42' } }), errorCode('HARBOR_CONTEXT_INVALID'))
  assert.throws(() => normalizeHarborUiContext(trialContext({ selection: [trialContext().selection[0], trialContext().selection[0]] })), errorCode('HARBOR_CONTEXT_INVALID'))
})

test('accepts opaque historical Evidence refs with fragments but rejects path traversal', () => {
  const evidenceRef = 'observation.json#/criteria/quality'
  const normalized = normalizeHarborUiContext(trialContext({
    route: {
      name: 'harbor.trial.detail',
      params: { job: 'job-42', stage: 'judge', trial: 'trial-21', detailTab: 'evidence', evidenceRef },
    },
    selection: [{ kind: 'evidence', id: evidenceRef, job: 'job-42', stage: 'judge', trial: 'trial-21', evidenceRef }],
  }))
  assert.equal(normalized.route.params.evidenceRef, evidenceRef)
  assert.equal(normalized.selection[0].evidenceRef, evidenceRef)

  for (const unsafe of ['../outside.json', '/Users/alice/private.json', 'file:///tmp/private.json', 'safe/../private.json']) {
    assert.throws(() => normalizeHarborUiContext(trialContext({
      route: {
        name: 'harbor.trial.detail',
        params: { job: 'job-42', stage: 'judge', trial: 'trial-21', detailTab: 'evidence', evidenceRef: unsafe },
      },
      selection: [{ kind: 'evidence', id: unsafe, job: 'job-42', stage: 'judge', trial: 'trial-21', evidenceRef: unsafe }],
    })), error => ['HARBOR_CONTEXT_INVALID', 'HARBOR_CONTEXT_UNSAFE_VALUE'].includes(error?.code))
  }
})

test('enforces stable IDs, sha256 syntax, and filter enums', () => {
  assert.throws(() => normalizeHarborUiContext(homeContext({ workspace: '../escape', object: { kind: 'workspace', id: '../escape' } })), errorCode('HARBOR_CONTEXT_UNSAFE_VALUE'))
  assert.throws(() => normalizeHarborUiContext(homeContext({ workspace: 'workspace name', object: { kind: 'workspace', id: 'workspace name' } })), errorCode('HARBOR_CONTEXT_INVALID'))
  assert.throws(() => normalizeHarborUiContext(trialContext({ artifactRevision: 'sha256:not-a-digest' })), errorCode('HARBOR_CONTEXT_INVALID'))
  assert.throws(() => normalizeHarborUiContext(trialContext({ identities: { candidate: { id: 'agent', digest: `sha1:${'a'.repeat(40)}` } } })), errorCode('HARBOR_CONTEXT_INVALID'))
  assert.throws(() => normalizeHarborUiContext(trialContext({ viewState: { ...trialContext().viewState, filters: { status: 'surprise' } } })), errorCode('HARBOR_CONTEXT_INVALID'))
  assert.throws(() => normalizeHarborUiContext(trialContext({ viewState: { ...trialContext().viewState, filters: { validity: 'yes' } } })), errorCode('HARBOR_CONTEXT_INVALID'))
})

test('recursively rejects secret canaries and URL/path-like values even in unknown fields', () => {
  const unsafe = [
    { metadata: { nested: [{ accessToken: 'not-even-needed' }] } },
    { metadata: { note: 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz' } },
    { metadata: { note: 'sk-proj_abcdefghijklmnopqrstuvwxyz' } },
    { metadata: { sourceUrl: 'safe-looking-name' } },
    { metadata: { note: 'https://example.invalid/internal' } },
    { metadata: { note: 'mailto:private@example.invalid' } },
    { metadata: { note: '/Users/person/private/artifact.json' } },
    { metadata: { note: 'artifacts/private/result.json' } },
  ]
  for (const extra of unsafe) {
    assert.throws(
      () => normalizeHarborUiContext({ ...homeContext(), ...extra }),
      error => ['HARBOR_CONTEXT_SECRET_DETECTED', 'HARBOR_CONTEXT_UNSAFE_VALUE'].includes(error?.code),
      JSON.stringify(extra),
    )
  }
})

test('applies the 4 KB limit to the raw payload before unknown keys are dropped', () => {
  const context = { ...homeContext(), ignored: 'x'.repeat(MAX_UI_CONTEXT_BYTES) }
  assert.throws(() => normalizeHarborUiContext(context), errorCode('HARBOR_CONTEXT_TOO_LARGE'))
})

test('registry issuance is idempotent and generation updates use monotonic CAS per page', () => {
  let now = 1_000
  const registry = new HarborUiContextRegistry({ now: () => now, random: deterministicRandom() })
  const firstContext = homeContext()
  const first = registry.issue({ sessionId: 'session-1', context: firstContext, projectRoot: '/tmp/project-a' })
  const repeated = registry.issue({ sessionId: 'session-1', context: structuredClone(firstContext), projectRoot: '/tmp/project-a' })
  assert.deepEqual(repeated, first)
  assert.equal(registry.entries.size, 1)
  assert.throws(() => registry.issue({ sessionId: 'session-1', context: { ...firstContext, generation: 2 }, projectRoot: '/tmp/project-b' }), errorCode('HARBOR_CONTEXT_PROJECT_MISMATCH'))

  assert.throws(() => registry.issue({
    sessionId: 'session-1', context: { ...firstContext, observedAt: '2026-09-04T02:32:00.000Z' }, projectRoot: '/tmp/project-a',
  }), errorCode('HARBOR_CONTEXT_GENERATION_CONFLICT'))

  now += 1
  const secondContext = { ...firstContext, generation: 2, observedAt: '2026-09-04T02:32:00.000Z' }
  const second = registry.issue({ sessionId: 'session-1', context: secondContext, projectRoot: '/tmp/project-a' })
  assert.notEqual(second.contextSnapshotId, first.contextSnapshotId)
  assert.throws(() => registry.issue({ sessionId: 'session-1', context: firstContext, projectRoot: '/tmp/project-a' }), errorCode('HARBOR_CONTEXT_STALE_GENERATION'))

  const otherPage = registry.issue({ sessionId: 'session-1', context: { ...firstContext, pageSessionId: 'harbor-page-2' }, projectRoot: '/tmp/project-a' })
  assert.equal(otherPage.generation, 1)
})

test('registry tokens are TTL-, Session-, and project-bound', () => {
  let now = 1_000
  const registry = new HarborUiContextRegistry({ ttlMs: 10, now: () => now, random: deterministicRandom() })
  const issued = registry.issue({ sessionId: 'session-1', context: homeContext(), projectRoot: '/tmp/project-a' })
  assert.equal(registry.resolve({ contextSnapshotId: issued.contextSnapshotId, sessionId: 'session-1', projectRoot: '/tmp/project-a' }).context.workspace, 'workspace-1')
  assert.throws(() => registry.resolve({ contextSnapshotId: issued.contextSnapshotId, sessionId: 'session-2', projectRoot: '/tmp/project-a' }), errorCode('HARBOR_CONTEXT_SESSION_MISMATCH'))
  assert.throws(() => registry.resolve({ contextSnapshotId: issued.contextSnapshotId, sessionId: 'session-1', projectRoot: '/tmp/project-b' }), errorCode('HARBOR_CONTEXT_PROJECT_MISMATCH'))

  now = 1_010
  assert.throws(() => registry.resolve({ contextSnapshotId: issued.contextSnapshotId, sessionId: 'session-1', projectRoot: '/tmp/project-a' }), errorCode('HARBOR_CONTEXT_EXPIRED'))
  const renewed = registry.issue({ sessionId: 'session-1', context: homeContext(), projectRoot: '/tmp/project-a' })
  assert.notEqual(renewed.contextSnapshotId, issued.contextSnapshotId)
})

test('registry enforces both per-Session and total capacity without evicting live references', () => {
  const registry = new HarborUiContextRegistry({ maxEntries: 3, maxEntriesPerSession: 2, random: deterministicRandom() })
  registry.issue({ sessionId: 'session-1', context: homeContext(), projectRoot: '/tmp/project-a' })
  registry.issue({ sessionId: 'session-1', context: { ...homeContext(), pageSessionId: 'harbor-page-2' }, projectRoot: '/tmp/project-a' })
  assert.throws(() => registry.issue({ sessionId: 'session-1', context: { ...homeContext(), pageSessionId: 'harbor-page-3' }, projectRoot: '/tmp/project-a' }), errorCode('HARBOR_CONTEXT_CAPACITY'))

  registry.issue({ sessionId: 'session-2', context: { ...homeContext(), sessionId: 'session-2', pageSessionId: 'harbor-page-4' }, projectRoot: '/tmp/project-a' })
  assert.throws(() => registry.issue({ sessionId: 'session-3', context: { ...homeContext(), sessionId: 'session-3', pageSessionId: 'harbor-page-5' }, projectRoot: '/tmp/project-a' }), errorCode('HARBOR_CONTEXT_CAPACITY'))
  assert.equal(registry.entries.size, 3)
})
