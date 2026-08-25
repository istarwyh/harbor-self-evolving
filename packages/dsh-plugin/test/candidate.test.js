import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { computeCandidate, loadModelBinding, snapshotCandidate } from '../lib/candidate.js'

test('candidate digest is stable and excludes its manifest', async () => {
  const candidate = await mkdtemp(path.join(os.tmpdir(), 'dsh-candidate-'))
  await writeFile(path.join(candidate, 'cordis.yml'), '- name: demo\n')
  await writeFile(path.join(candidate, 'package.json'), '{"name":"demo"}\n')
  await writeFile(path.join(candidate, 'package-lock.json'), '{"name":"demo","lockfileVersion":3}\n')
  const first = await snapshotCandidate(candidate, { candidateId: 'demo', version: '1.0.0' })
  const second = await snapshotCandidate(candidate, { candidateId: 'demo', version: '1.0.0' })
  assert.equal(first.digest, second.digest)
  assert.equal((await computeCandidate(candidate)).digest, first.digest)
})

test('candidate identity defaults to package.json', async () => {
  const candidate = await mkdtemp(path.join(os.tmpdir(), 'dsh-candidate-identity-'))
  await writeFile(path.join(candidate, 'cordis.yml'), '- name: demo\n')
  await writeFile(path.join(candidate, 'package.json'), '{"name":"business-agent","version":"2.1.0"}\n')
  await writeFile(path.join(candidate, 'package-lock.json'), '{"name":"business-agent","version":"2.1.0","lockfileVersion":3}\n')
  const manifest = await snapshotCandidate(candidate)
  assert.equal(manifest.candidate_id, 'business-agent')
  assert.equal(manifest.version, '2.1.0')
  assert.deepEqual(manifest.runtime, {
    kind: 'deepseek-harness',
    policy: 'follow-latest',
    version: 'latest',
    package: '@deepseek-ai/dsh-acp-demo@latest',
    transport: 'acp',
  })
})

test('candidate digest matches the Python cross-language vector', async () => {
  const candidate = await mkdtemp(path.join(os.tmpdir(), 'dsh-candidate-vector-'))
  await writeFile(path.join(candidate, 'cordis.yml'), '- name: example\n')
  await writeFile(path.join(candidate, 'package.json'), '{"name":"candidate"}\n')
  await writeFile(path.join(candidate, '插件.mjs'), "export const name = 'example'\n")
  assert.equal(
    (await computeCandidate(candidate)).digest,
    'sha256:870d96928d1d3ae7617c1ead379c258c8b4fe3607ee34010206a42f8dd332ebf',
  )
})

test('candidate snapshot requires a lockfile and rejects credential files', async () => {
  const candidate = await mkdtemp(path.join(os.tmpdir(), 'dsh-candidate-contract-'))
  await writeFile(path.join(candidate, 'cordis.yml'), '- name: demo\n')
  await writeFile(path.join(candidate, 'package.json'), '{"name":"demo","version":"1.0.0"}\n')
  await assert.rejects(snapshotCandidate(candidate), /lockfile/)
  await writeFile(path.join(candidate, 'package-lock.json'), '{"name":"demo","lockfileVersion":3}\n')
  await writeFile(path.join(candidate, '.env.local'), 'TOKEN=do-not-store\n')
  await assert.rejects(snapshotCandidate(candidate), /credential-bearing/)
})

test('model binding is validated, digest-bound, and copied into Candidate metadata', async () => {
  const candidate = await mkdtemp(path.join(os.tmpdir(), 'dsh-candidate-model-'))
  await writeFile(path.join(candidate, 'cordis.yml'), '- name: demo\n')
  await writeFile(path.join(candidate, 'package.json'), '{"name":"demo","version":"1.0.0"}\n')
  await writeFile(path.join(candidate, 'package-lock.json'), '{"name":"demo","lockfileVersion":3}\n')
  const binding = {
    schema_version: 1,
    source: 'skill-agent-default',
    provider: 'openai-codex',
    model: 'gpt-test',
    reasoning_effort: 'high',
  }
  await writeFile(path.join(candidate, 'model-binding.json'), `${JSON.stringify(binding)}\n`)

  const manifest = await snapshotCandidate(candidate)

  assert.deepEqual(await loadModelBinding(candidate), binding)
  assert.deepEqual(manifest.metadata.model_binding, binding)
  assert.equal(manifest.files.some(item => item.path === 'model-binding.json'), true)
  assert.doesNotMatch(JSON.stringify(manifest), /auth\.json|api[_-]?key|token/i)

  await writeFile(path.join(candidate, 'model-binding.json'), `${JSON.stringify({ ...binding, token: 'forbidden' })}\n`)
  await assert.rejects(snapshotCandidate(candidate), /unsupported or secret-bearing fields/)
})
