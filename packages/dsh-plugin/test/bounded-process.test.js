import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { runBoundedProcess } from '../lib/bounded-process.js'

const testEnv = { ...process.env, NODE_NO_WARNINGS: '1' }
const node = (source, options = {}) => runBoundedProcess(process.execPath, ['-e', source], { timeoutMs: 2000, killGraceMs: 60, env: testEnv, ...options })
const exists = pid => {
  try { process.kill(pid, 0); return true } catch (error) { if (error.code === 'ESRCH') return false; throw error }
}
const waitUntil = async (check, timeout = 2000) => {
  const deadline = Date.now() + timeout
  while (!await check()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for subprocess fixture')
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

test('bounded process returns UTF-8 output and never evaluates arguments through a shell', async () => {
  const result = await runBoundedProcess(process.execPath, ['-e', 'process.stdout.write(process.argv[1]); process.stderr.write("你好")', '$(echo forbidden); echo forbidden'], { timeoutMs: 2000, env: testEnv })
  assert.deepEqual(result, { code: 0, stdout: '$(echo forbidden); echo forbidden', stderr: '你好' })
})

test('bounded process abort before launch starts no child and does not expose abort reasons', async () => {
  const controller = new AbortController()
  controller.abort(new Error('secret-token-value'))
  let spawns = 0
  await assert.rejects(node('process.exit(0)', { signal: controller.signal, onSpawn: () => { spawns += 1 } }), error => error.code === 'HARBOR_PROCESS_ABORTED' && !error.message.includes('secret-token-value'))
  assert.equal(spawns, 0)
})

test('bounded process reports missing executable and nonzero exit with bounded diagnostics', async () => {
  await assert.rejects(runBoundedProcess('/nonexistent-harbor-owned-executable', [], { timeoutMs: 1000 }), error => error.code === 'HARBOR_PROCESS_SPAWN_FAILED' && error.result.stdout === '')
  await assert.rejects(node('process.stderr.write("controlled diagnostic"); process.exit(7)'), error => error.code === 'HARBOR_PROCESS_EXIT_FAILED' && error.result.code === 7 && error.result.stderr === 'controlled diagnostic')
  assert.equal((await node('process.exit(2)', { allowedExitCodes: [0, 2] })).code, 2)
})

test('bounded process validates limits before launch', async () => {
  for (const options of [{ timeoutMs: 0 }, { timeoutMs: Number.POSITIVE_INFINITY }, { maxOutputBytes: -1 }, { killGraceMs: 0 }]) {
    await assert.rejects(node('process.exit(0)', options), { code: 'HARBOR_PROCESS_INVALID_OPTIONS' })
  }
})

test('bounded process supplies bounded stdin and rejects oversized input before launch', async () => {
  const echo = 'process.stdin.pipe(process.stdout)'
  assert.equal((await node(echo, { input: '受控输入' })).stdout, '受控输入')
  assert.equal((await node(echo, { input: Buffer.from('bytes') })).stdout, 'bytes')
  let spawns = 0
  await assert.rejects(node(echo, { input: '12345', maxInputBytes: 4, onSpawn: () => { spawns += 1 } }), { code: 'HARBOR_PROCESS_INPUT_LIMIT' })
  assert.equal(spawns, 0)
  assert.equal((await node('process.exit(0)', { input: 'x'.repeat(1024 * 1024) })).code, 0)
})

test('bounded process enforces one aggregate stdout/stderr budget and kills the writer', async () => {
  let pid
  await assert.rejects(node('process.stdout.write("a".repeat(64)); process.stderr.write("b".repeat(64)); setInterval(() => process.stdout.write("overflow"), 10)', { maxOutputBytes: 100, onSpawn: value => { pid = value } }), error => {
    assert.equal(error.code, 'HARBOR_PROCESS_OUTPUT_LIMIT')
    assert.equal(Buffer.byteLength(error.result.stdout) + Buffer.byteLength(error.result.stderr), 100)
    return true
  })
  assert.equal(exists(pid), false)
})

test('bounded process timeout escalates TERM-resistant child and waits for close', async () => {
  let pid
  const startedAt = Date.now()
  await assert.rejects(node('process.on("SIGTERM", () => {}); setInterval(() => {}, 20)', { timeoutMs: 250, onSpawn: value => { pid = value } }), { code: 'HARBOR_PROCESS_TIMEOUT' })
  assert.equal(exists(pid), false)
  assert.ok(Date.now() - startedAt < 2000)
})

test('bounded process cancellation settles once and waits for child shutdown', async () => {
  const controller = new AbortController()
  let pid
  const pending = node('process.on("SIGTERM", () => {}); setInterval(() => {}, 20)', { signal: controller.signal, onSpawn: value => { pid = value; setTimeout(() => { controller.abort(); controller.abort() }, 150) } })
  await assert.rejects(pending, { code: 'HARBOR_PROCESS_ABORTED' })
  assert.equal(exists(pid), false)
})

test('bounded process checkpoint failure kills its child before rejection', async () => {
  let pid
  await assert.rejects(node('setInterval(() => {}, 20)', { onSpawn: value => { pid = value; throw new Error('private checkpoint path') } }), error => error.code === 'HARBOR_PROCESS_CHECKPOINT_FAILED' && !error.message.includes('private checkpoint path'))
  assert.equal(exists(pid), false)
})

test('bounded process never hangs on an unfinished asynchronous ownership checkpoint', async () => {
  let pid
  await assert.rejects(node('setInterval(() => {}, 20)', { timeoutMs: 150, onSpawn: value => { pid = value; return new Promise(() => {}) } }), { code: 'HARBOR_PROCESS_TIMEOUT' })
  assert.equal(exists(pid), false)
})

test('bounded process byte budget also bounds decoded invalid or truncated UTF-8', async () => {
  for (const source of ['process.stdout.write(Buffer.alloc(32, 255))', 'process.stdout.write("你".repeat(32))']) {
    await assert.rejects(node(source, { maxOutputBytes: 10 }), error => {
      assert.equal(error.code, 'HARBOR_PROCESS_OUTPUT_LIMIT')
      assert.ok(Buffer.byteLength(error.result.stdout) + Buffer.byteLength(error.result.stderr) <= 10)
      return true
    })
  }
})

test('bounded process exact output budget does not reject a successful command', async () => {
  assert.equal((await node('process.stdout.write("你")', { maxOutputBytes: 3 })).stdout, '你')
  assert.equal((await node('process.exit(0)', { maxOutputBytes: 0 })).code, 0)
})

test('bounded process cancellation kills owned POSIX grandchildren even after their parent exits', { skip: process.platform === 'win32' }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'harbor-bounded-process-'))
  const ready = path.join(directory, 'grandchild.json')
  const controller = new AbortController()
  let parentPid, grandchildPid
  const descendant = 'process.on("SIGTERM", () => {}); require("node:fs").writeFileSync(process.argv[1], JSON.stringify({pid:process.pid})); setInterval(() => {}, 20)'
  const source = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}, ${JSON.stringify(ready)}], {stdio:'ignore'}); setInterval(() => {}, 20)`
  const pending = node(source, { timeoutMs: 5000, signal: controller.signal, onSpawn: value => { parentPid = value } })
  const rejected = assert.rejects(pending, { code: 'HARBOR_PROCESS_ABORTED' })
  try {
    await waitUntil(async () => {
      try { grandchildPid = JSON.parse(await readFile(ready, 'utf8')).pid; return Boolean(grandchildPid) } catch { return false }
    })
    controller.abort()
    await rejected
    assert.equal(exists(parentPid), false)
    await waitUntil(() => !exists(grandchildPid))
  } finally {
    controller.abort()
    if (parentPid && exists(parentPid)) { try { process.kill(-parentPid, 'SIGKILL') } catch {} }
    if (grandchildPid && exists(grandchildPid)) { try { process.kill(grandchildPid, 'SIGKILL') } catch {} }
    await rejected
  }
})

test('bounded process successful parent exit cannot leave owned POSIX background work', { skip: process.platform === 'win32' }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'harbor-bounded-background-'))
  const ready = path.join(directory, 'grandchild.json')
  let parentPid, grandchildPid
  const descendant = 'process.on("SIGTERM", () => {}); require("node:fs").writeFileSync(process.argv[1], JSON.stringify({pid:process.pid})); setInterval(() => {}, 20)'
  const source = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}, ${JSON.stringify(ready)}], {stdio:'ignore'}); setInterval(() => { if (require('node:fs').existsSync(${JSON.stringify(ready)})) process.exit(0) }, 10)`
  try {
    const result = await node(source, { onSpawn: value => { parentPid = value } })
    grandchildPid = JSON.parse(await readFile(ready, 'utf8')).pid
    assert.equal(result.code, 0)
    assert.equal(exists(parentPid), false)
    await waitUntil(() => !exists(grandchildPid))
  } finally {
    if (parentPid && exists(parentPid)) { try { process.kill(-parentPid, 'SIGKILL') } catch {} }
    if (grandchildPid && exists(grandchildPid)) { try { process.kill(grandchildPid, 'SIGKILL') } catch {} }
  }
})
