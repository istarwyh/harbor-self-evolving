import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import { resolveWithin } from '../lib/evolution.js'
import { runProcess } from '../lib/process.js'

test('paths are constrained to the configured project root', () => {
  const root = path.resolve('/tmp/project')
  assert.equal(resolveWithin(root, 'candidates/v1', 'candidate'), path.join(root, 'candidates/v1'))
  assert.throws(() => resolveWithin(root, '../outside', 'candidate'), /must stay under projectRoot/)
})

test('a policy rejection can be treated as a structured result', async () => {
  const result = await runProcess(process.execPath, ['-e', 'process.stdout.write("REJECT"); process.exit(1)'], {
    allowedExitCodes: [0, 1],
    timeoutMs: 1000,
  })
  assert.equal(result.code, 1)
  assert.equal(result.stdout, 'REJECT')
})
