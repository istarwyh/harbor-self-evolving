import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { apply, synchronizeWorkbenchProjectRoot } from '../index.js'
import { historicalRunLock } from '../lib/historical-run-lock.js'

test('Cordis plugin registers the bundled evolution Skill and strict architecture tools', () => {
  const tools = []
  const skills = []
  const ctx = {
    skills: { register(skill) { skills.push(skill) } },
    tools: { register(tool) { tools.push(tool) } },
    on() {},
  }
  apply(ctx, {
    projectRoot: '.',
    jobsDir: 'jobs',
    harborBin: 'harbor',
    harborDshBin: 'harbor-dsh',
    agentImportPath: 'harbor_dsh_evolution.agent:DshCandidateAgent',
    pluginImportPath: 'dsh-evolution',
    pythonPath: '',
    timeoutMs: 1000,
  })
  assert.deepEqual(tools.map(tool => tool.name), [
    'harbor_candidate_snapshot',
    'harbor_model_binding',
    'harbor_evolution_init',
    'harbor_evolution_doctor',
    'harbor_quick_diagnostic_init',
    'harbor_session_diagnostic_preview',
    'harbor_session_diagnostic_run',
    'harbor_dataset_validate',
    'harbor_context_preview',
    'harbor_eval_run',
    'harbor_eval_result',
    'harbor_resolve_page_context',
    'harbor_get_evidence',
    'harbor_evaluator_inspect',
    'harbor_evaluator_update',
    'harbor_ground_truth_init',
    'harbor_evaluator_meta_evaluate',
    'harbor_candidate_compare',
  ])
  assert.equal(skills.length, 1)
  assert.equal(skills[0].name, 'evolve-agent-with-harbor')
  assert.equal(skills[0].invocation.modelInvocable, true)
  assert.equal(skills[0].invocation.userInvocable, true)
  assert.equal(skills[0].resourceBase.kind, 'directory')
  assert.equal(existsSync(skills[0].path), true)
  assert.match(skills[0].description, /self-evolution/)
  assert.match(skills[0].content, /harbor_candidate_snapshot/)
  assert.match(skills[0].content, /Evaluation Stack/)
  assert.match(skills[0].content, /评测集 \(Dataset\)/)
  assert.match(skills[0].content, /生成器 \(Generator\)/)
  assert.match(skills[0].content, /评测器（含评测标准） \(Evaluator\)/)
  assert.match(skills[0].content, /优化器 \(Optimizer\)/)
  assert.match(skills[0].content, /harbor_model_binding/)
  assert.match(skills[0].content, /Synthesize one Dataset-level recommendation/)
  assert.match(skills[0].content, /评测集整体优化建议/)
  assert.match(skills[0].content, /including every server-side page/)
  assert.match(skills[0].content, /Never ask a first-time user to enumerate Evaluation Stack roles/)
  assert.match(skills[0].content, /derive `projectRoot` from the calling session/)
  assert.doesNotMatch(skills[0].content, /configured to a different `projectRoot`/)
  assert.doesNotMatch(skills[0].content, /Obtain:\s*\n\s*1\. Business behavior/)
  assert.doesNotMatch(skills[0].content, /^---/)

  const pageContextTool = tools.find(tool => tool.name === 'harbor_resolve_page_context')
  assert.deepEqual(pageContextTool.parameters.required, ['contextSnapshotId'])
  assert.deepEqual(Object.keys(pageContextTool.parameters.properties), ['contextSnapshotId'])
  assert.match(pageContextTool.description, /exact calling DSH Session/)
  assert.match(pageContextTool.description, /read-only/)
  assert.equal(pageContextTool.output.schema.type, 'object')
  const evidenceTool = tools.find(tool => tool.name === 'harbor_get_evidence')
  assert.deepEqual(evidenceTool.parameters.required, ['workspace', 'job', 'trial', 'criterion', 'evidenceRef'])
  assert.match(evidenceTool.description, /untrusted Harbor evidence/)
  assert.equal(evidenceTool.output.schema.type, 'object')
})

