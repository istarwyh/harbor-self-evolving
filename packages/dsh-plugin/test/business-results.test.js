import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmod, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { canonicalDigest } from '../lib/bridge-contract.js'
import { businessObservationDigest, businessObservationProjection } from '../lib/business-results.js'
import { importBusinessObservation, listBusinessObservations } from '../lib/evolution.js'
import { EvolutionService } from '../lib/service.js'
import { readDashboardSnapshot, readEvaluationReport, readJobDetail } from '../lib/dashboard.js'

const CANDIDATE = `sha256:${'a'.repeat(64)}`

function observation(value = 0.74) {
  return {
    schema_version: 1,
    protocol: 'business-observation/v1',
    observation_id: 'support-resolution-2026w39',
    source: { kind: 'analytics', id: 'support-dashboard', version: 'query-v3', provenance: 'reviewed aggregate export' },
    subject: { generator_id: 'support-agent', candidate_digest: CANDIDATE, deployment_id: 'production-a' },
    window: { from: '2026-09-21T00:00:00Z', through: '2026-09-27T23:59:59Z' },
    metrics: [{ id: 'resolution_rate', value, unit: 'ratio', direction: 'maximize', sample_size: 1830 }],
    segments: [],
  }
}

async function fakeCli(projectRoot, listObservations = []) {
  const executable = path.join(projectRoot, 'fake-harbor-dsh.mjs')
  await writeFile(executable, `#!/usr/bin/env node
import fs from 'node:fs'
const args = process.argv.slice(2)
const input = fs.readFileSync(0, 'utf8')
fs.appendFileSync(${JSON.stringify(path.join(projectRoot, 'calls.jsonl'))}, JSON.stringify({ args, input }) + '\\n')
if (args[0] === 'business-observation' && args[1] === 'list') {
  const observations = ${JSON.stringify(listObservations)}
  console.log(JSON.stringify({ schema_version: 1, protocol: 'business-observation-list/v1', filters: {}, pagination: { offset: 0, limit: 100, total: observations.length, has_more: false }, observations, trends: [], groups: [], causality: { status: 'correlation-only', label: 'Associated observations are correlational and do not establish causation.', affects_offline_evaluation: false, affects_reward: false, affects_gate: false } }))
} else {
  console.log(JSON.stringify({ schema_version: 1, protocol: 'business-observation-import/v1', status: 'imported', observation_id: 'support-resolution-2026w39', digest: 'sha256:' + 'f'.repeat(64), stored_path: '.harbor/business-observations/support-resolution-2026w39.json', source_path: null, network_access: false }))
}
`)
  await chmod(executable, 0o755)
  return executable
}

