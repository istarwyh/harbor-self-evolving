import assert from 'node:assert/strict'
import test from 'node:test'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { readContextSnapshot, writeContextSnapshot } from '../lib/context-snapshots.js'
import { TrialSelectionRegistry, resolveFrozenTrialSelection } from '../lib/trial-selection.js'

const run = promisify(execFile)
const sessionId = 'session-a'
const id = `hctx_${'a'.repeat(32)}`
const unavailable = /HARBOR_CONTEXT_STORAGE_UNAVAILABLE/
const sessionKey = createHash('sha256').update(sessionId).digest('hex')
const segments = ['.harbor', 'private', 'page-contexts', sessionKey]
const snapshotDirectory = root => path.join(root, ...segments)
const snapshotFile = root => path.join(snapshotDirectory(root), `${id}.json`)

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harbor-context-storage-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

test('snapshot roundtrip is exact and absence never returns another Session or project record', async t => {
  const root = await fixture(t)
  const otherRoot = await fixture(t)
  const value = { token: id, context: { generation: 4 }, digest: `sha256:${'b'.repeat(64)}` }
  assert.equal(await readContextSnapshot(root, sessionId, id), undefined)
  await writeContextSnapshot(root, sessionId, id, value)
  assert.deepEqual(await readContextSnapshot(root, sessionId, id), value)
  assert.equal(await readContextSnapshot(root, 'session-b', id), undefined)
  assert.equal(await readContextSnapshot(otherRoot, sessionId, id), undefined)
  assert.equal(await readContextSnapshot(root, sessionId, `hctx_${'c'.repeat(32)}`), undefined)
})

test('new private storage is owner-only and creates its ignore-all convention', async t => {
  const root = await fixture(t)
  await writeContextSnapshot(root, sessionId, id, { generation: 1 })
  for (let depth = 1; depth <= segments.length; depth += 1) {
    assert.equal((await lstat(path.join(root, ...segments.slice(0, depth)))).mode & 0o777, 0o700)
  }
  assert.equal((await lstat(snapshotFile(root))).mode & 0o777, 0o600)
  assert.equal(await readFile(path.join(root, '.harbor/private/page-contexts/.gitignore'), 'utf8'), '*\n!.gitignore\n')
  await assert.rejects(lstat(path.join(root, '.harbor/private/.gitignore')), { code: 'ENOENT' })
})

test('record IDs cannot supply filesystem traversal or arbitrary filenames', async t => {
  const root = await fixture(t)
  for (const invalid of ['', '../outside', `${id}/../outside`, `../${id}`, `hctx_${'a'.repeat(81)}`, 'hsel_short']) {
    await assert.rejects(writeContextSnapshot(root, sessionId, invalid, {}), unavailable)
    await assert.rejects(readContextSnapshot(root, sessionId, invalid), unavailable)
  }
  assert.deepEqual(await readdir(root), [])
})

test('an existing Git exclusion that could expose snapshots is rejected without overwriting it', async t => {
  const root = await fixture(t)
  const directory = path.join(root, '.harbor/private/page-contexts')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const ignore = path.join(directory, '.gitignore')
  await writeFile(ignore, '!*.json\n', { mode: 0o600 })
  await assert.rejects(writeContextSnapshot(root, sessionId, id, {}), unavailable)
  assert.equal(await readFile(ignore, 'utf8'), '!*.json\n')
  assert.equal(await readContextSnapshot(root, sessionId, id), undefined)
})

test('writes are idempotent but never overwrite an existing snapshot', async t => {
  const root = await fixture(t)
  const value = { generation: 1, members: ['trial-a'] }
  await writeContextSnapshot(root, sessionId, id, value)
  const original = await readFile(snapshotFile(root))
  await writeContextSnapshot(root, sessionId, id, value)
  await assert.rejects(writeContextSnapshot(root, sessionId, id, { generation: 2 }), unavailable)
  assert.deepEqual(await readFile(snapshotFile(root)), original)
  assert.deepEqual(await readdir(snapshotDirectory(root)), [`${id}.json`])
})

