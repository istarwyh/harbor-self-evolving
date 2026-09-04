import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { readHistoricalEvidence } from '../lib/dashboard.js'
import { EvolutionService } from '../lib/service.js'

const SHA_A = `sha256:${'a'.repeat(64)}`
const SHA_B = `sha256:${'b'.repeat(64)}`

async function writeInteractionJob(projectRoot, reason = 'Missing a required concept.') {
  const now = new Date().toISOString()
  const directory = path.join(projectRoot, 'jobs', 'job-42')
  await mkdir(path.join(directory, 'trial-assessments'), { recursive: true })
  await writeFile(path.join(directory, 'evaluation-summary.json'), JSON.stringify({
    schema_version: 3,
    job: 'job-42',
    mode: 'diagnostic',
    metrics: { reward: 0.5, api_key: 123456 },
    n_trials: 1,
    n_valid_scores: 1,
  }))
  await writeFile(path.join(directory, 'evaluation-context.json'), JSON.stringify({
    schema_version: 2,
    digest: 'sha256:context',
  }))
  await writeFile(path.join(directory, 'trial-lifecycle.json'), JSON.stringify({
    schema_version: 1,
    job: 'job-42',
    updated_at: now,
    dataset_total: 1,
    counts: { completed: 1 },
    trials: [{
      dataset_order: 0,
      dataset_trial: 'task/a',
      execution_id: 'exec-a',
      trial_name: 'trial-a',
      phase: 'completed',
      terminal: true,
      attempt: 1,
      updated_at: now,
      score: { value: 0.5, valid: true, invalid_reasons: [] },
    }],
  }))
  await writeFile(path.join(directory, 'trial-assessments', 'exec-a.json'), JSON.stringify({
    schema_version: 2,
    trial_id: 'exec-a',
    status: 'completed',
    score: { value: 0.5, valid: true, invalid_reasons: [] },
    criteria: [{
      id: 'quality',
      label: 'Quality',
      score: 0.5,
      reason,
      recommendation: 'Add the missing concept and rerun.',
      evidence_refs: ['renderer-output'],
    }],
    output: {
      kind: 'document',
      format: 'text',
      content: 'Visible result. api_key=do-not-return Bearer abcdefghijklmnopqrstuvwxyz /Users/alice/private/result.txt',
      secretMap: { AKIAIOSFODNN7EXAMPLE: 'safe-value' },
    },
    evidence_provenance: [{
      id: 'renderer-output',
      kind: 'real-renderer',
      label: 'Real Renderer',
      artifact_ref: 'verifier_result.rendered_output',
      reward_affecting: true,
    }],
  }))
}

async function writeComparisonJob(projectRoot, job, reward, promotion) {
  const directory = path.join(projectRoot, 'jobs', job)
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, 'evaluation-summary.json'), JSON.stringify({
    schema_version: 3,
    job,
    mode: 'promotion-eligible',
    metrics: { reward },
    n_trials: 1,
    n_valid_scores: 1,
    artifact_validation: { valid: true },
    trials: [{ datasetTrial: 'task/a', score: { value: reward, valid: true }, rewards: { reward } }],
  }))
  await writeFile(path.join(directory, 'evaluation-context.json'), JSON.stringify({
    schema_version: 2,
    digest: SHA_A,
    candidate: { candidate_id: `candidate-${job}`, version: '1.0.0', digest: SHA_B },
    dataset: { dataset_id: 'dataset-a', version: '1.0.0', source_digest: SHA_A },
  }))
  await writeFile(path.join(directory, 'evaluation-contract.json'), JSON.stringify({
    schema_version: 1,
    contract_id: 'quality-contract',
    version: '1.0.0',
    primary_metric: 'reward',
    metrics: [{ id: 'reward', direction: 'maximize' }],
  }))
  if (promotion) await writeFile(path.join(directory, 'promotion-report.json'), JSON.stringify(promotion))
}

function comparisonContext(workspace, pageSessionId, comparison) {
  return {
    schema: 'harbor-ui-context/v1',
    sessionId: 'session-1',
    pageSessionId,
    generation: 1,
    workspace,
    route: {
      name: 'harbor.compare',
      params: {
        job: comparison.candidateJob,
        stage: 'gate',
        baseline: comparison.baselineJob,
        candidate: comparison.candidateJob,
      },
    },
    object: {
      kind: 'compare',
      id: comparison.comparisonDigest,
      job: comparison.candidateJob,
      stage: 'gate',
      baseline: comparison.baselineJob,
      candidate: comparison.candidateJob,
      comparisonDigest: comparison.comparisonDigest,
    },
    observedAt: '2099-01-01T00:00:00.000Z',
  }
}

function gateContext(workspace, pageSessionId, gate) {
  return {
    schema: 'harbor-ui-context/v1',
    sessionId: 'session-1',
    pageSessionId,
    generation: 1,
    workspace,
    route: {
      name: 'harbor.gate',
      params: { job: gate.candidate, stage: 'gate', ...gate },
    },
    object: { kind: 'gate', id: gate.reportDigest, job: gate.candidate, stage: 'gate', ...gate },
    observedAt: new Date().toISOString(),
  }
}

