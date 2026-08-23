import assert from 'node:assert/strict'
import test from 'node:test'

import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'

import { loadBundledSkill } from '../lib/official-skill.js'

test('bundled Skill loads through the official DSH Skill Registry', async () => {
  const root = new Context()
  await root.plugin(SkillRegistry)

  const dispose = root.skills.register(loadBundledSkill())
  const summaries = await root.skills.list()
  const skill = await root.skills.get('evolve-agent-with-harbor')

  assert.deepEqual(summaries.map(summary => summary.name), ['evolve-agent-with-harbor'])
  assert.equal(summaries[0].invocation.modelInvocable, true)
  assert.equal(summaries[0].invocation.userInvocable, true)
  assert.equal(skill.source, 'npm:dsh-harbor-evolution')
  assert.equal(skill.resourceBase.kind, 'directory')
  assert.match(skill.content, /Run the evolution loop/)
  assert.match(skill.content, /harbor_evolution_doctor/)
  assert.match(skill.content, /fresh_baseline_required/)
  assert.match(skill.content, /评测集：测什么？/)
  assert.match(skill.content, /生成器：谁来回答？/)
  assert.match(skill.content, /评测器（评测标准）：怎样算好？/)
  assert.match(skill.content, /优化器：谁根据结果改进？/)
  assert.match(skill.content, /开始初始化/)
  assert.match(skill.content, /single Query becomes a one-task \*\*diagnostic\*\* Dataset/)

  dispose()
  assert.deepEqual(await root.skills.list(), [])
  await root.fiber.dispose()
})