test('concurrent writers publish only one complete immutable value and clean temporary files', async t => {
  const root = await fixture(t)
  const values = Array.from({ length: 24 }, (_, index) => ({ winner: index % 2, members: ['trial-a', 'trial-b'] }))
  const results = await Promise.allSettled(values.map(value => writeContextSnapshot(root, sessionId, id, value)))
  const saved = await readContextSnapshot(root, sessionId, id)
  assert.ok(results.some(result => result.status === 'fulfilled'))
  for (const [index, result] of results.entries()) {
    if (values[index].winner === saved.winner) assert.equal(result.status, 'fulfilled')
    else { assert.equal(result.status, 'rejected'); assert.match(result.reason.message, unavailable) }
  }
  assert.deepEqual(await readdir(snapshotDirectory(root)), [`${id}.json`])
})

test('symlinked storage directory components are rejected without writing to the target', async t => {
  for (let depth = 0; depth < segments.length; depth += 1) {
    const root = await fixture(t)
    const outside = await fixture(t)
    const parent = path.join(root, ...segments.slice(0, depth))
    await mkdir(parent, { recursive: true, mode: 0o700 })
    await symlink(outside, path.join(parent, segments[depth]))
    await assert.rejects(writeContextSnapshot(root, sessionId, id, {}), unavailable)
    await assert.rejects(readContextSnapshot(root, sessionId, id), unavailable)
    assert.deepEqual(await readdir(outside), [])
  }
})

test('snapshot and ignore-file symlinks are rejected without touching their targets', async t => {
  const root = await fixture(t)
  const outside = await fixture(t)
  const target = path.join(outside, 'target')
  await writeFile(target, 'untouched')
  await mkdir(snapshotDirectory(root), { recursive: true, mode: 0o700 })
  await symlink(target, snapshotFile(root))
  await assert.rejects(readContextSnapshot(root, sessionId, id), unavailable)
  await assert.rejects(writeContextSnapshot(root, sessionId, id, {}), unavailable)
  assert.equal(await readFile(target, 'utf8'), 'untouched')
  const secondRoot = await fixture(t)
  await mkdir(path.join(secondRoot, '.harbor/private/page-contexts'), { recursive: true, mode: 0o700 })
  await symlink(target, path.join(secondRoot, '.harbor/private/page-contexts/.gitignore'))
  await assert.rejects(writeContextSnapshot(secondRoot, sessionId, id, {}), unavailable)
  assert.equal(await readFile(target, 'utf8'), 'untouched')
})

test('pre-existing group/other-writable storage directories are rejected', async t => {
  for (let depth = 1; depth <= segments.length; depth += 1) {
    const root = await fixture(t)
    await mkdir(snapshotDirectory(root), { recursive: true, mode: 0o700 })
    await chmod(path.join(root, ...segments.slice(0, depth)), 0o777)
    await assert.rejects(writeContextSnapshot(root, sessionId, id, {}), unavailable)
  }
})

test('pre-existing private directories and snapshot files cannot be group/other-readable', async t => {
  for (let depth = 2; depth <= segments.length; depth += 1) {
    const root = await fixture(t)
    await mkdir(snapshotDirectory(root), { recursive: true, mode: 0o700 })
    await chmod(path.join(root, ...segments.slice(0, depth)), 0o755)
    await assert.rejects(writeContextSnapshot(root, sessionId, id, {}), unavailable)
    assert.equal((await lstat(path.join(root, ...segments.slice(0, depth)))).mode & 0o777, 0o755)
  }
  const root = await fixture(t)
  await writeContextSnapshot(root, sessionId, id, { generation: 1 })
  for (const mode of [0o644, 0o777]) {
    await chmod(snapshotFile(root), mode)
    await assert.rejects(readContextSnapshot(root, sessionId, id), unavailable)
    await assert.rejects(writeContextSnapshot(root, sessionId, id, { generation: 1 }), unavailable)
    assert.equal((await lstat(snapshotFile(root))).mode & 0o777, mode)
  }
})

test('an ordinary non-writable shared .harbor directory is supported without permission changes', async t => {
  const root = await fixture(t)
  await mkdir(path.join(root, '.harbor'), { mode: 0o755 })
  await writeContextSnapshot(root, sessionId, id, { generation: 1 })
  assert.deepEqual(await readContextSnapshot(root, sessionId, id), { generation: 1 })
  assert.equal((await lstat(path.join(root, '.harbor'))).mode & 0o777, 0o755)
})

