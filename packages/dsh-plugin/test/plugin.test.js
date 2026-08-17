import assert from 'node:assert/strict'
import test from 'node:test'

import { apply } from '../index.js'

test('Cordis plugin registers only the four evolution tools', () => {
  const tools = []
  const ctx = { tools: { register(tool) { tools.push(tool) } } }
  apply(ctx, {
    projectRoot: '.',
    jobsDir: 'jobs',
    harborBin: 'harbor',
    harborDshBin: 'harbor-dsh',
    dshVersion: '0.1.0-rc.6',
    agentImportPath: 'harbor_dsh_evolution.agent:DshCandidateAgent',
    pluginImportPath: 'dsh-evolution',
    pythonPath: '',
    timeoutMs: 1000,
  })
  assert.deepEqual(tools.map(tool => tool.name), [
    'harbor_candidate_snapshot',
    'harbor_eval_run',
    'harbor_eval_result',
    'harbor_candidate_compare',
  ])
})
