import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { prepareEvaluatorSaveHistory, readEvaluatorSave, recordEvaluatorSave } from '../lib/evaluator-saves.js'
import { EvolutionService } from '../lib/service.js'

const digest = character => `sha256:${character.repeat(64)}`
const owner = { sessionId: 'session-a', workspace: 'workspace-a', job: 'historical-job' }
const governance = { stackIdentity: { id: 'stack-a', version: '1.0.0', digest: digest('b') }, components: { evaluator: { id: 'evaluator-a', version: '1.0.0', entry: 'stack/evaluator.json', digest: digest('b') } }, contextDigest: digest('c') }
const saved = () => ({
  stack: { id: 'stack-a', version: '1.0.1', path: '.harbor/evaluation-stack.yml' },
  evaluator: { evaluator_id: 'evaluator-a', version: '1.0.1', descriptor_path: 'stack/1.0.1/evaluator.json', digest: digest('a'), editable_files: [{ path: 'stack/1.0.1/rubric.md', text: 'New source should not be duplicated into the journal', digest: digest('d') }] },
  requires_fresh_baseline: true, automatic_evaluation: false, automatic_gate: false,
})
const fixture = async () => {
  const config = { projectRoot: await mkdtemp(path.join(os.tmpdir(), 'harbor-evaluator-saves-')) }
  await mkdir(path.join(config.projectRoot, '.harbor'))
  await writeFile(path.join(config.projectRoot, '.harbor/evaluation-stack.yml'), 'fixture stack version 1.0.1')
  return config
}
const journalFile = async config => path.join(config.projectRoot, '.harbor', 'workbench-evaluator-saves', (await readdir(path.join(config.projectRoot, '.harbor', 'workbench-evaluator-saves'))).find(file => file.endsWith('.json')))

test('saved-version entry survives a fresh reader and uses reverified live source, not persisted text', async () => {
  const config = await fixture()
  const receipt = saved()
  const returned = await recordEvaluatorSave(config, owner, governance, receipt)
  assert.equal(returned.continuation.durable, true)
  const bytes = await readFile(await journalFile(config), 'utf8')
  assert.equal(bytes.includes(receipt.evaluator.editable_files[0].text), false)
  assert.equal(bytes.includes('editable_files'), false)
  const recovered = await readEvaluatorSave({ ...config }, { ...owner }, structuredClone(governance), structuredClone(receipt))
  assert.equal(recovered.continuation.recovered, true)
  assert.equal(recovered.continuation.verification, 'VERIFIED')
  assert.deepEqual(recovered.evaluator.editable_files, receipt.evaluator.editable_files)
  assert.equal(governance.components.evaluator.version, '1.0.0', 'source Job identity must remain historical')
})

test('Session, workspace, source Job, and project root isolate identical version names', async () => {
  const config = await fixture()
  await recordEvaluatorSave(config, owner, governance, saved())
  for (const scope of [{ ...owner, sessionId: 'session-b' }, { ...owner, workspace: 'workspace-b' }, { ...owner, job: 'other-job' }]) assert.equal(await readEvaluatorSave(config, scope, governance, saved()), undefined)
  assert.equal(await readEvaluatorSave(await fixture(), owner, governance, saved()), undefined)
  await assert.rejects(readEvaluatorSave(config, { ...owner, sessionId: '' }, governance, saved()), /HARBOR_EVALUATOR_SAVE_HISTORY_UNAVAILABLE/)
})

test('changed or unavailable live identities preserve saved metadata but cannot masquerade as verified source', async () => {
  const config = await fixture()
  await recordEvaluatorSave(config, owner, governance, saved())
  for (const change of [value => { value.stack.version = '1.0.2' }, value => { value.evaluator.digest = digest('e') }, value => { value.evaluator.descriptor_path = 'another/evaluator.json' }]) {
    const current = saved(); change(current)
    const recovered = await readEvaluatorSave(config, owner, governance, current)
    assert.equal(recovered.continuation.verification, 'DRIFTED')
    assert.equal(recovered.stack.version, '1.0.1')
    assert.equal(recovered.evaluator.editable_files, undefined)
  }
  const unavailable = await readEvaluatorSave(config, owner, governance, undefined)
  assert.equal(unavailable.continuation.verification, 'UNAVAILABLE')
  assert.equal(unavailable.evaluator.editable_files, undefined)
  await writeFile(path.join(config.projectRoot, saved().stack.path), 'Judge parameters changed without a version bump')
  const changedStack = await readEvaluatorSave(config, owner, governance, saved())
  assert.equal(changedStack.continuation.verification, 'DRIFTED', 'same version labels must not hide Stack file changes')
})

test('rewritten historical identity or journal owner cannot inherit another save', async () => {
  const config = await fixture()
  await recordEvaluatorSave(config, owner, governance, saved())
  await assert.rejects(readEvaluatorSave(config, owner, { ...governance, contextDigest: digest('e') }, saved()), /HARBOR_EVALUATOR_SAVE_HISTORY_UNAVAILABLE/)
  const file = await journalFile(config)
  const record = JSON.parse(await readFile(file, 'utf8'))
  record.scope.sessionId = 'session-b'
  await writeFile(file, JSON.stringify(record))
  await assert.rejects(readEvaluatorSave(config, owner, governance, saved()), /HARBOR_EVALUATOR_SAVE_HISTORY_UNAVAILABLE/)
})

