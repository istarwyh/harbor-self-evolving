import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import React from 'react'

test('built Web client registers the Harbor dashboard, Doctor, and four Tool views', async () => {
  const bundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  let descriptor
  const window = { __ModuleLoader__: { load(value) { descriptor = value } } }
  new Function('window', bundle)(window)
  assert.equal(descriptor.id, 'dsh-harbor-evolution')
  const plugin = descriptor.factory(id => {
    if (id === 'react') return React
    throw new Error(`unexpected client dependency: ${id}`)
  })
  assert.equal(plugin.name, 'dsh-harbor-evolution')
  assert.deepEqual(plugin.inject, ['slots', 'locale'])

  const registrations = []
  const ctx = {
    effect() { return () => {} },
    locale: {
      bind() { return key => key },
      register() { return () => {} },
    },
    slots: {
      inject(name, callback) {
        const value = callback()
        if (value?.[Symbol.iterator] && typeof value !== 'string') {
          for (const dispose of value) void dispose
        }
      },
      register(options, component) {
        registrations.push({ options, component })
        return () => {}
      },
    },
  }
  plugin.apply(ctx)
  assert.deepEqual(registrations.map(entry => entry.options.name), [
    'conversation.view',
    'settings.section',
    'tool.call.toolview',
    'tool.call.toolview',
    'tool.call.toolview',
    'tool.call.toolview',
  ])
  assert.equal(registrations[0].options.id, 'harbor-evolution')
  assert.equal(registrations[1].options.id, 'harbor-evolution')
  assert.deepEqual(registrations.slice(2).map(entry => entry.options.key), [
    'harbor_candidate_snapshot',
    'harbor_eval_run',
    'harbor_eval_result',
    'harbor_candidate_compare',
  ])
  assert.ok(bundle.length > 150_000, 'the embedded ocean asset should ship in the portable client bundle')
})
