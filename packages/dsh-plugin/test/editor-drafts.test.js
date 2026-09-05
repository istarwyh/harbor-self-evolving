import assert from 'node:assert/strict'
import test from 'node:test'

import { createEditorDraftStore, makeEditorDraftKey } from '../src/client/editor-drafts.js'

const scope = { sessionId: 'session-a', workspace: 'workspace-a', jobId: 'job-a', role: 'rubric', path: 'rubrics/quality.md' }
const key = makeEditorDraftKey(scope)
const draft = { baseDigest: 'digest-a', baseText: 'original source', text: 'human edits' }

function memoryStorage() {
  const values = new Map()
  return {
    values,
    getItem(name) { return values.get(name) ?? null },
    setItem(name, value) { values.set(name, value) },
    removeItem(name) { values.delete(name) },
  }
}

test('editor buffers survive file switches, view remounts, and browser refresh with their original base', () => {
  const storage = memoryStorage()
  const first = createEditorDraftStore({ storage, now: () => 10 })
  const otherKey = makeEditorDraftKey({ ...scope, path: 'prompts/judge.md' })
  assert.equal(first.put(key, draft).persisted, true)
  first.put(otherKey, { ...draft, text: 'another file edit' })
  assert.deepEqual(first.get(key), { ...draft, updatedAt: 10 })
  const refreshed = createEditorDraftStore({ storage })
  assert.equal(refreshed.get(key).text, 'human edits')
  assert.equal(refreshed.get(otherKey).text, 'another file edit')
  assert.deepEqual(refreshed.status(), { persisted: true, error: undefined })
})

test('every session, workspace, job, role, and path dimension isolates drafts without delimiter collisions', () => {
  const store = createEditorDraftStore()
  store.put(key, draft)
  for (const field of Object.keys(scope)) assert.equal(store.get(makeEditorDraftKey({ ...scope, [field]: `${scope[field]}-other` })), undefined)
  assert.notEqual(makeEditorDraftKey({ ...scope, sessionId: 'a:b', workspace: 'c' }), makeEditorDraftKey({ ...scope, sessionId: 'a', workspace: 'b:c' }))
  assert.notEqual(makeEditorDraftKey({ ...scope, path: 'a|b' }), makeEditorDraftKey({ ...scope, role: 'rubric|a', path: 'b' }))
})

test('scoped recovery can list human drafts when the live editable source is no longer available', () => {
  const store = createEditorDraftStore({ storage: memoryStorage() })
  store.put(key, draft)
  store.put(makeEditorDraftKey({ ...scope, jobId: 'job-other' }), { ...draft, text: 'other job' })
  const recovered = store.list(scope)
  assert.equal(recovered.length, 1)
  assert.equal(recovered[0].path, scope.path)
  assert.equal(recovered[0].text, draft.text)
  recovered[0].text = 'changed clone'
  assert.equal(store.get(key).text, draft.text)
  assert.equal(store.list({ ...scope, sessionId: 'session-other' }).length, 0)
  assert.throws(() => store.list({ workspace: scope.workspace, jobId: scope.jobId }), /SCOPE_INVALID/)
})

test('updated server source never silently rebases or overwrites unsaved text', () => {
  const storage = memoryStorage()
  const store = createEditorDraftStore({ storage, now: () => 20 })
  store.put(key, draft)
  const result = store.put(key, { baseDigest: 'digest-b', baseText: 'server changed', text: 'human edits continued' })
  assert.equal(result.baseChanged, true)
  assert.deepEqual(result.draft, { ...draft, text: 'human edits continued', updatedAt: 20 })
  assert.equal(createEditorDraftStore({ storage }).get(key).baseDigest, 'digest-a')
  store.remove(key)
  store.put(key, { baseDigest: 'digest-b', baseText: 'server changed', text: 'explicit new edit' })
  assert.equal(store.get(key).baseDigest, 'digest-b')
})

test('returned records and status are defensive copies, not mutable authorization state', () => {
  const store = createEditorDraftStore()
  const result = store.put(key, draft)
  result.draft.text = 'mutated'
  result.error.code = 'mutated'
  const retrieved = store.get(key)
  retrieved.baseDigest = 'mutated'
  assert.equal(store.get(key).text, draft.text)
  assert.equal(store.get(key).baseDigest, draft.baseDigest)
  assert.equal(store.status().error.code, 'HARBOR_EDITOR_DRAFT_MEMORY_ONLY')
})

test('saved or explicitly discarded drafts are removed without clearing unrelated browser data', () => {
  const storage = memoryStorage()
  storage.setItem('host-owned-setting', 'keep')
  const store = createEditorDraftStore({ storage })
  const otherKey = makeEditorDraftKey({ ...scope, path: 'other.md' })
  store.put(key, draft)
  store.put(otherKey, draft)
  assert.equal(store.remove(key).persisted, true)
  assert.equal(createEditorDraftStore({ storage }).get(key), undefined)
  assert.equal(store.get(otherKey).text, draft.text)
  store.remove(otherKey)
  assert.deepEqual([...storage.values], [['host-owned-setting', 'keep']])
})

test('unavailable browser storage explicitly reports memory-only protection', () => {
  const store = createEditorDraftStore()
  assert.equal(store.status().persisted, false)
  assert.equal(store.status().error.code, 'HARBOR_EDITOR_DRAFT_MEMORY_ONLY')
  assert.equal(store.put(key, draft).accepted, true)
  assert.equal(store.get(key).text, draft.text)
})