test('Agent-requested Harbor mutations require one-shot approval after downstream policy', async () => {
  const hooks = []
  const ctx = {
    skills: { register() {} },
    tools: { register() {} },
    on(event, handler, options) { hooks.push({ event, handler, options }) },
  }
  apply(ctx, {
    projectRoot: '.',
    jobsDir: 'jobs',
    harborBin: 'harbor',
    harborDshBin: 'harbor-dsh',
    agentImportPath: 'harbor_dsh_evolution.agent:DshCandidateAgent',
    pluginImportPath: 'dsh-evolution',
    pythonPath: '',
    timeoutMs: 1000,
  })

  const hook = hooks.find(item => item.event === 'tools/pre-execute')
  assert.ok(hook)
  assert.equal(hook.options?.prepend, true)

  const mutating = [
    'harbor_candidate_snapshot',
    'harbor_evolution_init',
    'harbor_quick_diagnostic_init',
    'harbor_context_preview',
    'harbor_session_diagnostic_run',
    'harbor_eval_run',
    'harbor_evaluator_update',
    'harbor_ground_truth_init',
    'harbor_evaluator_meta_evaluate',
    'harbor_candidate_compare',
  ]
  for (const name of mutating) {
    const decision = await hook.handler({ name }, async () => ({ kind: 'allow' }))
    assert.equal(decision.kind, 'ask', `${name} must require approval`)
    assert.match(decision.reason, new RegExp(`^Harbor tool ${name} `))
    assert.doesNotMatch(decision.reason, /argument|token|secret|path/i)
  }

  assert.deepEqual(
    await hook.handler({ name: 'harbor_get_evidence' }, async () => ({ kind: 'allow' })),
    { kind: 'allow' },
  )
  assert.deepEqual(
    await hook.handler({ name: 'harbor_eval_run' }, async () => ({ kind: 'deny', reason: 'owner policy' })),
    { kind: 'deny', reason: 'owner policy' },
  )
})

test('plugin registration fails closed when the DSH approval hook is unavailable', () => {
  const tools = []
  const skills = []
  assert.throws(() => apply({
    skills: { register(skill) { skills.push(skill) } },
    tools: { register(tool) { tools.push(tool) } },
  }, {
    projectRoot: '.',
    jobsDir: 'jobs',
    harborBin: 'harbor',
    harborDshBin: 'harbor-dsh',
    agentImportPath: 'harbor_dsh_evolution.agent:DshCandidateAgent',
    pluginImportPath: 'dsh-evolution',
    pythonPath: '',
    timeoutMs: 1000,
  }), error => {
    assert.equal(error.code, 'HARBOR_APPROVAL_HOOK_UNAVAILABLE')
    assert.match(error.message, /^HARBOR_APPROVAL_HOOK_UNAVAILABLE:/)
    return true
  })
  assert.equal(tools.length, 0)
  assert.equal(skills.length, 0)
})

test('published package exposes the DSH bundle patch', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  )

  assert.equal(packageJson.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(packageJson.exports['./cordis.patch.yml'], './cordis.patch.yml')
  assert.equal(packageJson.exports['./schemas/evaluation-result.schema.json'], './schemas/evaluation-result.schema.json')
  assert.equal(packageJson.exports['./schemas/evaluation-result-v2.schema.json'], './schemas/evaluation-result-v2.schema.json')
  assert.equal(packageJson.exports['./schemas/historical-generation-batch.schema.json'], './schemas/historical-generation-batch.schema.json')
  assert.equal(packageJson.exports['./schemas/dsh-session-observation.schema.json'], './schemas/dsh-session-observation.schema.json')
  assert.equal(packageJson.exports['./schemas/historical-evaluation-context.schema.json'], './schemas/historical-evaluation-context.schema.json')
  assert.equal(packageJson.exports['./schemas/historical-evaluation-summary.schema.json'], './schemas/historical-evaluation-summary.schema.json')
  assert.equal(packageJson.exports['./schemas/ground-truth.schema.json'], './schemas/ground-truth.schema.json')
  assert.deepEqual(packageJson.harborEvolution, {
    runtimePolicy: 'follow-latest',
    dshRuntimeVersion: 'latest',
    candidateAcpPackage: '@deepseek-ai/dsh-acp-demo@latest',
  })
})

