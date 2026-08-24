import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { EvolutionService, resolveEvaluatorStackPath } from '../lib/service.js'

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

test('Web Workbench projectRoot can switch to an existing absolute directory without changing Agent tool scoping', async () => {
  const first = await mkdtemp(path.join(os.tmpdir(), 'harbor-web-root-first-'))
  const second = await mkdtemp(path.join(os.tmpdir(), 'harbor-web-root-second-'))
  const service = new EvolutionService({ projectRoot: first })

  const result = await service.setProjectRoot({ projectRoot: second })

  assert.equal(result.projectRoot, second)
  assert.equal(result.reloaded, true)
  assert.equal(service.config.projectRoot, second)
  await assert.rejects(service.setProjectRoot({ projectRoot: 'relative' }), /absolute directory/)
})

test('version status uses the installed Plugin identity and current Web projectRoot', async () => {
  let received
  const service = new EvolutionService(
    { projectRoot: '/workspace/agent' },
    { pluginVersion: '0.7.2', versionChecker: async value => { received = value; return { status: 'up-to-date' } } },
  )
  assert.deepEqual(await service.version({ refresh: 'true' }), { status: 'up-to-date' })
  assert.deepEqual(received, { currentVersion: '0.7.2', projectRoot: '/workspace/agent', refresh: true })
})

test('model binding exposes only immutable Host Broker identity', async () => {
  const service = new EvolutionService(
    { projectRoot: '/workspace/agent' },
    {},
    { currentBinding: async () => ({ schema_version: 1, source: 'skill-agent-default', provider: 'openai-codex', model: 'gpt-test' }) },
  )

  const result = await service.modelBinding()

  assert.equal(result.transport, 'dsh-host-broker')
  assert.equal(result.protocol, 'dsh-host-model-gateway/v1')
  assert.equal(result.candidate_model_binding.model, 'gpt-test')
  assert.equal(result.credentials.mode, 'host-broker-only')
  assert.doesNotMatch(JSON.stringify(result), /auth\.json|api[_-]?key|token/i)
})
