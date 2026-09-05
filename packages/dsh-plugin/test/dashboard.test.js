import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rename, symlink, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import test from 'node:test'

import { discoverWorkspaceConfigs, readComparison, readDashboardSnapshot, readDatasetPreview, readEvaluatorGovernance, readJobDetail, readJobProgress, readMetaEvaluation, readTrialDetail, readTrialsPage } from '../lib/dashboard.js'

function config(projectRoot) {
  return { projectRoot, jobsDir: 'jobs', harborBin: '/bin/sh', harborDshBin: '/bin/sh', runtimePolicy: 'follow-latest', agentImportPath: 'example:Agent', pluginImportPath: 'dsh-evolution' }
}

async function makeJob(projectRoot, name = 'candidate-v2', nTrials = 4) {
  const job = path.join(projectRoot, 'jobs', name)
  await mkdir(path.join(job, 'trial-assessments'), { recursive: true })
  const trials = Array.from({ length: nTrials }, (_, index) => ({ id: `trial-${index}`, name: `query ${index}`, rewards: { reward: index / Math.max(1, nTrials) }, exception: index === 1 ? { type: 'Timeout', classification: 'infrastructure' } : null }))
  await writeFile(path.join(job, 'evaluation-summary.json'), JSON.stringify({ schema_version: 2, job: name, mode: 'promotion-eligible', candidate: { candidate_id: 'research-agent', version: '2.0.0', digest: 'sha256:candidate-v2' }, evaluation_context: { schema_version: 2, digest: 'sha256:context-stable' }, n_trials: nTrials, n_exceptions: 1, metrics: { reward: 0.82, citation_accuracy: 0.91 }, trials, artifact_validation: { valid: true } }))
  await writeFile(path.join(job, 'evaluation-context.json'), JSON.stringify({ schema_version: 2, digest: 'sha256:context-stable', full_digest: 'sha256:full', candidate: {}, dataset: {}, evaluation_stack: {}, runtime: {} }))
  await writeFile(path.join(job, 'evaluation-contract.json'), JSON.stringify({ schema_version: 1, contract_id: 'search', version: '1', primary_metric: 'reward', metrics: [{ id: 'reward', direction: 'maximize' }] }))
  await writeFile(path.join(job, 'trial-assessments', 'trial-0.json'), JSON.stringify({
    schema_version: 1,
    trial_id: 'trial-0',
    output: {
      token: 'should-redact',
      text: 'x'.repeat(9000),
      note: 'authorization="Bearer quoted-dashboard-secret with residue"',
    },
    process: [],
  }))
  return job
}

async function makeHistoricalJob(projectRoot, name = 'session-diagnostic') {
  const job = path.join(projectRoot, 'jobs', name)
  await mkdir(job, { recursive: true })
  const evaluationTarget = {
    kind: 'generation-record-batch',
    source_kind: 'dsh-session',
    batch_id: 'recent-session-batch',
    digest: 'sha256:batch',
    record_count: 3,
    generator_population: {
      homogeneous: false,
      agent_presets: ['default', 'research'],
      model_routes: ['provider/model-a', 'provider/model-b'],
    },
  }
  const context = {
    schema_version: 1,
    protocol: 'historical-generation-evaluation-context/v1',
    job_kind: 'historical-generation-evaluation',
    mode: 'diagnostic',
    execution_mode: 'observe-existing',
    generation_source: { mode: 'existing-records', kind: 'dsh-session', adapter_id: 'dsh-session-query' },
    evaluation_target: evaluationTarget,
    downstream_analysis: {
      population_analysis: true,
      generator_diagnosis: true,
      evaluator_meta_evaluation: { status: 'not-run', validation_report_ref: null },
    },
    digest: 'sha256:historical-context',
  }
  const trials = [
    { id: 'session-1', datasetTrial: 'session/1', status: 'completed', score: { value: 1, valid: true, invalid_reasons: [] }, rewards: { reward: 1 } },
    { id: 'session-2', datasetTrial: 'session/2', status: 'completed', score: { value: 0.5, valid: true, invalid_reasons: [] }, rewards: { reward: 0.5 } },
    { id: 'session-3', datasetTrial: 'session/3', status: 'completed-unscored', score: { value: null, valid: false, invalid_reasons: ['insufficient-evidence'] }, rewards: {} },
  ]
  const historicalCoverage = { scored_trials: 2, unscored_trials: 1, total_trials: 3, trial_rate: 2 / 3, criterion_scored: 5, criterion_total: 8, criterion_rate: 0.625 }
  await writeFile(path.join(job, 'evaluation-context.json'), JSON.stringify(context))
  await writeFile(path.join(job, 'evaluation-summary.json'), JSON.stringify({
    schema_version: 4,
    job: name,
    job_kind: 'historical-generation-evaluation',
    mode: 'diagnostic',
    execution_mode: 'observe-existing',
    evaluation_target: evaluationTarget,
    evaluation_context: context,
    n_trials: 3,
    n_discovered_trials: 3,
    n_completed_trials: 3,
    n_valid_scores: 2,
    n_invalid_scores: 0,
    n_exceptions: 0,
    n_infrastructure_exceptions: 0,
    n_evaluation_exceptions: 0,
    status_counts: { completed: 2, 'completed-unscored': 1 },
    coverage: historicalCoverage,
    evaluator_meta_evaluation: { status: 'not-run', validation_report_ref: null },
    metrics: { reward: 0.75 },
    trials,
    artifact_validation: { valid: true },
  }))
  await writeFile(path.join(job, 'historical-evaluation-complete.json'), JSON.stringify({
    schema_version: 1,
    job_kind: 'historical-generation-evaluation',
    status: 'completed',
    valid: true,
    job: name,
    summary_path: 'evaluation-summary.json',
    artifact_registry_path: 'artifact-registry.json',
    coverage: historicalCoverage,
  }))
  await writeFile(path.join(job, 'population-report.json'), JSON.stringify({
    schema_version: 3,
    job_kind: 'historical-generation-evaluation',
    population_size: 3,
    valid_population_size: 2,
    unscored_population_size: 1,
    status_counts: { completed: 2, 'completed-unscored': 1 },
    coverage: { scored_trials: 2, unscored_trials: 1, total_trials: 3 },
    metrics: { reward: 0.75 },
  }))
  await writeFile(path.join(job, 'diagnosis-report.json'), JSON.stringify({
    schema_version: 2,
    job_kind: 'historical-generation-evaluation',
    diagnoses: [],
  }))
  await writeFile(path.join(job, 'optimization-report.json'), JSON.stringify({
    schema_version: 3,
    job_kind: 'historical-generation-evaluation',
    hypotheses: [],
  }))
  return job
}