test('model binding tool snapshots the current model without exposing Host credentials', async () => {
  const tools = []
  const ctx = {
    skills: { register() {} },
    tools: { register(tool) { tools.push(tool) } },
    on() {},
    agentDefaultModel: { currentSelection: () => ({ provider: 'other', model: 'model-a', reasoningEffort: 'high' }) },
    llm: {
      listProviders: () => [{ id: 'other' }],
      resolveModelInfo: async (_provider, model) => ({ id: model }),
    },
    get: () => undefined,
  }
  apply(ctx, {
    projectRoot: '.', jobsDir: 'jobs', harborBin: 'harbor', harborDshBin: 'harbor-dsh',
    agentImportPath: 'harbor_dsh_evolution.agent:DshCandidateAgent',
    pluginImportPath: 'dsh-evolution', pythonPath: '', timeoutMs: 1000,
    candidateProvider: '', candidateModel: '', candidateReasoningEffort: '',
  })

  const tool = tools.find(item => item.name === 'harbor_model_binding')
  const result = JSON.parse(await tool.execute({}, toolExecution(path.resolve('.'))))

  assert.deepEqual(result.candidate_model_binding, {
    schema_version: 1,
    source: 'skill-agent-default',
    provider: 'other',
    model: 'model-a',
    reasoning_effort: 'high',
  })
  assert.equal(result.transport, 'dsh-host-broker')
  assert.doesNotMatch(JSON.stringify(result), /auth\.json|api[_-]?key|token/i)
})

function toolExecution(cwd) {
  return {
    agent: { session: { header: { id: `session-at-${cwd}`, cwd } } },
  }
}

test('Session diagnostic tools remain registered and fail explicitly without Session Query capability', async () => {
  const tools = []
  const root = await mkdtemp(path.join(os.tmpdir(), 'harbor-no-session-query-'))
  apply({
    skills: { register() {} },
    tools: { register(tool) { tools.push(tool) } },
    on() {},
    get() { return undefined },
  }, {
    projectRoot: root,
    jobsDir: 'jobs',
    harborBin: 'harbor',
    harborDshBin: 'harbor-dsh',
    agentImportPath: 'harbor_dsh_evolution.agent:DshCandidateAgent',
    pluginImportPath: 'dsh-evolution',
    pythonPath: '',
    timeoutMs: 1000,
  })

  const preview = tools.find(tool => tool.name === 'harbor_session_diagnostic_preview')
  assert.ok(preview.parameters.properties.evaluatorProvider)
  const run = tools.find(tool => tool.name === 'harbor_session_diagnostic_run')
  assert.equal(run.parameters.properties.evaluatorProvider, undefined)
  await assert.rejects(
    preview.execute({}, toolExecution(root)),
    /DSH_SESSION_QUERY_UNAVAILABLE/,
  )
})

test('Agent Historical Run shares the process lock and releases it on every failure path', async () => {
  const tools = []
  const root = await mkdtemp(path.join(os.tmpdir(), 'harbor-shared-run-lock-'))
  apply({
    skills: { register() {} },
    tools: { register(tool) { tools.push(tool) } },
    on() {},
    get() { return undefined },
  }, {
    projectRoot: root,
    jobsDir: 'jobs',
    harborBin: 'harbor',
    harborDshBin: 'harbor-dsh',
    agentImportPath: 'harbor_dsh_evolution.agent:DshCandidateAgent',
    pluginImportPath: 'dsh-evolution',
    pythonPath: '',
    timeoutMs: 1000,
  })
  const run = tools.find(tool => tool.name === 'harbor_session_diagnostic_run')
  const webLease = historicalRunLock.acquire(
    { projectRoot: root, jobsDir: 'jobs' },
    { channel: 'web' },
  )
  await assert.rejects(
    run.execute({ selectionToken: 'not-consumed-while-busy' }, toolExecution(root)),
    error => error.code === 'HISTORICAL_JOB_ALREADY_RUNNING',
  )
  webLease.release()

  await assert.rejects(
    run.execute({ selectionToken: 'invalid-token' }, toolExecution(root)),
    /TOKEN_INVALID/,
  )
  const afterFailure = historicalRunLock.acquire(
    { projectRoot: root, jobsDir: 'jobs' },
    { channel: 'verification' },
  )
  afterFailure.release()
})

test('Agent tool invocation activates its Session root for the shared Web Workbench', () => {
  const current = path.resolve('/tmp/harbor-current-session')
  let activated
  const service = {
    activateProjectRoot(projectRoot, source) { activated = { projectRoot, source } },
  }

  assert.equal(synchronizeWorkbenchProjectRoot(service, toolExecution(current)), current)
  assert.deepEqual(activated, { projectRoot: current, source: 'agent-session' })
})

