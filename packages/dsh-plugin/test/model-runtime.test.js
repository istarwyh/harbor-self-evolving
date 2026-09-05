import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CandidateModelRuntime,
  MODEL_GATEWAY_PROTOCOL,
} from '../lib/model-runtime.js'

function runtime(options = {}) {
  const calls = []
  const status = options.status ?? { configured: true }
  const ctx = {
    agentDefaultModel: {
      currentSelection: () => ({
        provider: 'openai-codex',
        model: 'gpt-test',
        reasoningEffort: 'high',
      }),
    },
    llm: {
      listProviders: () => [
        { id: 'openai-codex', name: 'Codex' },
        { id: 'other', name: 'Other' },
      ],
      resolveModelInfo: async (provider, model) => ({
        provider,
        id: model,
        name: 'GPT Test',
        context: { contextWindow: 1000 },
      }),
      async * stream(value) {
        calls.push(value)
        if (options.stream) { yield * options.stream(value); return }
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: 'ok' }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: 'ok' } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
    get: name => name === 'codexAuth' ? { status: async () => status } : undefined,
  }
  return {
    calls,
    value: new CandidateModelRuntime(ctx, {
      candidateProvider: '',
      candidateModel: '',
      candidateReasoningEffort: '',
      modelBrokerBindHost: '127.0.0.1',
      modelBrokerAdvertisedHost: '127.0.0.1',
      modelBrokerMaxRequests: 2,
      modelBrokerMaxRequestBytes: 1024 * 1024,
      ...options.config,
    }),
  }
}

test('freezes the current DSH Agent model into a Candidate binding', async () => {
  const { value } = runtime()
  assert.deepEqual(await value.resolve(), {
    provider: 'openai-codex',
    model: 'gpt-test',
    reasoning_effort: 'high',
    transport: 'dsh-host-broker',
    protocol: MODEL_GATEWAY_PROTOCOL,
    model_info: {
      provider: 'openai-codex',
      id: 'gpt-test',
      name: 'GPT Test',
      context: { contextWindow: 1000 },
    },
  })
})

test('allows a complete explicit Candidate provider and model override', async () => {
  const { value } = runtime()
  const binding = await value.resolve({
    candidateProvider: 'other',
    candidateModel: 'other-model',
    candidateReasoningEffort: 'low',
  })
  assert.deepEqual(binding, {
    provider: 'other',
    model: 'other-model',
    reasoning_effort: 'low',
    transport: 'dsh-host-broker',
    protocol: MODEL_GATEWAY_PROTOCOL,
    model_info: {
      provider: 'other',
      id: 'other-model',
      name: 'GPT Test',
      context: { contextWindow: 1000 },
    },
  })
})

test('returns a non-secret current-model Candidate draft and honors its pinned identity', async () => {
  const { value } = runtime()
  assert.deepEqual(await value.currentBinding(), {
    schema_version: 1,
    source: 'skill-agent-default',
    provider: 'openai-codex',
    model: 'gpt-test',
    reasoning_effort: 'high',
  })

  const pinned = await value.resolve({}, {
    provider: 'other',
    model: 'pinned-model',
    reasoning_effort: 'low',
  })
  assert.equal(pinned.provider, 'other')
  assert.equal(pinned.model, 'pinned-model')
  assert.equal(pinned.reasoning_effort, 'low')
  await assert.rejects(
    value.resolve({ candidateProvider: 'other', candidateModel: 'different-model', candidateReasoningEffort: 'low' }, {
      provider: 'other', model: 'pinned-model', reasoning_effort: 'low',
    }),
    /CANDIDATE_MODEL_BINDING_CONFLICT/,
  )
})

test('Historical Judge default resolves the current Agent model without Candidate overrides', async () => {
  const { value } = runtime({
    config: {
      candidateProvider: 'other',
      candidateModel: 'configured-candidate',
      candidateReasoningEffort: 'low',
    },
  })
  const binding = await value.resolveCurrent()
  assert.equal(binding.provider, 'openai-codex')
  assert.equal(binding.model, 'gpt-test')
  assert.equal(binding.reasoning_effort, 'high')

  const halfConfigured = runtime({ config: { candidateProvider: 'other' } }).value
  assert.equal((await halfConfigured.resolveCurrent()).model, 'gpt-test')
})

