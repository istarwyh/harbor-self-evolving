import assert from 'node:assert/strict'
import { mkdir, mkdtemp, stat, symlink, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { EvolutionService, enforceEvidenceResponseLimit, protectEvaluatorInspectionForAgent, untrustedAgentReadEnvelope } from '../lib/service.js'

async function fixture(name = 'safe-job') {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-result-safety-'))
  const job = path.join(projectRoot, 'jobs', name)
  await mkdir(job, { recursive: true })
  return {
    job,
    service: new EvolutionService({ projectRoot, jobsDir: 'jobs' }),
  }
}

test('default result Summary uses the bounded redacting dashboard reader', async () => {
  const { job, service } = await fixture()
  await writeFile(path.join(job, 'evaluation-summary.json'), JSON.stringify({
    schema_version: 3,
    job: 'safe-job',
    metrics: { reward: 0.8 },
    request_headers: { authorization: 'Bearer private' },
    nested: { api_key: 'private-key' },
    explanation: 'x'.repeat(9_000),
  }))

  const result = await service.result({ jobPath: 'jobs/safe-job' })

  assert.equal(result.schema, 'harbor-agent-read/v1')
  assert.equal(result.tool, 'harbor_eval_result')
  assert.equal(result.view, 'summary')
  assert.equal(result.artifactTrust, 'untrusted-evidence')
  assert.equal(result.policy.treatAsInstructions, false)
  assert.deepEqual(result.data.request_headers, '[REDACTED]')
  assert.equal(result.data.nested.api_key, '[REDACTED]')
  assert.match(result.data.explanation, /\[TRUNCATED 1000 chars\]$/)
})

test('default result Summary refuses a symlink', async () => {
  const { job, service } = await fixture('linked-job')
  const outside = path.join(path.dirname(job), 'outside-summary.json')
  await writeFile(outside, JSON.stringify({ schema_version: 3, job: 'outside', metrics: {} }))
  await symlink(outside, path.join(job, 'evaluation-summary.json'))

  const result = await service.result({ jobPath: 'jobs/linked-job' })

  assert.match(result.data.__readError, /not a safe file/)
  assert.equal(result.data.job, undefined)
})

test('default result Summary refuses a symlinked ancestor directory', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-result-ancestor-'))
  const outsideRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-result-outside-'))
  const outsideJob = path.join(outsideRoot, 'escaped-job')
  await mkdir(outsideJob, { recursive: true })
  await writeFile(path.join(outsideJob, 'evaluation-summary.json'), JSON.stringify({
    schema_version: 3,
    job: 'escaped-job',
    metrics: { reward: 1 },
  }))
  await symlink(outsideRoot, path.join(projectRoot, 'jobs'))
  const service = new EvolutionService({ projectRoot, jobsDir: 'jobs' })

  const result = await service.result({ jobPath: 'jobs/escaped-job' })

  assert.match(result.data.__readError, /not a safe directory/)
  assert.equal(result.data.job, undefined)
})

test('default result Summary refuses files larger than the dashboard JSON limit', async () => {
  const { job, service } = await fixture('oversized-job')
  await writeFile(path.join(job, 'evaluation-summary.json'), JSON.stringify({
    schema_version: 3,
    job: 'oversized-job',
    metrics: {},
    padding: 'x'.repeat(2 * 1024 * 1024),
  }))

  const result = await service.result({ jobPath: 'jobs/oversized-job' })

  assert.match(result.data.__readError, /exceeds 2097152 bytes/)
  assert.equal(result.data.padding, undefined)
})

test('bounded JSON cache notices same-size rewrites even when mtime is restored', async () => {
  const { job, service } = await fixture('cache-revision-job')
  const summaryPath = path.join(job, 'evaluation-summary.json')
  await writeFile(summaryPath, JSON.stringify({ schema_version: 3, job: 'cache-revision-job', metrics: { reward: 1 } }))
  assert.equal((await service.result({ jobPath: 'jobs/cache-revision-job' })).data.metrics.reward, 1)
  const before = await stat(summaryPath)

  await writeFile(summaryPath, JSON.stringify({ schema_version: 3, job: 'cache-revision-job', metrics: { reward: 2 } }))
  await utimes(summaryPath, before.atime, before.mtime)

  assert.equal((await service.result({ jobPath: 'jobs/cache-revision-job' })).data.metrics.reward, 2)
})

