import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import path from 'node:path'

import { compareCandidates, readEvaluation, runEvaluation, snapshot } from './lib/evolution.js'

export const name = 'harbor-evolution'
export const inject = ['tools']

export const Config = Schema.object({
  projectRoot: Schema.string().default('.'),
  jobsDir: Schema.string().default('jobs'),
  harborBin: Schema.string().default('harbor'),
  harborDshBin: Schema.string().default('harbor-dsh'),
  dshVersion: Schema.string().default('0.1.0-rc.6'),
  agentImportPath: Schema.string().default('harbor_dsh_evolution.agent:DshCandidateAgent'),
  pluginImportPath: Schema.string().default('dsh-evolution'),
  pythonPath: Schema.string().default(''),
  timeoutMs: Schema.number().default(1800000),
})

function jsonTool(definition, execute) {
  return defineTool({
    ...definition,
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return JSON.stringify(await execute(args), null, 2)
    },
  })
}

export function apply(ctx, config) {
  const resolved = { ...config, projectRoot: path.resolve(config.projectRoot) }

  ctx.tools.register(jsonTool({
    name: 'harbor_candidate_snapshot',
    description: 'Freeze a DeepSeek Harness Cordis composition as an immutable Candidate manifest.',
    parameters: {
      candidatePath: { type: 'string', required: true },
      candidateId: { type: 'string', required: true },
      version: { type: 'string', required: true },
    },
  }, args => snapshot(resolved, args)))

  ctx.tools.register(jsonTool({
    name: 'harbor_eval_run',
    description: 'Run one immutable DeepSeek Harness Candidate against a Harbor dataset.',
    parameters: {
      candidatePath: { type: 'string', required: true },
      candidateId: { type: 'string', required: true },
      version: { type: 'string', required: true },
      datasetPath: { type: 'string', required: true },
      jobName: { type: 'string', required: true },
    },
  }, args => runEvaluation(resolved, args)))

  ctx.tools.register(jsonTool({
    name: 'harbor_eval_result',
    description: 'Read the stable evaluation summary produced for a Harbor Job.',
    parameters: {
      jobPath: { type: 'string', required: true },
    },
  }, args => readEvaluation(resolved, args)))

  ctx.tools.register(jsonTool({
    name: 'harbor_candidate_compare',
    description: 'Apply the deterministic Promotion Gate to a baseline Job and a Candidate Job.',
    parameters: {
      baselineJob: { type: 'string', required: true },
      candidateJob: { type: 'string', required: true },
      policyPath: { type: 'string', required: true },
    },
  }, args => compareCandidates(resolved, args)))
}