test('dashboard is a lightweight Context v2 overview', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-'))
  await makeJob(projectRoot)
  await mkdir(path.join(projectRoot, 'jobs', 'pending'))
  await writeFile(path.join(projectRoot, 'jobs', 'pending', 'evaluation-context.json'), JSON.stringify({ schema_version: 2, digest: 'sha256:pending' }))
  await mkdir(path.join(projectRoot, 'jobs', 'broken'))
  await writeFile(path.join(projectRoot, 'jobs', 'broken', 'evaluation-context.json'), JSON.stringify({ schema_version: 2, digest: 'sha256:broken' }))
  await writeFile(path.join(projectRoot, 'jobs', 'broken', 'evaluation-summary.json'), '{not-json')
  await mkdir(path.join(projectRoot, 'jobs', 'legacy'))
  await writeFile(path.join(projectRoot, 'jobs', 'legacy', 'evaluation-summary.json'), JSON.stringify({ schema_version: 1, evaluation_context: { schema_version: 1 } }))
  const snapshot = await readDashboardSnapshot(config(projectRoot), { pluginVersion: '0.5.0-test', projectRootSource: 'agent-session' })
  assert.equal(snapshot.schemaVersion, 3)
  assert.equal(snapshot.pluginVersion, '0.5.0-test')
  assert.equal(snapshot.config.projectRoot, projectRoot)
  assert.equal(snapshot.config.projectRootSource, 'agent-session')
  assert.equal(snapshot.overview.totalJobs, 4)
  assert.deepEqual(snapshot.overview.latestMetric, { name: 'reward', value: 0.82 })
  assert.equal(snapshot.jobs.find(job => job.name === 'candidate-v2').status, 'partial')
  assert.equal(snapshot.jobs.find(job => job.name === 'pending').status, 'pending')
  assert.match(snapshot.jobs.find(job => job.name === 'broken').readError, /invalid JSON/)
  assert.equal(snapshot.jobs.find(job => job.name === 'legacy').capabilities.readOnlyLegacy, true)
  assert.equal('path' in snapshot.jobs[0], false)
})

test('dashboard normalizes Historical Generation Jobs without inventing a Candidate', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-historical-generation-'))
  await makeHistoricalJob(projectRoot)

  const snapshot = await readDashboardSnapshot(config(projectRoot))
  const job = snapshot.jobs[0]
  assert.equal(job.jobKind, 'historical-generation-evaluation')
  assert.equal(job.executionMode, 'observe-existing')
  assert.equal(job.status, 'completed', 'completed-unscored is a normal abstention, not an invalid Job')
  assert.equal(job.candidate, undefined)
  assert.equal(job.evaluationTarget.batch_id, 'recent-session-batch')
  assert.equal(job.generatorPopulation.homogeneous, false)
  assert.equal(job.coverage.scored_trials, 2)
  assert.equal(job.nUnscoredTrials, 1)
  assert.equal(job.evaluatorMetaEvaluation.status, 'not-run')
  assert.equal(job.capabilities.contextSupported, true)
  assert.equal(job.capabilities.contextV2, false)
  assert.equal(job.capabilities.source, true)
  assert.equal(job.capabilities.compare, false)
  assert.equal(job.capabilities.gate, false)
  assert.equal(job.capabilities.readOnlyLegacy, false)

  const detail = await readJobDetail(config(projectRoot), { job: 'session-diagnostic' })
  assert.equal(detail.schemaVersion, 3)
  assert.equal(detail.jobKind, 'historical-generation-evaluation')
  assert.equal(detail.validation.summary.status, 'valid')
  assert.equal(detail.validation.population.status, 'valid')
  assert.equal(detail.validation.diagnosis.status, 'valid')
  assert.equal(detail.validation.optimization.status, 'valid')
  assert.equal(detail.evaluationTarget.record_count, 3)
  assert.equal(detail.evaluatorMetaEvaluation.status, 'not-run')

  const trials = await readTrialsPage(config(projectRoot), { job: 'session-diagnostic' })
  assert.deepEqual(trials.items.map(item => item.scoringStatus), ['scored', 'scored', 'unscored'])
  assert.equal(trials.items[2].status, 'completed-unscored')

  await unlink(path.join(projectRoot, 'jobs', 'session-diagnostic', 'historical-evaluation-complete.json'))
  const incomplete = await readDashboardSnapshot(config(projectRoot))
  assert.equal(incomplete.jobs[0].status, 'failed')
  const incompleteDetail = await readJobDetail(config(projectRoot), { job: 'session-diagnostic' })
  assert.equal(incompleteDetail.validation.completion.status, 'invalid')
})