async function writeHistoricalInteractionJob(projectRoot) {
  const now = new Date().toISOString()
  const job = 'history-job'
  const trial = 'exec-history'
  const trialDirectoryName = 'frozen-trial'
  const directory = path.join(projectRoot, 'jobs', job)
  const trialDirectory = path.join(directory, trialDirectoryName)
  await mkdir(path.join(directory, 'trial-assessments'), { recursive: true })
  await mkdir(path.join(trialDirectory, 'artifacts'), { recursive: true })
  await mkdir(path.join(trialDirectory, 'verifier'), { recursive: true })

  const evaluationContext = {
    schema_version: 1,
    protocol: 'historical-generation-evaluation-context/v1',
    job_kind: 'historical-generation-evaluation',
    mode: 'diagnostic',
    execution_mode: 'observe-existing',
    digest: 'sha256:historical-context',
  }
  await writeFile(path.join(directory, 'evaluation-context.json'), JSON.stringify(evaluationContext))
  await writeFile(path.join(directory, 'evaluation-summary.json'), JSON.stringify({
    schema_version: 4,
    job,
    job_kind: 'historical-generation-evaluation',
    mode: 'diagnostic',
    execution_mode: 'observe-existing',
    evaluation_context: evaluationContext,
    n_trials: 1,
    n_discovered_trials: 1,
    n_completed_trials: 1,
    n_valid_scores: 1,
    status_counts: { completed: 1 },
    coverage: {
      scored_trials: 1,
      unscored_trials: 0,
      total_trials: 1,
      trial_rate: 1,
      criterion_scored: 1,
      criterion_total: 1,
      criterion_rate: 1,
    },
    metrics: { reward: 0.75 },
    artifact_validation: { valid: true },
  }))
  await writeFile(path.join(directory, 'trial-lifecycle.json'), JSON.stringify({
    schema_version: 1,
    job,
    updated_at: now,
    dataset_total: 1,
    counts: { completed: 1 },
    trials: [{
      dataset_order: 0,
      dataset_trial: 'session/42',
      execution_id: trial,
      trial_name: trialDirectoryName,
      phase: 'completed',
      terminal: true,
      attempt: 1,
      updated_at: now,
      score: { value: 0.75, valid: true, invalid_reasons: [] },
    }],
  }))
  await writeFile(path.join(directory, 'trial-assessments', `${trial}.json`), JSON.stringify({
    schema_version: 2,
    trial_id: trial,
    status: 'completed',
    score: { value: 0.75, valid: true, invalid_reasons: [] },
    criteria: [{
      id: 'quality',
      label: 'Quality',
      score: 0.75,
      reason: 'Assessment reason.',
      recommendation: 'Keep the useful detail.',
      evidence_refs: ['generation_record.visible_transcript/1', 'judge-gateway'],
    }],
    output: { kind: 'document', format: 'text', content: 'generic-preview-must-not-be-used' },
    evidence_provenance: [{
      id: 'frozen-session-observation',
      kind: 'historical-generation-record',
      label: 'Frozen Session Observation',
      artifact_ref: 'artifacts/session-observation.json',
      reward_affecting: false,
    }, {
      id: 'evaluator-result-v2',
      kind: 'evaluator-result',
      label: 'Frozen Evaluator Result',
      artifact_ref: 'verifier/evaluation-result.json',
      reward_affecting: true,
    }],
  }))
  await writeFile(path.join(trialDirectory, 'artifacts', 'session-observation.json'), JSON.stringify({
    protocol: 'dsh-session-observation/v1',
    visible_transcript: [{
      role: 'user',
      content: 'unselected-transcript-entry',
    }, {
      role: 'assistant',
      content: 'selected-transcript-entry api_key=transcript-secret /Users/alice/private.txt',
      api_key: 'transcript-object-secret',
      local_path: '/Users/alice/private.txt',
    }],
    private_note: 'observation-outside-selector',
  }))
  await writeFile(path.join(trialDirectory, 'verifier', 'evaluation-result.json'), JSON.stringify({
    schema_version: 2,
    criteria: [{
      id: 'quality',
      label: 'Quality',
      score: 0.75,
      reason: 'selected-judge-entry Bearer judge-secret-value',
      recommendation: 'Keep the useful detail.',
      api_key: 'judge-object-secret',
    }, {
      id: 'safety',
      label: 'Safety',
      score: 1,
      reason: 'unrelated-criterion-entry',
    }],
  }))

  return { job, trial, trialDirectoryName }
}

function context(workspace) {
  return {
    schema: 'harbor-ui-context/v1',
    sessionId: 'session-1',
    pageSessionId: 'page-1',
    generation: 7,
    workspace,
    route: {
      name: 'harbor.trial.detail',
      params: { job: 'job-42', trial: 'exec-a', criterion: 'quality', detailTab: 'evidence' },
    },
    object: { kind: 'trial', id: 'exec-a', job: 'job-42', trial: 'exec-a', stage: 'judge' },
    selection: [{ kind: 'criterion', id: 'quality', job: 'job-42', trial: 'exec-a', criterion: 'quality', stage: 'judge' }],
    artifactRevision: 'api_key=client-controlled-secret',
    observedAt: new Date().toISOString(),
  }
}

async function fixture() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-ui-service-'))
  await writeInteractionJob(projectRoot)
  const service = new EvolutionService({ projectRoot, jobsDir: 'jobs' })
  service.activateProjectRoot(projectRoot, 'test-session', 'session-1')
  const dashboard = await service.dashboard({ sessionId: 'session-1' })
  return { projectRoot, service, workspace: dashboard.workspace.id }
}

