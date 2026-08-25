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
  assert.equal(result.source, 'manual')
  assert.equal(service.config.projectRoot, first)
  const dashboard = await service.dashboard()
  assert.equal(dashboard.config.projectRoot, second)
  assert.equal(dashboard.config.projectRootSource, 'manual')
  assert.equal(dashboard.workspaces.length, 2)
  await assert.rejects(service.setProjectRoot({ projectRoot: 'relative' }), /absolute directory/)
})

test('latest Harbor Agent session replaces a stale Workbench root without changing tool isolation', async () => {
  const stale = await mkdtemp(path.join(os.tmpdir(), 'harbor-web-root-stale-'))
  const current = await mkdtemp(path.join(os.tmpdir(), 'harbor-web-root-session-'))
  await mkdir(path.join(current, 'jobs'), { recursive: true })
  const service = new EvolutionService({
    projectRoot: stale,
    jobsDir: 'jobs',
    harborBin: '/bin/sh',
    harborDshBin: '/bin/sh',
    runtimePolicy: 'follow-latest',
    agentImportPath: 'example:Agent',
    pluginImportPath: 'dsh-evolution',
  }, { projectRootSource: 'configured' })

  const result = service.activateProjectRoot(current, 'agent-session')
  const dashboard = await service.dashboard()

  assert.equal(result.projectRoot, current)
  assert.equal(result.source, 'agent-session')
  assert.equal(dashboard.config.projectRoot, current)
  assert.equal(dashboard.config.projectRootSource, 'agent-session')
})

test('a pinned workspace keeps same-named Job reads isolated when another Agent session becomes active', async () => {
  const first = await mkdtemp(path.join(os.tmpdir(), 'harbor-web-pinned-first-'))
  const second = await mkdtemp(path.join(os.tmpdir(), 'harbor-web-pinned-second-'))
  for (const [root, digest] of [[first, 'sha256:first'], [second, 'sha256:second']]) {
    const job = path.join(root, 'jobs', 'same-job')
    await mkdir(job, { recursive: true })
    await writeFile(path.join(job, 'evaluation-context.json'), JSON.stringify({ schema_version: 2, digest }))
  }
  const service = new EvolutionService({
    projectRoot: first,
    jobsDir: 'jobs',
    harborBin: '/bin/sh',
    harborDshBin: '/bin/sh',
    runtimePolicy: 'follow-latest',
    agentImportPath: 'example:Agent',
    pluginImportPath: 'dsh-evolution',
  })
  const initial = await service.dashboard()
  const firstWorkspace = initial.workspace.id
  service.activateProjectRoot(second, 'agent-session')
  const active = await service.dashboard()

  assert.equal(active.config.projectRoot, second)
  const historical = await service.job({ workspace: firstWorkspace, job: 'same-job' })
  assert.equal(historical.artifacts.context.digest, 'sha256:first')
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
