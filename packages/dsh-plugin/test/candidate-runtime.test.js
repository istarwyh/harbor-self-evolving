import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { loadCandidateRuntime } from '../lib/candidate-runtime.js'
import { computeCandidate, snapshotCandidate } from '../lib/candidate.js'

const descriptor = () => ({
  schema_version: 1,
  transport: 'acp',
  entrypoint: 'run-acp.mjs',
  config_path: 'config/agent.yml',
  agent_entry_id: 'business-agent',
  node_version: '22.22.2',
})
const packageJson = () => ({ name: 'business-agent', version: '1.0.0', dependencies: { runtime: '1.2.3-rc.2' } })
const registryEntry = () => ({
  version: '1.2.3-rc.2',
  resolved: 'https://registry.example.org/runtime/-/runtime-1.2.3-rc.2.tgz',
  integrity: `sha512-${Buffer.alloc(64, 7).toString('base64')}`,
})
const lockfile = () => ({ lockfileVersion: 3, packages: { '': packageJson(), 'node_modules/runtime': registryEntry() } })
const json = async (root, filename, value) => writeFile(path.join(root, filename), JSON.stringify(value))
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harbor-candidate-runtime-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, 'config'))
  await writeFile(path.join(root, 'config/agent.yml'), '- id: business-agent\n')
  await writeFile(path.join(root, 'run-acp.mjs'), 'export const ownedRuntime = true\n')
  await json(root, 'candidate-runtime.json', descriptor())
  await json(root, 'package.json', packageJson())
  await json(root, 'package-lock.json', lockfile())
  return root
}

test('Candidate-owned runtime replaces registry defaults and is source-digest bound', async t => {
  const root = await fixture(t)
  const runtime = await loadCandidateRuntime(root, { required: true })
  assert.deepEqual(runtime, {
    kind: 'deepseek-harness', policy: 'candidate-locked', transport: 'acp',
    descriptor: 'candidate-runtime.json', entrypoint: 'run-acp.mjs', config_path: 'config/agent.yml',
    agent_entry_id: 'business-agent', node_version: '22.22.2', lockfile: 'package-lock.json',
    descriptor_digest: digest(await readFile(path.join(root, 'candidate-runtime.json'))),
    entrypoint_digest: digest(await readFile(path.join(root, 'run-acp.mjs'))),
    lockfile_digest: digest(await readFile(path.join(root, 'package-lock.json'))),
  })
  const snapshot = await snapshotCandidate(root)
  assert.deepEqual(snapshot.runtime, runtime)
  for (const filename of ['candidate-runtime.json', 'run-acp.mjs', 'config/agent.yml', 'package-lock.json']) {
    assert.ok(snapshot.files.some(file => file.path === filename))
  }
  assert.doesNotMatch(JSON.stringify(snapshot.runtime), /demo|latest/)
  await writeFile(path.join(root, 'run-acp.mjs'), 'export const ownedRuntime = false\n')
  assert.notEqual((await computeCandidate(root)).digest, snapshot.digest)
  assert.notEqual((await loadCandidateRuntime(root)).entrypoint_digest, runtime.entrypoint_digest)
})

test('unbound legacy Candidates remain inspectable but cannot execute implicitly', async t => {
  const root = await fixture(t)
  await rm(path.join(root, 'candidate-runtime.json'))
  const before = await computeCandidate(root)
  assert.deepEqual(await loadCandidateRuntime(root), { kind: 'deepseek-harness', policy: 'unbound', transport: 'acp' })
  await assert.rejects(loadCandidateRuntime(root, { required: true }), /unbound; migrate.*new snapshot/)
  assert.equal((await computeCandidate(root)).digest, before.digest)
})

test('empty dependency Candidates still require a real v3 root lock record', async t => {
  const root = await fixture(t)
  const pkg = { name: 'minimal-agent', version: '1.0.0' }
  await json(root, 'package.json', pkg)
  await json(root, 'package-lock.json', { lockfileVersion: 3, packages: { '': pkg } })
  assert.equal((await loadCandidateRuntime(root)).policy, 'candidate-locked')
})

test('runtime descriptor rejects missing, unknown, malformed, and unsupported fields', async t => {
  const root = await fixture(t)
  for (const value of [null, [], {}, { ...descriptor(), secret: 'not-allowed' }, { ...descriptor(), schema_version: 2 }, { ...descriptor(), transport: 'http' }]) {
    await json(root, 'candidate-runtime.json', value)
    await assert.rejects(loadCandidateRuntime(root), /object|requires/)
  }
  await writeFile(path.join(root, 'candidate-runtime.json'), '{broken')
  await assert.rejects(loadCandidateRuntime(root), /not valid JSON/)
})

