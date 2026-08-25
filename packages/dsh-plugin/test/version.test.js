import assert from 'node:assert/strict'
import test from 'node:test'

import { compareSemver, createVersionChecker, NPM_LATEST_URL, renderUpdateCommand } from '../lib/version.js'

test('semantic versions compare stable and prerelease releases correctly', () => {
  assert.equal(compareSemver('0.7.0', '0.7.1'), -1)
  assert.equal(compareSemver('1.0.0', '1.0.0-rc.2'), 1)
  assert.equal(compareSemver('1.0.0-rc.10', '1.0.0-rc.2'), 1)
  assert.equal(compareSemver('development', '1.0.0'), undefined)
})

test('version checker returns an exact, safely quoted update command and caches registry success', async () => {
  let requests = 0
  const checker = createVersionChecker({
    now: () => Date.parse('2026-08-23T04:00:00.000Z'),
    fetchImpl: async (url, options) => {
      requests += 1
      assert.equal(url, NPM_LATEST_URL)
      assert.equal(options.redirect, 'error')
      return { ok: true, async json() { return { name: 'dsh-harbor-evolution', version: '0.8.0' } } }
    },
  })
  const input = { currentVersion: '0.7.0', projectRoot: "/tmp/Agent's workspace" }
  const first = await checker(input)
  const second = await checker(input)

  assert.equal(first.status, 'update-available')
  assert.equal(first.latestVersion, '0.8.0')
  assert.equal(first.command, `npx --yes dsh-harbor-evolution@0.8.0 setup --project-root '/tmp/Agent'"'"'s workspace'`)
  assert.equal(second.source, 'cache')
  assert.equal(requests, 1)
  assert.equal(renderUpdateCommand('0.8.0', '/tmp/project'), "npx --yes dsh-harbor-evolution@0.8.0 setup --project-root '/tmp/project'")
})

test('registry failure stays non-blocking and falls back to stale successful data', async () => {
  let now = Date.parse('2026-08-23T04:00:00.000Z')
  let fail = false
  const checker = createVersionChecker({
    now: () => now,
    cacheTtlMs: 1,
    fetchImpl: async () => {
      if (fail) throw new Error('offline')
      return { ok: true, async json() { return { name: 'dsh-harbor-evolution', version: '0.8.0' } } }
    },
  })
  await checker({ currentVersion: '0.7.0', projectRoot: '/tmp/project' })
  now += 2
  fail = true
  const stale = await checker({ currentVersion: '0.7.0', projectRoot: '/tmp/project' })
  assert.equal(stale.status, 'update-available')
  assert.equal(stale.stale, true)

  const offline = await createVersionChecker({ fetchImpl: async () => { throw new Error('offline') } })({
    currentVersion: '0.7.0', projectRoot: '/tmp/project',
  })
  assert.deepEqual(Object.keys(offline).sort(), ['checkedAt', 'currentVersion', 'source', 'status'])
  assert.equal(offline.status, 'unavailable')
})
