import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import test from 'node:test'

import {
  COMPARE_ROUTE,
  createDashboardHandler,
  createMutationHandler,
  DASHBOARD_ROUTE,
  DATASET_ROUTE,
  EVALUATOR_ROUTE,
  GOVERNANCE_ROUTE,
  HISTORICAL_OPERATION_ROUTE,
  HISTORICAL_PREVIEW_ROUTE,
  HISTORICAL_RUN_ROUTE,
  installDashboardWeb,
  isSameOriginRequest,
  JOB_ROUTE,
  META_ROUTE,
  PROGRESS_ROUTE,
  PROJECT_ROOT_ROUTE,
  SESSION_CONTEXT_ROUTE,
  SESSION_CONTEXT_RESOLVE_ROUTE,
  TRIALS_ROUTE,
  TRIAL_ROUTE,
  VERSION_ROUTE,
} from '../lib/web.js'

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

function mutationRequest(body, {
  method = 'POST',
  origin = 'http://127.0.0.1:3080',
  contentType = 'application/json',
} = {}) {
  const request = Readable.from([body])
  request.method = method
  request.headers = {
    host: '127.0.0.1:3080',
    origin,
    'content-type': contentType,
  }
  return request
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
  assert.equal(isSameOriginRequest({ headers: { 'sec-fetch-site': 'none' }, socket: { remoteAddress: '192.0.2.10' } }), false)
})

test('Evaluator mutation accepts bounded same-origin JSON only', async () => {
  let received
  let resolvedArgs
  const handler = createMutationHandler(async body => { received = body; return { updated: true } })
  const request = Readable.from([JSON.stringify({ filePath: 'evaluators/current.py', content: 'updated' })])
  request.method = 'POST'
  request.headers = { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'content-type': 'application/json' }
  const response = await invoke(handler, request)
  assert.equal(response.status, 200)
  assert.equal(received.filePath, 'evaluators/current.py')

  const crossSite = Readable.from(['{}'])
  crossSite.method = 'POST'
  crossSite.headers = { host: '127.0.0.1:3080', origin: 'https://example.com', 'content-type': 'application/json' }
  assert.equal((await invoke(handler, crossSite)).status, 403)
})

test('Session context route accepts only bounded same-origin JSON and reports safe failures', async () => {
  const routes = []
  let received
  let resolvedArgs
  let businessError
  const service = {
    dashboard: async () => ({}),
    job: async () => ({}),
    trials: async () => ({}),
    trial: async () => ({}),
    dataset: async () => ({}),
    progress: async () => ({}),
    comparison: async () => ({}),
    governance: async () => ({}),
    evaluator: async () => ({}),
    meta: async () => ({}),
    version: async () => ({}),
    setProjectRoot: async () => ({}),
    bindUiContext: async (args) => {
      if (businessError) throw businessError
      received = args
      return { contextSnapshotId: 'hctx_test' }
    },
    resolveBrowserUiContext: async (args) => {
      resolvedArgs = args
      return { schema: 'harbor-resolved-context/v1', freshness: 'FRESH' }
    },
  }
  installDashboardWeb({
    inject(_services, callback) {
      callback({
        webServer: { register(value) { routes.push(value); return () => {} } },
        effect(effect) { return effect() },
      })
    },
  }, service)
  const route = routes.find(item => item.path === SESSION_CONTEXT_ROUTE)
  assert.ok(route)

  const input = { sessionId: 'session-1', context: { schema: 'harbor/ui-context-v1' } }
  const success = await invoke(route.handler, mutationRequest(JSON.stringify(input)))
  assert.equal(success.status, 200)
  assert.equal(success.headers['cache-control'], 'no-store')
  assert.deepEqual(received, input)
  assert.deepEqual(JSON.parse(success.body), { ok: true, value: { contextSnapshotId: 'hctx_test' } })

  const wrongMethod = await invoke(route.handler, mutationRequest('{}', { method: 'GET' }))
  assert.equal(wrongMethod.status, 405)
  assert.equal(wrongMethod.headers.allow, 'POST')

  const crossOrigin = await invoke(route.handler, mutationRequest('{}', { origin: 'https://example.com' }))
  assert.equal(crossOrigin.status, 403)
  assert.equal(JSON.parse(crossOrigin.body).error.code, 'forbidden')

  const wrongMediaType = await invoke(route.handler, mutationRequest('{}', { contentType: 'text/plain' }))
  assert.equal(wrongMediaType.status, 415)
  assert.equal(JSON.parse(wrongMediaType.body).error.code, 'unsupported-media-type')

  const malformed = await invoke(route.handler, mutationRequest('{'))
  assert.equal(malformed.status, 400)
  assert.equal(JSON.parse(malformed.body).error.code, 'session-context-bind-failed')

  const oversized = await invoke(route.handler, mutationRequest(Buffer.alloc(256 * 1024 + 1, 0x20)))
  assert.equal(oversized.status, 413)
  assert.equal(JSON.parse(oversized.body).error.code, 'payload-too-large')

  businessError = new Error('HARBOR_CONTEXT_INVALID: /Users/alice/private/jobs/secret.json is missing')
  const failed = await invoke(route.handler, mutationRequest('{}'))
  const failedBody = JSON.parse(failed.body)
  assert.equal(failed.status, 400)
  assert.equal(failedBody.error.code, 'HARBOR_CONTEXT_INVALID')
  assert.match(failedBody.error.message, /HARBOR_CONTEXT_INVALID/)
  assert.doesNotMatch(failedBody.error.message, /\/Users\/alice/)

  businessError = Object.assign(new Error('Authorization: "Basic dXNlcjpwYXNzd29yZA=="\nOPENAI_API_KEY=`abc def ghi`'), { code: 'HARBOR_AUTH_FAILED' })
  const secretFailure = JSON.parse((await invoke(route.handler, mutationRequest('{}'))).body)
  assert.equal(secretFailure.error.code, 'HARBOR_AUTH_FAILED')
  assert.doesNotMatch(secretFailure.error.message, /dXNlcjpwYXNzd29yZA|abc|def|ghi/)

  const resolveRoute = routes.find(item => item.path === SESSION_CONTEXT_RESOLVE_ROUTE)
  assert.ok(resolveRoute)
  const resolveInput = { sessionId: 'session-1', contextSnapshotId: 'hctx_test' }
  const resolveResponse = await invoke(resolveRoute.handler, mutationRequest(JSON.stringify(resolveInput)))
  assert.equal(resolveResponse.status, 200)
  assert.deepEqual(resolvedArgs, resolveInput)
  assert.equal(JSON.parse(resolveResponse.body).value.freshness, 'FRESH')
})