async function writeCandidate(projectRoot, name) {
  const candidate = path.join(projectRoot, 'candidate')
  await mkdir(candidate, { recursive: true })
  await writeFile(path.join(candidate, 'cordis.yml'), '- name: demo\n')
  await writeFile(path.join(candidate, 'package.json'), `${JSON.stringify({ name, version: '1.0.0' })}\n`)
  await writeFile(path.join(candidate, 'package-lock.json'), `${JSON.stringify({ name, version: '1.0.0', lockfileVersion: 3 })}\n`)
}

test('Agent tools isolate concurrent calls by the calling session working directory', async () => {
  const configuredRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-configured-root-'))
  const firstRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-session-first-'))
  const secondRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-session-second-'))
  await Promise.all([
    writeCandidate(firstRoot, 'first-candidate'),
    writeCandidate(secondRoot, 'second-candidate'),
  ])
  const tools = []
  apply({
    skills: { register() {} },
    tools: { register(tool) { tools.push(tool) } },
    on() {},
  }, {
    projectRoot: configuredRoot,
    jobsDir: 'jobs',
    harborBin: 'harbor',
    harborDshBin: 'harbor-dsh',
    agentImportPath: 'harbor_dsh_evolution.agent:DshCandidateAgent',
    pluginImportPath: 'dsh-evolution',
    pythonPath: '',
    timeoutMs: 1000,
  })

  const snapshot = tools.find(tool => tool.name === 'harbor_candidate_snapshot')
  const [first, second] = await Promise.all([
    snapshot.execute({ candidatePath: 'candidate' }, toolExecution(firstRoot)),
    snapshot.execute({ candidatePath: 'candidate' }, toolExecution(secondRoot)),
  ])

  assert.equal(JSON.parse(first).candidate_id, 'first-candidate')
  assert.equal(JSON.parse(second).candidate_id, 'second-candidate')
  assert.equal(existsSync(path.join(firstRoot, 'candidate', 'candidate-manifest.json')), true)
  assert.equal(existsSync(path.join(secondRoot, 'candidate', 'candidate-manifest.json')), true)
  assert.equal(existsSync(path.join(configuredRoot, 'candidate', 'candidate-manifest.json')), false)
  await assert.rejects(
    snapshot.execute({ candidatePath: '../outside' }, toolExecution(firstRoot)),
    /must stay under projectRoot/,
  )
  await assert.rejects(
    snapshot.execute({ candidatePath: 'candidate' }, {}),
    /Agent session with an absolute working directory/,
  )
})

test('bundled Skill ships realistic low-friction onboarding evals', async () => {
  const evals = JSON.parse(
    await readFile(new URL('../skills/evolve-agent-with-harbor/evals/evals.json', import.meta.url), 'utf8'),
  )

  assert.equal(evals.skill_name, 'evolve-agent-with-harbor')
  assert.equal(evals.evals.length, 8)
  assert.ok(evals.evals.every(item => item.assertions.length >= 3))
  assert.match(evals.evals[0].expected_output, /评测集、生成器、评测器（评测标准）和优化器/)
  assert.match(evals.evals[0].expected_output, /\.harbor\/private 与 jobs.*VCS 风险/)
  assert.match(evals.evals[0].expected_output, /MVP 不接受自定义 stackPath/)
  assert.match(evals.evals[0].expected_output, /已有独立 GT\/meta-evaluate 流程仍可单独使用/)
  assert.match(evals.evals[1].expected_output, /单任务诊断评测/)
  assert.match(evals.evals[2].expected_output, /不回显或持久化 secret/)
  assert.match(evals.evals[3].expected_output, /不因路径不同而拒绝初始化/)
  assert.match(evals.evals[4].expected_output, /dsh-host-broker Capability/)
  assert.match(evals.evals[5].expected_output, /不要求用户编写 GT\/Observation JSON/)
  assert.match(evals.evals[6].expected_output, /explicit\/inferred\/unresolved/)
  assert.match(evals.evals[7].expected_output, /评测集级整体结论/)
  assert.match(evals.evals[7].expected_output, /回滚条件/)
  assert.doesNotMatch(JSON.stringify(evals), /\/Users\/|XiaoHui Harness\/workspace/)
})
