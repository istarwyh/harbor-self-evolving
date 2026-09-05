import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, realpath, symlink, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { inspectDiagnostic, observeDiagnostic, pinDiagnosticEnvironment, readDiagnosticRuntimeIdentity } from '../lib/diagnostic-observation.js'

async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'harbor-observation-')))
  const operationId = 'hop_12345678-0000-4000-8000-123456789abc'
  const jobName = `diagnostic-${operationId.slice(4)}`
  const directory = path.join(root, 'jobs', jobName)
  await mkdir(directory, { recursive: true })
  const provenanceFile = path.join(directory, 'diagnostic-provenance.json')
  const lifecycleFile = path.join(directory, 'trial-lifecycle.json')
  const provenance = { protocol: 'harbor-diagnostic-provenance/v1', operationId, promotionEligible: false, selection: [{ trialId: 'source-a' }, { trialId: 'source-b' }] }
  const lifecycle = { schema_version: 1, job: jobName, dataset_total: 2, updated_at: '2026-09-05T00:00:00Z', trials: [{ dataset_order: 0, trial_name: 'Alpha__a123456', phase: 'infrastructure-error', terminal: true }, { dataset_order: 1, trial_name: 'Beta__b123456', phase: 'running-agent', terminal: false }] }
  await writeFile(provenanceFile, JSON.stringify(provenance))
  await writeFile(lifecycleFile, JSON.stringify(lifecycle))
  const calls = []
  const runtime = { machine: '00000000-0000-4000-8000-000000000001', daemon: 'test-daemon-a', process: 'stopped', rows: { container: '', network: '', volume: '' } }
  let probes = 0
  const runProcess = async (command, args, options) => {
    calls.push({ command, args, options })
    if (command === 'ioreg') return { code: 0, stdout: `"IOPlatformUUID" = "${runtime.machine}"` }
    assert.equal(command, 'docker')
    if (args[0] === 'context') return { code: 0, stdout: args[1] === 'inspect' ? 'unix:///test/docker.sock' : 'test-context' }
    if (args[0] === 'info') return { code: 0, stdout: runtime.daemon }
    assert.equal(args[1], 'ls', 'inspection must never mutate Docker resources')
    return { code: 0, stdout: runtime.rows[args[0]] }
  }
  const identity = await readDiagnosticRuntimeIdentity({ runProcess, platform: 'darwin' })
  const operation = { schema: 'harbor-operation/v1', operationId, status: 'FAILED', target: { workspace: 'workspace-a' }, events: [{ status: 'ACTIVE', result: { process: { pid: 12345, groupId: 12345, platform: 'darwin', dockerTransport: 'pinned-local-unix/v1', ...identity } } }] }
  const config = { jobsDir: 'jobs', projectRoot: root }
  const options = { root, platform: 'darwin', runProcess, processProbe: async pid => { probes += 1; assert.equal(pid, 12345); return runtime.process } }
  calls.length = 0
  return { root, directory, provenance, provenanceFile, lifecycle, lifecycleFile, operation, config, options, calls, runtime, probes: () => probes }
}

test('progress comes from verified lifecycle artifacts and failed/cancelled Jobs expose partial evidence', async () => {
  const f = await fixture()
  for (const status of ['FAILED', 'CANCELLED', 'INTERRUPTED', 'ACTIVE', 'COMPLETED']) {
    const value = await observeDiagnostic(f.config, { ...f.operation, status }, f.options)
    assert.deepEqual(value.resultRef, { verified: true, jobName: path.basename(f.directory), workspace: 'workspace-a', partial: status !== 'COMPLETED' })
    assert.deepEqual(value.progress, { source: 'harbor-lifecycle', total: 2, completed: 1, counts: { 'infrastructure-error': 1, 'running-agent': 1 }, updatedAt: '2026-09-05T00:00:00Z' })
  }
  assert.equal(f.calls.length, 0, 'routine progress reads must not invoke Docker')
})

