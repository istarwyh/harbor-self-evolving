import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import { makeJobName, resolveWithin } from '../lib/evolution.js'
import { runProcess } from '../lib/process.js'

test('paths are constrained to the configured project root', () => {
  const root = path.resolve('/tmp/project')
  assert.equal(resolveWithin(root, 'candidates/v1', 'candidate'), path.join(root, 'candidates/v1'))
  assert.throws(() => resolveWithin(root, '../outside', 'candidate'), /must stay under projectRoot/)
})

test('job names are generated from candidate identity and remain Harbor-safe', () => {
  const name = makeJobName({
    candidate_id: '@team/deep research agent',
    version: '2.0.0+preview',
    digest: `sha256:${'a'.repeat(64)}`,
  }, new Date('2026-08-17T12:34:56.789Z'))
  assert.equal(name, 'team-deep-research-agent-2.0.0-preview-20260817T123456Z-aaaaaaaa')
  assert.match(name, /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/)
})

test('a policy rejection can be treated as a structured result', async () => {
  const result = await runProcess(process.execPath, ['-e', 'process.stdout.write("REJECT"); process.exit(1)'], {
    allowedExitCodes: [0, 1],
    timeoutMs: 1000,
  })
  assert.equal(result.code, 1)
  assert.equal(result.stdout, 'REJECT')
})
