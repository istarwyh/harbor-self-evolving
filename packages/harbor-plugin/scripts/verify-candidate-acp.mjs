#!/usr/bin/env node
/**
 * Keyless, real-ACP integration check using an explicitly supplied, already-built
 * DSH checkout. Only the Host model response is controlled; Cordis, Agent Loop,
 * ACP stdio, persistence, and Harbor's model bridge are the production modules.
 * This is local linked-fixture evidence, NOT npm-install or Linux-image evidence.
 */
import assert from 'node:assert/strict'
import { spawn, execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, writeFile, copyFile, symlink, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve, join } from 'node:path'
import { Readable, Writable } from 'node:stream'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify, parseArgs } from 'node:util'
import { CandidateModelRuntime } from '../../dsh-plugin/lib/model-runtime.js'

const runFile = promisify(execFile)
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { values } = parseArgs({ options: {
  'dsh-checkout': { type: 'string' },
  python: { type: 'string', default: join(pluginRoot, '.venv/bin/python') },
  keep: { type: 'boolean', default: false },
} })
assert(values['dsh-checkout'], 'Pass --dsh-checkout /absolute/path/to/an/already-built/DSH/checkout; no dependencies are installed')
const checkout = resolve(values['dsh-checkout'])
const fixture = await mkdtemp(join(tmpdir(), 'harbor-owned-acp-'))
const workspace = join(fixture, 'workspace')
const sessionsRoot = join(fixture, 'sessions')
const runtimeDir = join(fixture, '.harbor-runtime')
const entrypoint = 'run-owned-acp.mjs'
const configPath = 'candidate.cordis.yml'
const agentEntryId = 'candidate-owned-transport'
const persona = 'HARBOR_OWNED_CANDIDATE_PERSONA'
const answer = 'HARBOR_ACP_OK'
const promptText = 'Exercise the real Candidate loop with a controlled model response.'
const requests = []
const cancelledRequest = Promise.withResolvers()
const startedCancellation = Promise.withResolvers()
let child
let childExited
let lease
let rawStdout = ''
let stderr = ''
let succeeded = false

function bounded(promise, label, milliseconds = 15000) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${milliseconds} ms`)), milliseconds) }),
  ]).finally(() => clearTimeout(timer))
}

const cleanEnvironment = {
  PATH: dirname(process.execPath) + ':/usr/bin:/bin',
  LANG: 'C.UTF-8',
  DSH_HOME: join(fixture, 'isolated-dsh-home'),
  DSH_AGENTS_HOME: join(fixture, 'isolated-agents-home'),
}

try {
  await Promise.all([workspace, sessionsRoot, runtimeDir, join(fixture, 'node_modules/@deepseek-ai')].map(path => mkdir(path, { recursive: true })))
  const packages = {
    '@deepseek-ai/dsh-app-boot': 'packages/boot/app-boot',
    '@deepseek-ai/cordis-plugin-include': 'vendor/include',
    '@deepseek-ai/cordis-plugin-timer': 'vendor/timer',
    '@deepseek-ai/dsh-llm': 'packages/llm/llm',
    '@deepseek-ai/dsh-session': 'packages/core/session',
    '@deepseek-ai/dsh-system-prompt': 'packages/core/system-prompt',
    '@deepseek-ai/dsh-tools': 'packages/core/tools',
    '@deepseek-ai/dsh-agent': 'packages/core/agent',
    '@deepseek-ai/dsh-agent-loop': 'packages/core/agent-loop',
    '@deepseek-ai/dsh-session-persistence-jsonl': 'packages/session/session-persistence-jsonl',
    '@deepseek-ai/dsh-session-checkpoint-policy': 'packages/session/session-checkpoint-policy',
    '@deepseek-ai/dsh-acp': 'packages/acp/acp',
  }
  const dependencies = {}
  for (const [name, relative] of Object.entries(packages)) {
    const source = join(checkout, relative)
    const metadata = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
    assert.equal(metadata.name, name)
    dependencies[name] = metadata.version
    await symlink(source, join(fixture, 'node_modules', name), 'dir')
  }
  await writeFile(join(fixture, 'package.json'), JSON.stringify({ name: 'harbor-linked-acp-verification', private: true, type: 'module', dependencies }, null, 2))
  await writeFile(join(fixture, 'candidate-runtime.json'), JSON.stringify({
    schema_version: 1, transport: 'acp', entrypoint, config_path: configPath,
    agent_entry_id: agentEntryId, node_version: process.versions.node,
  }, null, 2))

  // This entrypoint belongs to this Candidate; neither demo package is loaded.
  // Explicitly do not call loadEnv/loadOptionalPatches or inherit Host settings.
  await writeFile(join(fixture, entrypoint), `