test('damaged JSON and forged record identities fail closed', async t => {
  const root = await fixture(t)
  await writeContextSnapshot(root, sessionId, id, { generation: 1 })
  const original = JSON.parse(await readFile(snapshotFile(root), 'utf8'))
  const records = [
    '{', 'null',
    JSON.stringify({ ...original, schema: 'other' }),
    JSON.stringify({ ...original, id: `hctx_${'b'.repeat(32)}` }),
    JSON.stringify({ ...original, sessionId: 'session-b' }),
    JSON.stringify({ ...original, projectRoot: path.join(root, 'other') }),
  ]
  for (const record of records) {
    await writeFile(snapshotFile(root), record)
    await assert.rejects(readContextSnapshot(root, sessionId, id), unavailable)
  }
})

test('oversized and non-file records are rejected before parsing', async t => {
  const root = await fixture(t)
  await assert.rejects(writeContextSnapshot(root, sessionId, id, { text: 'x'.repeat(1024 * 1024) }), unavailable)
  assert.deepEqual(await readdir(root), [])
  await mkdir(snapshotDirectory(root), { recursive: true, mode: 0o700 })
  await writeFile(snapshotFile(root), 'x'.repeat(1024 * 1024 + 1), { mode: 0o600 })
  await assert.rejects(readContextSnapshot(root, sessionId, id), unavailable)
  await rm(snapshotFile(root))
  await mkdir(snapshotFile(root), { mode: 0o700 })
  await assert.rejects(readContextSnapshot(root, sessionId, id), unavailable)
})

test('a FIFO masquerading as a snapshot fails promptly instead of waiting for a writer', async t => {
  const root = await fixture(t)
  await mkdir(snapshotDirectory(root), { recursive: true, mode: 0o700 })
  await run('mkfifo', [snapshotFile(root)])
  const code = `import { readContextSnapshot } from ${JSON.stringify(new URL('../lib/context-snapshots.js', import.meta.url).href)};
    try { await readContextSnapshot(${JSON.stringify(root)}, ${JSON.stringify(sessionId)}, ${JSON.stringify(id)}); process.exitCode = 2 }
    catch (error) { if (!/HARBOR_CONTEXT_STORAGE_UNAVAILABLE/.test(error.message)) throw error }`
  await run(process.execPath, ['--input-type=module', '-e', code], { timeout: 3000 })
})

test('persisted selections retain only fixed IDs/revisions and reject drift after a fresh registry', async t => {
  const root = await fixture(t)
  const owner = { sessionId, projectRoot: root, workspace: 'workspace-a', job: 'job-a' }
  const trials = [{ id: 'trial-a', score: 0, evidence: 'private evidence body' }, { id: 'trial-b', score: 1 }]
  const firstRegistry = new TrialSelectionRegistry({ now: () => 1000, ttlMs: 1 })
  const issued = firstRegistry.issue({ ...owner, mode: 'query-snapshot', filters: { query: 'private search text' }, trials })
  await writeContextSnapshot(root, sessionId, issued.ref.id, firstRegistry.owned(issued.ref, owner))
  const raw = await readFile(path.join(snapshotDirectory(root), `${issued.ref.id}.json`), 'utf8')
  assert.doesNotMatch(raw, /private evidence body|private search text|"score"|"evidence"|"trials"/)
  const newRegistry = new TrialSelectionRegistry({ now: () => 1_000_000 })
  assert.throws(() => newRegistry.owned(issued.ref, owner), /EXPIRED/)
  const saved = await readContextSnapshot(root, sessionId, issued.ref.id)
  assert.deepEqual(resolveFrozenTrialSelection(saved, issued.ref, owner, [...trials, { id: 'trial-new' }]).value.members.map(member => member.id), ['trial-a', 'trial-b'])
  for (const changedOwner of [{ ...owner, sessionId: 'session-b' }, { ...owner, projectRoot: `${root}-other` }, { ...owner, workspace: 'other' }]) {
    assert.throws(() => resolveFrozenTrialSelection(saved, issued.ref, changedOwner, trials), /DENIED/)
  }
  assert.throws(() => resolveFrozenTrialSelection(saved, issued.ref, owner, [trials[0]]), /STALE_SELECTION/)
  assert.throws(() => resolveFrozenTrialSelection(saved, issued.ref, owner, [{ ...trials[0], score: 2 }, trials[1]]), /STALE_SELECTION/)
})