test('job and trial APIs redact evidence, reject traversal, and report invalid symlinks', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-secure-'))
  const job = await makeJob(projectRoot)
  const outside = path.join(projectRoot, 'outside.json')
  await writeFile(outside, '{"schema_version":1}')
  await symlink(outside, path.join(job, 'optimization-report.json'))
  const detail = await readJobDetail(config(projectRoot), { job: 'candidate-v2' })
  assert.equal(detail.validation.optimization.status, 'invalid')
  assert.equal('process' in detail.artifacts, false)
  const trial = await readTrialDetail(config(projectRoot), { job: 'candidate-v2', trial: 'trial-0' })
  assert.equal(trial.assessment.output.token, '[REDACTED]')
  assert.match(trial.assessment.output.text, /\[TRUNCATED/)
  assert.equal(trial.assessment.output.note, 'authorization=[REDACTED]')
  assert.doesNotMatch(JSON.stringify(trial), /quoted-dashboard-secret|with residue/)
  await assert.rejects(() => readJobDetail(config(projectRoot), { job: '../outside' }), /invalid/)
})

test('Trial readers reject symlinked intermediate assessment and artifact directories', async () => {
  const assessmentRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-assessment-link-'))
  const assessmentJob = await makeJob(assessmentRoot, 'assessment-link', 1)
  const outsideAssessments = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-outside-assessment-'))
  await writeFile(path.join(outsideAssessments, 'trial-0.json'), JSON.stringify({
    schema_version: 1,
    trial_id: 'trial-0',
    output: { text: 'outside assessment must not be read' },
  }))
  await rename(path.join(assessmentJob, 'trial-assessments'), path.join(assessmentJob, 'real-trial-assessments'))
  await symlink(outsideAssessments, path.join(assessmentJob, 'trial-assessments'))

  await assert.rejects(
    readTrialDetail(config(assessmentRoot), { job: 'assessment-link', trial: 'trial-0' }),
    /Trial assessment is invalid/,
  )

  const artifactRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-artifact-link-'))
  const artifactJob = await makeJob(artifactRoot, 'artifact-link', 1)
  await writeFile(path.join(artifactJob, 'evaluation-summary.json'), JSON.stringify({
    schema_version: 2,
    job: 'artifact-link',
    evaluation_context: { schema_version: 2, digest: 'sha256:context-stable' },
    n_trials: 1,
    metrics: {},
    trials: [{ id: 'trial-0', name: 'run-0', status: 'completed', score: { value: 1, valid: true } }],
  }))
  await writeFile(path.join(artifactJob, 'trial-assessments', 'trial-0.json'), JSON.stringify({
    schema_version: 1,
    trial_id: 'trial-0',
    output: { metadata: { status: 'complete' } },
  }))
  const outsideArtifacts = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-outside-artifact-'))
  await writeFile(path.join(outsideArtifacts, 'manifest.json'), JSON.stringify([{ status: 'ok', destination: 'artifacts/result.txt' }]))
  await writeFile(path.join(outsideArtifacts, 'result.txt'), 'outside artifact must not be read')
  await mkdir(path.join(artifactJob, 'run-0'), { recursive: true })
  await symlink(outsideArtifacts, path.join(artifactJob, 'run-0', 'artifacts'))

  const artifactTrial = await readTrialDetail(config(artifactRoot), { job: 'artifact-link', trial: 'trial-0' })
  assert.equal(artifactTrial.preview, undefined)
  assert.doesNotMatch(JSON.stringify(artifactTrial), /outside artifact must not be read/)
})

test('job detail opens Context v1 artifacts as capability-gated read-only history', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-v1-'))
  const job = path.join(projectRoot, 'jobs', 'legacy')
  await mkdir(job, { recursive: true })
  await writeFile(path.join(job, 'evaluation-context.json'), JSON.stringify({ schema_version: 1 }))

  const detail = await readJobDetail(config(projectRoot), { job: 'legacy' })
  assert.equal(detail.capabilities.readOnlyLegacy, true)
  assert.equal(detail.capabilities.compare, false)
})

test('Workbench job and Trial readers redact header, environment, and credential containers before HTTP exposure', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-sensitive-containers-'))
  const job = await makeJob(projectRoot, 'sensitive-containers', 1)
  const summaryPath = path.join(job, 'evaluation-summary.json')
  const contextPath = path.join(job, 'evaluation-context.json')
  const assessmentPath = path.join(job, 'trial-assessments', 'trial-0.json')
  const summary = JSON.parse(await readFile(summaryPath, 'utf8'))
  const context = JSON.parse(await readFile(contextPath, 'utf8'))
  const assessment = JSON.parse(await readFile(assessmentPath, 'utf8'))
  summary.headers = { opaque: 'header-secret-value' }
  context.environmentVariables = { OPAQUE: 'environment-secret-value' }
  assessment.output.credentialsMap = { opaque: 'credential-secret-value' }
  await writeFile(summaryPath, JSON.stringify(summary))
  await writeFile(contextPath, JSON.stringify(context))
  await writeFile(assessmentPath, JSON.stringify(assessment))

  const detail = await readJobDetail(config(projectRoot), { job: 'sensitive-containers' })
  const trial = await readTrialDetail(config(projectRoot), { job: 'sensitive-containers', trial: 'trial-0' })
  const serialized = JSON.stringify({ detail, trial })

  assert.equal(detail.artifacts.summary.headers, '[REDACTED]')
  assert.equal(detail.artifacts.context.environmentVariables, '[REDACTED]')
  assert.equal(trial.assessment.output.credentialsMap, '[REDACTED]')
  assert.doesNotMatch(serialized, /header-secret-value|environment-secret-value|credential-secret-value/)
})

