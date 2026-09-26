import assert from 'node:assert/strict'
import test from 'node:test'

import { buildEvaluationReport } from '../lib/evaluation-report.js'

function historicalInput() {
  const criteria = (evidenceStatus = 'insufficient-evidence') => [
    { id: 'goal_progress', label: 'Goal progress', status: 'scored', score: 1 },
    { id: 'execution_reliability', label: 'Execution reliability', status: 'scored', score: 0.5 },
    { id: 'evidence_alignment', label: 'Evidence alignment', status: evidenceStatus, score: null },
    { id: 'interaction_quality', label: 'Interaction quality', status: 'scored', score: 1 },
  ]
  return {
    job: 'recent-sessions',
    summary: {
      schema_version: 4,
      job: 'recent-sessions',
      job_kind: 'historical-generation-evaluation',
      mode: 'diagnostic',
      n_trials: 4,
      n_valid_scores: 0,
      n_invalid_scores: 1,
      n_evaluation_exceptions: 1,
      n_infrastructure_exceptions: 0,
      coverage: {
        scored_trials: 0,
        unscored_trials: 3,
        total_trials: 4,
        trial_rate: 0,
        criterion_scored: 9,
        criterion_total: 16,
        criterion_rate: 0.5625,
      },
      metrics: {},
      trials: [
        { id: 'exec-1', datasetTrial: '01-session-a', generationRecord: { record_id: 'session-a' }, status: 'completed-unscored', score: { value: null, valid: false }, criteria: criteria() },
        { id: 'exec-2', datasetTrial: '02-session-b', generationRecord: { record_id: 'session-b' }, status: 'completed-unscored', score: { value: null, valid: false }, criteria: criteria() },
        { id: 'exec-3', datasetTrial: '03-session-c', generationRecord: { record_id: 'session-c' }, status: 'completed-unscored', score: { value: null, valid: false }, criteria: criteria() },
        { id: 'exec-4', datasetTrial: '04-session-d', generationRecord: { record_id: 'session-d' }, status: 'evaluation-error', score: { value: null, valid: false }, criteria: criteria('evaluation-error').map(item => ({ ...item, status: 'evaluation-error', score: null })) },
      ],
      artifact_validation: { valid: true },
      evaluator_meta_evaluation: { status: 'not-run', validation_report_ref: null },
    },
    context: {
      schema_version: 2,
      protocol: 'historical-generation-evaluation-context/v2',
      job_kind: 'historical-generation-evaluation',
      mode: 'diagnostic',
    },
    contract: {
      schema_version: 1,
      primary_metric: 'reward',
      metrics: [{ id: 'reward', direction: 'maximize' }],
    },
    stack: {
      schema_version: 1,
      components: {
        evaluator: {
          id: 'experience-evaluator',
          version: '1.0.0',
          digest: 'sha256:configured',
          interface: {
            interface: 'harbor-dsh-evaluator/v2',
            editable_files: [{ relative_path: 'evaluator.py' }],
            criteria: [{ id: 'goal_progress', label: 'Goal progress', required: true }],
          },
        },
      },
    },
    diagnosis: {
      diagnoses: [{
        root_cause: 'criterion-coverage-below-minimum',
        owner: 'evaluation-stack',
        affected_records: ['session-a', 'session-b', 'session-c', 'session-d'],
        evidence_refs: ['trial-assessments/session-a.json'],
      }],
    },
    optimization: {
      hypotheses: [{ id: 'change-generator', owner: 'generator', next_experiment: 'Change the Generator.' }],
    },
  }
}

test('Historical report preserves abstention and prioritizes the evidence gap', () => {
  const report = buildEvaluationReport(historicalInput())

  assert.equal(report.protocol, 'evaluation-report/v1')
  assert.equal(report.run.experience_diagnostic, true)
  assert.equal(report.run.evaluation_type, 'experience-diagnostic')
  assert.equal(report.run.promotion_eligible, false)
  assert.equal(report.verdict.code, 'insufficient-evidence')
  assert.equal(report.sample.scored, 0)
  assert.equal(report.sample.unscored, 3)
  assert.equal(report.sample.criterion_scored, 9)
  assert.equal(report.sample.criterion_total, 16)
  assert.equal(report.sample.criterion_coverage, 0.5625)
  assert.equal(report.sample.evaluation_errors, 1)
  assert.equal(report.quality.overall_score, null)
  assert.equal(report.quality.partial_signals.find(item => item.id === 'goal_progress').mean, null)
  assert.equal(report.quality.partial_signals.find(item => item.id === 'goal_progress').suppressed, true)
  assert.equal(report.evaluation_health.evaluator_reliability, 'unvalidated')
  assert.equal(report.effective_evaluator.status, 'unattested')
  assert.equal(report.effective_evaluator.configured.id, 'experience-evaluator')
  assert.equal(report.effective_evaluator.executed, null)
  assert.equal(report.next_action.owner, 'evaluation-evidence')
  assert.deepEqual(
    report.findings.slice(0, 2).map(item => [item.id, item.owner, item.affected_count]),
    [
      ['required-evidence-gap', 'evaluation-evidence', 3],
      ['evaluator-runtime-failure', 'evaluator-runtime', 1],
    ],
  )
  assert.equal(report.representative_cases[0].trial_id, 'session-d')
  assert.equal(report.representative_cases.some(item => item.score === 0), false)
})

