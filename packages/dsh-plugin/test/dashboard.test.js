import assert from 'node:assert/strict'
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import test from 'node:test'

import { readDashboardSnapshot, readJobDetail, readTrialDetail, readTrialsPage } from '../lib/dashboard.js'

function config(projectRoot) {
  return { projectRoot, jobsDir: 'jobs', harborBin: '/bin/sh', harborDshBin: '/bin/sh', dshVersion: '0.1.0-rc.6', agentImportPath: 'example:Agent', pluginImportPath: 'dsh-evolution' }
}

async function makeJob(projectRoot, name = 'candidate-v2', nTrials = 4) {
  const job = path.join(projectRoot, 'jobs', name)
  await mkdir(path.join(job, 'trial-assessments'), { recursive: true })
  const trials = Array.from({ length: nTrials }, (_, index) => ({ id: `trial-${index}`, name: `query ${index}`, rewards: { reward: index / Math.max(1, nTrials) }, exception: index === 1 ? { type: 'Timeout', classification: 'infrastructure' } : null }))
  await writeFile(path.join(job, 'evaluation-summary.json'), JSON.stringify({ schema_version: 2, job: name, mode: 'promotion-eligible', candidate: { candidate_id: 'research-agent', version: '2.0.0', digest: 'sha256:candidate-v2' }, evaluation_context: { schema_version: 2, digest: 'sha256:context-stable' }, n_trials: nTrials, n_exceptions: 1, metrics: { reward: 0.82, citation_accuracy: 0.91 }, trials, artifact_validation: { valid: true } }))
  await writeFile(path.join(job, 'evaluation-context.json'), JSON.stringify({ schema_version: 2, digest: 'sha256:context-stable', full_digest: 'sha256:full', candidate: {}, dataset: {}, evaluation_stack: {}, runtime: {} }))
  await writeFile(path.join(job, 'evaluation-contract.json'), JSON.stringify({ schema_version: 1, contract_id: 'search', version: '1', primary_metric: 'reward', metrics: [{ id: 'reward', direction: 'maximize' }] }))
  await writeFile(path.join(job, 'trial-assessments', 'trial-0.json'), JSON.stringify({ schema_version: 1, trial_id: 'trial-0', output: { token: 'should-redact', text: 'x'.repeat(9000) }, process: [] }))
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
  const snapshot = await readDashboardSnapshot(config(projectRoot), { pluginVersion: '0.5.0-test' })
  assert.equal(snapshot.schemaVersion, 2)
  assert.equal(snapshot.pluginVersion, '0.5.0-test')
  assert.equal(snapshot.overview.totalJobs, 3)
  assert.deepEqual(snapshot.overview.latestMetric, { name: 'reward', value: 0.82 })
  assert.equal(snapshot.jobs.find(job => job.name === 'candidate-v2').status, 'partial')
  assert.equal(snapshot.jobs.find(job => job.name === 'pending').status, 'pending')
  assert.match(snapshot.jobs.find(job => job.name === 'broken').readError, /invalid JSON/)
  assert.equal(snapshot.jobs.some(job => job.name === 'legacy'), false)
  assert.equal('path' in snapshot.jobs[0], false)
})

test('job and trial APIs redact evidence, reject traversal, and report invalid symlinks', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-secure-'))
  const job = await makeJob(projectRoot)
  const outside = path.join(projectRoot, 'outside.json')
  await writeFile(outside, '{"schema_version":1}')
  await symlink(outside, path.join(job, 'optimization-report.json'))
  const detail = await readJobDetail(config(projectRoot), { job: 'candidate-v2' })
  assert.equal(detail.validation.optimization.status, 'invalid')
  const trial = await readTrialDetail(config(projectRoot), { job: 'candidate-v2', trial: 'trial-0' })
  assert.equal(trial.assessment.output.token, '[REDACTED]')
  assert.match(trial.assessment.output.text, /\[TRUNCATED/)
  await assert.rejects(() => readJobDetail(config(projectRoot), { job: '../outside' }), /invalid/)
})

test('job detail rejects Context v1 artifacts', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-v1-'))
  const job = path.join(projectRoot, 'jobs', 'legacy')
  await mkdir(job, { recursive: true })
  await writeFile(path.join(job, 'evaluation-context.json'), JSON.stringify({ schema_version: 1 }))

  await assert.rejects(
    () => readJobDetail(config(projectRoot), { job: 'legacy' }),
    /not a Context v2 evaluation/,
  )
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
  assert.equal(snapshot.jobs.length, 50)
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
