import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { resolveEvaluatorStackPath } from '../lib/service.js'

test('Evaluator governance finds the nearest nested active Stack without leaving projectRoot', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-service-stack-'))
  const stack = path.join(projectRoot, 'examples', 'research', '.harbor', 'evaluation-stack.yml')
  await mkdir(path.dirname(stack), { recursive: true })
  await writeFile(stack, 'schema_version: 1\n')
  const governance = { components: { evaluator: { entry: 'examples/research/stack/evaluator/evaluator.json' } } }

  assert.equal(
    await resolveEvaluatorStackPath({ projectRoot }, governance),
    path.join('examples', 'research', '.harbor', 'evaluation-stack.yml'),
  )
  assert.equal(
    await resolveEvaluatorStackPath({ projectRoot }, { components: { evaluator: { entry: '../outside/evaluator.json' } } }),
    undefined,
  )
  assert.equal(await resolveEvaluatorStackPath({ projectRoot }, governance, '.harbor/custom.yml'), '.harbor/custom.yml')
})