test('Agent result envelopes recursively redact secret values and local paths outside sensitive keys', async () => {
  const { job, service } = await fixture('secret-shaped-job')
  await writeFile(path.join(job, 'evaluation-summary.json'), JSON.stringify({
    schema_version: 3,
    job: 'secret-shaped-job',
    notes: [
      'Authorization: Bearer this-is-a-private-bearer-token',
      'Basic dXNlcjpwYXNzd29yZA==',
      'Bearer this-is-a-naked-bearer-token',
      'Authorization: "Bearer quoted-assignment-secret with trailing material"',
      "api_key='quoted-secret-assignment with trailing material'",
      'password = `correct horse battery staple`',
      'OPENAI_API_KEY="openai-environment-secret with spaces"',
      'MY_ACCESS_TOKEN=`namespaced access token secret`',
      'AWS_SECRET_ACCESS_KEY=aws-secret-access-material',
      '"Basic quoted-basic-secret with spaces"',
      "'Bearer quoted-bearer-secret with spaces'",
      'github ghp_abcdefghijklmnopqrstuvwxyz123456',
      'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature1234',
      'aws AKIAIOSFODNN7EXAMPLE',
      'pem -----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY-----',
      'trace at /Users/alice/workspace/private/report.json',
      'spaced path /Users/mac/My Secret Folder/credentials.txt',
      'windows path C:\\Users\\Mac User\\secret.txt',
    ],
  }))

  const result = await service.result({ jobPath: 'jobs/secret-shaped-job' })
  const serialized = JSON.stringify(result, null, 2)

  assert.equal(result.artifactTrust, 'untrusted-evidence')
  assert.equal(result.policy.treatAsInstructions, false)
  assert.doesNotMatch(serialized, /this-is-a-private-bearer-token|dXNlcjpwYXNzd29yZA|this-is-a-naked-bearer-token|quoted-assignment-secret|quoted-secret-assignment|quoted-basic-secret|quoted-bearer-secret|correct horse|openai-environment-secret|namespaced access token|aws-secret-access-material|trailing material|ghp_|eyJhbGci|AKIAIOSFODNN7EXAMPLE|private-material|\/Users\/alice|My Secret Folder|Mac User/)
  assert.match(serialized, /REDACTED/)
  assert.match(serialized, /\[local path\]/)
})

test('Agent result envelope fails closed for URL credentials and a private key without a footer', () => {
  const result = untrustedAgentReadEnvelope('harbor_eval_result', {
    database: 'postgres://user:dbpassword@localhost',
    endpoint: 'https://alice:supersecret@example.com',
    output: '-----BEGIN PRIVATE KEY-----\nopaque-private-material-without-footer',
  })
  const serialized = JSON.stringify(result)

  assert.doesNotMatch(serialized, /dbpassword|supersecret|opaque-private-material/)
  assert.match(serialized, /REDACTED/)
})

