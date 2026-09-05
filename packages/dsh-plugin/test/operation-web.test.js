import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'
import { DiagnosticRunner } from '../lib/diagnostic-runner.js'
import { EvolutionService } from '../lib/service.js'
import { EVALUATOR_ROUTE, installDashboardWeb } from '../lib/web.js'

const base = '/_dsh/harbor-evolution'
const sessionId = 'session-operation-web'
const operationId = index => `hop_00000000-0000-4000-8000-${String(index).padStart(12, '0')}`

function routesFor(service) {
  const routes = new Map()
  installDashboardWeb({ inject(_dependencies, callback) {
    callback({ effect: effect => effect(), webServer: { register: route => { routes.set(route.path, route.handler); return () => {} } } })
  } }, service)
  return routes
}

function http(routes, route, { method = 'GET', params = {}, body, origin = 'http://127.0.0.1:3080' } = {}) {
  const request = Readable.from(body === undefined ? [] : [JSON.stringify(body)])
  request.method = method
  request.url = `${route}?${new URLSearchParams(params)}`
  request.headers = { host: '127.0.0.1:3080', origin, 'content-type': 'application/json' }
  return new Promise((resolve, reject) => {
    const response = {
      writeHead(status, headers = {}) { this.status = status; this.headers = headers },
      end(text = '') { resolve({ status: this.status, headers: this.headers, body: text ? JSON.parse(text) : undefined }) },
    }
    try { routes.get(route)(request, response) } catch (error) { reject(error) }
  })
}

async function fixture(t) {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-operation-web-'))
  const alternateRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-operation-web-other-'))
  let liveRoot = projectRoot
  const service = new EvolutionService({ projectRoot, jobsDir: 'jobs' }, { sessionProjectRoot: id => [sessionId, 'foreign-session'].includes(id) ? liveRoot : undefined })
  t.after(async () => { await service.actionDrafts.dispose(); await rm(projectRoot, { recursive: true, force: true }); await rm(alternateRoot, { recursive: true, force: true }) })
  const workspace = (await service.dashboard({ sessionId })).workspace.id
  const directory = path.join(projectRoot, '.harbor', 'workbench-operations')
  // Stub only runtime evidence inspection. HTTP routing, Session ownership,
  // journal parsing, pagination, approval validation and recovery are real.
  t.mock.method(DiagnosticRunner.prototype, 'observe', async () => ({}))
  t.mock.method(DiagnosticRunner.prototype, 'inspect', async () => ({ process: { state: 'stopped', pid: 42001, groupId: 42001 }, resources: { state: 'clean', items: [] }, blockers: [], canRecover: true }))
  t.mock.method(DiagnosticRunner.prototype, 'execute', async () => assert.fail('HTTP read/recovery must never execute a diagnostic'))
  const writeOperation = async (index, owner = sessionId, cleanupRequired = false) => {
    await mkdir(directory, { recursive: true })
    const value = { schema: 'harbor-operation/v1', operationId: operationId(index), draftId: `draft-${index}`, sessionId: owner, kind: 'diagnostic-evaluation', diagnosticOnly: true, status: 'FAILED', cleanupRequired,
      target: { workspace, job: 'synthetic-source-not-executed' }, createdAt: `2026-09-05T00:00:${String(index).padStart(2, '0')}Z`,
      events: [{ sequence: 1, status: 'FAILED', result: { code: 'HARBOR_PROCESS_TIMEOUT', cleanupRequired } }],
    }
    await writeFile(path.join(directory, `${value.operationId}.1.json`), JSON.stringify(value))
    return value
  }
  return { service, projectRoot, directory, workspace, routes: routesFor(service), writeOperation, moveSession: () => { liveRoot = alternateRoot } }
}

test('real HTTP task list accepts its query-string limit, paginates journals, and hides foreign Session records', async t => {
  const f = await fixture(t)
  const read = params => http(f.routes, `${base}/action-operations`, { params: { sessionId, limit: 20, ...params } })
  const empty = await read()
  assert.equal(empty.status, 200)
  assert.deepEqual(empty.body.value.items, [])
  for (const index of [1, 2, 3]) await f.writeOperation(index)
  const foreign = await f.writeOperation(4, 'foreign-session')
  const first = await read({ limit: 2 })
  assert.equal(first.status, 200)
  assert.equal(first.headers['cache-control'], 'no-store')
  assert.deepEqual(first.body.value.items.map(item => item.operationId), [operationId(3), operationId(2)])
  assert.equal(first.body.value.nextCursor, operationId(2))
  const second = await read({ limit: 2, cursor: first.body.value.nextCursor })
  assert.deepEqual(second.body.value.items.map(item => item.operationId), [operationId(1)])
  assert.equal(second.body.value.nextCursor, undefined)
  assert.equal(JSON.stringify(first.body).includes(foreign.operationId), false)
  const ownForeign = await read({ sessionId: 'foreign-session' })
  assert.deepEqual(ownForeign.body.value.items.map(item => item.operationId), [foreign.operationId])
  const denied = await http(f.routes, `${base}/action-operation`, { params: { sessionId, operationId: foreign.operationId } })
  assert.equal(denied.body.ok, false)
  assert.equal(denied.body.error.code, 'HARBOR_ACTION_DENIED')
  f.moveSession()
  assert.deepEqual((await read()).body.value.items, [], 'a moved Session cannot retain the previous project journals')
})

