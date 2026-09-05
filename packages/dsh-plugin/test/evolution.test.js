import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import { assertHistoricalCompletion, buildEvaluationRunReceipt, buildHistoricalRunReceipt, classifyHarborFailure, explainHarborFailure, historicalDockerBlockers, makeHistoricalJobName, makeJobName, redactDiagnostic, resolveWithin } from '../lib/evolution.js'
import { dockerDesktopAwareEnv, runProcess } from '../lib/process.js'

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

test('mutating evaluation runs return bounded receipts instead of raw artifacts', () => {
  const credential = 'Bearer mutation-result-secret-material'
  const candidate = buildEvaluationRunReceipt({
    jobName: 'candidate-job',
    mode: 'promotion-eligible',
    processCode: 0,
    summary: {
      schema_version: 3,
      n_trials: 4,
      n_valid_scores: 3,
      n_invalid_scores: 1,
      artifact_validation: { valid: true },
      trials: [{ output: credential }],
      diagnostics: `${credential}${'x'.repeat(20_000)}`,
      request_headers: { authorization: credential },
    },
    doctor: { findings: [{ message: credential }] },
    contextPreview: { private: credential },
  })
  assert.deepEqual(candidate, {
    schema_version: 1,
    jobKind: 'candidate-evaluation',
    mode: 'promotion-eligible',
    status: 'completed',
    job: 'candidate-job',
    summary: {
      artifact_ref: 'evaluation-summary.json',
      artifact_validation: { valid: true },
      schema_version: 3,
      n_trials: 4,
      n_valid_scores: 3,
      n_invalid_scores: 1,
    },
    process: { code: 0 },
  })
  assert.doesNotMatch(JSON.stringify(candidate), /mutation-result-secret-material|request_headers|diagnostics/)

  const historical = buildHistoricalRunReceipt({
    jobName: 'sk-proj-abcdefghijklmnopqrstuv',
    processCode: 0,
    summary: {
      schema_version: 4,
      n_trials: 2,
      n_valid_scores: 1,
      n_invalid_scores: 0,
      n_unscored_trials: 1,
      artifact_validation: { valid: true },
      coverage: {
        scored_trials: 1,
        unscored_trials: 1,
        total_trials: 2,
        trial_rate: 0.5,
        criterion_scored: 4,
        criterion_total: 8,
        criterion_rate: 0.5,
        private_note: credential,
      },
      private_note: credential,
    },
    completion: { private_note: credential },
    judgeModelBinding: { model: credential },
  })
  assert.equal(historical.job, '[redacted token]')
  assert.deepEqual(historical.summary.coverage, {
    scored_trials: 1,
    unscored_trials: 1,
    total_trials: 2,
    trial_rate: 0.5,
    criterion_scored: 4,
    criterion_total: 8,
    criterion_rate: 0.5,
  })
  assert.deepEqual(historical.completion, {
    schema_version: 1,
    status: 'completed',
    valid: true,
    artifact_ref: 'historical-evaluation-complete.json',
  })
  assert.doesNotMatch(JSON.stringify(historical), /mutation-result-secret-material|private_note|judgeModelBinding/)
  assert.ok(JSON.stringify(historical).length < 2_000)
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

test('macOS child processes inherit the Docker Desktop credential-helper directory once', () => {
  const dockerBin = '/Applications/Docker.app/Contents/Resources/bin'
  const source = { PATH: '/usr/local/bin:/usr/bin', KEEP: 'value' }
  const augmented = dockerDesktopAwareEnv(source, { platform: 'darwin', pathExists: () => true })
  assert.deepEqual(augmented, { ...source, PATH: `${dockerBin}:${source.PATH}` })
  assert.equal(dockerDesktopAwareEnv(augmented, { platform: 'darwin', pathExists: () => true }), augmented)
  assert.equal(dockerDesktopAwareEnv(source, { platform: 'linux', pathExists: () => true }), source)
  assert.equal(dockerDesktopAwareEnv(source, { platform: 'darwin', pathExists: () => false }), source)
})

test('Historical Docker preflight blocks only stable Docker error findings', () => {
  const blocking = { level: 'error', code: 'DOCKER_CREDENTIAL_HELPER_MISSING', message: 'repair helper' }
  assert.deepEqual(historicalDockerBlockers({ findings: [
    blocking,
    { level: 'warning', code: 'DOCKER_BASE_IMAGE_NOT_LOCAL' },
    { level: 'error', code: 'OTHER_FAILURE' },
  ] }), [blocking])
  assert.deepEqual(historicalDockerBlockers({}), [])
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
  assert.doesNotMatch(explained.message, /\/tmp\/jobs\/demo/)
  assert.match(redactDiagnostic('Basic dXNlcjpwYXNzd29yZA=='), /Basic \[redacted\]/)
  assert.match(redactDiagnostic('Bearer naked-secret-value'), /Bearer \[redacted\]/)
  assert.match(redactDiagnostic('apiKey=secret-value'), /apiKey=\[redacted\]/)
  assert.doesNotMatch(redactDiagnostic('Authorization: "Basic dXNlcjpwYXNzd29yZA=="'), /dXNlcjpwYXNzd29yZA/)
  assert.doesNotMatch(redactDiagnostic('token = "abc def ghi"'), /abc|def|ghi/)
  assert.doesNotMatch(redactDiagnostic('token = "abc\'def"; secret=\'ghi"jkl\''), /abc|def|ghi|jkl/)
  assert.doesNotMatch(redactDiagnostic('api_key="escaped\\\"quote tail"'), /escaped|quote|tail/)
  assert.doesNotMatch(redactDiagnostic('password = `correct horse battery staple`'), /correct|horse|battery|staple/)
  assert.doesNotMatch(redactDiagnostic('OPENAI_API_KEY="abcdefghijklmnopqrstuvwx"'), /abcdefghijklmnopqrstuvwx/)
  assert.doesNotMatch(redactDiagnostic('AWS_SECRET_ACCESS_KEY=aws-secret-access-material'), /aws-secret-access-material/)
  assert.equal(redactDiagnostic('failure at /Users/alice/private/report.json'), 'failure at [local path]')
  assert.equal(redactDiagnostic('failure at /Users/mac/My Secret Folder/credentials.txt'), 'failure at [local path]')
  assert.equal(redactDiagnostic('failure at C:\\Users\\Mac User\\secret.txt'), 'failure at [local path]')
  assert.equal(classifyHarborFailure('Either datasets or tasks must be provided.')[0].code, 'DATASET_NOT_RESOLVED')
  assert.equal(classifyHarborFailure('evaluation-result.json is missing')[0].code, 'EVALUATOR_RESULT_MISSING')
})