import { parseArgs } from 'node:util'
import { boot, installFailLoud } from '@deepseek-ai/dsh-app-boot'
installFailLoud('harbor-owned-acp')
const { values } = parseArgs({ options: { config: { type: 'string' } } })
const ctx = await boot('harbor-owned-acp', values.config)
let closing
function close() { closing ??= ctx.fiber.dispose().then(() => { process.exitCode = 0 }); return closing }
process.stdin.on('end', () => { void close() })
process.on('SIGTERM', () => { void close() })
`)
  // ACP must quiesce before checkpoint/persistence and core services detach.
  // Flat sibling entries can truncate a cancelled turn during root disposal.
  await writeFile(join(fixture, 'owned-acp-composition.mjs'), `
import Timer from '@deepseek-ai/cordis-plugin-timer'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import * as checkpoint from '@deepseek-ai/dsh-session-checkpoint-policy'
import * as acp from '@deepseek-ai/dsh-acp'
export const name = 'owned-candidate-acp-composition'
export async function apply(ctx, config) {
  ctx.on('agent/error', ({ error }) => process.stderr.write(String(error?.stack ?? error) + '\\n'))
  await ctx.effect(async function* () {
    const core = ctx.plugin({ name: 'owned-candidate-core', apply(ctx) {
      ctx.plugin(Timer)
      ctx.plugin(LlmRuntime)
      ctx.plugin(SessionStore)
      ctx.plugin(SystemPrompt, { persona: config.persona, includeRuntimeContext: false })
      ctx.plugin(ToolRuntime, { mode: 'native' })
      ctx.plugin(AgentRegistry)
      ctx.plugin(AgentLoop, { agents: [] })
    } })
    await core
    yield core.dispose
    const persistence = ctx.plugin(Persistence, { root: config.persistenceRoot, compression: 'none', packChunks: false })
    await persistence
    yield persistence.dispose
    const barrier = ctx.plugin(checkpoint)
    await barrier
    yield barrier.dispose
    const transport = ctx.plugin(acp, { provider: config.provider, model: config.model })
    await transport
    yield transport.dispose
  }, 'owned-candidate-acp.lifecycle')
}
`)
  const entries = [
    { id: agentEntryId, name: './owned-acp-composition.mjs', config: {
      provider: 'candidate-placeholder', model: 'candidate-placeholder', persona,
      persistenceRoot: sessionsRoot,
    } },
  ]
  // JSON is a YAML subset, keeping fixture generation independent of a parser.
  await writeFile(join(fixture, configPath), JSON.stringify(entries, null, 2))
  await copyFile(join(pluginRoot, 'src/harbor_dsh_evolution/llm_gateway.mjs'), join(runtimeDir, 'llm_gateway.mjs'))

  const host = new CandidateModelRuntime({
    agentDefaultModel: { currentSelection: () => ({ provider: 'controlled-fixture', model: 'controlled-model' }) },
    llm: {
      listProviders: () => [{ id: 'controlled-fixture', name: 'Controlled fixture; no vendor' }],
      resolveModelInfo: async () => ({ id: 'controlled-model', name: 'Controlled model', context: { contextWindow: 32768 } }),
      async * stream(options) {
        requests.push(options)
        if (requests.length > 2) throw new Error('Unexpected additional model request')
        if (requests.length === 2) {
          yield { type: 'block-start', index: 0, blockType: 'text' }
          startedCancellation.resolve()
          await new Promise(resolveAbort => {
            if (options.signal.aborted) resolveAbort()
            else options.signal.addEventListener('abort', resolveAbort, { once: true })
          })
          cancelledRequest.resolve()
          return
        }
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: answer }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: answer } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
    get: () => undefined,
  }, { modelBrokerBindHost: '127.0.0.1', modelBrokerAdvertisedHost: '127.0.0.1', modelBrokerMaxRequests: 2, modelBrokerMaxRequestBytes: 1048576 })
  lease = await host.openLease(await host.resolve(), { candidateDigest: 'local-linked-verification-only', jobName: 'keyless-real-acp', maxRequests: 2 })
  const tokenFile = join(runtimeDir, 'test-capability')
  await writeFile(tokenFile, lease.token, { mode: 0o600 })
  const rendered = await runFile(resolve(values.python), ['-c', [
    'from pathlib import Path',
    'from harbor_dsh_evolution.runtime_binding import render_runtime_config',
    'import sys',
    'print(render_runtime_config(Path(sys.argv[1]), gateway_provider=sys.argv[2], model="controlled-model", config_path=sys.argv[3], agent_entry_id=sys.argv[4]))',
  ].join(';'), fixture, lease.candidateProvider, configPath, agentEntryId], {
    env: { ...cleanEnvironment, PYTHONPATH: join(pluginRoot, 'src') }, timeout: 15000,
  })
  const overlay = join(runtimeDir, 'cordis.yml')
  await writeFile(overlay, rendered.stdout)

  const requireSdk = createRequire(join(checkout, 'package.json'))
  const { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } = await import(pathToFileURL(requireSdk.resolve('@agentclientprotocol/sdk')).href)
  child = spawn(process.execPath, [join(fixture, entrypoint), '--config', overlay], {
    cwd: workspace, env: {
      ...cleanEnvironment,
      HSE_MODEL_GATEWAY_URL: lease.endpoint,
      HSE_MODEL_GATEWAY_TOKEN_FILE: tokenFile,
      HSE_MODEL_GATEWAY_INFO: JSON.stringify(lease.modelInfo),
    }, stdio: ['pipe', 'pipe', 'pipe'],
  })
  const exited = childExited = new Promise((resolveExit, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolveExit({ code, signal })) })
  // Observe process-level failure even if an earlier assertion interrupts us.
  void exited.catch(() => undefined)
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
  const wire = new Readable({ read() {} })
  child.stdout.on('data', chunk => { rawStdout += chunk.toString('utf8'); wire.push(chunk) })
  child.stdout.on('end', () => wire.push(null))
  const updates = []
  const client = new ClientSideConnection(() => ({
    sessionUpdate: async notification => { updates.push(notification) },
    requestPermission: async () => ({ outcome: { outcome: 'cancelled' } }),
  }), ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(wire)))
  const beforeExit = operation => Promise.race([operation, exited.then(result => { throw new Error(`Candidate exited before ACP completed: ${JSON.stringify(result)}\n${stderr}`) })])
  await bounded(beforeExit(client.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} })), 'ACP initialize')
  const { sessionId } = await bounded(beforeExit(client.newSession({ cwd: workspace, mcpServers: [] })), 'ACP session/new')
  assert.equal(typeof sessionId, 'string')
  assert(sessionId.length > 0)
  assert.equal(requests.length, 0, 'initialize and session/new must not invoke a model')
  assert.equal(lease.usage().modelRequests, 0)

  const result = await bounded(beforeExit(client.prompt({ sessionId, prompt: [{ type: 'text', text: promptText }] })), 'ACP prompt')
  assert.equal(result.stopReason, 'end_turn')
  assert.equal(requests.length, 1)
  assert.equal(lease.usage().modelRequests, 1)
  assert(JSON.stringify(requests[0]).includes(persona), 'Candidate persona must reach the real model request')
  assert(JSON.stringify(requests[0]).includes(promptText), 'ACP user input must reach the real model request')
  assert.equal(requests[0].provider, 'controlled-fixture')
  const reply = updates.filter(item => item.sessionId === sessionId && item.update.sessionUpdate === 'agent_message_chunk').map(item => item.update.content.text ?? '').join('')
  assert.equal(reply, answer)

  const cancelling = beforeExit(client.prompt({ sessionId, prompt: [{ type: 'text', text: 'Hold this second controlled request until cancellation.' }] }))
  void cancelling.catch(() => undefined)
  await bounded(startedCancellation.promise, 'controlled cancellation request start')
  await client.cancel({ sessionId })
  assert.equal((await bounded(cancelling, 'ACP cancellation')).stopReason, 'cancelled')
  await bounded(cancelledRequest.promise, 'Host stream abort')
  assert.equal(requests.length, 2)
  child.stdin.end()
  const exit = await bounded(exited, 'Candidate EOF disposal', 5000)
  assert.deepEqual(exit, { code: 0, signal: null })
  child = undefined

  const frames = rawStdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  assert(frames.length > 0)
  assert(frames.every(frame => frame.jsonrpc === '2.0'), 'stdout must contain only JSON-RPC frames')
  const sessionFiles = (await readdir(sessionsRoot, { recursive: true })).filter(file => file.endsWith('.jsonl'))
  assert(sessionFiles.length > 0, 'Real DSH persistence must write a session log')
  const events = (await Promise.all(sessionFiles.map(file => readFile(join(sessionsRoot, file), 'utf8')))).flatMap(content => content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)))
  for (const type of ['user/message', 'assistant/message', 'turn/end']) assert(events.some(event => event.type === type), `Missing persisted ${type}`)
  assert(events.some(event => event.type === 'assistant/message' && JSON.stringify(event).includes(answer)))
  const turnEndReasons = events.filter(event => event.type === 'turn/end').map(event => event.data.reason)
  assert.deepEqual(turnEndReasons, [
    { kind: 'completed' }, { kind: 'aborted', reason: { kind: 'user' } },
  ], 'Both completed and cancelled turns must flush with unmodified semantic reasons before process exit')
  assert(!Object.keys(dependencies).some(name => name.includes('demo')), 'Verification must not load either demo application package')
  await lease.close()
  lease = undefined
  succeeded = true
  console.log(JSON.stringify({
    status: 'passed', evidence: 'local-linked-built-dsh-not-published-or-linux-install',
    node: process.versions.node, platform: process.platform, entrypoint, config_path: configPath,
    agent_entry_id: agentEntryId, initialize_and_session_new_model_requests: 0,
    completed_prompt_model_requests: 1, cancelled_prompt_model_requests: 1,
    real_agent_reply: reply, stdout_frames: frames.length, session_logs: sessionFiles.length,
    cancelled: true, persisted_turn_end_reasons: turnEndReasons, clean_exit: true, dependencies,
    ...(values.keep ? { fixture } : {}),
  }, null, 2))
} catch (error) {
  // Capability and request contents deliberately do not appear in diagnostics.
  console.error(`${error.stack ?? error}\nCandidate stderr:\n${stderr}`)
  process.exitCode = 1
} finally {
  if (child) {
    child.stdin.destroy()
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    try { await bounded(childExited, 'failed Candidate cleanup', 3000) }
    catch {
      child.kill('SIGKILL')
      await bounded(childExited, 'forced Candidate cleanup', 3000).catch(() => undefined)
    }
  }
  await lease?.close()
  if (values.keep) console.error(`Verification fixture retained at ${fixture}; contains only a test capability, no Host credentials.`)
  else await rm(fixture, { recursive: true, force: true })
  if (!succeeded && values.keep) console.error('This failed fixture is diagnostic evidence, not a passing Candidate acceptance.')
}
