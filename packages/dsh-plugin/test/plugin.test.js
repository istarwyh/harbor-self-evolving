import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'

import { apply } from '../index.js'

test('Cordis plugin registers the bundled evolution Skill and four tools', () => {
  const tools = []
  const skills = []
  const ctx = {
    skills: { register(skill) { skills.push(skill) } },
    tools: { register(tool) { tools.push(tool) } },
  }
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
  assert.equal(skills.length, 1)
  assert.equal(skills[0].name, 'evolve-agent-with-harbor')
  assert.equal(skills[0].invocation.modelInvocable, true)
  assert.equal(skills[0].invocation.userInvocable, true)
  assert.equal(skills[0].resourceBase.kind, 'directory')
  assert.equal(existsSync(skills[0].path), true)
  assert.match(skills[0].description, /self-evolution/)
  assert.match(skills[0].content, /harbor_candidate_snapshot/)
  assert.match(skills[0].content, /Clarify the evaluation contract/)
  assert.doesNotMatch(skills[0].content, /^---/)
})