test('page-context revision is Host-owned, drift-aware, narrow, and carries typed refs', async () => {
  const { projectRoot, service, workspace } = await fixture()
  const beforeBind = Date.now()
  const bound = await service.bindUiContext({ sessionId: 'session-1', context: context(workspace) })
  const afterBind = Date.now()
  const repeated = await service.bindUiContext({ sessionId: 'session-1', context: context(workspace) })
  const owner = { sessionId: 'session-1', projectRoot }
  const first = await service.resolveUiContext({ contextSnapshotId: bound.contextSnapshotId }, owner)

  assert.equal(repeated.contextSnapshotId, bound.contextSnapshotId, 'a same-generation retry remains idempotent after Host timestamping')
  assert.equal(first.freshness, 'FRESH')
  assert.notEqual(first.basedOn.artifactRevision, 'api_key=client-controlled-secret')
  assert.notEqual(first.basedOn.observedAt, '2099-01-01T00:00:00.000Z')
  assert.ok(Date.parse(first.basedOn.observedAt) >= beforeBind)
  assert.ok(Date.parse(first.basedOn.observedAt) <= afterBind)
  assert.equal(first.refs.evidence[0].kind, 'harbor.evidence/v1')
  assert.deepEqual(first.refs.object, {
    kind: 'harbor.trial/v1', workspace, job: 'job-42', trial: 'exec-a',
  })
  assert.deepEqual(first.context.object, first.refs.object)
  assert.deepEqual(first.refs.evidence[0], {
    kind: 'harbor.evidence/v1',
    workspace,
    job: 'job-42',
    trial: 'exec-a',
    criterion: 'quality',
    evidenceRef: 'renderer-output',
  })
  assert.equal(first.currentState.trial.assessment, undefined)
  assert.equal(first.currentState.job.metrics.api_key, undefined)
  assert.equal(first.readHints, undefined)
  assert.equal(first.uiAction.expectedPageSessionId, 'page-1')
  assert.equal(first.uiAction.expectedGeneration, 7)
  assert.equal('comparable' in first.context.flags, false)
  assert.doesNotMatch(JSON.stringify(first), /Visible result|\/Users\/alice/)

  await writeInteractionJob(projectRoot, 'A materially changed and longer reason.')
  const drifted = await service.resolveUiContext({ contextSnapshotId: bound.contextSnapshotId }, owner)
  assert.equal(drifted.freshness, 'DRIFTED_READ_ONLY')
  assert.notEqual(drifted.basedOn.currentRevision, drifted.basedOn.artifactRevision)
})

test('page-context revision tracks full artifact bytes beyond the bounded 8 KB display value', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-ui-full-revision-'))
  const unchangedPrefix = 'same-visible-prefix-'.repeat(500)
  await writeInteractionJob(projectRoot, `${unchangedPrefix}A`)
  const service = new EvolutionService({ projectRoot, jobsDir: 'jobs' })
  service.activateProjectRoot(projectRoot, 'test-session', 'session-1')
  const workspace = (await service.dashboard({ sessionId: 'session-1' })).workspace.id
  const owner = { sessionId: 'session-1', projectRoot }
  const bound = await service.bindUiContext({ sessionId: 'session-1', context: context(workspace) })
  const first = await service.resolveUiContext({ contextSnapshotId: bound.contextSnapshotId }, owner)
  const firstTrial = await service.trial({ sessionId: 'session-1', workspace, job: 'job-42', trial: 'exec-a' })

  const assessmentPath = path.join(projectRoot, 'jobs', 'job-42', 'trial-assessments', 'exec-a.json')
  const assessment = JSON.parse(await readFile(assessmentPath, 'utf8'))
  assessment.criteria[0].reason = `${unchangedPrefix}B`
  await writeFile(assessmentPath, JSON.stringify(assessment))

  const currentTrial = await service.trial({ sessionId: 'session-1', workspace, job: 'job-42', trial: 'exec-a' })
  assert.equal(
    currentTrial.assessment.criteria[0].reason,
    firstTrial.assessment.criteria[0].reason,
    'the bounded display value intentionally remains identical',
  )
  const drifted = await service.resolveUiContext({ contextSnapshotId: bound.contextSnapshotId }, owner)
  assert.equal(drifted.freshness, 'DRIFTED_READ_ONLY')
  assert.notEqual(drifted.basedOn.currentRevision, first.basedOn.artifactRevision)

  const rebound = await service.bindUiContext({
    sessionId: 'session-1',
    context: { ...context(workspace), generation: 8 },
  })
  const fresh = await service.resolveUiContext({ contextSnapshotId: rebound.contextSnapshotId }, owner)
  assert.equal(fresh.freshness, 'FRESH')
  assert.equal(fresh.basedOn.artifactRevision, drifted.basedOn.currentRevision)
})

test('page-context comparability flag is sourced from the persisted Promotion artifact', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-ui-promotion-context-'))
  await writeInteractionJob(projectRoot)
  await writeFile(path.join(projectRoot, 'jobs', 'job-42', 'promotion-report.json'), JSON.stringify({
    schema_version: 2,
    decision: 'blocked',
    reasons: ['evaluation contexts differ'],
    policy_digest: 'sha256:policy',
    comparable: false,
  }))
  const service = new EvolutionService({ projectRoot, jobsDir: 'jobs' })
  service.activateProjectRoot(projectRoot, 'test-session', 'session-1')
  const workspace = (await service.dashboard({ sessionId: 'session-1' })).workspace.id

  const bound = await service.bindUiContext({ sessionId: 'session-1', context: context(workspace) })
  const resolved = await service.resolveUiContext(
    { contextSnapshotId: bound.contextSnapshotId },
    { sessionId: 'session-1', projectRoot },
  )

  assert.equal(resolved.context.flags.comparable, false)
})