test('runtime descriptor requires an exact supported Node release and bounded agent identifier', async t => {
  const root = await fixture(t)
  for (const version of ['latest', '^22.22.2', '22', 'v22.22.2', '21.9.0', '22.22.2-rc.1', '022.22.2', 22]) {
    await json(root, 'candidate-runtime.json', { ...descriptor(), node_version: version })
    await assert.rejects(loadCandidateRuntime(root), /node_version.*exact/)
  }
  for (const id of ['', '.', '..', '-agent', 'agent/id', 'agent id', 'a'.repeat(129), 42]) {
    await json(root, 'candidate-runtime.json', { ...descriptor(), agent_entry_id: id })
    await assert.rejects(loadCandidateRuntime(root), /agent_entry_id/)
  }
})

test('entrypoint and config paths reject traversal, reserved trees, and non-source files', async t => {
  const root = await fixture(t)
  for (const field of ['entrypoint', 'config_path']) {
    for (const value of ['', '/tmp/agent.mjs', '../agent.mjs', 'dir/../agent.mjs', './agent.mjs', 'dir//agent.mjs', 'node_modules/runtime/index.mjs', 'dir/.git/index.mjs', '.harbor-runtime/index.mjs', 'C:\\agent.mjs', 'dir\\agent.mjs', 'agent\u0000.mjs']) {
      await json(root, 'candidate-runtime.json', { ...descriptor(), [field]: value })
      await assert.rejects(loadCandidateRuntime(root), /relative path|reserved Candidate paths/)
    }
  }
  await json(root, 'candidate-runtime.json', { ...descriptor(), entrypoint: 'agent.sh' })
  await assert.rejects(loadCandidateRuntime(root), /source file/)
  await json(root, 'candidate-runtime.json', { ...descriptor(), entrypoint: 'missing.mjs' })
  await assert.rejects(loadCandidateRuntime(root), /regular source file/)
  await json(root, 'candidate-runtime.json', { ...descriptor(), config_path: 'config' })
  await assert.rejects(loadCandidateRuntime(root), /regular source file/)
})

test('all runtime files and intermediate path components reject symlinks', async t => {
  for (const filename of ['candidate-runtime.json', 'run-acp.mjs', 'config/agent.yml', 'package.json', 'package-lock.json']) {
    const root = await fixture(t)
    const content = await readFile(path.join(root, filename))
    await writeFile(path.join(root, 'other-source'), content)
    await rm(path.join(root, filename))
    await symlink(path.join(root, 'other-source'), path.join(root, filename))
    await assert.rejects(loadCandidateRuntime(root), /without symlinks/)
  }
  const root = await fixture(t)
  await symlink(path.join(root, 'config'), path.join(root, 'config-link'))
  await json(root, 'candidate-runtime.json', { ...descriptor(), config_path: 'config-link/agent.yml' })
  await assert.rejects(loadCandidateRuntime(root), /without symlinks/)
})

test('lockfile must have v3 root metadata matching Candidate name and version', async t => {
  const root = await fixture(t)
  for (const value of [[], {}, { ...lockfile(), lockfileVersion: 2 }, { lockfileVersion: 3, packages: {} }]) {
    await json(root, 'package-lock.json', value)
    await assert.rejects(loadCandidateRuntime(root), /object|v3/)
  }
  for (const field of ['name', 'version']) {
    const value = lockfile()
    value.packages[''][field] = 'drifted'
    await json(root, 'package-lock.json', value)
    await assert.rejects(loadCandidateRuntime(root), new RegExp(`root ${field} must match`))
  }
})

test('every direct dependency must have its exact installed lock record', async t => {
  const root = await fixture(t)
  for (const field of ['dependencies', 'optionalDependencies', 'devDependencies', 'peerDependencies']) {
    const pkg = { name: 'business-agent', version: '1.0.0', [field]: { runtime: '1.2.3-rc.2' } }
    await json(root, 'package.json', pkg)
    for (const target of [undefined, { ...registryEntry(), version: '9.8.7' }]) {
      await json(root, 'package-lock.json', { lockfileVersion: 3, packages: { '': pkg, ...(target ? { 'node_modules/runtime': target } : {}) } })
      await assert.rejects(loadCandidateRuntime(root), /dependency must resolve to its exact locked version/)
    }
  }
})

