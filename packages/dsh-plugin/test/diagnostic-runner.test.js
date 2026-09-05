import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readdir, symlink, realpath } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { DiagnosticRunner, DIAGNOSTIC_LIMITS } from '../lib/diagnostic-runner.js'

const digest = char => `sha256:${char.repeat(64)}`
function fixturePlan() {
  return {
    protocol: 'harbor-bounded-diagnostic-plan/v1', mode: 'diagnostic', promotionEligible: false,
    sourceJob: 'jobs/source', candidatePath: 'candidates/v1', datasetPath: 'dataset', stackPath: '.harbor/evaluation-stack.yml',
    candidateModelBinding: { provider: 'verified-test-provider', model: 'test-model', transport: 'dsh-host-broker', protocol: 'dsh-host-model-gateway/v1' },
    selection: [{ trialId: 'trial-1', taskId: 'task-1', taskPath: 'task-1', taskDigest: digest('a') }],
    identities: { candidate: { candidate_id: 'candidate', version: '1.0.0', digest: digest('b') }, dataset: { source_digest: digest('c') }, stack: { digest: digest('d') } },
    limits: { ...DIAGNOSTIC_LIMITS }, planDigest: digest('e'),
  }
}

async function harness(overrides = {}) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'harbor-diagnostic-runner-')))
  const calls = [], leases = [], closed = []
  const plan = fixturePlan()
  const modelRuntime = {
    async resolve(_args, pinned, options) { assert.equal(options.ignoreConfigured, true); return { ...pinned, model_info: { id: pinned.model } } },
    async assertLeaseLimits(_binding, scope) { assert.deepEqual(scope, { maxRequests: 96, maxResponseBytes: 1_048_576 }); return scope },
    async openLease(binding, scope) {
      leases.push({ binding, scope })
      return { endpoint: 'http://127.0.0.1:9/test', token: 'temporary-gateway-test-secret', candidateProvider: 'gateway', modelInfo: { id: binding.model }, protocol: binding.protocol, async close() { closed.push(true) } }
    },
    ...overrides.modelRuntime,
  }
  const materialized = { ...plan, datasetPath: '.harbor/diagnostic-datasets/hop_test-1', datasetIdentity: { source_digest: digest('f'), task_count: 1 } }
  const runProcess = async (command, args, options) => {
    calls.push({ command, args, options })
    const override = await overrides.process?.(command, args, options, { root, plan, materialized })
    if (override !== undefined) return override
    if (args[0] === 'diagnostic-subset') return { code: 0, stdout: JSON.stringify(args[1] === 'plan' ? plan : materialized), stderr: '' }
    if (args[0] === 'docker-check') return { code: 0, stdout: '{"valid":true}', stderr: '' }
    if (args[0] === '--version') return { code: 0, stdout: 'harbor 0.21.3', stderr: '' }
    if (args[0] === 'run') {
      await options.onSpawn(42)
      const job = args[args.indexOf('--job-name') + 1]
      const jobDir = path.join(root, 'jobs', job)
      await mkdir(jobDir, { recursive: true })
      const context = { schema_version: 2, mode: 'diagnostic', candidate: { digest: digest('b') }, dataset: { source_digest: digest('f') }, evaluation_stack: { digest: digest('d') }, full_digest: digest('a') }
      await writeFile(path.join(jobDir, 'evaluation-context.json'), JSON.stringify(context))
      await writeFile(path.join(jobDir, 'evaluation-summary.json'), JSON.stringify({ schema_version: 3, job, mode: 'diagnostic', n_trials: 1, n_discovered_trials: 1, n_valid_scores: 1, artifact_validation: { valid: true }, evaluation_context: context }))
      return { code: 0, stdout: 'test double completed', stderr: '' }
    }
    assert.fail(`Unexpected process arguments ${args[0]}`)
  }
  const owner = { sessionId: 'session-1', projectRoot: root }
  return { root, owner, calls, leases, closed, plan, materialized, runner: new DiagnosticRunner({ projectRoot: root, jobsDir: 'jobs', harborDshBin: 'harbor-dsh-test-double', harborBin: 'harbor-test-double' }, modelRuntime, { runProcess, platform: overrides.platform }) }
}

test('prepare is read-only and does not open a lease, materialize or launch a Job', async () => {
  const h = await harness()
  const plan = await h.runner.prepare({ owner: h.owner, sourceJobDir: 'jobs/source', trialIds: ['trial-1'] })
  assert.equal(plan.planDigest, h.plan.planDigest)
  assert.deepEqual(await readdir(h.root), [])
  assert.equal(h.leases.length, 0)
  assert.deepEqual(h.calls.map(call => call.args.slice(0, 2)), [['diagnostic-subset', 'plan'], ['docker-check'], ['--version']])
  assert.deepEqual(JSON.parse(h.calls[0].options.input), { projectRoot: h.root, sourceJobDir: path.join(h.root, 'jobs/source'), trialIds: ['trial-1'] })
})

