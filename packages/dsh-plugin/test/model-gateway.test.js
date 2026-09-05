import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { once } from 'node:events'
import test from 'node:test'
import { apply } from '../../harbor-plugin/src/harbor_dsh_evolution/llm_gateway.mjs'

async function adapter(t, endpoint = 'http://127.0.0.1:1') {
  const directory = await mkdtemp(join(tmpdir(), 'harbor-gateway-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const tokenFile = join(directory, 'token')
  await writeFile(tokenFile, 'test-only-capability')
  let result
  await apply({ llm: { registerAdapter: (_, value) => { result = value } } }, {
    provider: 'host', model: 'test', endpoint, tokenFile,
    modelInfoJson: JSON.stringify({ id: 'test' }),
  })
  return result
}

test('prepareCall resolves only the leased model and honors cancellation', async t => {
  const gateway = await adapter(t)
  const prepared = await gateway.prepareCall('host', 'test')
  assert.equal(prepared.model.id, 'test')
  assert.equal(typeof prepared.stream, 'function')
  await assert.rejects(gateway.prepareCall('host', 'another'), /lease does not allow/)
  const controller = new AbortController()
  const reason = { kind: 'user' }
  controller.abort(reason)
  await assert.rejects(gateway.prepareCall('host', 'test', controller.signal), error => error === reason)
})

test('readiness refuses model transport before fetch', async t => {
  const gateway = await adapter(t)
  const prior = process.env.HSE_MODEL_GATEWAY_PREFLIGHT
  process.env.HSE_MODEL_GATEWAY_PREFLIGHT = '1'
  try {
    await assert.rejects(gateway.stream({ provider: 'host', model: 'test' }).next(), /disabled during ACP readiness/)
  } finally {
    if (prior === undefined) delete process.env.HSE_MODEL_GATEWAY_PREFLIGHT
    else process.env.HSE_MODEL_GATEWAY_PREFLIGHT = prior
  }
})

test('fetch cancellation never mutates the durable DSH cancellation reason', async t => {
  let received
  const requestReceived = new Promise(resolve => { received = resolve })
  const server = createServer((_req, res) => {
    received()
    res.writeHead(200, { 'content-type': 'application/x-ndjson' })
    res.flushHeaders()
  }).listen(0, '127.0.0.1')
  t.after(() => { server.closeAllConnections(); server.close() })
  await once(server, 'listening')
  const gateway = await adapter(t, `http://127.0.0.1:${server.address().port}`)
  const controller = new AbortController()
  const reason = { kind: 'user' }
  const descriptors = Object.getOwnPropertyDescriptors(reason)
  const pending = gateway.stream({ provider: 'host', model: 'test', signal: controller.signal }).next()
  await requestReceived
  controller.abort(reason)
  await assert.rejects(pending, { name: 'AbortError' })
  assert.deepEqual(Object.getOwnPropertyDescriptors(reason), descriptors)
  assert.equal(JSON.stringify(reason), '{"kind":"user"}')
})
