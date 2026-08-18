import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { readDashboardSnapshot } from '../lib/dashboard.js'

test('dashboard summarizes completed, pending, and invalid jobs without executing Harbor', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-'))
  const jobsDir = path.join(projectRoot, 'jobs')
  await mkdir(path.join(jobsDir, 'candidate-v2'), { recursive: true })
  await mkdir(path.join(jobsDir, 'candidate-v3'))
  await mkdir(path.join(jobsDir, 'broken'))
  await writeFile(path.join(jobsDir, 'candidate-v2', 'evaluation-summary.json'), JSON.stringify({
    job: 'candidate-v2',
    candidate: { candidate_id: 'research-agent', version: '2.0.0', digest: 'sha256:candidate-v2' },
    evaluation_context: { digest: 'sha256:context-stable' },
    n_trials: 4,
    n_exceptions: 1,
    metrics: { reward: 0.82, citation_accuracy: 0.91 },
  }))
  await writeFile(path.join(jobsDir, 'broken', 'evaluation-summary.json'), '{not-json')

  const snapshot = await readDashboardSnapshot({
    projectRoot,
    jobsDir: 'jobs',
    harborBin: '/bin/sh',
    harborDshBin: '/bin/sh',
    dshVersion: '0.1.0-rc.6',
    agentImportPath: 'example:Agent',
    pluginImportPath: 'dsh-evolution',
  }, { pluginVersion: '0.4.0-test' })

  assert.equal(snapshot.schemaVersion, 1)
  assert.equal(snapshot.pluginVersion, '0.4.0-test')
  assert.equal(snapshot.overview.totalJobs, 3)
  assert.equal(snapshot.overview.completedJobs, 1)
  assert.equal(snapshot.overview.activeJobs, 1)
  assert.equal(snapshot.overview.failedJobs, 1)
  assert.deepEqual(snapshot.overview.latestMetric, { name: 'reward', value: 0.82 })
  assert.equal(snapshot.jobs.find(job => job.name === 'candidate-v2').status, 'partial')
  assert.equal(snapshot.jobs.find(job => job.name === 'candidate-v3').status, 'pending')
  assert.match(snapshot.jobs.find(job => job.name === 'broken').readError, /invalid JSON/)
  assert.equal(snapshot.checks.projectRoot.status, 'ok')
  assert.equal(snapshot.checks.jobsDir.status, 'ok')
})

test('dashboard treats a not-yet-created jobs directory as an empty onboarding state', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-dashboard-empty-'))
  const snapshot = await readDashboardSnapshot({
    projectRoot,
    jobsDir: 'jobs',
    harborBin: 'harbor',
    harborDshBin: 'harbor-dsh',
  })
  assert.deepEqual(snapshot.jobs, [])
  assert.equal(snapshot.checks.jobsDir.status, 'warning')
})