test('Compare and Gate bindings are verified against authoritative artifacts and reject spoofed identity', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-ui-compare-gate-'))
  const promotion = {
    schema_version: 2,
    decision: 'REJECT',
    reasons: ['candidate does not meet the promotion threshold'],
    baseline_job: 'baseline-job',
    candidate_job: 'candidate-job',
    policy: { policy_id: 'quality-policy', version: '2.0.0' },
    policy_digest: SHA_A,
    comparable: true,
    gate_eligible: false,
  }
  await writeComparisonJob(projectRoot, 'baseline-job', 0.4)
  await writeComparisonJob(projectRoot, 'other-baseline', 0.3)
  await writeComparisonJob(projectRoot, 'candidate-job', 0.6, promotion)
  await writeComparisonJob(projectRoot, 'no-gate-job', 0.5)

  const service = new EvolutionService({ projectRoot, jobsDir: 'jobs' })
  service.activateProjectRoot(projectRoot, 'test-session', 'session-1')
  const workspace = (await service.dashboard({ sessionId: 'session-1' })).workspace.id
  const owner = { sessionId: 'session-1', projectRoot }

  const comparison = await service.comparison({
    sessionId: 'session-1', workspace, baseline: 'baseline-job', candidate: 'candidate-job',
  })
  assert.match(comparison.comparisonDigest, /^sha256:[a-f0-9]{64}$/)
  const boundCompare = await service.bindUiContext({
    sessionId: 'session-1', context: comparisonContext(workspace, 'compare-page', comparison),
  })
  const resolvedCompare = await service.resolveUiContext({ contextSnapshotId: boundCompare.contextSnapshotId }, owner)
  assert.equal(resolvedCompare.freshness, 'FRESH')
  assert.deepEqual(resolvedCompare.refs.object, {
    kind: 'harbor.compare/v1', workspace, job: 'candidate-job',
    baseline: 'baseline-job', candidate: 'candidate-job', comparisonDigest: comparison.comparisonDigest,
  })
  assert.equal(resolvedCompare.currentState.comparison.comparisonDigest, comparison.comparisonDigest)

  const forgedDigest = comparisonContext(workspace, 'compare-forged-digest', {
    ...comparison,
    comparisonDigest: SHA_B,
  })
  await assert.rejects(
    service.bindUiContext({ sessionId: 'session-1', context: forgedDigest }),
    /Compare identity no longer matches/,
  )

  const forgedBaseline = comparisonContext(workspace, 'compare-forged-baseline', {
    ...comparison,
    baselineJob: 'other-baseline',
  })
  await assert.rejects(
    service.bindUiContext({ sessionId: 'session-1', context: forgedBaseline }),
    /Compare identity no longer matches/,
  )

  const baselineSummaryPath = path.join(projectRoot, 'jobs', 'baseline-job', 'evaluation-summary.json')
  const changedBaseline = JSON.parse(await readFile(baselineSummaryPath, 'utf8'))
  changedBaseline.metrics.reward = 0.1
  changedBaseline.trials[0].score.value = 0.1
  changedBaseline.trials[0].rewards.reward = 0.1
  await writeFile(baselineSummaryPath, JSON.stringify(changedBaseline))
  const driftedCompare = await service.resolveUiContext({ contextSnapshotId: boundCompare.contextSnapshotId }, owner)
  assert.equal(driftedCompare.freshness, 'DRIFTED_READ_ONLY')
  assert.notEqual(driftedCompare.currentState.comparison.comparisonDigest, comparison.comparisonDigest)

  const candidate = await service.job({ sessionId: 'session-1', workspace, job: 'candidate-job' })
  const gate = candidate.interactionIdentities.gate
  assert.deepEqual(gate, {
    baseline: 'baseline-job', candidate: 'candidate-job', policy: 'quality-policy', policyVersion: '2.0.0',
    policyDigest: SHA_A, reportDigest: gate.reportDigest,
  })
  assert.match(gate.reportDigest, /^sha256:[a-f0-9]{64}$/)
  const boundGate = await service.bindUiContext({
    sessionId: 'session-1', context: gateContext(workspace, 'gate-page', gate),
  })
  const resolvedGate = await service.resolveUiContext({ contextSnapshotId: boundGate.contextSnapshotId }, owner)
  assert.equal(resolvedGate.freshness, 'FRESH')
  assert.deepEqual(resolvedGate.refs.object, {
    kind: 'harbor.gate/v1', workspace, job: 'candidate-job',
    baseline: 'baseline-job', candidate: 'candidate-job',
    policy: { id: 'quality-policy', version: '2.0.0', digest: SHA_A },
    reportDigest: gate.reportDigest,
  })

  const forgedPolicy = gateContext(workspace, 'gate-forged-policy', { ...gate, policy: 'other-policy' })
  await assert.rejects(
    service.bindUiContext({ sessionId: 'session-1', context: forgedPolicy }),
    /Gate identity no longer matches/,
  )
  const forgedReport = gateContext(workspace, 'gate-forged-report', { ...gate, reportDigest: SHA_B })
  await assert.rejects(
    service.bindUiContext({ sessionId: 'session-1', context: forgedReport }),
    /Gate identity no longer matches/,
  )

  const noGateJob = await service.job({ sessionId: 'session-1', workspace, job: 'no-gate-job' })
  assert.equal(noGateJob.interactionIdentities.gate, undefined)
  const fabricatedGate = gateContext(workspace, 'gate-without-artifact', {
    ...gate,
    candidate: 'no-gate-job',
    reportDigest: SHA_B,
  })
  await assert.rejects(
    service.bindUiContext({ sessionId: 'session-1', context: fabricatedGate }),
    /Gate identity no longer matches/,
  )
})

