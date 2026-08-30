import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import { assertHistoricalCompletion, classifyHarborFailure, explainHarborFailure, makeHistoricalJobName, makeJobName, redactDiagnostic, resolveWithin } from '../lib/evolution.js'
import { runProcess } from '../lib/process.js'

test('paths are constrained to the configured project root', () => {
  const root = path.resolve('/tmp/project')
  assert.equal(resolveWithin(root, 'candidates/v1', 'candidate'), path.join(root, 'candidates/v1'))
  assert.throws(() => resolveWithin(root, '../outside', 'candidate'), error => {
    assert.match(error.message, /PATH_OUTSIDE_PROJECT_ROOT/)
    assert.match(error.message, /projectRoot: \/tmp\/project/)
    assert.match(error.message, /candidate: \.\.\/outside/)
    assert.match(error.message, /Recommended fix/)
    return true
  })
})

test('job names are generated from candidate identity and remain Harbor-safe', () => {
  const name = makeJobName({
    candidate_id: '@team/deep research agent',
    version: '2.0.0+preview',
    digest: `sha256:${'a'.repeat(64)}`,
  }, new Date('2026-08-17T12:34:56.789Z'))
  assert.equal(name, 'team-deep-research-agent-2.0.0-preview-20260817T123456Z-aaaaaaaa')
  assert.match(name, /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/)
})

test('Historical Job names use Batch identity without inventing a Candidate', () => {
  const name = makeHistoricalJobName(
    { digest: `sha256:${'b'.repeat(64)}` },
    new Date('2026-08-30T12:34:56.789Z'),
  )
  assert.equal(name, 'dsh-session-history-20260830T123456Z-bbbbbbbb')
  assert.match(name, /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/)
})

test('Historical completion validation rejects stale or incomplete plugin sentinels', () => {
  const digest = `sha256:${'c'.repeat(64)}`
  const coverage = {
    scored_trials: 1,
    unscored_trials: 0,
    total_trials: 1,
    trial_rate: 1,
    criterion_scored: 4,
    criterion_total: 4,
    criterion_rate: 1,
  }
  const summary = {
    schema_version: 4,
    job: 'historical-job',
    job_kind: 'historical-generation-evaluation',
    mode: 'diagnostic',
    execution_mode: 'observe-existing',
    evaluation_target: { digest, batch_id: 'batch-1', record_count: 1 },
    n_trials: 1,
    artifact_validation: { valid: true },
    coverage,
  }
  const completion = {
    schema_version: 1,
    job_kind: 'historical-generation-evaluation',
    status: 'completed',
    valid: true,
    job: 'historical-job',
    summary_path: 'evaluation-summary.json',
    artifact_registry_path: 'artifact-registry.json',
    coverage,
  }
  assert.doesNotThrow(() => assertHistoricalCompletion(summary, completion, {
    jobName: 'historical-job',
    batchDigest: digest,
    batchId: 'batch-1',
    recordCount: 1,
  }))
  for (const malformed of [
    {},
    { ...completion, status: 'unknown' },
    { ...completion, job_kind: 'candidate-evaluation' },
    { ...completion, job: 'old-job' },
    { ...completion, coverage: { ...coverage, scored_trials: 0 } },
  ]) {
    assert.throws(
      () => assertHistoricalCompletion(summary, malformed, {
        jobName: 'historical-job',
        batchDigest: digest,
        batchId: 'batch-1',
        recordCount: 1,
      }),
      /HISTORICAL_JOB_ARTIFACT_VALIDATION_FAILED/,
    )
  }
  assert.throws(
    () => assertHistoricalCompletion(
      { ...summary, artifact_validation: { valid: false } },
      completion,
      { jobName: 'historical-job', batchDigest: digest, batchId: 'batch-1', recordCount: 1 },
    ),
    /HISTORICAL_JOB_IDENTITY_INVALID/,
  )
})

test('a policy rejection can be treated as a structured result', async () => {
  const result = await runProcess(process.execPath, ['-e', 'process.stdout.write("REJECT"); process.exit(1)'], {
    allowedExitCodes: [0, 1],
    timeoutMs: 1000,
  })
  assert.equal(result.code, 1)
  assert.equal(result.stdout, 'REJECT')
})

test('process input is delivered over stdin without shell interpolation', async () => {
  const input = 'source with $HOME and `backticks`'
  const result = await runProcess(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], {
    input,
    timeoutMs: 1000,
  })
  assert.equal(result.stdout, input)
})

test('Harbor failures expose a redacted diagnostic tail and actionable next step', async () => {
  const error = Object.assign(new Error('failed'), {
    result: {
      code: 1,
      stdout: '',
      stderr: 'Authorization: Bearer sk-live-secret\nAgentSetupTimeoutError: setup timed out',
    },
  })
  const explained = await explainHarborFailure(error, '/tmp/jobs/demo')
  assert.match(explained.message, /HARBOR_JOB_FAILED/)
  assert.match(explained.message, /AGENT_SETUP_TIMEOUT/)
  assert.doesNotMatch(explained.message, /sk-live-secret/)
  assert.match(redactDiagnostic('apiKey=secret-value'), /apiKey=\[redacted\]/)
  assert.equal(classifyHarborFailure('Either datasets or tasks must be provided.')[0].code, 'DATASET_NOT_RESOLVED')
  assert.equal(classifyHarborFailure('evaluation-result.json is missing')[0].code, 'EVALUATOR_RESULT_MISSING')
})