test('quota errors preserve the latest in-memory buffer and warn that refresh may restore an older draft', () => {
  const storage = memoryStorage()
  const store = createEditorDraftStore({ storage })
  store.put(key, draft)
  const originalSetItem = storage.setItem
  storage.setItem = () => { throw new Error('QuotaExceededError') }
  const result = store.put(key, { ...draft, text: 'latest edits' })
  assert.equal(result.accepted, true)
  assert.equal(result.persisted, false)
  assert.equal(result.error.code, 'HARBOR_EDITOR_DRAFT_PERSIST_FAILED')
  assert.equal(store.get(key).text, 'latest edits')
  assert.equal(createEditorDraftStore({ storage }).get(key).text, 'human edits')
  storage.setItem = originalSetItem
  assert.equal(store.put(key, { ...draft, text: 'latest edits' }).persisted, true)
  assert.equal(createEditorDraftStore({ storage }).get(key).text, 'latest edits')
})

test('failed removal is surfaced and never claimed to persist across refresh', () => {
  const storage = memoryStorage()
  const store = createEditorDraftStore({ storage })
  store.put(key, draft)
  storage.removeItem = () => { throw new Error('Storage blocked') }
  const result = store.remove(key)
  assert.equal(result.persisted, false)
  assert.equal(result.error.code, 'HARBOR_EDITOR_DRAFT_PERSIST_FAILED')
  assert.equal(store.get(key), undefined)
  assert.equal(createEditorDraftStore({ storage }).get(key).text, draft.text)
})

test('capacity rejects a new buffer without evicting existing human work; current buffers remain editable', () => {
  const store = createEditorDraftStore({ storage: memoryStorage(), maxEntries: 1 })
  store.put(key, draft)
  const otherKey = makeEditorDraftKey({ ...scope, path: 'other.md' })
  const result = store.put(otherKey, draft)
  assert.equal(result.accepted, false)
  assert.equal(result.error.code, 'HARBOR_EDITOR_DRAFT_CAPACITY')
  assert.equal(store.get(key).text, draft.text)
  assert.equal(store.put(key, { ...draft, text: 'continued edit' }).accepted, true)
  assert.equal(store.get(key).text, 'continued edit')
  assert.equal(store.get(otherKey), undefined)
})

test('oversized source text is rejected without replacing an existing valid buffer', () => {
  const store = createEditorDraftStore({ storage: memoryStorage() })
  store.put(key, draft)
  const result = store.put(key, { ...draft, text: 'x'.repeat(256 * 1024 + 1) })
  assert.equal(result.accepted, false)
  assert.equal(result.error.code, 'HARBOR_EDITOR_DRAFT_TOO_LARGE')
  assert.equal(store.get(key).text, draft.text)
  assert.equal(store.put(key, { ...draft, text: 'x'.repeat(256 * 1024) }).accepted, true)
})

test('malformed, unscoped, duplicate, oversized, and incompatible stored records are never restored', () => {
  const valid = { key, ...draft, updatedAt: 1 }
  const invalidValues = [
    '{',
    JSON.stringify({ schema: 'other/v1', entries: [valid] }),
    JSON.stringify({ schema: 'harbor-editor-drafts/v1', entries: [{ ...valid, key: 'job-a/rubric' }] }),
    JSON.stringify({ schema: 'harbor-editor-drafts/v1', entries: [{ ...valid, text: null }] }),
    JSON.stringify({ schema: 'harbor-editor-drafts/v1', entries: [{ ...valid, updatedAt: -1 }] }),
    JSON.stringify({ schema: 'harbor-editor-drafts/v1', entries: [{ ...valid, baseText: 'x'.repeat(256 * 1024 + 1) }] }),
    JSON.stringify({ schema: 'harbor-editor-drafts/v1', entries: [valid, valid] }),
    JSON.stringify({ schema: 'harbor-editor-drafts/v1', entries: [valid, { ...valid, key: makeEditorDraftKey({ ...scope, path: 'other.md' }) }] }),
  ]
  for (const value of invalidValues) {
    const storage = memoryStorage()
    storage.setItem('harbor.editor-drafts.v1', value)
    const store = createEditorDraftStore({ storage, maxEntries: 1 })
    assert.equal(store.get(key), undefined)
    assert.equal(store.status().error.code, 'HARBOR_EDITOR_DRAFT_RESTORE_FAILED')
  }
})

test('a storage read failure is visible and subsequent edits can still recover persistence', () => {
  const storage = memoryStorage()
  storage.getItem = () => { throw new Error('SecurityError') }
  const store = createEditorDraftStore({ storage })
  assert.equal(store.status().error.code, 'HARBOR_EDITOR_DRAFT_RESTORE_FAILED')
  assert.equal(store.put(key, draft).persisted, true)
  assert.equal(store.get(key).text, draft.text)
})

test('invalid scope and resource configuration fail explicitly', () => {
  for (const field of Object.keys(scope)) {
    assert.throws(() => makeEditorDraftKey({ ...scope, [field]: '' }), /SCOPE_INVALID/)
    assert.throws(() => makeEditorDraftKey({ ...scope, [field]: 'bad\nvalue' }), /SCOPE_INVALID/)
  }
  const store = createEditorDraftStore()
  assert.throws(() => store.get('not-a-key'), /SCOPE_INVALID/)
  assert.throws(() => store.put('not-a-key', draft), /SCOPE_INVALID/)
  assert.throws(() => store.remove('not-a-key'), /SCOPE_INVALID/)
  assert.throws(() => createEditorDraftStore({ maxEntries: 0 }), /maxEntries/)
  assert.throws(() => createEditorDraftStore({ maxEntries: 129 }), /maxEntries/)
  assert.throws(() => createEditorDraftStore({ now: () => NaN }).put(key, draft), /timestamp/)
})
