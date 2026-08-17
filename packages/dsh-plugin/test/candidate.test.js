import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { computeCandidate, snapshotCandidate } from '../lib/candidate.js'

test('candidate digest is stable and excludes its manifest', async () => {
  const candidate = await mkdtemp(path.join(os.tmpdir(), 'dsh-candidate-'))
  await writeFile(path.join(candidate, 'cordis.yml'), '- name: demo\n')
  await writeFile(path.join(candidate, 'package.json'), '{"name":"demo"}\n')
  const first = await snapshotCandidate(candidate, { candidateId: 'demo', version: '1.0.0' })
  const second = await snapshotCandidate(candidate, { candidateId: 'demo', version: '1.0.0' })
  assert.equal(first.digest, second.digest)
  assert.equal((await computeCandidate(candidate)).digest, first.digest)
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