test('operation HTTP reads reject invalid limits, unknown Sessions, wrong methods and cross-origin requests safely', async t => {
  const f = await fixture(t)
  for (const limit of ['0', '101', '1.5', '-1', 'twenty', '2junk', '', 'Infinity']) {
    const response = await http(f.routes, `${base}/action-operations`, { params: { sessionId, limit } })
    assert.equal(response.body.ok, false, `limit ${JSON.stringify(limit)} must not be accepted`)
    assert.equal(response.body.error.code, 'HARBOR_ACTION_INVALID')
  }
  for (const params of [{}, { sessionId: 'unknown-session' }]) {
    const response = await http(f.routes, `${base}/action-operations`, { params })
    assert.equal(response.status, 500)
    assert.match(response.body.error.code, /^HARBOR_(ACTION_DENIED|SESSION_PROJECT_UNAVAILABLE)$/)
  }
  assert.equal((await http(f.routes, `${base}/action-operations`, { method: 'POST', body: { sessionId } })).status, 405)
  assert.equal((await http(f.routes, `${base}/action-operations`, { params: { sessionId }, origin: 'https://foreign.test' })).status, 403)
})

test('real inspect GET and recover POST require same owner and exact reviewed confirmation; release never reruns', async t => {
  const f = await fixture(t)
  const operation = await f.writeOperation(1, sessionId, true)
  const claimFile = path.join(f.directory, 'diagnostic-active.json')
  await writeFile(claimFile, JSON.stringify({ operationId: operation.operationId, sessionId }))
  const before = await readdir(f.directory)
  const inspected = await http(f.routes, `${base}/action-inspect`, { params: { sessionId, operationId: operation.operationId } })
  assert.equal(inspected.status, 200)
  assert.equal(inspected.body.value.canRecover, true)
  assert.deepEqual(await readdir(f.directory), before, 'inspection is read-only apart from its in-memory approval token')
  const inspection = inspected.body.value
  const body = { sessionId, operationId: operation.operationId, inspectionId: inspection.inspectionId, contentHash: inspection.contentHash, confirmed: true }
  for (const changed of [{ confirmed: false }, { confirmed: 'true' }, { contentHash: 'wrong-review' }, { sessionId: 'foreign-session' }]) {
    const failed = await http(f.routes, `${base}/action-recover`, { method: 'POST', body: { ...body, ...changed } })
    assert.equal(failed.status, 400)
    assert.equal(failed.body.ok, false)
    assert.equal(JSON.parse(await readFile(claimFile, 'utf8')).operationId, operation.operationId)
  }
  assert.equal((await http(f.routes, `${base}/action-inspect`, { method: 'POST', body })).status, 405)
  assert.equal((await http(f.routes, `${base}/action-recover`, { params: body })).status, 405)
  assert.equal((await http(f.routes, `${base}/action-recover`, { method: 'POST', body, origin: 'https://foreign.test' })).status, 403)
  const released = await http(f.routes, `${base}/action-recover`, { method: 'POST', body })
  assert.equal(released.status, 200)
  assert.equal(released.body.value.recovery.released, true)
  assert.equal(released.body.value.recovery.rerun, false)
  await assert.rejects(readFile(claimFile), { code: 'ENOENT' })
  assert.equal((await readdir(f.directory)).filter(name => /\.1\.json$/.test(name)).length, 1, 'release must not create another operation')
  const restored = await http(f.routes, `${base}/action-operations`, { params: { sessionId, limit: 20 } })
  assert.equal(restored.body.value.items[0].recovery.released, true)
})

test('Evaluator HTTP route forces browser authorization even when request fields imitate the CLI', async t => {
  const f = await fixture(t)
  const before = await readdir(f.projectRoot)
  const request = { filePath: 'rubric.md', content: 'must not save', stackPath: '.harbor/evaluation-stack.yml', browser: false }
  const response = await http(f.routes, EVALUATOR_ROUTE, { method: 'POST', body: request })
  assert.equal(response.status, 400)
  assert.equal(response.body.ok, false)
  assert.match(response.body.error.code, /^HARBOR_(EVALUATOR_SOURCE_REQUIRED|WORKSPACE|ACTION_DENIED|SESSION)/)
  await assert.rejects(readFile(path.join(f.projectRoot, 'rubric.md')), { code: 'ENOENT' })
  assert.deepEqual(await readdir(f.projectRoot), before)
  let received
  const routeOnly = routesFor({ evaluator: async (...args) => { received = args; return { accepted: false } } })
  assert.equal((await http(routeOnly, EVALUATOR_ROUTE, { method: 'POST', body: request })).status, 200)
  assert.deepEqual(received, [request, { browser: true }], 'browser mode is supplied by the installed route, not trusted from JSON')
})