test('Candidate report emits a reliable result only from the declared primary metric', () => {
  const report = buildEvaluationReport({
    job: 'candidate-v2',
    summary: {
      schema_version: 3,
      job: 'candidate-v2',
      mode: 'diagnostic',
      n_trials: 2,
      n_valid_scores: 2,
      n_invalid_scores: 0,
      n_evaluation_exceptions: 0,
      n_infrastructure_exceptions: 0,
      metrics: { reward: 0.8, secondary: 0.9 },
      trials: [
        { id: 'trial-1', status: 'completed', score: { value: 1, valid: true }, criteria: [] },
        { id: 'trial-2', status: 'completed', score: { value: 0.6, valid: true }, criteria: [] },
      ],
      artifact_validation: { valid: true },
      effective_evaluator: {
        schema_version: 1,
        protocol: 'effective-evaluator/v1',
        configured: { id: 'business-evaluator', version: '2.0.0', portable_digest: `sha256:${'a'.repeat(64)}` },
        materialized: { id: 'business-evaluator', version: '2.0.0', portable_digest: `sha256:${'a'.repeat(64)}`, bundle_complete: true },
        executed: { id: 'business-evaluator', version: '2.0.0', portable_digest: `sha256:${'a'.repeat(64)}`, bundle_complete: true },
        identity_match: true,
        execution: { status: 'succeeded', error_type: null },
      },
    },
    context: { schema_version: 3, job_kind: 'candidate-evaluation', mode: 'diagnostic' },
    contract: {
      primary_metric: 'reward',
      metrics: [
        { id: 'reward', label: 'Quality', direction: 'maximize' },
        { id: 'secondary', direction: 'maximize' },
      ],
    },
    validation: { jobBundle: { status: 'valid' } },
  })

  assert.equal(report.verdict.code, 'reliable-result')
  assert.equal(report.quality.primary_metric_id, 'reward')
  assert.equal(report.quality.overall_score, 0.8)
  assert.equal(report.run.experience_diagnostic, false)
})

test('Report never substitutes an arbitrary numeric metric for a missing primary metric', () => {
  const input = historicalInput()
  input.summary.n_valid_scores = 1
  input.summary.coverage.scored_trials = 1
  input.summary.coverage.unscored_trials = 3
  input.summary.metrics = { secondary: 0.9 }
  const report = buildEvaluationReport(input)

  assert.equal(report.quality.primary_metric_id, 'reward')
  assert.equal(report.quality.overall_score, null)
  assert.deepEqual(report.quality.metrics.map(item => item.id), ['secondary'])
})

test('An unattested or mismatched Evaluator can never produce a reliable verdict', () => {
  const base = {
    job: 'candidate-identity',
    summary: {
      schema_version: 3,
      job: 'candidate-identity',
      mode: 'diagnostic',
      n_trials: 1,
      n_valid_scores: 1,
      n_invalid_scores: 0,
      metrics: { reward: 1 },
      trials: [{ id: 'trial-1', status: 'completed', score: { value: 1, valid: true }, criteria: [] }],
      artifact_validation: { valid: true },
    },
    context: { schema_version: 3, job_kind: 'candidate-evaluation', mode: 'diagnostic' },
    contract: { primary_metric: 'reward', metrics: [{ id: 'reward', direction: 'maximize' }] },
    stack: { components: { evaluator: { id: 'configured-only', version: '1', digest: 'sha256:legacy' } } },
  }
  const unattested = buildEvaluationReport(base)
  assert.equal(unattested.verdict.code, 'actionable-with-limitations')
  assert.equal(unattested.effective_evaluator.status, 'unattested')
  assert.equal(unattested.quality.overall_score, null)
  assert.equal(unattested.quality.score_trusted, false)

  const mismatch = buildEvaluationReport({
    ...base,
    summary: {
      ...base.summary,
      effective_evaluator: {
        schema_version: 1,
        protocol: 'effective-evaluator/v1',
        configured: { id: 'configured-only', version: '1', portable_digest: `sha256:${'a'.repeat(64)}` },
        materialized: { id: 'configured-only', version: '1', portable_digest: `sha256:${'a'.repeat(64)}` },
        executed: { id: 'other', version: '1', portable_digest: `sha256:${'b'.repeat(64)}` },
        identity_match: false,
      },
    },
  })
  assert.equal(mismatch.verdict.code, 'evaluation-failed')
  assert.equal(mismatch.effective_evaluator.status, 'mismatch')
  assert.equal(mismatch.quality.overall_score, null)
  assert.equal(mismatch.next_action.owner, 'evaluator-runtime')
})

