import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { compareCandidates, readEvaluation, runEvaluation, snapshot } from './lib/evolution.js'

export const name = 'harbor-evolution'
export const inject = ['tools']

const packageDir = path.dirname(fileURLToPath(import.meta.url))
const checkoutPythonPackage = path.resolve(packageDir, '../harbor-plugin')

function checkoutExecutable(name) {
  const candidate = path.join(checkoutPythonPackage, '.venv', 'bin', name)
  return existsSync(candidate) ? candidate : name
}

export const Config = Schema.object({
  projectRoot: Schema.string().default('.'),
  jobsDir: Schema.string().default('jobs'),
  harborBin: Schema.string().default(''),
  harborDshBin: Schema.string().default(''),
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
  const resolved = {
    ...config,
    projectRoot: path.resolve(config.projectRoot),
    harborBin: config.harborBin || process.env.HARBOR_BIN || checkoutExecutable('harbor'),
    harborDshBin: config.harborDshBin || process.env.HARBOR_DSH_BIN || checkoutExecutable('harbor-dsh'),
    pythonPath: config.pythonPath || (
      existsSync(path.join(checkoutPythonPackage, 'src'))
        ? path.join(checkoutPythonPackage, 'src')
        : ''
    ),
  }

  ctx.tools.register(jsonTool({
    name: 'harbor_candidate_snapshot',
    description: 'Freeze a DeepSeek Harness Cordis composition as an immutable Candidate manifest. Candidate id and version default to package.json.',
    parameters: {
      candidatePath: { type: 'string', required: true },
      candidateId: { type: 'string' },
      version: { type: 'string' },
    },
  }, args => snapshot(resolved, args)))

  ctx.tools.register(jsonTool({
    name: 'harbor_eval_run',
    description: 'Snapshot and run one DeepSeek Harness Candidate against a Harbor dataset, then return the completed evaluation summary.',
    parameters: {
      candidatePath: { type: 'string', required: true },
      candidateId: { type: 'string' },
      version: { type: 'string' },
      datasetPath: { type: 'string', required: true },
      jobName: { type: 'string' },
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