test('1000-trial first page stays paginated and within the local latency budget', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-large-'))
  await makeJob(projectRoot, 'large-job', 1000)
  const started = performance.now()
  const page = await readTrialsPage(config(projectRoot), { job: 'large-job', offset: 0, limit: 100 })
  const elapsed = performance.now() - started
  assert.equal(page.total, 1000)
  assert.equal(page.items.length, 100)
  assert.equal(page.hasMore, true)
  assert.ok(elapsed < 800, `first page took ${elapsed.toFixed(1)}ms`)
})

test('dashboard, 100-trial page, and Trial detail meet local response budgets', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-budgets-'))
  for (let index = 0; index < 50; index += 1) await makeJob(projectRoot, `job-${index}`, index === 0 ? 100 : 1)
  let started = performance.now()
  const snapshot = await readDashboardSnapshot(config(projectRoot))
  const dashboardElapsed = performance.now() - started
  started = performance.now()
  const page = await readTrialsPage(config(projectRoot), { job: 'job-0', offset: 0, limit: 100 })
  const pageElapsed = performance.now() - started
  started = performance.now()
  const detail = await readTrialDetail(config(projectRoot), { job: 'job-0', trial: 'trial-0' })
  const detailElapsed = performance.now() - started
  assert.equal(snapshot.jobs.length, 20)
  assert.equal(snapshot.overview.totalJobs, 50)
  assert.equal(snapshot.jobPagination.hasMore, true)
  assert.equal(page.items.length, 100)
  assert.equal(detail.trial, 'trial-0')
  assert.ok(dashboardElapsed < 300, `dashboard took ${dashboardElapsed.toFixed(1)}ms`)
  assert.ok(pageElapsed < 500, `100-trial page took ${pageElapsed.toFixed(1)}ms`)
  assert.ok(detailElapsed < 300, `trial detail took ${detailElapsed.toFixed(1)}ms`)
})

test('dashboard treats a missing jobs directory as onboarding state', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-empty-'))
  const snapshot = await readDashboardSnapshot(config(projectRoot))
  assert.deepEqual(snapshot.jobs, [])
  assert.equal(snapshot.checks.jobsDir.status, 'warning')
})

test('running Trial lifecycle stays in Dataset order and is safe before assessment exists', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-running-'))
  const job = path.join(projectRoot, 'jobs', 'running-job')
  await mkdir(job, { recursive: true })
  await writeFile(path.join(job, 'evaluation-context.json'), JSON.stringify({ schema_version: 2, digest: 'sha256:running', mode: 'diagnostic', dataset: { task_count: 3 } }))
  const now = new Date().toISOString()
  await writeFile(path.join(job, 'trial-lifecycle.json'), JSON.stringify({
    schema_version: 1, job: 'running-job', updated_at: now, dataset_total: 3, attempt_count: 3,
    counts: { completed: 1, 'running-agent': 1, queued: 1 },
    trials: [
      { dataset_order: 0, dataset_trial: 'query/a', trial: 'query/a', execution_id: 'exec-a', trial_name: 'trial-a', phase: 'completed', terminal: true, attempt: 1, updated_at: now, score: { value: 1, valid: true, invalid_reasons: [] } },
      { dataset_order: 1, dataset_trial: 'query/b', trial: 'query/b', execution_id: 'exec-b', trial_name: 'trial-b', phase: 'running-agent', terminal: false, attempt: 1, updated_at: now, score: { value: null, valid: false, invalid_reasons: ['not-evaluated'] } },
      { dataset_order: 2, dataset_trial: 'query/c', trial: 'query/c', execution_id: null, trial_name: null, phase: 'queued', terminal: false, attempt: 1, updated_at: now, score: { value: null, valid: false, invalid_reasons: ['not-evaluated'] } },
    ],
  }))
  const page = await readTrialsPage(config(projectRoot), { job: 'running-job', limit: 100 })
  assert.equal(page.datasetTotal, 3)
  assert.deepEqual(page.items.map(item => item.datasetTrial), ['query/a', 'query/b', 'query/c'])
  assert.deepEqual(page.items.map(item => item.id), ['exec-a', 'exec-b', 'dataset-2'])
  const detail = await readTrialDetail(config(projectRoot), { job: 'running-job', trial: 'exec-b' })
  assert.equal(detail.capability, 'running-evidence-not-yet-available')
  assert.equal(detail.status, 'running-agent')
  const progress = await readJobProgress(config(projectRoot), { job: 'running-job' })
  assert.equal(progress.datasetTotal, 3)
  assert.equal(progress.changed.length, 3)
})

