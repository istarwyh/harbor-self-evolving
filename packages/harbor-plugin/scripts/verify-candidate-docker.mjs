#!/usr/bin/env node
/** Real Python adapter + Linux Docker + npm-lock closure, controlled model only. */
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, promisify } from 'node:util'
import { CandidateModelRuntime } from '../../dsh-plugin/lib/model-runtime.js'

const runFile = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(here, '..')
const { values } = parseArgs({ options: {
  image: { type: 'string' },
  python: { type: 'string', default: join(pluginRoot, '.venv/bin/python') },
  template: { type: 'string', default: join(pluginRoot, 'src/harbor_dsh_evolution/runtime_template') },
} })
assert(values.image, 'Pass --image <already-built-local-image>; this script never builds or publishes images')
const output = await mkdtemp(join(tmpdir(), 'harbor-real-docker-acp-'))
await mkdir(join(output, 'docker-config'))
const { stdout: endpoint } = await runFile('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'])
assert(endpoint.trim().startsWith('unix://'), 'This verification only supports an explicit local Docker Unix socket')
const { stdout: pluginInfo } = await runFile('docker', ['info', '--format', '{{json .ClientInfo.Plugins}}'])
const compose = JSON.parse(pluginInfo).find(plugin => plugin.Name === 'compose' && !plugin.Err)
assert(compose?.Path, 'Docker Compose must already be installed')
// Retain only the installed CLI-plugin location, not registry auth or other
// Host Docker configuration. The Unix socket is supplied explicitly below.
await writeFile(join(output, 'docker-config/config.json'), JSON.stringify({ cliPluginsExtraDirs: [dirname(compose.Path)] }))
const requests = []
let setupComplete = false
let runComplete = false
let cleanupComplete = false
let driver
let lease
let driverExited
const milestones = []
const runtime = new CandidateModelRuntime({
  agentDefaultModel: { currentSelection: () => ({ provider: 'controlled-fixture', model: 'controlled-model' }) },
  llm: {
    listProviders: () => [{ id: 'controlled-fixture', name: 'Controlled fixture; no vendor' }],
    resolveModelInfo: async () => ({ id: 'controlled-model', name: 'Controlled model', context: { contextWindow: 32768 } }),
    async * stream(options) {
      assert(setupComplete, 'The real adapter readiness check must not call a model')
      requests.push(options)
      assert.equal(requests.length, 1, 'Only one controlled evaluation request is authorized')
      assert(JSON.stringify(options).includes('Reply exactly HARBOR_ACP_OK'))
      assert(JSON.stringify(options).includes('evidence-driven research assistant'), 'Candidate persona must survive the production overlay')
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'HARBOR_ACP_OK' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'HARBOR_ACP_OK' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }, get: () => undefined,
}, { modelBrokerBindHost: '0.0.0.0', modelBrokerAdvertisedHost: 'host.docker.internal', modelBrokerMaxRequests: 1, modelBrokerMaxRequestBytes: 1048576 })

try {
  lease = await runtime.openLease(await runtime.resolve(), { candidateDigest: 'controlled-docker-acceptance', jobName: 'keyless-real-docker-acp', maxRequests: 1 })
  const environment = {
    PATH: dirname(process.execPath) + ':/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin',
    LANG: 'C.UTF-8', DOCKER_HOST: endpoint.trim(), DOCKER_CONFIG: join(output, 'docker-config'),
    PYTHONPATH: join(pluginRoot, 'src'), PYTHONUNBUFFERED: '1',
    HSE_MODEL_GATEWAY_URL: lease.endpoint, HSE_MODEL_GATEWAY_TOKEN: lease.token,
    HSE_MODEL_GATEWAY_PROVIDER: lease.candidateProvider,
    HSE_MODEL_GATEWAY_PROTOCOL: lease.protocol,
    HSE_MODEL_GATEWAY_INFO: JSON.stringify(lease.modelInfo),
  }
  driver = spawn(resolve(values.python), [join(here, 'verify-candidate-docker.py'),
    '--image', values.image, '--template', resolve(values.template), '--output', output,
  ], { env: environment, stdio: ['pipe', 'pipe', 'pipe'] })
  let stderr = ''
  let pending = ''
  let protocolError
  driver.stderr.setEncoding('utf8').on('data', text => { stderr += text })
  driver.stdout.setEncoding('utf8').on('data', text => {
    pending += text
    const lines = pending.split('\n')
    pending = lines.pop()
    for (const line of lines.filter(Boolean)) {
      try {
        const milestone = JSON.parse(line)
        milestones.push(milestone)
        if (milestone.stage === 'setup_complete') {
          assert.equal(requests.length, 0)
          assert.equal(lease.usage().modelRequests, 0)
          setupComplete = true
          driver.stdin.write('continue\n')
        }
        if (milestone.stage === 'run_complete') runComplete = true
        if (milestone.stage === 'cleanup_complete') cleanupComplete = true
        console.log(JSON.stringify(milestone))
      } catch (error) {
        protocolError = error
        driver.stdin.end('stop\n')
      }
    }
  })
  driverExited = new Promise((resolveExit, reject) => {
    driver.once('error', reject)
    driver.once('close', (code, signal) => resolveExit({ code, signal }))
  })
  const exit = await driverExited
  driver = undefined
  await writeFile(join(output, 'driver-stderr.log'), stderr)
  if (protocolError) throw protocolError
  assert.equal(exit.code, 0, `Python adapter verification failed (${JSON.stringify(exit)}):\n${stderr}`)
  assert(setupComplete && runComplete && cleanupComplete, 'All actual lifecycle and cleanup gates must complete')
  assert.equal(requests.length, 1)
  assert.equal(lease.usage().modelRequests, 1)
  const report = { status: 'passed', evidence: 'real-python-adapter-linux-docker-locked-npm-controlled-model',
    setup_model_requests: 0, evaluation_model_requests: 1, real_model_provider_calls: 0,
    output, milestones,
  }
  await writeFile(join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally {
  if (driver) {
    driver.stdin.end('stop\n')
    // The Python driver owns its container's finally cleanup. Do not replace
    // that with a broad docker prune or a signal that skips its cleanup.
    if (driverExited) await driverExited
  }
  await lease?.close()
  console.error(`Docker acceptance evidence: ${output}`)
}