test('execute uses the fixed bounded CLI and a scoped lease, never promotion flags', async () => {
  const h = await harness()
  const spawns = []
  const result = await h.runner.execute(h.plan, { owner: h.owner, operationId: 'hop_test-1', onSpawn: (pid, detail) => spawns.push({ pid, detail }) })
  const call = h.calls.find(call => call.args[0] === 'run')
  assert.deepEqual(call.args.slice(call.args.indexOf('-n'), call.args.indexOf('-n') + 8), ['-n', '2', '-k', '1', '--max-retries', '0', '-e', 'docker'])
  assert.ok(call.args.includes('mode=diagnostic'))
  assert.ok(call.args.includes('harbor_dsh_evolution.agent:DshCandidateAgent'))
  assert.ok(call.args.includes('harbor_dsh_evolution.diagnostic_plugin:BoundedDiagnosticPlugin'))
  assert.doesNotMatch(JSON.stringify(call.args), /secret|promotion-eligible|policy_path/)
  assert.equal(call.options.timeoutMs, 900_000)
  assert.equal(call.options.killGraceMs, 30_000)
  assert.equal(call.options.env.HSE_MODEL_GATEWAY_TOKEN, 'temporary-gateway-test-secret')
  assert.deepEqual(h.leases[0].scope, { candidateDigest: digest('b'), jobName: 'diagnostic-test-1', maxRequests: 96, maxResponseBytes: 1_048_576 })
  assert.equal(h.closed.length, 1)
  assert.equal(spawns[0].pid, 42)
  assert.equal(spawns[0].detail.job, 'diagnostic-test-1')
  assert.equal(result.schema, 'harbor-diagnostic-operation-result/v1')
  assert.equal(result.jobName, 'diagnostic-test-1')
  assert.equal(result.job, result.jobName)
  assert.equal(result.promotionEligible, false)
  assert.doesNotMatch(JSON.stringify(result), /temporary-gateway-test-secret|model_info/)
})

test('execution rejects a changed preflight without a lease or materialization', async () => {
  const h = await harness()
  await assert.rejects(h.runner.execute({ ...h.plan, planDigest: digest('a') }, { owner: h.owner, operationId: 'hop_test-1' }), /REVISION_CONFLICT/)
  assert.equal(h.leases.length, 0)
  assert.equal(h.calls.some(call => call.args[1] === 'materialize'), false)
})

test('execution cannot be replayed when the deterministic Job already exists', async () => {
  const h = await harness()
  await mkdir(path.join(h.root, 'jobs/diagnostic-test-1'), { recursive: true })
  await assert.rejects(h.runner.execute(h.plan, { owner: h.owner, operationId: 'hop_test-1' }), /ALREADY_STARTED/)
  assert.equal(h.leases.length, 0)
})

test('unsupported broker budgets block before materialization or lease', async () => {
  const h = await harness({ modelRuntime: { async assertLeaseLimits() { throw new Error('HARBOR_MODEL_LIMIT_UNSUPPORTED: the broker cannot enforce the response cap') } } })
  await assert.rejects(h.runner.prepare({ owner: h.owner, sourceJobDir: 'jobs/source', trialIds: ['trial-1'] }), /MODEL_LIMIT_UNSUPPORTED/)
  assert.equal(h.calls.some(call => call.args[1] === 'materialize'), false)
  assert.equal(h.leases.length, 0)
})

test('runtime blockers are actionable and cannot start a Job', async () => {
  const h = await harness({ process: (_command, args) => args[0] === 'docker-check' ? { code: 2, stdout: '{"valid":false,"findings":[{"level":"error","code":"DOCKER_DAEMON_UNAVAILABLE","message":"/secret/path"}]}', stderr: '' } : undefined })
  await assert.rejects(h.runner.prepare({ owner: h.owner, sourceJobDir: 'jobs/source', trialIds: ['trial-1'] }), error => /RUNTIME_BLOCKED.*DOCKER_DAEMON_UNAVAILABLE/.test(error.message) && !/secret/.test(error.message))
  assert.equal(h.leases.length, 0)
})

test('wrong model binding fails closed instead of silently switching models', async () => {
  const h = await harness({ modelRuntime: { async resolve() { return { provider: 'other', model: 'other' } } } })
  await assert.rejects(h.runner.prepare({ owner: h.owner, sourceJobDir: 'jobs/source', trialIds: ['trial-1'] }), /MODEL_CHANGED/)
})