test('service comparison exposes lifecycle-classified invalid and new infrastructure Trials', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-ui-compare-classification-'))
  await writeComparisonJob(projectRoot, 'baseline-job', 0.4)
  await writeComparisonJob(projectRoot, 'candidate-job', 0.6)
  const now = new Date().toISOString()
  const lifecycle = (job, phase, score) => ({
    schema_version: 1,
    job,
    updated_at: now,
    dataset_total: 1,
    counts: { [phase]: 1 },
    trials: [{
      dataset_order: 0,
      dataset_trial: 'task/a',
      execution_id: 'dataset-0',
      trial_name: 'task/a',
      phase,
      terminal: true,
      attempt: 1,
      updated_at: now,
      score,
    }],
  })
  await writeFile(path.join(projectRoot, 'jobs', 'baseline-job', 'trial-lifecycle.json'), JSON.stringify(lifecycle(
    'baseline-job', 'completed', { value: 0.4, valid: true, invalid_reasons: [] },
  )))
  await writeFile(path.join(projectRoot, 'jobs', 'candidate-job', 'trial-lifecycle.json'), JSON.stringify(lifecycle(
    'candidate-job', 'infrastructure-error', { value: null, valid: false, invalid_reasons: ['infrastructure-error'] },
  )))

  const service = new EvolutionService({ projectRoot, jobsDir: 'jobs' })
  service.activateProjectRoot(projectRoot, 'test-session', 'session-1')
  const workspace = (await service.dashboard({ sessionId: 'session-1' })).workspace.id
  const comparison = await service.comparison({
    sessionId: 'session-1', workspace, baseline: 'baseline-job', candidate: 'candidate-job',
  })

  assert.deepEqual(comparison.improvedTrials, [])
  assert.deepEqual(comparison.regressedTrials, [])
  assert.deepEqual(comparison.invalidTrials, [{
    trial: 'task/a',
    status: 'infrastructure-error',
    invalidReasons: ['infrastructure-error'],
    baselineValid: true,
    candidateValid: false,
  }])
  assert.deepEqual(comparison.newInfrastructureExceptions, [{
    trial: 'task/a', baselineStatus: 'completed', candidateStatus: 'infrastructure-error',
  }])
  assert.match(comparison.comparisonDigest, /^sha256:[a-f0-9]{64}$/)
})

test('Evaluator context never substitutes the Job id when no authoritative Evaluator identity exists', async () => {
  const { service, workspace } = await fixture()
  const evaluatorContext = {
    ...context(workspace),
    route: { name: 'harbor.evaluator', params: { job: 'job-42', stage: 'judge' } },
    object: { kind: 'evaluator', id: 'job-42', job: 'job-42', stage: 'judge' },
    selection: undefined,
  }

  await assert.rejects(
    service.bindUiContext({ sessionId: 'session-1', context: evaluatorContext }),
    /evaluator identity no longer matches/,
  )
})

test('browser freshness checks and page-level object refs remain Session- and Host-authoritative', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-ui-browser-resolve-'))
  await writeInteractionJob(projectRoot)
  await writeFile(path.join(projectRoot, 'jobs', 'job-42', 'evaluation-context.json'), JSON.stringify({
    schema_version: 2,
    digest: 'sha256:context',
    evaluation_stack: { components: { evaluator: { id: 'judge-v1' } } },
  }))
  const service = new EvolutionService(
    { projectRoot, jobsDir: 'jobs' },
    { sessionProjectRoot: sessionId => sessionId === 'session-1' ? projectRoot : undefined },
  )
  const workspace = (await service.dashboard({ sessionId: 'session-1' })).workspace.id
  const evaluatorContext = {
    ...context(workspace),
    route: { name: 'harbor.evaluator', params: { job: 'job-42', stage: 'judge' } },
    object: { kind: 'evaluator', id: 'judge-v1', job: 'job-42', stage: 'judge' },
    selection: undefined,
  }
  const bound = await service.bindUiContext({ sessionId: 'session-1', context: evaluatorContext })
  const resolved = await service.resolveBrowserUiContext({
    sessionId: 'session-1', contextSnapshotId: bound.contextSnapshotId,
  })
  assert.equal(resolved.freshness, 'FRESH')
  assert.deepEqual(resolved.refs.object, {
    kind: 'harbor.evaluator/v1', workspace, job: 'job-42', evaluator: 'judge-v1',
  })
  await assert.rejects(
    service.bindUiContext({ context: evaluatorContext }),
    /HARBOR_CONTEXT_SESSION_MISMATCH: sessionId is required/,
  )
  await assert.rejects(
    service.bindUiContext({ sessionId: 'session-other', context: { ...evaluatorContext, sessionId: 'session-other' } }),
    /HARBOR_SESSION_PROJECT_UNAVAILABLE/,
  )
  await assert.rejects(
    service.resolveBrowserUiContext({ sessionId: 'session-other', contextSnapshotId: bound.contextSnapshotId }),
    /HARBOR_SESSION_PROJECT_UNAVAILABLE/,
  )
  await assert.rejects(
    service.bindUiContext({
      sessionId: 'session-1',
      context: { ...evaluatorContext, object: { ...evaluatorContext.object, id: 'guessed-evaluator' }, generation: 8 },
    }),
    /evaluator identity no longer matches/,
  )
})

