import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadBundledSkill } from './lib/official-skill.js'
import { EvolutionService } from './lib/service.js'
import { installDashboardWeb } from './lib/web.js'

export const name = 'harbor-evolution'
export const inject = ['tools', 'skills']

const packageDir = path.dirname(fileURLToPath(import.meta.url))
const checkoutPythonPackage = path.resolve(packageDir, '../harbor-plugin')
const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

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
  const service = new EvolutionService(resolved, { pluginVersion: packageJson.version })

  ctx.skills.register(loadBundledSkill())
  installDashboardWeb(ctx, service)

  ctx.tools.register(jsonTool({
    name: 'harbor_candidate_snapshot',
    description: 'Freeze a DeepSeek Harness Cordis composition as an immutable Candidate manifest. Candidate id and version default to package.json.',
    parameters: {
      candidatePath: { type: 'string', required: true },
      candidateId: { type: 'string' },
      version: { type: 'string' },
    },
  }, args => service.snapshot(args)))

  ctx.tools.register(jsonTool({
    name: 'harbor_evolution_init',
    description: 'Initialize a strict, non-overwriting Evaluation Stack project after the Skill has clarified identities, primary metric, judge, and promotion threshold.',
    parameters: {
      datasetPath: { type: 'string', required: true },
      stackId: { type: 'string', required: true },
      stackVersion: { type: 'string', required: true },
      datasetId: { type: 'string', required: true },
      datasetVersion: { type: 'string', required: true },
      contractId: { type: 'string', required: true },
      contractVersion: { type: 'string', required: true },
      primaryMetric: { type: 'string', required: true },
      primaryDirection: { type: 'string', required: true },
      judgeProvider: { type: 'string', required: true },
      judgeModel: { type: 'string', required: true },
      judgeVersion: { type: 'string', required: true },
      policyId: { type: 'string', required: true },
      policyVersion: { type: 'string', required: true },
      minImprovement: { type: 'number', required: true },
    },
  }, args => service.initialize(args)))

  ctx.tools.register(jsonTool({
    name: 'harbor_evolution_doctor',
    description: 'Validate the Evaluation Stack architecture, Dataset manifest, Candidate, and optional Promotion Policy before an expensive Harbor Job.',
    parameters: {
      candidatePath: { type: 'string', required: true },
      datasetPath: { type: 'string', required: true },
      stackPath: { type: 'string', required: true },
      policyPath: { type: 'string' },
      mode: { type: 'string', required: true },
    },
  }, args => service.doctor(args)))

  ctx.tools.register(jsonTool({
    name: 'harbor_dataset_validate',
    description: 'Validate dataset-manifest.json, task uniqueness, instructions, paths, sensitive metadata, and the immutable source digest.',
    parameters: {
      datasetPath: { type: 'string', required: true },
    },
  }, args => service.validateDataset(args)))

  ctx.tools.register(jsonTool({
    name: 'harbor_context_preview',
    description: 'Preview Evaluation Context v2 and find comparable baselines before launching a Job.',
    parameters: {
      candidatePath: { type: 'string', required: true },
      candidateId: { type: 'string' },
      version: { type: 'string' },
      datasetPath: { type: 'string', required: true },
      stackPath: { type: 'string', required: true },
      mode: { type: 'string', required: true },
    },
  }, args => service.previewContext(args)))

  ctx.tools.register(jsonTool({
    name: 'harbor_eval_run',
    description: 'Run a strict diagnostic or promotion-eligible Harbor Job bound to Candidate, Dataset Manifest, Evaluation Stack, and Context v2 identities.',
    parameters: {
      candidatePath: { type: 'string', required: true },
      candidateId: { type: 'string' },
      version: { type: 'string' },
      datasetPath: { type: 'string', required: true },
      stackPath: { type: 'string', required: true },
      mode: { type: 'string', required: true },
      policyPath: { type: 'string' },
      jobName: { type: 'string' },
    },
  }, args => service.run(args)))

  ctx.tools.register(jsonTool({
    name: 'harbor_eval_result',
    description: 'Read the stable evaluation summary produced for a Harbor Job.',
    parameters: {
      jobPath: { type: 'string', required: true },
    },
  }, args => service.result(args)))

  ctx.tools.register(jsonTool({
    name: 'harbor_candidate_compare',
    description: 'Apply the deterministic Promotion Gate to a baseline Job and a Candidate Job.',
    parameters: {
      baselineJob: { type: 'string', required: true },
      candidateJob: { type: 'string', required: true },
      policyPath: { type: 'string', required: true },
    },
  }, args => service.compare(args)))
}
