import assert from 'node:assert/strict'
import test from 'node:test'

import { createDashboardHandler, DASHBOARD_ROUTE, installDashboardWeb, isSameOriginRequest, JOB_ROUTE, TRIALS_ROUTE, TRIAL_ROUTE } from '../lib/web.js'

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

test('read-only Workbench routes are optional and scoped through Cordis', () => {
  let requested
  const routes = []
  const ctx = {
    inject(services, callback) {
      requested = services
      callback({
        webServer: { register(value) { routes.push(value); return () => {} } },
        effect(effect) { return effect() },
      })
    },
  }
  installDashboardWeb(ctx, { dashboard: async () => ({}), job: async () => ({}), trials: async () => ({}), trial: async () => ({}) })
  assert.deepEqual(requested, ['webServer'])
  assert.deepEqual(routes.map(route => route.path), [DASHBOARD_ROUTE, JOB_ROUTE, TRIALS_ROUTE, TRIAL_ROUTE])
  assert.ok(routes.every(route => route.kind === 'exact' && typeof route.handler === 'function'))
})