test('missing, mismatched and linked provenance never produces a verified Job link or fabricated progress', async () => {
  const f = await fixture()
  await unlink(f.provenanceFile)
  assert.deepEqual(await observeDiagnostic(f.config, f.operation, f.options), {})
  await writeFile(f.provenanceFile, JSON.stringify({ ...f.provenance, operationId: 'hop_foreign' }))
  assert.equal((await observeDiagnostic(f.config, f.operation, f.options)).resultRef, undefined)
  const outside = path.join(f.root, 'foreign-provenance.json')
  await writeFile(outside, JSON.stringify(f.provenance))
  await unlink(f.provenanceFile)
  await symlink(outside, f.provenanceFile)
  const unsafe = await observeDiagnostic(f.config, f.operation, f.options)
  assert.deepEqual(unsafe, { observationWarning: 'HARBOR_DIAGNOSTIC_OBSERVATION_UNSAFE' })
  assert.doesNotMatch(JSON.stringify(unsafe), /foreign-provenance/)
  assert.equal(JSON.parse(await readFile(outside)).operationId, f.operation.operationId)
})

test('invalid lifecycle membership is unavailable, while missing lifecycle retains only verified partial Job navigation', async () => {
  const f = await fixture()
  await writeFile(f.lifecycleFile, JSON.stringify({ ...f.lifecycle, trials: [f.lifecycle.trials[0], f.lifecycle.trials[0]] }))
  const invalid = await observeDiagnostic(f.config, f.operation, f.options)
  assert.equal(invalid.progress, undefined)
  assert.equal(invalid.resultRef.verified, true)
  assert.equal(invalid.observationWarning, 'HARBOR_DIAGNOSTIC_OBSERVATION_UNSAFE')
  assert.equal((await inspectDiagnostic(f.config, f.operation, f.options)).canRecover, false)
  await unlink(f.lifecycleFile)
  const partial = await observeDiagnostic(f.config, f.operation, f.options)
  assert.equal(partial.resultRef.verified, true)
  assert.equal(partial.progress, undefined)
  const inspection = await inspectDiagnostic(f.config, f.operation, f.options)
  assert.equal(inspection.canRecover, false)
  assert.equal(inspection.resources.state, 'unknown')
})

test('recovery proves process and all owned Compose resource classes, without touching unrelated resources', async () => {
  const f = await fixture()
  f.runtime.rows.container = 'deadbeef\tunrelated-trial__env\n'
  const clean = await inspectDiagnostic(f.config, f.operation, f.options)
  assert.equal(clean.canRecover, true)
  assert.equal(clean.process.state, 'stopped')
  assert.equal(clean.resources.state, 'clean')
  assert.equal(f.probes(), 1)
  assert.deepEqual(f.calls.filter(call => call.args[1] === 'ls').map(call => call.args[0]), ['container', 'network', 'volume'])
  assert.ok(f.calls.filter(call => call.args[1] === 'ls').every(call => call.options.env.DOCKER_CONTEXT === undefined && call.options.env.DOCKER_HOST.startsWith('unix:///')))
  f.runtime.rows = { container: 'cafe1234\talpha__a123456__env\n', network: 'beef1234\tbeta__b123456__verifier__tests\n', volume: 'volume1\talpha__a123456__env\n' }
  const remaining = await inspectDiagnostic(f.config, f.operation, f.options)
  assert.equal(remaining.canRecover, false)
  assert.equal(remaining.resources.state, 'remaining')
  assert.equal(remaining.resources.items.length, 3)
  assert.ok(remaining.blockers.some(item => item.code === 'DIAGNOSTIC_RESOURCES_REMAIN'))
})

test('legacy checkpoints, another machine or a different Docker daemon cannot produce false-clean recovery', async () => {
  for (const change of ['legacy', 'machine', 'daemon']) {
    const f = await fixture()
    if (change === 'legacy') delete f.operation.events[0].result.process.hostIdentity
    if (change === 'machine') f.runtime.machine = '00000000-0000-4000-8000-000000000002'
    if (change === 'daemon') f.runtime.daemon = 'another-empty-daemon'
    const value = await inspectDiagnostic(f.config, f.operation, f.options)
    assert.equal(value.canRecover, false, change)
    assert.equal(value.process.state, 'unknown')
    assert.equal(value.resources.state, 'unknown')
    assert.equal(f.probes(), 0)
    assert.ok(value.blockers.some(item => item.code === 'DIAGNOSTIC_RUNTIME_IDENTITY_UNVERIFIED'))
    assert.equal(f.calls.some(call => call.args[1] === 'ls'), false)
  }
})

