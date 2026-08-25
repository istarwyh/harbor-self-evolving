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
