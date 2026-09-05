import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import test from 'node:test'

import {
  containsCredentialText,
  containsLocalPath,
  containsOpaqueSecretText,
  isSensitiveCredentialContainerKey,
  redactCredentialText,
  redactLocalPaths,
  redactOpaqueSecretText,
} from '../lib/credential-redaction.js'

test('credential assignment matching retains common namespaced key forms', () => {
  const value = [
    'OPENAI_API_KEY=openai-secret',
    'MY_ACCESS_TOKEN=my-secret',
    'AWS_SECRET_ACCESS_KEY=aws-secret',
    'foo-bar-password=hyphen-secret',
    'api_key=plain-secret',
  ].join('\n')

  const redacted = redactCredentialText(value)

  assert.doesNotMatch(redacted, /openai-secret|my-secret|aws-secret|hyphen-secret|plain-secret/)
  assert.equal((redacted.match(/\[REDACTED\]/g) ?? []).length, 5)
  assert.equal(containsCredentialText(value), true)
  assert.equal(containsCredentialText(redacted), true, 'preserved sensitive keys remain detectable after their values are redacted')
})

test('credential scanning remains bounded on long benign hyphenated text', () => {
  const benign = `${'same-visible-prefix-'.repeat(5_000)}ordinary-value`
  const started = performance.now()

  assert.equal(redactCredentialText(benign), benign)
  assert.equal(containsCredentialText(benign), false)

  const elapsed = performance.now() - started
  assert.ok(elapsed < 500, `100KB benign input took ${elapsed.toFixed(1)}ms`)
})

test('URL userinfo, opaque token families, and truncated PEM values fail closed', () => {
  const credentialUrls = [
    'postgres://user:dbpassword@localhost',
    'https://alice:supersecret@example.com',
    'https://superopaque@example.com',
    'postgres://dbtoken@localhost',
  ].join('\n')
  const opaque = [
    'github_pat_abcdefghijklmnopqrstuvwxyz123456',
    ['xoxb', '1234567890', 'syntheticfixtureonly'].join('-'),
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWNyZXQifQ.signaturepart',
    'ASIA1234567890ABCDEF',
    '-----BEGIN PRIVATE KEY-----\nopaque-private-material-without-footer',
  ].join('\n')

  const redactedUrls = redactCredentialText(credentialUrls)
  const redactedOpaque = redactOpaqueSecretText(opaque)

  assert.equal(containsCredentialText(credentialUrls), true)
  assert.doesNotMatch(redactedUrls, /dbpassword|supersecret|superopaque|dbtoken/)
  assert.match(redactedUrls, /postgres:\/\/\[REDACTED\]@localhost/)
  assert.equal(containsCredentialText(redactedUrls), false)
  assert.equal(containsOpaqueSecretText(opaque), true)
  assert.doesNotMatch(redactedOpaque, /github_pat_|syntheticfixtureonly|eyJ|ASIA|opaque-private-material/)
  assert.equal(containsOpaqueSecretText(redactedOpaque), false)
})

test('sensitive container classification covers header, environment, and credential variants', () => {
  for (const key of [
    'headers', 'requestHeaders', 'http_headers', 'headerMap', 'responseHeaderMaps',
    'env', 'runtimeEnvironment', 'environmentVariables', 'envVars', 'envMap',
    'providerCredentials', 'credentialMap', 'credentialStore', 'credentialValues',
  ]) assert.equal(isSensitiveCredentialContainerKey(key), true, key)
  assert.equal(isSensitiveCredentialContainerKey('safeMetadata'), false)
})

test('local path redaction includes a single absolute segment and preserves ordinary URLs and relative refs', () => {
  for (const value of ['/private', '/tmp', 'path=/private', '/Users/mac/My Secret/file.txt']) {
    assert.equal(containsLocalPath(value), true, value)
    assert.match(redactLocalPaths(value), /\[local path\]/)
  }
  for (const value of ['https://example.com/path', 'postgres://localhost', 'artifacts/result.json', 'generation_record.visible_transcript/1']) {
    assert.equal(containsLocalPath(value), false, value)
    assert.equal(redactLocalPaths(value), value)
  }
})