test('every root dependency map is exact and matches the lockfile', async t => {
  const root = await fixture(t)
  for (const field of ['dependencies', 'optionalDependencies', 'devDependencies', 'peerDependencies']) {
    for (const invalid of [null, [], '1.2.3']) {
      const pkg = { ...packageJson(), [field]: invalid }
      const lock = lockfile()
      lock.packages[''] = pkg
      await json(root, 'package.json', pkg)
      await json(root, 'package-lock.json', lock)
      await assert.rejects(loadCandidateRuntime(root), /must be an object/)
    }
    for (const version of ['latest', '^1.2.3', '~1.2.3', '1.x', 'file:../runtime', 'npm:runtime@1.2.3', 'git+https://example.org/r.git', '01.2.3', '1.2.3-01']) {
      const pkg = { ...packageJson(), [field]: { runtime: version } }
      const lock = lockfile()
      lock.packages[''] = pkg
      await json(root, 'package.json', pkg)
      await json(root, 'package-lock.json', lock)
      await assert.rejects(loadCandidateRuntime(root), /exact semver/)
    }
    await json(root, 'package.json', { ...packageJson(), [field]: { runtime: '9.8.7' } })
    await json(root, 'package-lock.json', lockfile())
    await assert.rejects(loadCandidateRuntime(root), /must match/)
  }
})

test('lockfile validates every package including dev-only and rejects mutable or unverified resolutions', async t => {
  const root = await fixture(t)
  const invalid = [
    { version: '^1.2.3' }, { version: '1.2.3-01' }, { link: true }, { inBundle: true },
    { resolved: undefined }, { resolved: 'file:../runtime.tgz' }, { resolved: 'http://example.org/a.tgz' },
    { resolved: 'https://user:password@example.org/a.tgz' }, { resolved: 'https://example.org/a.tgz?token=x' },
    { resolved: 'https://example.org/a.tgz#sha' }, { resolved: 'https://example.org/a.tgz?' },
    { resolved: 'https:example.org/a.tgz' }, { resolved: 'https://example.org/a\n.tgz' },
    { integrity: undefined }, { integrity: 'sha1-YWJj' }, { integrity: 'sha512-YWJj' },
    { integrity: `sha512-${Buffer.alloc(63).toString('base64')}` },
    { integrity: `${registryEntry().integrity} ${registryEntry().integrity}` },
  ]
  for (const changes of invalid) {
    const value = lockfile()
    value.packages['node_modules/dev-only'] = { ...registryEntry(), dev: true, ...changes }
    await json(root, 'package-lock.json', value)
    await assert.rejects(loadCandidateRuntime(root), /registry version|resolved package URL|sha512/)
  }
  const value = lockfile()
  value.packages['packages/workspace'] = registryEntry()
  await json(root, 'package-lock.json', value)
  await assert.rejects(loadCandidateRuntime(root), /unsupported package location/)
})

test('changing descriptor or lock bytes changes both runtime metadata and Candidate identity', async t => {
  const root = await fixture(t)
  const before = await snapshotCandidate(root)
  await json(root, 'candidate-runtime.json', { ...descriptor(), agent_entry_id: 'another-agent' })
  const changedDescriptor = await snapshotCandidate(root)
  assert.notEqual(changedDescriptor.digest, before.digest)
  assert.notEqual(changedDescriptor.runtime.descriptor_digest, before.runtime.descriptor_digest)
  await writeFile(path.join(root, 'package-lock.json'), `${JSON.stringify(lockfile(), null, 2)}\n`)
  const changedLock = await snapshotCandidate(root)
  assert.notEqual(changedLock.digest, changedDescriptor.digest)
  assert.notEqual(changedLock.runtime.lockfile_digest, changedDescriptor.runtime.lockfile_digest)
})

test('runtime contract agrees with the shared Python/Node acceptance vectors', async t => {
  const contract = JSON.parse(await readFile(new URL('./fixtures/candidate-runtime-contract.json', import.meta.url), 'utf8'))
  for (const vector of contract.cases) {
    await t.test(vector.name, async t => {
      const root = await fixture(t)
      const data = structuredClone(contract)
      let target = { descriptor: data.descriptor, package: data.package, lock: data.lock, root: data.lock.packages[''] }[vector.target]
      if (vector.target === 'extra') {
        target = data.lock.packages['node_modules/extra'] = { ...data.lock.packages['node_modules/runtime'] }
      }
      Object.assign(target, vector.patch)
      await json(root, 'candidate-runtime.json', data.descriptor)
      await json(root, 'package.json', data.package)
      await json(root, 'package-lock.json', data.lock)
      for (const [filename, content] of Object.entries(data.source_files)) await writeFile(path.join(root, filename), content)
      if (vector.valid) assert.equal((await loadCandidateRuntime(root, { required: true })).policy, 'candidate-locked')
      else await assert.rejects(loadCandidateRuntime(root, { required: true }))
    })
  }
})
