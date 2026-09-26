import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import React from 'react'
import { build } from 'esbuild'

const compiled = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/evaluation-result.jsx', import.meta.url))],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  external: ['react'],
})
const module = { exports: {} }
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(name => {
  assert.equal(name, 'react')
  return React
}, module, module.exports)
const { EvaluationResult, EVALUATION_RESULT_MESSAGES } = module.exports

function flatten(node) {
  if (!node || typeof node !== 'object') return []
  return [node, ...React.Children.toArray(node.props?.children).flatMap(flatten)]
}

function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(text).join('')
  return node?.props ? text(node.props.children) : ''
}

function report() {
  return {
    run: { experience_diagnostic: true },
    verdict: { code: 'insufficient-evidence', summary: 'No valid overall Trial score is available.' },
    sample: { total: 4, scored: 0, criterion_coverage: 0.5625, evaluation_errors: 1 },
    quality: {
      overall_score: null,
      partial_signals: [
        { id: 'goal_progress', label: 'Goal progress', mean: 1, scored: 3, unscored: 1 },
      ],
    },
    generator_quality: { status: 'untrusted', overall_score: null },
    evaluation_health: { status: 'limited' },
    run_health: { status: 'failed', infrastructure_errors: 0 },
    effective_evaluator: {
      status: 'unattested',
      configured: { id: 'experience-evaluator', version: '1.0.0', digest: 'sha256:hidden' },
      executed: null,
    },
    evaluator_reliability: { status: 'unvalidated' },
    dataset_validity: { status: 'not-assessed' },
    business_results: {
      status: 'matched-candidate',
      candidate_digest: `sha256:${'a'.repeat(64)}`,
      association_label: 'These observations are bound to the same Candidate digest as this Job.',
      causality: { status: 'correlation-only', label: 'Correlation only.', affects_offline_summary: false, affects_reward: false, affects_gate: false },
      observations: [{
        schema_version: 1,
        protocol: 'business-observation/v1',
        observation_id: 'support-resolution-2026w39',
        source: { kind: 'analytics', id: 'support-dashboard', version: 'query-v3', provenance: 'reviewed aggregate export' },
        subject: { candidate_digest: `sha256:${'a'.repeat(64)}`, deployment_id: 'production-a' },
        window: { from: '2026-09-21T00:00:00Z', through: '2026-09-27T23:59:59Z' },
        metrics: [{ id: 'resolution_rate', value: 0.74, unit: 'ratio', direction: 'maximize', sample_size: 1830 }],
        segments: [],
        digest: `sha256:${'b'.repeat(64)}`,
      }],
      trends: [],
      groups: [],
    },
    findings: [
      { id: 'required-evidence-gap', owner: 'evaluation-evidence', affected_count: 3, summary: 'Required evidence was insufficient.' },
      { id: 'evaluator-runtime-failure', owner: 'evaluator-runtime', affected_count: 1, summary: 'The Judge did not complete reliably.' },
    ],
    representative_cases: [
      { trial_id: 'session-a', status: 'completed-unscored', score: null, score_valid: false },
    ],
    next_action: {
      owner: 'evaluation-evidence',
      change: 'Collect bounded execution evidence.',
      verification: 'Rerun the same metric template.',
    },
  }
}

test('Evaluation Result leads with the experience boundary, verdict, coverage, and one next action', () => {
  const opened = []
  const t = key => EVALUATION_RESULT_MESSAGES.en[key] ?? key
  const tree = EvaluationResult({ report: report(), openSection: section => opened.push(section), t })
  const nodes = flatten(tree)
  const visible = text(tree)

  assert.match(visible, /Experience diagnostic/)
  assert.match(visible, /not a formal business-quality conclusion/i)
  assert.match(visible, /Insufficient evidence for a reliable overall score/)
  assert.match(visible, /0\/4/)
  assert.match(visible, /56%/)
  assert.match(visible, /Not scoreable/)
  assert.match(visible, /Read the result in three parts/)
  assert.match(visible, /Generator qualitySignals exist but are not a trusted score/)
  assert.match(visible, /Evaluation healthLimited/)
  assert.match(visible, /Run healthFailed/)
  assert.match(visible, /experience-evaluator/)
  assert.match(visible, /does not prove the exact executed code/)
  assert.match(visible, /Required evidence was insufficient/)
  assert.match(visible, /The Judge did not complete reliably/)
  assert.match(visible, /Collect bounded execution evidence/)
  assert.match(visible, /Real business results/)
  assert.match(visible, /same Candidate digest/)
  assert.match(visible, /correlation, not causation/i)
  assert.match(visible, /resolution_rate: 0.74 ratio/)
  assert.match(visible, /Sample size 1830/)
  assert.doesNotMatch(visible, /completed-unscored/)
  assert.doesNotMatch(visible, /sha256:hidden/)
  assert.doesNotMatch(visible, new RegExp(`sha256:${'a'.repeat(64)}`))

  const open = nodes.find(node => node.type === 'button' && text(node) === 'Open tasks and evidence')
  open.props.onClick()
  assert.deepEqual(opened, ['trials'])
})