test('Trial list uses Dataset queries and repairs callback-order metadata by task identity', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-trial-labels-'))
  const job = path.join(projectRoot, 'jobs', 'parallel-job')
  const now = new Date().toISOString()
  await mkdir(job, { recursive: true })
  await writeFile(path.join(job, 'dataset-preview.json'), JSON.stringify({
    schema_version: 1,
    task_count: 2,
    tasks: [
      { id: '01-color', path: '01-color', query: '什么是颜色？' },
      { id: '10-scientific-method', path: '10-scientific-method', query: '什么是科学方法？' },
    ],
  }))
  await writeFile(path.join(job, 'evaluation-summary.json'), JSON.stringify({
    schema_version: 2,
    n_trials: 2,
    trials: [
      { id: 'execution-science', name: '10-scientific-method__random', datasetTrial: 'concepts/10-scientific-method', score: { value: 1, valid: true } },
      { id: 'execution-color', name: '01-color__random', datasetTrial: 'concepts/01-color', score: { value: 1, valid: true } },
    ],
  }))
  // Simulate historical lifecycle metadata produced by parallel callbacks in completion order.
  await writeFile(path.join(job, 'trial-lifecycle.json'), JSON.stringify({
    schema_version: 1,
    job: 'parallel-job',
    updated_at: now,
    dataset_total: 2,
    attempt_count: 2,
    trials: [
      { dataset_order: 0, dataset_trial: '01-color', execution_id: 'execution-science', trial_name: '10-scientific-method__random', phase: 'completed', terminal: true, attempt: 1, updated_at: now },
      { dataset_order: 1, dataset_trial: '10-scientific-method', execution_id: 'execution-color', trial_name: '01-color__random', phase: 'completed', terminal: true, attempt: 1, updated_at: now },
    ],
  }))

  const page = await readTrialsPage(config(projectRoot), { job: 'parallel-job', limit: 100 })
  assert.deepEqual(page.items.map(item => item.displayName), ['什么是颜色？', '什么是科学方法？'])
  assert.deepEqual(page.items.map(item => item.datasetTrial), ['concepts/01-color', 'concepts/10-scientific-method'])
  assert.deepEqual(page.items.map(item => item.datasetOrder), [0, 1])
})

test('Dataset view exposes Agent-visible instruction content for a historical Job', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-dataset-'))
  const source = path.join(projectRoot, 'dataset')
  const job = path.join(projectRoot, 'jobs', 'dataset-job')
  await mkdir(source, { recursive: true })
  await mkdir(path.join(job, 'trial-a'), { recursive: true })
  await writeFile(path.join(source, 'instruction.md'), 'Research the refund policy and cite doc-1.\n')
  await writeFile(path.join(job, 'dataset-manifest.json'), JSON.stringify({ schema_version: 1, dataset_id: 'research', version: '1', source_digest: 'sha256:dataset', task_count: 1, tasks: [{ id: 'task-1', path: '.', instruction: 'instruction.md' }] }))
  await writeFile(path.join(job, 'trial-a', 'result.json'), JSON.stringify({ task_id: { path: source } }))
  const preview = await readDatasetPreview(config(projectRoot), { job: 'dataset-job' })
  assert.equal(preview.source, 'historical-source-fallback')
  assert.equal(preview.tasks[0].instruction, 'Research the refund policy and cite doc-1.\n')
})

test('Trial view falls back to the ACP final response when old assessments contain only runtime metadata', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-preview-'))
  const job = path.join(projectRoot, 'jobs', 'preview-job')
  const now = new Date().toISOString()
  await mkdir(path.join(job, 'trial-assessments'), { recursive: true })
  await mkdir(path.join(job, 'trial-a', 'agent'), { recursive: true })
  await writeFile(path.join(job, 'trial-lifecycle.json'), JSON.stringify({ schema_version: 1, job: 'preview-job', updated_at: now, dataset_total: 1, attempt_count: 1, counts: { completed: 1 }, trials: [{ dataset_order: 0, dataset_trial: 'task/a', execution_id: 'exec-a', trial_name: 'trial-a', phase: 'completed', terminal: true, attempt: 1, updated_at: now, score: { value: 1, valid: true, invalid_reasons: [] } }] }))
  await writeFile(path.join(job, 'trial-assessments', 'exec-a.json'), JSON.stringify({ schema_version: 2, trial_id: 'exec-a', status: 'completed', output: { metadata: { acp: {} } }, evidence_provenance: [{ label: 'Agent Result Metadata' }] }))
  await writeFile(path.join(job, 'trial-a', 'agent', 'trajectory.json'), JSON.stringify({ steps: [{ source: 'user', message: 'question' }, { source: 'agent', message: 'Generated research document.' }] }))
  const detail = await readTrialDetail(config(projectRoot), { job: 'preview-job', trial: 'exec-a' })
  assert.equal(detail.preview.kind, 'document')
  assert.equal(detail.preview.content, 'Generated research document.')
  assert.equal(detail.preview.provenance[0].label, 'ACP Final Response')
})

test('Trial view prefers a collected business artifact over an ACP summary', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-artifact-'))
  const job = path.join(projectRoot, 'jobs', 'artifact-job')
  const now = new Date().toISOString()
  await mkdir(path.join(job, 'trial-assessments'), { recursive: true })
  await mkdir(path.join(job, 'trial-a', 'artifacts', 'app'), { recursive: true })
  await mkdir(path.join(job, 'trial-a', 'verifier'), { recursive: true })
  await writeFile(path.join(job, 'trial-lifecycle.json'), JSON.stringify({ schema_version: 1, job: 'artifact-job', updated_at: now, dataset_total: 1, attempt_count: 1, counts: { completed: 1 }, trials: [{ dataset_order: 0, dataset_trial: 'task/a', execution_id: 'exec-a', trial_name: 'trial-a', phase: 'completed', terminal: true, attempt: 1, updated_at: now, score: { value: 1, valid: true, invalid_reasons: [] } }] }))
  await writeFile(path.join(job, 'trial-assessments', 'exec-a.json'), JSON.stringify({ schema_version: 2, trial_id: 'exec-a', status: 'completed', score: { value: 0.5, valid: true, invalid_reasons: [] }, criteria: [{ id: 'quality', label: 'Quality', score: 0.5 }], recommendations: [], output: { kind: 'document', format: 'text', source: 'acp-final-response', content: 'Short ACP summary.' }, evidence_provenance: [{ kind: 'acp-final-response', label: 'ACP Final Response' }] }))
  await writeFile(path.join(job, 'trial-a', 'verifier', 'evaluation-result.json'), JSON.stringify({ schema_version: 1, protocol: 'evaluation-result/v1', criteria: [{ id: 'quality', score: 0.5, reason: 'One required concept is missing.', recommendation: 'Add the missing concept and rerun.' }] }))
  await writeFile(path.join(job, 'trial-a', 'artifacts', 'manifest.json'), JSON.stringify([{ destination: 'artifacts/app/research.json', status: 'ok' }]))
  await writeFile(path.join(job, 'trial-a', 'artifacts', 'app', 'research.json'), JSON.stringify({ answer: 'Full generated research document.', citations: [{ source_id: 'doc-1' }] }))
  const detail = await readTrialDetail(config(projectRoot), { job: 'artifact-job', trial: 'exec-a' })
  assert.equal(detail.preview.content.answer, 'Full generated research document.')
  assert.equal(detail.preview.provenance[0].label, 'Agent Artifact')
  assert.equal(detail.assessment.criteria[0].reason, 'One required concept is missing.')
  assert.equal(detail.assessment.criteria[0].recommendation, 'Add the missing concept and rerun.')
})