test('live/reused process group or inaccessible process state always blocks recovery', async () => {
  const f = await fixture()
  for (const state of ['running', 'unknown']) {
    f.runtime.process = state
    const value = await inspectDiagnostic(f.config, f.operation, f.options)
    assert.equal(value.canRecover, false)
    assert.equal(value.process.state, state)
    assert.equal(value.resources.state, 'clean')
  }
})

test('unavailable or malformed Docker responses are unknown, never an empty resource set', async () => {
  const f = await fixture()
  f.runtime.rows.network = '<no value>\n'
  assert.equal((await inspectDiagnostic(f.config, f.operation, f.options)).resources.state, 'unknown')
  const process = f.options.runProcess
  f.options.runProcess = (command, args, options) => args[1] === 'ls' ? Promise.reject(new Error('private-daemon-endpoint credential')) : process(command, args, options)
  const unavailable = await inspectDiagnostic(f.config, f.operation, f.options)
  assert.equal(unavailable.canRecover, false)
  assert.equal(unavailable.resources.state, 'unknown')
  assert.doesNotMatch(JSON.stringify(unavailable), /private-daemon-endpoint|credential/)
})

test('Docker daemon changing during inspection is detected by the final identity recheck', async () => {
  const f = await fixture()
  const original = f.options.runProcess
  f.options.runProcess = async (command, args, options) => {
    const response = await original(command, args, options)
    if (args[0] === 'volume') f.runtime.daemon = 'another-daemon'
    return response
  }
  const value = await inspectDiagnostic(f.config, f.operation, f.options)
  assert.equal(value.canRecover, false)
  assert.equal(value.resources.state, 'unknown')
})

test('long Trial names whose verifier namespace may be truncated are not assumed clean', async () => {
  const f = await fixture()
  f.lifecycle.trials[0].trial_name = 'long-name-'.repeat(8)
  await writeFile(f.lifecycleFile, JSON.stringify(f.lifecycle))
  const value = await inspectDiagnostic(f.config, f.operation, f.options)
  assert.equal(value.canRecover, false)
  assert.equal(value.resources.state, 'unknown')
  assert.equal(f.calls.some(call => call.args[1] === 'ls'), false)
})

test('runtime identity is hashed, and explicit Docker environment selection is preserved without persistence', async () => {
  const f = await fixture()
  const identity = await readDiagnosticRuntimeIdentity(f.options)
  assert.match(identity.hostIdentity, /^sha256:[a-f0-9]{64}$/)
  assert.match(identity.dockerIdentity, /^sha256:[a-f0-9]{64}$/)
  assert.doesNotMatch(JSON.stringify(identity), /00000000-0000|test-daemon-a/)
  f.calls.length = 0
  const explicit = { DOCKER_HOST: 'unix:///test/only.sock', DOCKER_TLS_VERIFY: '1' }
  assert.deepEqual(await pinDiagnosticEnvironment(f.options.runProcess, explicit), { DOCKER_HOST: explicit.DOCKER_HOST })
  assert.equal(f.calls.length, 0)
  assert.deepEqual(await pinDiagnosticEnvironment(f.options.runProcess, { DOCKER_CONTEXT: 'user-choice' }), { DOCKER_HOST: 'unix:///test/docker.sock' })
  assert.equal(f.calls.length, 1)
  assert.deepEqual(await pinDiagnosticEnvironment(f.options.runProcess, {}), { DOCKER_HOST: 'unix:///test/docker.sock' })
  await assert.rejects(pinDiagnosticEnvironment(f.options.runProcess, { DOCKER_HOST: 'tcp://remote:2376', DOCKER_TLS_VERIFY: '1', DOCKER_CERT_PATH: '/private/certs' }), /RUNTIME_UNSUPPORTED/)
})

test('symlinked Job parents are refused before any partial navigation', async () => {
  const f = await fixture()
  const sibling = await realpath(await mkdtemp(path.join(os.tmpdir(), 'harbor-linked-observation-')))
  await symlink(path.join(f.root, 'jobs'), path.join(sibling, 'jobs'))
  const result = await observeDiagnostic({ jobsDir: 'jobs' }, f.operation, { root: sibling })
  assert.equal(result.resultRef, undefined)
  assert.equal(result.observationWarning, 'HARBOR_DIAGNOSTIC_OBSERVATION_UNSAFE')
})