test('page-context binding rejects a workspace outside the authoritative Session project', async () => {
  const sessionRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-ui-session-project-'))
  const otherRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-ui-other-project-'))
  await writeInteractionJob(sessionRoot)
  await writeInteractionJob(otherRoot)
  const service = new EvolutionService(
    { projectRoot: sessionRoot, jobsDir: 'jobs' },
    { sessionProjectRoot: sessionId => sessionId === 'session-1' ? sessionRoot : undefined },
  )
  service.activateProjectRoot(otherRoot, 'other-session', 'session-other')
  const otherWorkspace = (await service.dashboard()).workspace.id

  await assert.rejects(
    service.bindUiContext({ sessionId: 'session-1', context: context(otherWorkspace) }),
    /HARBOR_CONTEXT_PROJECT_MISMATCH/,
  )
})

test('Session-scoped workspace discovery never scans unrelated historical project roots', async () => {
  const sessionRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-ui-authoritative-root-'))
  const malformedRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-ui-malformed-root-'))
  await writeInteractionJob(sessionRoot)
  await mkdir(path.join(malformedRoot, '.harbor'), { recursive: true })
  await writeFile(path.join(malformedRoot, '.harbor', 'workspace.json'), JSON.stringify({
    schema_version: 1,
    workspace_id: 'malformed-history',
    jobs: '../../outside-authoritative-root',
    stack: '.harbor/evaluation-stack.yml',
  }))
  const service = new EvolutionService(
    { projectRoot: sessionRoot, jobsDir: 'jobs' },
    { sessionProjectRoot: sessionId => sessionId === 'session-1' ? sessionRoot : undefined },
  )
  service.activateProjectRoot(malformedRoot, 'historical-session', 'session-old')

  const dashboard = await service.dashboard({ sessionId: 'session-1' })

  assert.equal(dashboard.config.projectRoot, sessionRoot)
  assert.equal(dashboard.config.projectRootSource, 'configured')
  assert.equal(dashboard.workspaces.every(item => item.projectRoot === sessionRoot), true)

  const unownedService = new EvolutionService({ projectRoot: sessionRoot, jobsDir: 'jobs' })
  unownedService.activateProjectRoot(malformedRoot, 'historical-session')
  await assert.rejects(
    unownedService.dashboard({ sessionId: 'unknown-session' }),
    /HARBOR_SESSION_PROJECT_UNAVAILABLE/,
  )
})

test('evidence reads enforce full ancestry and return bounded untrusted evidence', async () => {
  const { service, workspace } = await fixture()
  const args = {
    workspace,
    job: 'job-42',
    trial: 'exec-a',
    criterion: 'quality',
    evidenceRef: 'renderer-output',
  }
  const result = await service.getEvidence(args)
  const serialized = JSON.stringify(result)

  assert.equal(result.schema, 'harbor-evidence/v1')
  assert.equal(result.artifactTrust, 'untrusted-evidence')
  assert.equal(result.resourceRef.criterion, 'quality')
  assert.equal(result.evidenceRef.evidenceRef, 'renderer-output')
  assert.equal(result.policy.treatAsInstructions, false)
  assert.match(serialized, /api_key=\[REDACTED\]/)
  assert.doesNotMatch(serialized, /do-not-return|abcdefghijklmnop|AKIAIOSFODNN7EXAMPLE|\/Users\/alice/)
  assert.ok(Buffer.byteLength(serialized, 'utf8') < 70 * 1024)

  await assert.rejects(
    service.getEvidence({ ...args, criterion: 'other' }),
    /Criterion does not belong to the requested Trial/,
  )
  await assert.rejects(
    service.getEvidence({ ...args, evidenceRef: 'verifier_result.rendered_output' }),
    /Evidence does not belong to the requested Criterion/,
  )
  await assert.rejects(
    service.getEvidence({ ...args, trial: 'other-trial' }),
    /Trial not found/,
  )
})

