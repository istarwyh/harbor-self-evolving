import assert from 'node:assert/strict'
import test from 'node:test'

import { createDashboardHandler, DASHBOARD_ROUTE, installDashboardWeb, isSameOriginRequest } from '../lib/web.js'

function invoke(handler, request) {
  return new Promise(resolve => {
    const response = {
      status: 0,
      headers: {},
      writeHead(status, headers = {}) { this.status = status; this.headers = headers },
      end(body = '') { resolve({ status: this.status, headers: this.headers, body }) },
    }
    handler(request, response)
  })
}

test('dashboard endpoint is GET-only, same-origin, and never cached', async () => {
  const handler = createDashboardHandler({ dashboard: async () => ({ schemaVersion: 1, jobs: [] }) })
  const success = await invoke(handler, { method: 'GET', headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' } })
  assert.equal(success.status, 200)
  assert.equal(success.headers['cache-control'], 'no-store')
  assert.deepEqual(JSON.parse(success.body), { ok: true, value: { schemaVersion: 1, jobs: [] } })

  const crossOrigin = await invoke(handler, { method: 'GET', headers: { host: '127.0.0.1:3080', origin: 'https://example.com' } })
  assert.equal(crossOrigin.status, 403)
  const post = await invoke(handler, { method: 'POST', headers: {} })
  assert.equal(post.status, 405)
  assert.equal(post.headers.allow, 'GET')
})

test('same-origin guard rejects cross-site browser requests', () => {
  assert.equal(isSameOriginRequest({ headers: { 'sec-fetch-site': 'cross-site' } }), false)
  assert.equal(isSameOriginRequest({ headers: { 'sec-fetch-site': 'same-origin' } }), true)
  assert.equal(isSameOriginRequest({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }), true)
  assert.equal(isSameOriginRequest({ headers: {}, socket: { remoteAddress: '192.0.2.10' } }), false)
})

test('Web route is optional and registered through a scoped Cordis injection', () => {
  let requested
  let route
  const ctx = {
    inject(services, callback) {
      requested = services
      callback({
        webServer: { register(value) { route = value; return () => {} } },
        effect(effect) { return effect() },
      })
    },
  }
  installDashboardWeb(ctx, { dashboard: async () => ({}) })
  assert.deepEqual(requested, ['webServer'])
  assert.equal(route.kind, 'exact')
  assert.equal(route.path, DASHBOARD_ROUTE)
  assert.equal(typeof route.handler, 'function')
})