test('process failures close the lease and do not expose private stderr', async () => {
  const h = await harness({ process: (_command, args) => { if (args[0] === 'run') throw Object.assign(new Error('execution failed'), { code: 'HARBOR_PROCESS_EXIT_FAILED', result: { stderr: 'Authorization: Bearer hidden-model-secret' } }) } })
  await assert.rejects(h.runner.execute(h.plan, { owner: h.owner, operationId: 'hop_test-1' }), error => error.code === 'HARBOR_PROCESS_EXIT_FAILED' && !JSON.stringify(error).includes('hidden-model-secret'))
  assert.equal(h.closed.length, 1)
})

test('process exit zero is not completion when authoritative artifacts are missing', async () => {
  const h = await harness({ process: (_command, args) => args[0] === 'run' ? { code: 0, stdout: '', stderr: '' } : undefined })
  await assert.rejects(h.runner.execute(h.plan, { owner: h.owner, operationId: 'hop_test-1' }), /EXECUTION_FAILED/)
  assert.equal(h.closed.length, 1)
})

test('an abort before execute has zero subprocess or lease side effects', async () => {
  const h = await harness()
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(h.runner.execute(h.plan, { owner: h.owner, operationId: 'hop_test-1', signal: controller.signal }), /PROCESS_ABORTED/)
  assert.equal(h.calls.length, 0)
  assert.equal(h.leases.length, 0)
})

test('a cross-project owner and a symlink Job output are both denied', async () => {
  const h = await harness()
  const other = await mkdtemp(path.join(os.tmpdir(), 'harbor-diagnostic-other-'))
  await assert.rejects(h.runner.prepare({ owner: { ...h.owner, projectRoot: other }, sourceJobDir: 'jobs/source', trialIds: ['trial-1'] }), /SOURCE_DENIED/)
  await symlink(other, path.join(h.root, 'jobs'))
  await assert.rejects(h.runner.execute(h.plan, { owner: h.owner, operationId: 'hop_test-1' }), /SOURCE_DENIED/)
  assert.equal(h.leases.length, 0)
})

test('Windows is denied until process-tree cancellation is supported', async () => {
  const h = await harness({ platform: 'win32' })
  await assert.rejects(h.runner.prepare({ owner: h.owner, sourceJobDir: 'jobs/source', trialIds: ['trial-1'] }), /RUNTIME_UNSUPPORTED/)
})

test('an adapter cannot enlarge the server-side quotas', async () => {
  const h = await harness({ process: (_command, args, _options, { plan }) => args[0] === 'diagnostic-subset' ? { code: 0, stdout: JSON.stringify({ ...plan, limits: { ...plan.limits, maxTrials: 1000 } }), stderr: '' } : undefined })
  await assert.rejects(h.runner.prepare({ owner: h.owner, sourceJobDir: 'jobs/source', trialIds: ['trial-1'] }), /PLAN_INVALID/)
  assert.equal(h.leases.length, 0)
})

test('an interrupted spawned process preserves cleanup uncertainty and the exact Job identity', async () => {
  const h = await harness({ process: async (_command, args, options) => {
    if (args[0] === 'run') {
      await options.onSpawn(42)
      throw Object.assign(new Error('cancelled'), { code: 'HARBOR_PROCESS_ABORTED', result: { stderr: 'private secret material' } })
    }
  } })
  await assert.rejects(h.runner.execute(h.plan, { owner: h.owner, operationId: 'hop_test-1' }), error => error.cleanupRequired === true && error.jobName === 'diagnostic-test-1' && error.code === 'HARBOR_PROCESS_ABORTED' && !JSON.stringify(error).includes('private secret material'))
  assert.equal(h.closed.length, 1)
})

test('effective Host limits are returned and cannot expand after review', async () => {
  const h = await harness({ modelRuntime: { async assertLeaseLimits() { return { maxRequests: 8, maxResponseBytes: 1024 } } } })
  const prepared = await h.runner.prepare({ owner: h.owner, sourceJobDir: 'jobs/source', trialIds: ['trial-1'] })
  assert.equal(prepared.effectiveLimits.maxModelRequests, 8)
  const result = await h.runner.execute(prepared, { owner: h.owner, operationId: 'hop_test-1' })
  assert.equal(h.leases[0].scope.maxRequests, 8)
  assert.equal(result.limits.maxResponseBytes, 1024)
  await assert.rejects(h.runner.execute({ ...prepared, effectiveLimits: { ...prepared.effectiveLimits, maxModelRequests: 4 } }, { owner: h.owner, operationId: 'hop_test-2' }), /REVISION_CONFLICT/)
})