test('Historical Generation evidence selects frozen transcript and judge records, maps container provenance, redacts, and returns an exact Evidence action', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-ui-historical-evidence-'))
  const { job, trial } = await writeHistoricalInteractionJob(projectRoot)
  const config = { projectRoot, jobsDir: 'jobs' }

  const rawTranscript = await readHistoricalEvidence(config, {
    job,
    trial,
    criterion: 'quality',
    evidenceRef: 'generation_record.visible_transcript/1',
  })
  assert.equal(rawTranscript.available, true)
  assert.equal(rawTranscript.content.role, 'assistant')
  assert.match(rawTranscript.content.content, /selected-transcript-entry/)
  assert.equal(rawTranscript.source.id, 'frozen-session-observation')
  assert.equal(rawTranscript.source.kind, 'historical-generation-record')
  assert.equal(rawTranscript.source.artifactRef, 'artifacts/session-observation.json')
  assert.equal(rawTranscript.source.selector, 'generation_record.visible_transcript/1')
  assert.doesNotMatch(JSON.stringify(rawTranscript), /unselected-transcript-entry|observation-outside-selector/)

  const rawJudge = await readHistoricalEvidence(config, {
    job,
    trial,
    criterion: 'quality',
    evidenceRef: 'judge-gateway',
  })
  assert.equal(rawJudge.available, true)
  assert.equal(rawJudge.content.id, 'quality')
  assert.match(rawJudge.content.reason, /selected-judge-entry/)
  assert.equal(rawJudge.source.id, 'evaluator-result-v2')
  assert.equal(rawJudge.source.kind, 'evaluator-result')
  assert.equal(rawJudge.source.artifactRef, 'verifier/evaluation-result.json')
  assert.equal(rawJudge.source.selector, 'criteria[id=quality]')
  assert.doesNotMatch(JSON.stringify(rawJudge), /unrelated-criterion-entry/)

  const service = new EvolutionService(config)
  const workspace = (await service.dashboard()).workspace.id
  const transcript = await service.getEvidence({
    workspace,
    job,
    trial,
    criterion: 'quality',
    evidenceRef: 'generation_record.visible_transcript/1',
  })
  const serializedTranscript = JSON.stringify(transcript)
  assert.equal(transcript.evidence.provenance.id, 'frozen-session-observation')
  assert.equal(transcript.evidence.provenance.kind, 'historical-generation-record')
  assert.equal(transcript.evidence.artifact.source.id, 'frozen-session-observation')
  assert.equal(transcript.evidence.artifact.source.selector, 'generation_record.visible_transcript/1')
  assert.match(transcript.evidence.artifact.content.content, /selected-transcript-entry/)
  assert.equal(transcript.evidence.artifact.content.api_key, '[REDACTED]')
  assert.match(serializedTranscript, /api_key=\[REDACTED\]/)
  assert.match(serializedTranscript, /\[local path\]/)
  assert.doesNotMatch(serializedTranscript, /transcript-secret|transcript-object-secret|\/Users\/alice/)
  assert.doesNotMatch(serializedTranscript, /unselected-transcript-entry|observation-outside-selector|generic-preview-must-not-be-used/)

  const judge = await service.getEvidence({
    workspace,
    job,
    trial,
    criterion: 'quality',
    evidenceRef: 'judge-gateway',
  })
  const serializedJudge = JSON.stringify(judge)
  assert.equal(judge.evidence.provenance.id, 'evaluator-result-v2')
  assert.equal(judge.evidence.provenance.kind, 'evaluator-result')
  assert.equal(judge.evidence.artifact.source.id, 'evaluator-result-v2')
  assert.equal(judge.evidence.artifact.source.selector, 'criteria[id=quality]')
  assert.equal(judge.evidence.artifact.content.id, 'quality')
  assert.match(judge.evidence.artifact.content.reason, /selected-judge-entry/)
  assert.equal(judge.evidence.artifact.content.api_key, '[REDACTED]')
  assert.match(serializedJudge, /Bearer \[REDACTED\]/)
  assert.doesNotMatch(serializedJudge, /judge-secret-value|judge-object-secret|unrelated-criterion-entry|generic-preview-must-not-be-used/)

  assert.equal(judge.uiAction.kind, 'harbor.navigate')
  assert.match(judge.uiAction.actionId, /^harbor-evidence-/)
  assert.equal(judge.uiAction.artifactRevision, judge.artifactRevision)
  assert.deepEqual(judge.uiAction.target, {
    route: 'harbor.trial.detail',
    workspace,
    job,
    stage: 'judge',
    trial,
    detailTab: 'evidence',
    criterion: 'quality',
    evidenceRef: 'judge-gateway',
  })
})

test('evidence redaction covers credential families and final response stays below 64 KiB', async () => {
  const { projectRoot, service, workspace } = await fixture()
  const assessmentPath = path.join(projectRoot, 'jobs', 'job-42', 'trial-assessments', 'exec-a.json')
  const assessment = JSON.parse(await readFile(assessmentPath, 'utf8'))
  const secrets = [
    'Bearer bearer-secret-value',
    'Basic dXNlcjpwYXNzd29yZA==',
    'api_key=key-value-secret',
    'sk-proj-abcdefghijklmnopqrstuvwxyz',
    'rk-abcdefghijklmnopqrstuvwxyz',
    'pk-abcdefghijklmnopqrstuvwxyz',
    'ghp_abcdefghijklmnopqrstuvwxyz123456',
    'gho_abcdefghijklmnopqrstuvwxyz123456',
    'ghu_abcdefghijklmnopqrstuvwxyz123456',
    'github_pat_abcdefghijklmnopqrstuvwxyz123456',
    'SLACK_TOKEN_PLACEHOLDER',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWNyZXQifQ.signaturepart',
    '-----BEGIN PRIVATE KEY-----\nprivate-key-material\n-----END PRIVATE KEY-----',
    'postgres://user:dbpassword@localhost',
    'https://alice:supersecret@example.com',
    '/Users/alice/Library/secret.txt',
    '/home/alice/private/result.txt',
    '/etc/private.conf',
    String.raw`C:\Users\alice\private\result.txt`,
    String.raw`\\server\share\private.txt`,
    '-----BEGIN PRIVATE KEY-----\nprivate-key-material-without-footer',
  ]
  assessment.output = {
    kind: 'document',
    format: 'text',
    content: `${secrets.join('\n')}\n${'large-safe-text '.repeat(20_000)}`,
  }
  await writeFile(assessmentPath, JSON.stringify(assessment))

  const result = await service.getEvidence({
    workspace, job: 'job-42', trial: 'exec-a', criterion: 'quality', evidenceRef: 'renderer-output',
  })
  const serialized = JSON.stringify(result, null, 2)

  assert.ok(Buffer.byteLength(serialized, 'utf8') <= 64 * 1024)
  for (const secret of [
    'bearer-secret-value', 'dXNlcjpwYXNzd29yZA', 'key-value-secret', 'abcdefghijklmnopqrstuvwxyz', 'private-key-material',
    'dbpassword', 'supersecret', 'private-key-material-without-footer',
    '/Users/alice', '/home/alice', '/etc/private.conf', String.raw`C:\Users\alice`, String.raw`\\server\share`,
  ]) assert.doesNotMatch(serialized, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(serialized, /REDACTED/)
  assert.match(serialized, /\[local path\]/)

  assessment.output = {
    kind: 'structured',
    format: 'json',
    content: Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`field-${index}`, 'z'.repeat(20_000)])),
  }
  await writeFile(assessmentPath, JSON.stringify(assessment))
  const oversized = await service.getEvidence({
    workspace, job: 'job-42', trial: 'exec-a', criterion: 'quality', evidenceRef: 'renderer-output',
  })
  assert.ok(Buffer.byteLength(JSON.stringify(oversized), 'utf8') <= 64 * 1024)
  assert.equal(oversized.evidence.available, false)
  assert.match(oversized.evidence.reason, /65536-byte serialized response limit/)
})