test('fails before Harbor starts when GPT Auth is not signed in', async () => {
  const { value } = runtime({ status: { configured: false } })
  await assert.rejects(value.resolve(), /complete GPT Auth in Settings/)
})

test('rejects half-configured Candidate provider/model overrides', async () => {
  const { value } = runtime()
  await assert.rejects(value.resolve({ candidateProvider: 'other' }), /must be supplied together/)
  const configured = runtime({ config: { candidateProvider: 'other' } }).value
  await assert.rejects(configured.resolve(), /configuration must be supplied together/)
})

test('proxies an authenticated Candidate stream and forces the frozen route', async () => {
  const { value, calls } = runtime()
  const binding = await value.resolve()
  const lease = await value.openLease(binding, {
    candidateDigest: 'sha256:test',
    jobName: 'job-test',
  })
  try {
    const health = await fetch(lease.endpoint, {
      headers: { authorization: `Bearer ${lease.token}` },
    })
    assert.equal(health.status, 200)
    assert.equal((await health.json()).binding.provider, 'openai-codex')

    const response = await fetch(lease.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${lease.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'attacker',
        model: 'other',
        reasoningEffort: 'none',
        messages: [],
      }),
    })
    assert.equal(response.status, 200)
    const chunks = (await response.text()).trim().split('\n').map(line => JSON.parse(line))
    assert.equal(chunks.at(-1).type, 'finish')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].provider, 'openai-codex')
    assert.equal(calls[0].model, 'gpt-test')
    assert.equal(calls[0].reasoningEffort, 'high')
  } finally {
    await lease.close()
  }
})

test('rejects wrong capabilities and enforces request count and body limits', async () => {
  const { value } = runtime({
    config: { modelBrokerMaxRequests: 1, modelBrokerMaxRequestBytes: 80 },
  })
  const binding = await value.resolve()
  const lease = await value.openLease(binding, { candidateDigest: 'sha256:test', jobName: 'job-test' })
  try {
    const unauthorized = await fetch(lease.endpoint, {
      headers: { authorization: 'Bearer wrong' },
    })
    assert.equal(unauthorized.status, 404)
    const tooLarge = await fetch(lease.endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${lease.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'x'.repeat(100) }] }),
    })
    assert.equal(tooLarge.status, 413)
    const exhausted = await fetch(lease.endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${lease.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    })
    assert.equal(exhausted.status, 429)
  } finally {
    await lease.close()
  }
})

test('closes the Job lease and releases the broker endpoint', async () => {
  const { value } = runtime()
  const lease = await value.openLease(await value.resolve(), {
    candidateDigest: 'sha256:test',
    jobName: 'job-test',
  })
  const endpoint = lease.endpoint
  await lease.close()
  await assert.rejects(fetch(endpoint), TypeError)
  await lease.close()
})