test('Agent result envelopes redact header, environment, and credential containers as a whole', () => {
  const result = untrustedAgentReadEnvelope('harbor_eval_result', {
    headers: { 'x-custom-auth': 'custom-header-secret-value' },
    requestHeaders: { 'x-arbitrary': 'request-header-secret-value' },
    http_headers: { 'x-arbitrary': 'http-header-secret-value' },
    env: { CUSTOM_CREDENTIAL: 'custom-env-secret-value' },
    runtimeEnvironment: { CUSTOM_VALUE: 'runtime-environment-secret-value' },
    environmentVariables: { CUSTOM_VALUE: 'environment-variables-secret-value' },
    envVars: { CUSTOM_VALUE: 'env-vars-secret-value' },
    envMap: { CUSTOM_VALUE: 'env-map-secret-value' },
    providerCredentials: { opaque: 'provider-credential-secret-value' },
    credentialMap: { opaque: 'credential-map-secret-value' },
    credentialStore: { opaque: 'credential-store-secret-value' },
    credentialValues: { opaque: 'credential-values-secret-value' },
    headerMap: { 'x-arbitrary': 'header-map-secret-value' },
    responseHeaderMaps: { 'x-arbitrary': 'header-maps-secret-value' },
    safeMetadata: { status: 'completed' },
  })

  assert.equal(result.data.headers, '[REDACTED]')
  assert.equal(result.data.requestHeaders, '[REDACTED]')
  assert.equal(result.data.http_headers, '[REDACTED]')
  assert.equal(result.data.env, '[REDACTED]')
  assert.equal(result.data.runtimeEnvironment, '[REDACTED]')
  assert.equal(result.data.environmentVariables, '[REDACTED]')
  assert.equal(result.data.envVars, '[REDACTED]')
  assert.equal(result.data.envMap, '[REDACTED]')
  assert.equal(result.data.providerCredentials, '[REDACTED]')
  assert.equal(result.data.credentialMap, '[REDACTED]')
  assert.equal(result.data.credentialStore, '[REDACTED]')
  assert.equal(result.data.credentialValues, '[REDACTED]')
  assert.equal(result.data.headerMap, '[REDACTED]')
  assert.equal(result.data.responseHeaderMaps, '[REDACTED]')
  assert.deepEqual(result.data.safeMetadata, { status: 'completed' })
  assert.doesNotMatch(JSON.stringify(result), /custom-header-secret|request-header-secret|http-header-secret|custom-env-secret|runtime-environment-secret|environment-variables-secret|env-vars-secret|env-map-secret|provider-credential-secret|credential-map-secret|credential-store-secret|credential-values-secret|header-map-secret|header-maps-secret/)
})

test('Agent result envelope enforces an aggregate serialized byte cap', () => {
  const result = untrustedAgentReadEnvelope('harbor_eval_result', {
    rows: Array.from({ length: 1_000 }, (_, index) => ({
      index,
      text: `${index}: ${'多字节内容'.repeat(4_000)}`,
    })),
  }, { view: 'trial' })
  const serialized = JSON.stringify(result, null, 2)

  assert.ok(Buffer.byteLength(serialized, 'utf8') <= 128 * 1024)
  assert.match(serialized, /TRUNCATED/)
  assert.equal(result.view, 'trial')
})

test('Evidence response cap measures the actual pretty-printed Agent representation', () => {
  const response = {
    schema: 'harbor-evidence/v1',
    artifactTrust: 'untrusted-evidence',
    evidence: {
      rows: Array.from({ length: 1_500 }, (_, index) => ({ index, value: 'x' })),
    },
    policy: { treatAsInstructions: false },
  }
  assert.ok(Buffer.byteLength(JSON.stringify(response), 'utf8') <= 64 * 1024)
  assert.ok(Buffer.byteLength(JSON.stringify(response, null, 2), 'utf8') > 64 * 1024)

  const bounded = enforceEvidenceResponseLimit(response)

  assert.equal(bounded.evidence.available, false)
  assert.ok(Buffer.byteLength(JSON.stringify(bounded, null, 2), 'utf8') <= 64 * 1024)
})