test('evidence content is selected by one exact provenance id and never borrowed from a generic preview', async () => {
  const { projectRoot, service, workspace } = await fixture()
  const assessmentPath = path.join(projectRoot, 'jobs', 'job-42', 'trial-assessments', 'exec-a.json')
  const assessment = JSON.parse(await readFile(assessmentPath, 'utf8'))
  assessment.criteria[0].evidence_refs.push('judge-explanation')
  assessment.evidence_provenance.push({
    id: 'judge-explanation',
    kind: 'judge-explanation',
    label: 'Judge Explanation',
    artifact_ref: 'verifier_result.judge_explanation',
    reward_affecting: true,
  })
  assessment.output.content = 'must-not-be-borrowed-for-judge-evidence'
  await writeFile(assessmentPath, JSON.stringify(assessment))

  const result = await service.getEvidence({
    workspace, job: 'job-42', trial: 'exec-a', criterion: 'quality', evidenceRef: 'judge-explanation',
  })
  assert.equal(result.evidence.artifact.available, false)
  assert.match(result.evidence.artifact.reason, /Exact artifact content is not exposed/)
  assert.doesNotMatch(JSON.stringify(result), /must-not-be-borrowed-for-judge-evidence/)

  assessment.evidence_provenance.push({ ...assessment.evidence_provenance.at(-1) })
  await writeFile(assessmentPath, JSON.stringify(assessment))
  await assert.rejects(
    service.getEvidence({
      workspace, job: 'job-42', trial: 'exec-a', criterion: 'quality', evidenceRef: 'judge-explanation',
    }),
    /HARBOR_EVIDENCE_PROVENANCE_AMBIGUOUS/,
  )
})

test('interaction summaries drop malformed metadata values and do not infer comparability from capability', async () => {
  const { projectRoot, service, workspace } = await fixture()
  const jobDirectory = path.join(projectRoot, 'jobs', 'job-42')
  const summaryPath = path.join(jobDirectory, 'evaluation-summary.json')
  const lifecyclePath = path.join(jobDirectory, 'trial-lifecycle.json')
  const assessmentPath = path.join(jobDirectory, 'trial-assessments', 'exec-a.json')
  const summary = JSON.parse(await readFile(summaryPath, 'utf8'))
  const lifecycle = JSON.parse(await readFile(lifecyclePath, 'utf8'))
  const assessment = JSON.parse(await readFile(assessmentPath, 'utf8'))
  summary.mode = 'sk-proj-abcdefghijklmnopqrstuvwxyz'
  summary.metrics = { reward: 0.5, '/private/metric-name': 1, infinite: null }
  lifecycle.updated_at = { malicious: true }
  lifecycle.dataset_total = { malicious: true }
  lifecycle.trials[0].attempt = { malicious: true }
  lifecycle.trials[0].terminal = 'yes'
  lifecycle.trials[0].updated_at = { malicious: true }
  lifecycle.trials[0].score = { value: { malicious: true }, valid: 'true', invalid_reasons: [{ malicious: true }] }
  assessment.score = { value: { malicious: true }, valid: 'true', invalid_reasons: [{ malicious: true }] }
  await writeFile(summaryPath, JSON.stringify(summary))
  await writeFile(lifecyclePath, JSON.stringify(lifecycle))
  await writeFile(assessmentPath, JSON.stringify(assessment))

  const bound = await service.bindUiContext({ sessionId: 'session-1', context: context(workspace) })
  const resolved = await service.resolveUiContext(
    { contextSnapshotId: bound.contextSnapshotId },
    { sessionId: 'session-1', projectRoot },
  )
  const serialized = JSON.stringify(resolved.currentState)
  assert.doesNotMatch(serialized, /malicious|sk-proj|private\/metric-name/)
  assert.equal(resolved.currentState.job.mode, undefined)
  assert.equal(resolved.currentState.job.progress.updatedAt, undefined)
  assert.equal(resolved.currentState.job.progress.datasetTotal, undefined)
  assert.equal(resolved.currentState.trial.attempt, undefined)
  assert.equal(resolved.currentState.trial.terminal, undefined)
  assert.equal(resolved.currentState.trial.score.value, undefined)
  assert.equal(resolved.currentState.trial.score.valid, undefined)
  assert.equal('comparable' in resolved.context.flags, false)
})

test('authoritative session project lookup never falls back to a stale cached root', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-ui-session-root-'))
  let liveRoot = projectRoot
  const service = new EvolutionService(
    { projectRoot, jobsDir: 'jobs' },
    { sessionProjectRoot: () => liveRoot },
  )

  await service.dashboard({ sessionId: 'session-live' })
  liveRoot = undefined
  await assert.rejects(
    service.dashboard({ sessionId: 'session-live' }),
    /HARBOR_SESSION_PROJECT_UNAVAILABLE/,
  )
})