test('read-only compare reports comparability and never claims an automatic Gate', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-compare-'))
  await makeJob(projectRoot, 'baseline', 2)
  await makeJob(projectRoot, 'candidate', 2)
  const candidatePath = path.join(projectRoot, 'jobs', 'candidate', 'evaluation-summary.json')
  const candidate = JSON.parse(await readFile(candidatePath, 'utf8'))
  candidate.metrics.reward = 0.92
  candidate.trials[0].rewards.reward = 0.5
  await writeFile(candidatePath, JSON.stringify(candidate))
  const comparison = await readComparison(config(projectRoot), { baseline: 'baseline', candidate: 'candidate' })
  assert.equal(comparison.comparable, true)
  assert.ok(Math.abs(comparison.metrics.reward.delta - 0.1) < 1e-9)
  assert.equal(comparison.gateEligibility, 'requires-explicit-gate')
  assert.match(comparison.note, /never runs Gate/)
})

test('read-only comparison never treats invalid or infrastructure-error scores as quality deltas', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-invalid-compare-'))
  await makeJob(projectRoot, 'baseline', 3)
  await makeJob(projectRoot, 'candidate', 3)
  const baselinePath = path.join(projectRoot, 'jobs', 'baseline', 'evaluation-summary.json')
  const candidatePath = path.join(projectRoot, 'jobs', 'candidate', 'evaluation-summary.json')
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'))
  const candidate = JSON.parse(await readFile(candidatePath, 'utf8'))

  baseline.trials[0].score = { value: 0, valid: true, invalid_reasons: [] }
  candidate.trials[0].score = { value: 0.5, valid: true, invalid_reasons: [] }
  baseline.trials[1].rewards.reward = 0.1
  candidate.trials[1].rewards.reward = 0.9
  baseline.trials[2].score = { value: 0.8, valid: true, invalid_reasons: [] }
  candidate.trials[2].score = { value: 0.1, valid: true, invalid_reasons: [] }

  await writeFile(baselinePath, JSON.stringify(baseline))
  await writeFile(candidatePath, JSON.stringify(candidate))
  const now = new Date().toISOString()
  const lifecycle = (job, trials) => ({
    schema_version: 1,
    job,
    updated_at: now,
    dataset_total: trials.length,
    counts: {},
    trials: trials.map((trial, dataset_order) => ({
      dataset_order,
      dataset_trial: `query ${dataset_order}`,
      execution_id: `trial-${dataset_order}`,
      trial_name: `query ${dataset_order}`,
      terminal: true,
      attempt: 1,
      updated_at: now,
      ...trial,
    })),
  })
  await writeFile(path.join(projectRoot, 'jobs', 'baseline', 'trial-lifecycle.json'), JSON.stringify(lifecycle('baseline', [
    { phase: 'completed', score: { value: 0, valid: true, invalid_reasons: [] } },
    { phase: 'completed', score: { value: 0.1, valid: true, invalid_reasons: [] } },
    { phase: 'completed', score: { value: 0.8, valid: true, invalid_reasons: [] } },
  ])))
  await writeFile(path.join(projectRoot, 'jobs', 'candidate', 'trial-lifecycle.json'), JSON.stringify(lifecycle('candidate', [
    { phase: 'completed', score: { value: 0.5, valid: true, invalid_reasons: [] } },
    { phase: 'infrastructure-error', score: { value: null, valid: false, invalid_reasons: ['infrastructure-error'] } },
    { phase: 'evaluation-error', score: { value: 0.1, valid: false, invalid_reasons: ['evaluation-error'] } },
  ])))

  const comparison = await readComparison(config(projectRoot), { baseline: 'baseline', candidate: 'candidate' })
  assert.deepEqual(comparison.improvedTrials.map(item => item.trial), ['query 0'])
  assert.deepEqual(comparison.regressedTrials, [])
  assert.equal(comparison.improvedTrials.some(item => item.trial === 'query 1'), false)
  assert.equal(comparison.regressedTrials.some(item => item.trial === 'query 2'), false)
  assert.deepEqual(comparison.invalidTrials, [{
    trial: 'query 1',
    status: 'infrastructure-error',
    invalidReasons: ['infrastructure-error'],
    baselineValid: true,
    candidateValid: false,
  }, {
    trial: 'query 2',
    status: 'evaluation-error',
    invalidReasons: ['evaluation-error'],
    baselineValid: true,
    candidateValid: false,
  }])
  assert.deepEqual(comparison.newInfrastructureExceptions, [{
    trial: 'query 1',
    baselineStatus: 'completed',
    candidateStatus: 'infrastructure-error',
    exception: { type: 'Timeout', classification: 'infrastructure' },
  }])
})