test('Failed Evaluator execution suppresses aggregate and representative-case scores', () => {
  const identity = { id: 'business-evaluator', version: '2', portable_digest: `sha256:${'a'.repeat(64)}` }
  const report = buildEvaluationReport({
    job: 'failed-evaluator',
    summary: {
      schema_version: 3, job: 'failed-evaluator', mode: 'diagnostic', n_trials: 1, n_valid_scores: 1, n_invalid_scores: 0,
      n_evaluation_exceptions: 0, n_infrastructure_exceptions: 0,
      coverage: { total_trials: 1, scored_trials: 1, unscored_trials: 0, trial_rate: 1 },
      metrics: { reward: 1 }, trials: [{ id: 'trial-1', status: 'completed', score: { value: 1, valid: true }, criteria: [] }],
      artifact_validation: { valid: true },
      effective_evaluator: { schema_version: 1, protocol: 'effective-evaluator/v1', configured: identity, materialized: { ...identity, bundle_complete: true }, executed: { ...identity, bundle_complete: true }, identity_match: true, execution: { status: 'failed', error_type: 'RuntimeError' } },
    },
    context: { schema_version: 3, job_kind: 'candidate-evaluation', mode: 'diagnostic' },
    contract: { primary_metric: 'reward', metrics: [{ id: 'reward', direction: 'maximize' }] },
    validation: { jobBundle: { status: 'valid' } },
  })

  assert.equal(report.verdict.code, 'evaluation-failed')
  assert.equal(report.effective_evaluator.status, 'execution-failed')
  assert.equal(report.quality.overall_score, null)
  assert.equal(report.representative_cases[0].score, null)
  assert.equal(report.representative_cases[0].score_suppressed, true)
})

test('Artifact validation failure owns the verdict instead of becoming a quality score', () => {
  const input = historicalInput()
  input.summary.artifact_validation.valid = false
  const report = buildEvaluationReport(input)

  assert.equal(report.verdict.code, 'run-failed')
  assert.equal(report.quality.overall_score, null)
  assert.equal(report.evaluation_health.status, 'failed')
})

test('External business results are additive and cannot mutate offline verdict, score, next action, or Gate eligibility', () => {
  const input = historicalInput()
  input.context = {
    schema_version: 3,
    protocol: 'candidate-evaluation-context/v3',
    mode: 'promotion-eligible',
    candidate: { id: 'support-agent', version: '2', digest: `sha256:${'a'.repeat(64)}` },
  }
  input.summary.job_kind = 'candidate-evaluation'
  input.summary.mode = 'promotion-eligible'
  const baseline = buildEvaluationReport(input)
  const businessResults = {
    status: 'matched-candidate',
    candidate_digest: input.context.candidate.digest,
    association_label: 'These observations are bound to the same Candidate digest as this Job.',
    causality: { status: 'correlation-only', label: 'Correlation only.', affects_offline_summary: false, affects_reward: false, affects_gate: false },
    observations: [{ observation_id: 'week-39' }],
    trends: [],
    groups: [],
  }
  const enriched = buildEvaluationReport({ ...input, businessResults })

  for (const key of ['run', 'verdict', 'sample', 'quality', 'evaluation_health', 'findings', 'next_action']) {
    assert.deepEqual(enriched[key], baseline[key])
  }
  assert.equal(enriched.run.promotion_eligible, true)
  assert.deepEqual(enriched.business_results, businessResults)
  assert.notDeepEqual(enriched.business_results, baseline.business_results)
})