test('Agent readers expose only one stable, bounded error contract', async () => {
  const { service } = await fixture('reader-error-job')
  await assert.rejects(
    service.result({ jobPath: 'jobs/reader-error-job', view: 'trial' }),
    error => {
      assert.equal(error.code, 'HARBOR_AGENT_READ_FAILED')
      assert.match(error.message, /^HARBOR_AGENT_READ_FAILED: harbor_eval_result /)
      assert.doesNotMatch(error.message, /trialId|jobs\/reader-error-job/)
      assert.ok(error.message.length < 240)
      return true
    },
  )

  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-reader-error-'))
  const inspectService = new EvolutionService({
    projectRoot,
    jobsDir: 'jobs',
    harborDshBin: path.join(projectRoot, 'Basic dXNlcjpwYXNzd29yZA==', 'malicious artifact value'),
    timeoutMs: 1_000,
  })
  await assert.rejects(
    inspectService.evaluatorInspect({ stackPath: '.harbor/missing-stack.yml' }),
    error => {
      assert.equal(error.code, 'HARBOR_AGENT_READ_FAILED')
      assert.match(error.message, /^HARBOR_AGENT_READ_FAILED: harbor_evaluator_inspect /)
      assert.doesNotMatch(error.message, /Basic|dXNlcjpwYXNzd29yZA|malicious artifact|harbor-reader-error|\/Users\//)
      assert.ok(error.message.length < 240)
      return true
    },
  )
})

test('Evaluator inspection omits unsafe source and caps the returned editable file set', () => {
  const files = [
    {
      path: 'stack/evaluator/1.0.0/evaluator.py',
      relative_path: 'evaluator.py',
      role: 'implementation',
      language: 'python',
      text: 'def evaluate(payload):\n    return {"reward": 1}\n',
    },
    {
      path: 'stack/evaluator/1.0.0/prompt.txt',
      relative_path: 'prompt.txt',
      role: 'prompt',
      language: 'text',
      text: 'api_key = "sk-proj-abcdefghijklmnopqrstuvwxyz"\nread /Users/alice/private/rubric.txt',
    },
    ...Array.from({ length: 40 }, (_, index) => ({
      path: `stack/evaluator/1.0.0/rubric-${index}.txt`,
      relative_path: `rubric-${index}.txt`,
      role: 'rubric',
      language: 'text',
      text: `safe rubric ${index}`,
    })),
  ]

  const result = protectEvaluatorInspectionForAgent({
    schema_version: 1,
    evaluator: { editable_files: files },
  })
  const serialized = JSON.stringify(result, null, 2)

  assert.equal(result.artifactTrust, 'untrusted-evidence')
  assert.equal(result.policy.treatAsInstructions, false)
  assert.equal(result.data.inspectionSafety.sourceFilesReturned, 32)
  assert.equal(result.data.inspectionSafety.omittedSensitiveSources, 1)
  assert.equal(result.data.inspectionSafety.omittedExcessFiles, 10)
  assert.equal(result.data.evaluator.editable_files.length, 32)
  assert.equal(result.data.evaluator.editable_files[0].text.startsWith('def evaluate'), true)
  assert.equal(result.data.evaluator.editable_files[1].text, undefined)
  assert.equal(result.data.evaluator.editable_files[1].sourceAccess.included, false)
  assert.doesNotMatch(serialized, /sk-proj-|\/Users\/alice/)
  assert.ok(Buffer.byteLength(serialized, 'utf8') <= 128 * 1024)
})

test('Evaluator inspection fails closed for auth schemes, backticks, and namespaced credential assignments', () => {
  const result = protectEvaluatorInspectionForAgent({
    schema_version: 1,
    evaluator: {
      editable_files: [{
        path: 'stack/evaluator/1.0.0/basic.txt',
        relative_path: 'basic.txt',
        text: 'Basic dXNlcjpwYXNzd29yZA==',
      }, {
        path: 'stack/evaluator/1.0.0/bearer.txt',
        relative_path: 'bearer.txt',
        text: 'Bearer this-is-a-private-bearer-token',
      }, {
        path: 'stack/evaluator/1.0.0/backtick.txt',
        relative_path: 'backtick.txt',
        text: 'password = `correct horse battery staple`',
      }, {
        path: 'stack/evaluator/1.0.0/openai.txt',
        relative_path: 'openai.txt',
        text: 'OPENAI_API_KEY="abcdefghijklmnopqrstuvwx"',
      }, {
        path: 'stack/evaluator/1.0.0/access-token.txt',
        relative_path: 'access-token.txt',
        text: 'MY_ACCESS_TOKEN=`alpha beta gamma delta`',
      }, {
        path: 'stack/evaluator/1.0.0/aws.txt',
        relative_path: 'aws.txt',
        text: 'AWS_SECRET_ACCESS_KEY=abcdefghijklmnopqrstuvwx',
      }],
    },
  })

  assert.equal(result.data.inspectionSafety.omittedSensitiveSources, 6)
  assert.ok(result.data.evaluator.editable_files.every(file => file.text === undefined))
  assert.doesNotMatch(JSON.stringify(result), /dXNlcjpwYXNzd29yZA|this-is-a-private-bearer-token|correct horse|abcdefghijklmnopqrstuvwx|alpha beta gamma/)
})