test('read-only comparison rejects Historical Generation Jobs with a stable promotion reason', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-historical-compare-'))
  await makeJob(projectRoot, 'candidate', 2)
  await makeHistoricalJob(projectRoot, 'historical')

  const comparison = await readComparison(config(projectRoot), { baseline: 'candidate', candidate: 'historical' })
  assert.equal(comparison.comparable, false)
  assert.equal(comparison.gateEligibility, 'not-applicable')
  assert.equal(comparison.error.code, 'UNSUPPORTED_JOB_KIND_FOR_PROMOTION')
  assert.equal(comparison.comparabilityReasons[0].code, 'UNSUPPORTED_JOB_KIND_FOR_PROMOTION')
  assert.match(comparison.note, /fixed regression Dataset/)
})

test('Evaluator governance is read-only, source-contained, and redacts credential assignments', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-governance-'))
  const job = path.join(projectRoot, 'jobs', 'governed')
  await mkdir(path.join(projectRoot, 'stack'), { recursive: true })
  await mkdir(job, { recursive: true })
  await writeFile(path.join(projectRoot, 'stack', 'rubric.md'), [
    'score evidence',
    'api_key=do-not-show',
    'authorization: "Bearer quoted-assignment-secret with residue"',
    "secret='quoted-secret with spaces'",
    '"Basic quoted-basic-secret with spaces"',
  ].join('\n'))
  await writeFile(path.join(job, 'evaluation-stack-manifest.json'), JSON.stringify({ schema_version: 1, stack_id: 'search', version: '2', digest: 'sha256:stack', components: { rubric: { id: 'rubric', version: '2', entry: 'stack/rubric.md', digest: 'sha256:rubric', reward_affecting: true } }, judge: { provider: 'local', model: 'judge', version: '1' } }))
  await writeFile(path.join(job, 'evaluation-contract.json'), JSON.stringify({ schema_version: 1, contract_id: 'search', version: '2', primary_metric: 'reward', metrics: [{ id: 'reward' }] }))
  await writeFile(path.join(job, 'evaluation-context.json'), JSON.stringify({ schema_version: 2, digest: 'sha256:context' }))
  const governance = await readEvaluatorGovernance(config(projectRoot), { job: 'governed' })
  assert.match(governance.components.rubric.source.text, /api_key=\[REDACTED\]/)
  assert.doesNotMatch(governance.components.rubric.source.text, /do-not-show|quoted-assignment-secret|quoted-secret|quoted-basic-secret|with residue|with spaces/)
  assert.equal(governance.editingPolicy.browserWriteEnabled, false)
  assert.equal(governance.editingPolicy.automaticGate, false)
  assert.equal(governance.upgradeWorkflow.steps.length, 5)
  assert.match(governance.upgradeWorkflow.skillPrompt, /new immutable evaluator identity/)
})

test('Evaluator meta-evaluation is a separate Ground Truth flow with provenance and metrics', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-meta-'))
  await mkdir(path.join(projectRoot, 'examples', 'research', '.harbor'), { recursive: true })
  await writeFile(path.join(projectRoot, 'examples', 'research', '.harbor', 'ground-truth.json'), JSON.stringify({
    schema_version: 1,
    protocol: 'ground-truth/v1',
    ground_truth_id: 'research-gt',
    version: '1.0.0',
    source: { kind: 'model', description: 'Pinned independent adjudicator', provenance: 'provider/model/template', independent_of_candidate: true },
    criteria: [{ id: 'quality', label: 'Quality' }],
    cases: [{ id: 'bad', artifact_ref: 'fixtures/bad.json', badcase: true, criteria: [{ id: 'quality', score: 0, weight: 1, reason: 'Empty' }] }],
  }))
  await writeFile(path.join(projectRoot, 'examples', 'research', '.harbor', 'meta-evaluation-report.json'), JSON.stringify({
    schema_version: 1,
    protocol: 'meta-evaluation-report/v1',
    evaluator: { id: 'judge', version: '2.0.0' },
    coverage: { rate: 1 },
    metrics: { esf: 0.9, sce: 0.1, rcr: 1 },
    disagreements: [],
  }))
  const meta = await readMetaEvaluation(config(projectRoot), { evaluationRoot: 'examples/research' })
  assert.equal(meta.status, 'evaluated')
  assert.equal(meta.groundTruth.source.kind, 'model')
  assert.equal(meta.groundTruth.badcaseCount, 1)
  assert.equal(meta.report.metrics.esf, 0.9)
  assert.match(meta.workflow.nextAction, /fresh Agent baseline/)
})

test('dashboard discovers namespaced workspaces and pages every Job without a silent cap', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-workspaces-'))
  const nestedRoot = path.join(projectRoot, 'projects', 'research')
  await mkdir(path.join(nestedRoot, '.harbor'), { recursive: true })
  await writeFile(path.join(nestedRoot, '.harbor', 'workspace.json'), JSON.stringify({
    schema_version: 1,
    workspace_id: 'research',
    path_base: 'workspace',
    stack: '.harbor/evaluation-stack.yml',
    jobs: 'jobs',
  }))
  await writeFile(path.join(nestedRoot, '.harbor', 'evaluation-stack.yml'), 'schema_version: 1\n')
  for (let index = 0; index < 55; index += 1) await makeJob(nestedRoot, `nested-${index}`, 1)

  const workspaces = await discoverWorkspaceConfigs(config(projectRoot))
  const nested = workspaces.find(item => item.workspaceLabel === 'research')
  assert.ok(nested)
  assert.equal(nested.jobsDir, 'projects/research/jobs')
  assert.equal(nested.stackPath, 'projects/research/.harbor/evaluation-stack.yml')
  const reopenedDirectly = (await discoverWorkspaceConfigs(config(nestedRoot))).find(item => item.workspaceLabel === 'research')
  assert.equal(reopenedDirectly.jobsDir, 'jobs')
  assert.equal(reopenedDirectly.stackPath, '.harbor/evaluation-stack.yml')

  const firstPage = await readDashboardSnapshot(nested, {}, { offset: 0, limit: 20 })
  const lastPage = await readDashboardSnapshot(nested, {}, { offset: 40, limit: 20 })
  assert.equal(firstPage.overview.totalJobs, 55)
  assert.equal(firstPage.jobs.length, 20)
  assert.equal(firstPage.jobPagination.hasMore, true)
  assert.equal(lastPage.jobs.length, 15)
  assert.equal(lastPage.jobPagination.hasMore, false)
})

