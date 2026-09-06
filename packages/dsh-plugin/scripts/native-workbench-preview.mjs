// Opt-in component fixture. No real Host, model, evaluation, or profile writes.
// node scripts/native-workbench-preview.mjs --react-dom /absolute/path/to/react-dom
// Add --check to build and check fixture APIs without opening a listening port.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, realpath } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'esbuild'
import { EvolutionService } from '../lib/service.js'
import { createApiHandler, createMutationHandler } from '../lib/web.js'

const args = process.argv.slice(2)
if (args.includes('--help')) {
  console.log('Usage: node scripts/native-workbench-preview.mjs --react-dom /absolute/react-dom [--check]\nLocal component fixture only; creates a fresh temporary workspace and binds 127.0.0.1 on a random port. No browser is opened.')
  process.exit(0)
}
const dependencyIndex = args.indexOf('--react-dom')
const dependencyPath = args[dependencyIndex + 1]
if (dependencyIndex < 0 || !path.isAbsolute(dependencyPath ?? '')) throw new Error('Pass --react-dom with an existing absolute react-dom package directory; nothing will be installed.')
if (args.some((value, index) => index !== dependencyIndex + 1 && !['--react-dom', '--check'].includes(value))) throw new Error('Unknown argument')
const reactDomRoot = await realpath(dependencyPath)
const localRequire = createRequire(path.join(reactDomRoot, 'package.json'))
const reactPath = localRequire.resolve('react')
const reactDomClient = localRequire.resolve('./client.js')
const reactPackage = localRequire('react/package.json')
const reactDomPackage = JSON.parse(await readFile(path.join(reactDomRoot, 'package.json'), 'utf8'))
const major = version => /^\d+\./.test(version ?? '') ? Number(version.split('.')[0]) : undefined
if (reactDomPackage.name !== 'react-dom' || major(reactPackage.version) === undefined || major(reactPackage.version) !== major(reactDomPackage.version)) {
  throw new Error(`Incompatible fixture dependencies: react ${reactPackage.version}, react-dom ${reactDomPackage.version}. Pass --react-dom for an installed package with a matching React major version; no dependencies or profile settings were changed.`)
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const clientBuild = await build({
  entryPoints: [path.join(root, 'src/client/index.jsx')], bundle: true, write: false,
  platform: 'browser', format: 'cjs', target: ['es2022'], external: ['react'],
  loader: { '.jpg': 'dataurl' }, define: { __HSE_VERSION__: JSON.stringify(packageJson.version) },
  logOverride: { 'commonjs-variable-in-esm': 'silent' },
})
const clientSource = clientBuild.outputFiles[0].text
function loadClient(React) {
  const module = { exports: {} }
  new Function('require', 'module', 'exports', clientSource)(name => {
    if (name !== 'react') throw new Error(`Unexpected client dependency: ${name}`)
    return React
  }, module, module.exports)
  return module.exports
}
const client = loadClient(localRequire('react'))
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-native-workbench-'))
const generated = await promisify(execFile)(process.execPath, [path.join(root, 'scripts/workbench-fixture.mjs'), fixtureRoot, '2'])
const { job } = JSON.parse(generated.stdout.trim())
const sessions = new Set(['fixture-empty', 'fixture-tasks', 'fixture-proposal'])
const service = new EvolutionService({ projectRoot: fixtureRoot, jobsDir: 'jobs', harborBin: '', harborDshBin: '' }, {
  pluginVersion: `${packageJson.version} (source fixture)`,
  sessionProjectRoot: sessionId => sessions.has(sessionId) ? fixtureRoot : undefined,
  versionChecker: async () => { throw new Error('Version network lookup is disabled in this fixture') },
})
const snapshot = await service.dashboard({ sessionId: 'fixture-empty' })
const workspace = snapshot.workspace.id
const context = client.buildUiContext({ sessionId: 'fixture-proposal', pageSessionId: 'fixture-proposal-page', workspace, job, stage: 'judge', trial: 'hfq-021' })
const issued = await service.bindUiContext({ sessionId: 'fixture-proposal', context })
const draft = await service.proposeAction({ sessionId: 'fixture-proposal', contextSnapshotId: issued.contextSnapshotId, kind: 'candidate-draft', summary: '合成建议：在答案里补齐计算步骤与单位', rationale: '仅用于原生工具卡片验收；确认只保存草案，不修改 Candidate、不运行模型。' })
let operation = {
  schema: 'harbor-operation/v1', operationId: 'hop_00000000-0000-4000-8000-000000000099', draftId: 'fixture-diagnostic',
  sessionId: 'fixture-tasks', kind: 'diagnostic-evaluation', status: 'ACTIVE',
  target: { workspace, job }, createdAt: new Date().toISOString(),
  resultRef: { verified: true, jobName: job },
  progress: { completed: 1, total: 2, counts: { evaluating: 1 }, modelRequests: 0, maxModelRequests: 0, updatedAt: new Date().toISOString() },
  events: [{ sequence: 1, status: 'ACTIVE' }],
}
const requireSession = value => {
  if (!sessions.has(value?.sessionId)) throw new Error('Unknown isolated fixture Session')
  return value
}
const read = (method, args) => service[method](requireSession(args))
const cancelFixture = args => {
  requireSession(args)
  if (args.sessionId !== operation.sessionId || args.operationId !== operation.operationId) throw new Error('Synthetic operation identity mismatch')
  if (operation.status === 'ACTIVE') operation = { ...operation, status: 'CANCELLED', events: [...operation.events, { sequence: 2, status: 'CANCELLED' }] }
  return operation
}
const routes = new Map()
const get = (route, fn) => routes.set(route, createApiHandler(fn, 'FIXTURE_READ_FAILED'))
const post = (route, fn) => routes.set(route, createMutationHandler(fn, 'FIXTURE_MUTATION_DENIED'))
for (const method of ['dashboard', 'job', 'trials', 'trial', 'dataset', 'progress', 'governance', 'meta']) get(method, args => read(method, args))
get('historical-operation', args => { requireSession(args); return { status: 'idle', synthetic: true } })
get('action-operations', args => { requireSession(args); return { items: args.sessionId === 'fixture-tasks' ? [operation] : [], synthetic: true } })
get('action-operation', args => read('actionOperation', args))
post('session-context', args => read('bindUiContext', args))
post('session-context-resolve', args => read('resolveBrowserUiContext', args))
post('trial-selection', args => read('createTrialSelection', args))
get('selection-detail', args => read('trialSelection', args))
post('action-cancel', cancelFixture)
post('action-preview', args => {
  if (args.draftId !== draft.draftId || args.sessionId !== 'fixture-proposal') throw new Error('Only the fixture Candidate draft can be previewed')
  return read('previewAction', args)
})
post('action-confirm', args => {
  const preview = service.actionDrafts.previews.get(args.previewId)
  if (preview?.draft?.draftId !== draft.draftId || args.sessionId !== 'fixture-proposal') throw new Error('Only the fixture Candidate draft can be confirmed')
  return read('confirmAction', args)
})

const metadata = { job, workspace, draft, version: packageJson.version, synthetic: true }
const browserBuild = await build({
  stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import { mountFixture } from './scripts/native-workbench-preview.fixture.jsx';\nconst plugin = (() => { const module = { exports: {} }; const exports = module.exports; const require = name => { if (name !== 'react') throw Error(name); return React; };\n${clientSource}\nreturn module.exports; })();\nmountFixture({ React, createRoot, plugin, metadata: ${JSON.stringify(metadata)} });`, resolveDir: root, sourcefile: 'native-workbench-preview-entry.jsx', loader: 'jsx' },
  bundle: true, write: false, platform: 'browser', format: 'iife', target: ['es2022'],
  alias: { react: reactPath, 'react-dom/client': reactDomClient },
  define: { 'process.env.NODE_ENV': '"development"' },
})
const browserSource = browserBuild.outputFiles[0].text
if (args.includes('--check')) {
  assert.equal(snapshot.jobs.length, 1)
  assert.equal((await service.trials({ sessionId: 'fixture-empty', workspace, job })).items.length, 2)
  assert.equal((await service.trial({ sessionId: 'fixture-empty', workspace, job, trial: 'hfq-021' })).trial, 'hfq-021')
  const preview = await service.previewAction({ sessionId: 'fixture-proposal', draftId: draft.draftId })
  assert.equal(preview.status, 'READY_FOR_REVIEW')
  assert.equal(service.actionDrafts.previews.get(preview.previewId)?.draft.draftId, draft.draftId)
  const receipt = await service.confirmAction({ sessionId: 'fixture-proposal', previewId: preview.previewId, contentHash: preview.contentHash, expectedRevision: preview.baseRevision, confirmed: true })
  assert.equal(receipt.status, 'COMPLETED')
  assert.equal(receipt.events.at(-1).result.applied, false)
  assert.equal(receipt.events.at(-1).result.kind, 'candidate-draft')
  assert.equal(cancelFixture({ sessionId: 'fixture-tasks', operationId: operation.operationId }).status, 'CANCELLED')
  assert.equal(cancelFixture({ sessionId: 'fixture-tasks', operationId: operation.operationId }).status, 'CANCELLED')
  assert.equal(operation.events.length, 2)
  await service.actionDrafts.dispose()
  console.log(JSON.stringify({ checked: true, synthetic: true, reactVersion: reactPackage.version, reactDomVersion: reactDomPackage.version, fixtureRoot, job, browserBundleBytes: browserSource.length, listening: false, boundary: 'Component bundle and local service reads only; no browser/Host/model verification.' }))
  process.exit(0)
}
const html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Harbor isolated native workbench fixture</title></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'
const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
  const prefix = '/_dsh/harbor-evolution/'
  if (pathname.startsWith(prefix)) {
    const handler = routes.get(pathname.slice(prefix.length))
    if (handler) return handler(request, response)
  } else if (request.method === 'GET' && ['/', '/fixture.js'].includes(pathname)) {
    response.writeHead(200, { 'content-type': pathname === '/' ? 'text/html; charset=utf-8' : 'application/javascript; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'" })
    return response.end(pathname === '/' ? html : browserSource)
  }
  response.writeHead(404, { 'content-type': 'text/plain' }); response.end('Disabled or unknown fixture endpoint; no model/evaluation routes are exposed.')
})
server.listen(0, '127.0.0.1', () => {
  const base = `http://127.0.0.1:${server.address().port}`
  console.log(JSON.stringify({ base, scenarios: { empty: `${base}/?scene=empty`, tasks: `${base}/?scene=tasks`, proposal: `${base}/?scene=proposal` }, fixtureRoot, job, boundary: 'isolated component fixture / not real Host or model; cancellation is in-memory synthetic only' }))
})
let stopping = false
const stop = async () => {
  if (stopping) return
  stopping = true
  server.closeAllConnections()
  server.close()
  await service.actionDrafts.dispose()
  console.log(`Stopped preview; synthetic workspace retained at ${fixtureRoot}`)
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