const request = (lease, body = { messages: [] }) => fetch(lease.endpoint, {
  method: 'POST',
  headers: { authorization: `Bearer ${lease.token}`, 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

test('Preflight lease budgets are read-only, positive and cannot exceed Host limits', async () => {
  const { value, calls } = runtime({ config: { modelBrokerMaxRequests: 100, modelBrokerMaxResponseBytes: 1000 } })
  const binding = await value.resolve()
  assert.deepEqual(await value.assertLeaseLimits(binding, { maxRequests: 96, maxResponseBytes: 900 }), { maxRequests: 96, maxResponseBytes: 900 })
  assert.deepEqual(await value.assertLeaseLimits(binding, { maxRequests: 10000, maxResponseBytes: 10000 }), { maxRequests: 100, maxResponseBytes: 1000 })
  assert.deepEqual(await value.assertLeaseLimits(binding), { maxRequests: 100 })
  for (const scope of [{ maxRequests: 0 }, { maxRequests: 1.5 }, { maxRequests: Infinity }, { maxResponseBytes: -1 }, { maxResponseBytes: '1024' }]) {
    await assert.rejects(value.assertLeaseLimits(binding, scope), { code: 'HARBOR_MODEL_LIMIT_INVALID' })
  }
  assert.equal(calls.length, 0)
})

test('unverified provider token enforcement is never inferred from maxTokens API support or route name', async () => {
  const { value, calls } = runtime()
  for (const provider of ['openai-codex', 'other', 'deepseek-official']) {
    const binding = { provider, model: 'model' }
    await assert.rejects(value.assertLeaseLimits(binding, { maxOutputTokens: 4096 }), { code: 'HARBOR_MODEL_OUTPUT_LIMIT_UNSUPPORTED' })
    await assert.rejects(value.openLease(binding, { maxOutputTokens: 4096 }), { code: 'HARBOR_MODEL_OUTPUT_LIMIT_UNSUPPORTED' })
  }
  assert.equal(calls.length, 0)
})

test('scoped request quota is consumed before execution and cannot be raised by a Candidate request', async () => {
  const { value, calls } = runtime({ config: { modelBrokerMaxRequests: 100 } })
  const lease = await value.openLease(await value.resolve(), { maxRequests: 1 })
  try {
    assert.deepEqual(lease.usage(), { modelRequests: 0, maxModelRequests: 1 })
    const responses = await Promise.all([request(lease, { messages: [], maxRequests: 99999 }), request(lease)])
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 429])
    await Promise.all(responses.map(response => response.text()))
    assert.equal(calls.length, 1)
    assert.equal(calls[0].maxRequests, undefined)
    assert.deepEqual(lease.limits, { maxRequests: 1 })
    assert.deepEqual(lease.usage(), { modelRequests: 1, maxModelRequests: 1 })
    assert.deepEqual(Object.keys(lease.usage()).sort(), ['maxModelRequests', 'modelRequests'])
  } finally { await lease.close() }
})

test('response byte quota counts actual UTF-8 serialized chunks and aborts the real stream before overflow', async () => {
  let aborted = false, returned = false
  const { value, calls } = runtime({
    async * stream(options) {
      options.signal.addEventListener('abort', () => { aborted = true }, { once: true })
      try {
        yield { type: 'text-delta', index: 0, text: '你'.repeat(100) }
        yield { type: 'finish', reason: { kind: 'stop' } }
      } finally { returned = true }
    },
  })
  const lease = await value.openLease(await value.resolve(), { maxRequests: 1, maxResponseBytes: 200 })
  try {
    await assert.rejects(async () => { const response = await request(lease, { messages: [], maxResponseBytes: 99999 }); await response.text() })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].maxResponseBytes, undefined)
    assert.equal(aborted, true)
    assert.equal(returned, true)
    assert.equal((await request(lease)).status, 429)
  } finally { await lease.close() }
})

test('response quota allows an exact boundary and resets for each authorized request', async () => {
  const chunk = { type: 'finish', reason: { kind: 'stop' } }
  const bytes = Buffer.byteLength(`${JSON.stringify(chunk)}\n`)
  const { value } = runtime({ async * stream() { yield chunk } })
  const lease = await value.openLease(await value.resolve(), { maxRequests: 2, maxResponseBytes: bytes })
  try {
    for (let index = 0; index < 2; index += 1) {
      const response = await request(lease)
      assert.equal(response.status, 200)
      assert.equal(Buffer.byteLength(await response.text()), bytes)
    }
  } finally { await lease.close() }
})

test('response byte quota accumulates chunks instead of limiting each chunk independently', async () => {
  const chunk = { type: 'text-delta', index: 0, text: 'bounded' }
  const bytes = Buffer.byteLength(`${JSON.stringify(chunk)}\n`)
  let aborted = false, reachedFinish = false
  const { value } = runtime({
    async * stream(options) {
      options.signal.addEventListener('abort', () => { aborted = true }, { once: true })
      yield chunk
      yield chunk
      reachedFinish = true
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  })
  const lease = await value.openLease(await value.resolve(), { maxResponseBytes: bytes * 2 - 1 })
  try {
    await assert.rejects(async () => { const response = await request(lease); await response.text() })
    assert.equal(aborted, true)
    assert.equal(reachedFinish, false)
  } finally { await lease.close() }
})

test('closing a lease aborts its active bounded model response', async () => {
  let observedSignal
  const { value } = runtime({
    async * stream(options) {
      observedSignal = options.signal
      yield { type: 'text-delta', index: 0, text: 'started' }
      await new Promise(resolve => options.signal.addEventListener('abort', resolve, { once: true }))
    },
  })
  const lease = await value.openLease(await value.resolve(), { maxResponseBytes: 1024 })
  const response = await request(lease)
  const interrupted = assert.rejects(response.text())
  await lease.close()
  await interrupted
  assert.equal(observedSignal.aborted, true)
})