test('historical Evaluator governance reads the Job source snapshot after live files change', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-history-'))
  const job = path.join(projectRoot, 'jobs', 'historical')
  await mkdir(path.join(projectRoot, 'stack'), { recursive: true })
  await mkdir(job, { recursive: true })
  await writeFile(path.join(projectRoot, 'stack', 'rubric.md'), 'new rubric semantics\n')
  await writeFile(path.join(job, 'evaluation-stack-manifest.json'), JSON.stringify({
    schema_version: 1,
    stack_id: 'search',
    version: '1',
    digest: 'sha256:stack',
    comparison_digest: 'sha256:comparison',
    components: { rubric: { id: 'rubric', version: '1', entry: 'stack/rubric.md', digest: 'sha256:old', reward_affecting: true } },
    judge: { provider: 'local', model: 'judge', version: '1' },
  }))
  await writeFile(path.join(job, 'evaluation-stack-sources.json'), JSON.stringify({
    schema_version: 1,
    stack_digest: 'sha256:stack',
    components: { rubric: { entry: 'stack/rubric.md', files: [{ path: 'stack/rubric.md', digest: 'sha256:old', text: 'old rubric semantics\n', redacted: false }] } },
  }))
  await writeFile(path.join(job, 'evaluation-context.json'), JSON.stringify({ schema_version: 2, digest: 'sha256:context' }))

  const governance = await readEvaluatorGovernance(config(projectRoot), { job: 'historical' })
  assert.equal(governance.components.rubric.source.text, 'old rubric semantics\n')
  assert.equal(governance.components.rubric.source.source, 'job-snapshot')
  assert.equal(governance.components.rubric.source.readOnly, true)
  assert.equal(governance.stackIdentity.comparisonDigest, 'sha256:comparison')
})

test('Evaluator selection prefers the authorized historical prompt to its descriptor', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-source-selection-'))
  const job = path.join(projectRoot, 'jobs', 'prompt-review')
  await mkdir(job, { recursive: true })
  await writeFile(path.join(job, 'evaluation-stack-manifest.json'), JSON.stringify({ digest: 'sha256:stack', components: { evaluator: { entry: 'bundle/evaluator.json', interface: { editable_files: [{ path: 'bundle/prompt.md', role: 'prompt' }] } } } }))
  await writeFile(path.join(job, 'evaluation-stack-sources.json'), JSON.stringify({ schema_version: 1, stack_digest: 'sha256:stack', components: { evaluator: { files: [{ path: 'bundle/evaluator.json', text: '{"descriptor":true}' }, { path: 'bundle/prompt.md', text: 'Saved grading instructions' }] } } }))
  const governance = await readEvaluatorGovernance(config(projectRoot), { job: 'prompt-review' })
  assert.equal(governance.components.evaluator.source.text, 'Saved grading instructions')
  assert.equal(governance.components.evaluator.source.source, 'job-snapshot')
})

test('meta-evaluation follows registered artifact paths and paginates disagreements', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-meta-index-'))
  const evaluationRoot = path.join(projectRoot, 'evaluation')
  await mkdir(path.join(evaluationRoot, '.harbor'), { recursive: true })
  await mkdir(path.join(evaluationRoot, 'evidence'), { recursive: true })
  await writeFile(path.join(evaluationRoot, '.harbor', 'meta-artifacts.json'), JSON.stringify({
    schema_version: 1,
    artifacts: { ground_truth: 'evidence/gt.json', meta_evaluation_report: 'evidence/report.json' },
  }))
  await writeFile(path.join(evaluationRoot, 'evidence', 'gt.json'), JSON.stringify({
    schema_version: 1,
    ground_truth_id: 'custom-gt',
    version: '1',
    source: { kind: 'human' },
    criteria: [],
    cases: [{ id: 'case-1' }],
  }))
  await writeFile(path.join(evaluationRoot, 'evidence', 'report.json'), JSON.stringify({
    schema_version: 1,
    evaluator: { id: 'judge', version: '1' },
    metrics: { rcr: 0.8 },
    disagreements: Array.from({ length: 25 }, (_, index) => ({ case_id: `case-${index}`, criterion_id: 'quality', ground_truth: 1, observed: 0.5 })),
  }))

  const page = await readMetaEvaluation(config(projectRoot), { evaluationRoot: 'evaluation', offset: 20, limit: 20 })
  assert.equal(page.groundTruth.path, 'evaluation/evidence/gt.json')
  assert.equal(page.report.disagreements.length, 5)
  assert.equal(page.disagreementPagination.total, 25)
  assert.equal(page.disagreementPagination.hasMore, false)
  assert.equal(page.artifactIndex, 'evaluation/.harbor/meta-artifacts.json')
})