test('a saved non-default Stack path is re-read explicitly instead of substituting the default discovered Stack', async () => {
  const config = await fixture()
  const value = saved()
  value.stack.path = '.harbor/custom-stack.yml'
  await writeFile(path.join(config.projectRoot, value.stack.path), 'custom stack')
  await recordEvaluatorSave(config, owner, governance, value)
  const reads = []
  const recovered = await readEvaluatorSave(config, owner, governance, saved(), async stackPath => { reads.push(stackPath); return value })
  assert.deepEqual(reads, ['.harbor/custom-stack.yml'])
  assert.equal(recovered.continuation.verification, 'VERIFIED')
  const unavailable = await readEvaluatorSave(config, owner, governance, saved(), async () => { throw new Error('unavailable') })
  assert.equal(unavailable.continuation.verification, 'UNAVAILABLE')
})

test('unsafe journals fail closed and never create files outside the workspace', async () => {
  const config = await fixture()
  const outside = await fixture()
  await symlink(outside.projectRoot, path.join(config.projectRoot, '.harbor', 'workbench-evaluator-saves'))
  await assert.rejects(prepareEvaluatorSaveHistory(config, owner), /HARBOR_EVALUATOR_SAVE_HISTORY_UNAVAILABLE/)
  await assert.rejects(readEvaluatorSave(config, owner, governance, saved()), /HARBOR_EVALUATOR_SAVE_HISTORY_UNAVAILABLE/)
  assert.deepEqual(await readdir(outside.projectRoot), ['.harbor'])
})

test('malformed, oversized, and traversal-bearing receipts are never restored', async () => {
  const config = await fixture()
  await recordEvaluatorSave(config, owner, governance, saved())
  const file = await journalFile(config)
  const record = JSON.parse(await readFile(file, 'utf8'))
  for (const bytes of ['{broken', 'x'.repeat(16 * 1024 + 1), JSON.stringify({ ...record, receipt: { ...record.receipt, stack: { ...record.receipt.stack, path: '../outside.yml' } } })]) {
    await writeFile(file, bytes)
    await assert.rejects(readEvaluatorSave(config, owner, governance, saved()))
  }
})

test('browser save binds its source Job and governance recovers it after a new service instance', async () => {
  const config = await fixture()
  config.jobsDir = 'jobs'
  config.timeoutMs = 5000
  config.harborDshBin = path.join(config.projectRoot, 'fixture-cli.mjs')
  const jobDirectory = path.join(config.projectRoot, 'jobs', owner.job)
  await mkdir(jobDirectory, { recursive: true })
  await mkdir(path.join(config.projectRoot, '.harbor'), { recursive: true })
  await mkdir(path.join(config.projectRoot, 'stack'), { recursive: true })
  await writeFile(path.join(config.projectRoot, '.harbor/evaluation-stack.yml'), 'fixture')
  await writeFile(path.join(config.projectRoot, 'stack/evaluator.json'), '{}')
  await writeFile(path.join(jobDirectory, 'evaluation-stack-manifest.json'), JSON.stringify({ stack_id: 'stack-a', version: '1.0.0', digest: digest('b'), components: governance.components }))
  await writeFile(path.join(jobDirectory, 'evaluation-context.json'), JSON.stringify({ digest: governance.contextDigest }))
  const before = { ...saved(), stack: { ...saved().stack, version: '1.0.0' }, evaluator: { ...saved().evaluator, version: '1.0.0', descriptor_path: 'stack/evaluator.json', digest: digest('b') } }
  const state = path.join(config.projectRoot, 'fixture-inspection.json')
  await writeFile(state, JSON.stringify(before))
  await writeFile(config.harborDshBin, `#!/usr/bin/env node\nimport { readFileSync, writeFileSync } from 'node:fs';\nconst state = ${JSON.stringify(state)};\nif (process.argv[3] === 'update') writeFileSync(state, JSON.stringify(${JSON.stringify(saved())}));\nprocess.stdout.write(readFileSync(state, 'utf8'));\n`, { mode: 0o700 })
  const create = () => {
    const service = new EvolutionService(config)
    service.activateProjectRoot(config.projectRoot, 'agent-session', owner.sessionId)
    return service
  }
  const service = create()
  const dashboard = await service.dashboard({ sessionId: owner.sessionId })
  const args = { sessionId: owner.sessionId, workspace: dashboard.workspace.id, job: owner.job }
  await assert.rejects(service.evaluator({ content: 'unscoped browser edit' }, { browser: true }), /HARBOR_EVALUATOR_SOURCE_REQUIRED/)
  const result = await service.evaluator({ ...args, filePath: 'stack/rubric.md', content: 'edited', expectedDigest: digest('d'), newEvaluatorVersion: '1.0.1', newStackVersion: '1.0.1' })
  assert.equal(result.continuation.durable, true)
  const recovered = await create().governance(args)
  assert.equal(recovered.components.evaluator.version, '1.0.0')
  assert.equal(recovered.editingPolicy.identityMatch, false)
  assert.equal(recovered.savedEvaluatorVersion.evaluator.version, '1.0.1')
  assert.equal(recovered.savedEvaluatorVersion.continuation.verification, 'VERIFIED')
  await assert.rejects(service.evaluator({ ...args, job: undefined, content: 'another edit' }), /HARBOR_EVALUATOR_SOURCE_REQUIRED/)
  await assert.rejects(service.evaluator({ ...args, content: 'another edit' }), /HARBOR_EVALUATOR_BINDING_STALE/)
  const other = create()
  other.activateProjectRoot(config.projectRoot, 'agent-session', 'session-other')
  assert.equal((await other.governance({ ...args, sessionId: 'session-other' })).savedEvaluatorVersion, undefined)
})