test('Node adapters import file or structured payload and list only through the Python CLI', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-business-node-'))
  const harborDshBin = await fakeCli(projectRoot)
  const config = { projectRoot, harborDshBin, timeoutMs: 10_000 }
  const filePath = path.join(projectRoot, 'observation.json')
  await writeFile(filePath, JSON.stringify(observation()))

  const fileResult = await importBusinessObservation(config, { filePath: 'observation.json' })
  const payloadResult = await importBusinessObservation(config, { observation: observation() })
  const listed = await listBusinessObservations(config, { candidateDigest: CANDIDATE, metricId: 'resolution_rate', limit: 10 })

  assert.equal(fileResult.network_access, false)
  assert.equal(payloadResult.status, 'imported')
  assert.equal(listed.protocol, 'business-observation-list/v1')
  const calls = (await readFile(path.join(projectRoot, 'calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)
  assert.deepEqual(calls[0].args.slice(0, 2), ['business-observation', 'import'])
  assert.match(calls[0].args.join(' '), /--input/)
  assert.match(calls[1].args.join(' '), /--payload-stdin/)
  assert.equal(JSON.parse(calls[1].input).protocol, 'business-observation/v1')
  assert.match(calls[2].args.join(' '), /--candidate-digest/)
  assert.match(calls[2].args.join(' '), /--metric-id/)
  assert.equal(calls.every(call => !call.args.includes('http') && !call.args.includes('https')), true)

  await assert.rejects(importBusinessObservation(config, {}), /exactly one/)
  await assert.rejects(importBusinessObservation(config, { filePath: '../outside.json' }), /PATH_OUTSIDE_PROJECT_ROOT/)
})

test('EvolutionService exposes import and list without adding network import methods', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-business-service-'))
  const harborDshBin = await fakeCli(projectRoot)
  const service = new EvolutionService({ projectRoot, harborDshBin, timeoutMs: 10_000 })

  assert.equal((await service.businessObservationImport({ observation: observation() })).status, 'imported')
  const listed = await service.businessObservations({})
  assert.equal(listed.schema, 'harbor-agent-read/v1')
  assert.equal(listed.artifactTrust, 'untrusted-evidence')
  assert.equal(listed.data.protocol, 'business-observation-list/v1')
  assert.equal(typeof service.importBusinessObservationFromUrl, 'undefined')
})

async function sealBusinessJob(job) {
  const names = ['candidate-manifest.json', 'dataset-manifest.json', 'evaluation-stack-manifest.json', 'evaluation-contract.json', 'evaluation-context.json', 'evaluation-spec.json', 'evaluation-summary.json']
  const artifacts = []
  for (const name of names) {
    const bytes = await readFile(path.join(job, name))
    artifacts.push({ path: name, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`, size: bytes.length, reward_affecting: true })
  }
  const manifest = { schema_version: 1, protocol: 'job-bundle/v1', job: path.basename(job), created_at: '2026-09-25T00:00:00Z', artifacts }
  manifest.digest = canonicalDigest(manifest, 'harbor-dsh-job-bundle-v1')
  await writeFile(path.join(job, 'job-bundle-manifest.json'), JSON.stringify(manifest))
}

test('dashboard and both report readers associate observations by Job Candidate digest without changing offline artifacts', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-business-dashboard-'))
  const storedObservation = observation()
  storedObservation.digest = businessObservationDigest(storedObservation)
  const harborDshBin = await fakeCli(projectRoot, [storedObservation])
  const job = path.join(projectRoot, 'jobs', 'candidate-v2')
  await mkdir(job, { recursive: true })
  const summary = {
    schema_version: 3,
    job: 'candidate-v2',
    job_kind: 'candidate-evaluation',
    mode: 'promotion-eligible',
    candidate: { candidate_id: 'support-agent', version: '2', digest: CANDIDATE },
    n_trials: 1,
    n_valid_scores: 1,
    n_invalid_scores: 0,
    n_infrastructure_exceptions: 0,
    n_evaluation_exceptions: 0,
    coverage: { total_trials: 1, scored_trials: 1, unscored_trials: 0, trial_rate: 1, criterion_scored: 1, criterion_total: 1, criterion_rate: 1 },
    metrics: { reward: 0.82 },
    trials: [],
    artifact_validation: { valid: true },
  }
  const context = { schema_version: 3, protocol: 'candidate-evaluation-context/v3', digest: `sha256:${'c'.repeat(64)}`, mode: 'promotion-eligible', candidate: { id: 'support-agent', version: '2', digest: CANDIDATE } }
  await writeFile(path.join(job, 'evaluation-summary.json'), JSON.stringify(summary))
  await writeFile(path.join(job, 'evaluation-context.json'), JSON.stringify(context))
  await writeFile(path.join(job, 'evaluation-contract.json'), JSON.stringify({ schema_version: 1, contract_id: 'quality', version: '1', primary_metric: 'reward', metrics: [{ id: 'reward', direction: 'maximize' }] }))
  await writeFile(path.join(job, 'candidate-manifest.json'), JSON.stringify({ schema_version: 1, candidate_id: 'support-agent', version: '2', digest: CANDIDATE }))
  await writeFile(path.join(job, 'dataset-manifest.json'), JSON.stringify({ schema_version: 1 }))
  await writeFile(path.join(job, 'evaluation-stack-manifest.json'), JSON.stringify({ schema_version: 1 }))
  await writeFile(path.join(job, 'evaluation-spec.json'), JSON.stringify({ schema_version: 1, protocol: 'evaluation-spec/v1' }))
  await sealBusinessJob(job)
  const promotion = { schema_version: 2, decision: 'PROMOTE', reasons: [], policy_digest: `sha256:${'d'.repeat(64)}` }
  await writeFile(path.join(job, 'promotion-report.json'), JSON.stringify(promotion))
  const config = { projectRoot, jobsDir: 'jobs', harborBin: harborDshBin, harborDshBin, timeoutMs: 10_000, runtimePolicy: 'candidate-locked' }

  const report = await readEvaluationReport(config, { job: 'candidate-v2' })
  const detail = await readJobDetail(config, { job: 'candidate-v2' })
  const dashboard = await readDashboardSnapshot(config)

  assert.equal(report.business_results.status, 'matched-candidate')
  assert.equal(report.business_results.observations[0].observation_id, storedObservation.observation_id)
  assert.equal(report.business_results.causality.affects_reward, false)
  assert.equal(report.quality.overall_score, null)
  assert.equal(report.quality.trust_requirements.job_bundle_verified, true)
  assert.deepEqual(detail.report.business_results, report.business_results)
  assert.deepEqual(detail.artifacts.promotion, promotion)
  assert.equal(dashboard.jobs[0].businessResults.observationCount, 1)
  assert.equal(dashboard.jobs[0].businessResults.causality, 'correlation-only')
  assert.equal(dashboard.overview.businessObservationCount, 1)
  assert.deepEqual(JSON.parse(await readFile(path.join(job, 'evaluation-summary.json'), 'utf8')), summary)
  assert.deepEqual(JSON.parse(await readFile(path.join(job, 'promotion-report.json'), 'utf8')), promotion)
})

test('business observation digest normalizes float64 values and report projection labels correlation only', () => {
  const value = observation(-0)
  value.metrics[0].unit = 'count'
  value.digest = businessObservationDigest(value)
  assert.match(value.digest, /^sha256:[0-9a-f]{64}$/)
  assert.equal(value.digest, businessObservationDigest({ ...value, metrics: [{ ...value.metrics[0], value: 0 }] }))

  const list = {
    protocol: 'business-observation-list/v1',
    observations: [value],
    trends: [{ subject: value.subject, metric_id: 'resolution_rate', unit: 'count', direction: 'maximize', segment_id: null, points: [] }],
    groups: [{ subject: value.subject, observation_count: 1, observation_ids: [value.observation_id] }],
  }
  const projection = businessObservationProjection(list, CANDIDATE)
  assert.equal(projection.status, 'matched-candidate')
  assert.equal(projection.causality.status, 'correlation-only')
  assert.equal(projection.causality.affects_offline_summary, false)
  assert.equal(projection.causality.affects_reward, false)
  assert.equal(projection.causality.affects_gate, false)
  assert.equal(projection.observations[0].observation_id, value.observation_id)

  const other = observation(0.1)
  other.observation_id = 'other-candidate'
  other.subject = { ...other.subject, candidate_digest: `sha256:${'b'.repeat(64)}` }
  const filtered = businessObservationProjection({ ...list, observations: [other, value], trends: [{ subject: other.subject, points: [] }, ...list.trends], groups: [{ subject: other.subject, observation_ids: [other.observation_id] }, ...list.groups] }, CANDIDATE)
  assert.deepEqual(filtered.observations.map(item => item.observation_id), [value.observation_id])
  assert.equal(filtered.trends.every(item => item.subject.candidate_digest === CANDIDATE), true)
  assert.equal(filtered.groups.every(item => item.subject.candidate_digest === CANDIDATE), true)
})
