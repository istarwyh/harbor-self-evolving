import { access, stat } from 'node:fs/promises'
import path from 'node:path'

import { loadModelBinding } from './candidate.js'

import {
  readComparison,
  readDashboardSnapshot,
  readDatasetPreview,
  readEvaluatorGovernance,
  readJobDetail,
  readJobProgress,
  readMetaEvaluation,
  readTrialDetail,
  readTrialsPage,
} from './dashboard.js'
import {
  compareCandidates,
  initializeGroundTruth,
  initializeProject,
  initializeQuickDiagnostic,
  inspectEvaluator,
  previewContext,
  readEvaluation,
  runDoctor,
  runEvaluation,
  runMetaEvaluation,
  snapshot,
  updateEvaluator,
  validateDataset,
  resolveWithin,
} from './evolution.js'
import { createVersionChecker } from './version.js'

export async function resolveEvaluatorStackPath(config, governance, explicitPath) {
  if (explicitPath) return explicitPath
  const root = path.resolve(config.projectRoot)
  const entry = governance.components?.evaluator?.entry
  if (typeof entry !== 'string' || !entry) return undefined
  let directory = path.dirname(path.resolve(root, entry))
  if (directory !== root && !directory.startsWith(`${root}${path.sep}`)) return undefined
  while (directory === root || directory.startsWith(`${root}${path.sep}`)) {
    const candidate = path.join(directory, '.harbor', 'evaluation-stack.yml')
    try {
      await access(candidate)
      return path.relative(root, candidate)
    } catch {}
    if (directory === root) break
    directory = path.dirname(directory)
  }
  return undefined
}

/** One Host-side boundary shared by Agent tools and the Web dashboard. */
export class EvolutionService {
  constructor(config, metadata = {}, modelRuntime) {
    this.config = config
    this.metadata = metadata
    this.modelRuntime = modelRuntime
    this.versionChecker = metadata.versionChecker ?? createVersionChecker()
  }

  snapshot(args) {
    return snapshot(this.config, args)
  }

  initialize(args) {
    return initializeProject(this.config, args)
  }

  quickDiagnostic(args) {
    return initializeQuickDiagnostic(this.config, args)
  }

  async _resolveCandidateModel(args) {
    const candidatePath = resolveWithin(
      this.config.projectRoot,
      args.candidatePath,
      'candidatePath',
    )
    const pinnedBinding = await loadModelBinding(candidatePath)
    return this.modelRuntime.resolve(args, pinnedBinding)
  }

  async run(args) {
    const candidateModelBinding = await this._resolveCandidateModel(args)
    return runEvaluation(this.config, { ...args, candidateModelBinding }, this.modelRuntime)
  }

  result(args) {
    const job = String(args.jobPath ?? '').split(/[\\/]/).filter(Boolean).at(-1)
    if (args.view === 'job') return readJobDetail(this.config, { job })
    if (args.view === 'progress') return readJobProgress(this.config, { job, since: args.since })
    if (args.view === 'trial') {
      if (!args.trialId) throw new Error('trialId is required when view=trial')
      return readTrialDetail(this.config, { job, trial: args.trialId })
    }
    if (args.view === 'dataset') return readDatasetPreview(this.config, { job })
    if (args.view === 'governance') return readEvaluatorGovernance(this.config, { job, compareJob: args.compareJob })
    return readEvaluation(this.config, args)
  }

  compare(args) {
    return compareCandidates(this.config, args)
  }

  async doctor(args) {
    const candidateModelBinding = await this._resolveCandidateModel(args)
    const result = await runDoctor(this.config, args)
    return { ...result, candidate_model_binding: candidateModelBinding }
  }

  validateDataset(args) {
    return validateDataset(this.config, args)
  }

  async previewContext(args) {
    const candidateModelBinding = await this._resolveCandidateModel(args)
    return previewContext(this.config, { ...args, candidateModelBinding })
  }

  dashboard() {
    return readDashboardSnapshot(this.config, this.metadata)
  }

  version(args = {}) {
    return this.versionChecker({
      currentVersion: this.metadata.pluginVersion ?? 'development',
      projectRoot: this.config.projectRoot,
      refresh: args.refresh === true || args.refresh === 'true',
    })
  }

  async modelBinding() {
    const binding = await this.modelRuntime.currentBinding()
    return {
      schema_version: 1,
      scope: 'new-candidate',
      candidate_model_binding: binding,
      transport: 'dsh-host-broker',
      protocol: 'dsh-host-model-gateway/v1',
      credentials: {
        mode: 'host-broker-only',
        note: 'The Candidate receives only a short-lived Job capability. Host OAuth and API credentials never enter the Candidate or Harbor artifacts.',
      },
      note: 'Write candidate_model_binding to model-binding.json before snapshotting. Later chat-model changes do not rewrite this Candidate.',
    }
  }

  async setProjectRoot(args) {
    const requested = String(args?.projectRoot ?? '').trim()
    if (!path.isAbsolute(requested)) throw new Error('projectRoot must be an absolute directory path')
    const resolved = path.resolve(requested)
    const details = await stat(resolved)
    if (!details.isDirectory()) throw new Error('projectRoot must point to an existing directory')
    this.config.projectRoot = resolved
    return {
      projectRoot: resolved,
      reloaded: true,
      scope: 'Web Workbench only; Agent tools continue to use each calling session working directory.',
    }
  }

  job(args) {
    return readJobDetail(this.config, args)
  }

  trials(args) {
    return readTrialsPage(this.config, args)
  }

  trial(args) {
    return readTrialDetail(this.config, args)
  }

  dataset(args) {
    return readDatasetPreview(this.config, args)
  }

  progress(args) {
    return readJobProgress(this.config, args)
  }

  comparison(args) {
    return readComparison(this.config, args)
  }

  async governance(args) {
    const governance = await readEvaluatorGovernance(this.config, args)
    try {
      const stackPath = await resolveEvaluatorStackPath(this.config, governance, args.stackPath)
      governance.evaluatorInterface = await inspectEvaluator(this.config, { ...args, stackPath })
      governance.editingPolicy.browserWriteEnabled = true
      governance.editingPolicy.stackPath = governance.evaluatorInterface.stack?.path
      governance.editingPolicy.saveBehavior = 'Update one descriptor-authorized file with optimistic concurrency and create new Evaluator and Stack identities.'
    } catch (error) {
      governance.evaluatorInterface = { error: error instanceof Error ? error.message : String(error) }
    }
    return governance
  }

  evaluator(args) {
    return updateEvaluator(this.config, args)
  }

  evaluatorInspect(args) {
    return inspectEvaluator(this.config, args)
  }

  groundTruthInitialize(args) {
    return initializeGroundTruth(this.config, args)
  }

  evaluatorMetaEvaluate(args) {
    return runMetaEvaluation(this.config, args)
  }

  async meta(args) {
    const governance = await readEvaluatorGovernance(this.config, args)
    const stackPath = await resolveEvaluatorStackPath(this.config, governance, args.stackPath)
    if (!stackPath) return readMetaEvaluation(this.config)
    const stackDirectory = path.dirname(path.resolve(this.config.projectRoot, stackPath))
    const evaluationRoot = path.dirname(stackDirectory)
    return readMetaEvaluation(this.config, {
      evaluationRoot: path.relative(this.config.projectRoot, evaluationRoot),
    })
  }
}