test('mutation failures preserve stable business codes while redacting local paths', async () => {
  const handler = createMutationHandler(async () => {
    throw new Error('NO_ELIGIBLE_SESSIONS: no sessions under /Users/alice/My Private Sessions/history.json')
  }, 'historical-run-failed')
  const response = await invoke(handler, mutationRequest('{}'))
  const body = JSON.parse(response.body)
  assert.equal(response.status, 400)
  assert.equal(body.error.code, 'NO_ELIGIBLE_SESSIONS')
  assert.match(body.error.message, /^NO_ELIGIBLE_SESSIONS:/)
  assert.doesNotMatch(body.error.message, /\/Users\/alice|My Private Sessions/)
})

test('Workbench routes are optional and scoped through Cordis', () => {
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
  installDashboardWeb(
    ctx,
    { dashboard: async () => ({}), job: async () => ({}), trials: async () => ({}), trial: async () => ({}), dataset: async () => ({}), progress: async () => ({}), comparison: async () => ({}), governance: async () => ({}), evaluator: async () => ({}), meta: async () => ({}), bindUiContext: async () => ({}), resolveBrowserUiContext: async () => ({}), version: async () => ({}), setProjectRoot: async () => ({}) },
    { preview: async () => ({}), run: async () => ({}), operation: async () => ({}) },
  )
  assert.deepEqual(requested, ['webServer'])
  assert.deepEqual(routes.map(route => route.path), [DASHBOARD_ROUTE, JOB_ROUTE, TRIALS_ROUTE, TRIAL_ROUTE, DATASET_ROUTE, PROGRESS_ROUTE, COMPARE_ROUTE, GOVERNANCE_ROUTE, EVALUATOR_ROUTE, META_ROUTE, HISTORICAL_PREVIEW_ROUTE, HISTORICAL_RUN_ROUTE, HISTORICAL_OPERATION_ROUTE, SESSION_CONTEXT_ROUTE, '/_dsh/harbor-evolution/trial-selection', '/_dsh/harbor-evolution/selection-detail', '/_dsh/harbor-evolution/action-draft', '/_dsh/harbor-evolution/action-preview', '/_dsh/harbor-evolution/action-confirm', '/_dsh/harbor-evolution/action-operation', '/_dsh/harbor-evolution/action-cancel', SESSION_CONTEXT_RESOLVE_ROUTE, VERSION_ROUTE, PROJECT_ROOT_ROUTE])
  assert.ok(routes.every(route => route.kind === 'exact' && typeof route.handler === 'function'))
})
