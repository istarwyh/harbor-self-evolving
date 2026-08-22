import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { apply } from '../index.js'

test('Cordis plugin registers the bundled evolution Skill and strict architecture tools', () => {
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
    'harbor_evolution_init',
    'harbor_evolution_doctor',
    'harbor_dataset_validate',
    'harbor_context_preview',
    'harbor_eval_run',
    'harbor_eval_result',
    'harbor_evaluator_inspect',
    'harbor_evaluator_update',
    'harbor_ground_truth_init',
    'harbor_evaluator_meta_evaluate',
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
  assert.match(skills[0].content, /Evaluation Stack/)
  assert.doesNotMatch(skills[0].content, /^---/)
})

test('published package exposes the DSH bundle patch', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  )

  assert.equal(packageJson.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(packageJson.exports['./cordis.patch.yml'], './cordis.patch.yml')
  assert.equal(packageJson.exports['./schemas/evaluation-result.schema.json'], './schemas/evaluation-result.schema.json')
  assert.equal(packageJson.exports['./schemas/ground-truth.schema.json'], './schemas/ground-truth.schema.json')
})
