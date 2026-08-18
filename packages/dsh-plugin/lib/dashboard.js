import { access, constants, readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import { resolveWithin } from './evolution.js'

const SUMMARY_NAME = 'evaluation-summary.json'
const PROMOTION_NAME = 'promotion-report.json'
const MAX_JOBS = 50

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    if (error instanceof SyntaxError) return { __readError: `invalid JSON in ${path.basename(file)}` }
    throw error
  }
}

async function directoryCheck(directory, { optional = false } = {}) {
  try {
    const details = await stat(directory)
    if (!details.isDirectory()) return { status: 'error', detail: 'not a directory' }
    await access(directory, constants.R_OK)
    return { status: 'ok', detail: 'readable' }
  } catch (error) {
    if (optional && error.code === 'ENOENT') return { status: 'warning', detail: 'not created yet' }
    return { status: 'error', detail: error.code === 'ENOENT' ? 'not found' : error.message }
  }
}

async function executableCheck(command) {
  if (!command) return { status: 'error', detail: 'not configured' }
  if (!path.isAbsolute(command)) return { status: 'ok', detail: `${command} (resolved from PATH)` }
  try {
    await access(command, constants.X_OK)
    return { status: 'ok', detail: command }
  } catch (error) {
    return { status: 'error', detail: error.code === 'ENOENT' ? `${command} not found` : error.message }
  }
}

function jobStatus(summary) {
  if (!summary) return 'pending'
  if (summary.__readError) return 'failed'
  const trials = Number(summary.n_trials ?? 0)
  const exceptions = Number(summary.n_exceptions ?? 0)
  if (trials > 0 && exceptions >= trials) return 'failed'
  if (exceptions > 0) return 'partial'
  return 'completed'
}

async function readJob(jobsDir, entry, details) {
  const directory = path.join(jobsDir, entry.name)
  const summary = await readJson(path.join(directory, SUMMARY_NAME))
  const promotion = await readJson(path.join(directory, PROMOTION_NAME))
  return {
    name: entry.name,
    path: directory,
    updatedAt: details.mtime.toISOString(),
    status: jobStatus(summary),
    nTrials: Number(summary?.n_trials ?? 0),
    nExceptions: Number(summary?.n_exceptions ?? 0),
    metrics: summary?.metrics ?? {},
    candidate: summary?.candidate ?? undefined,
    evaluationContext: summary?.evaluation_context ?? undefined,
    promotion: promotion ? {
      decision: promotion.decision,
      reasons: Array.isArray(promotion.reasons) ? promotion.reasons : [],
      baselineJob: promotion.baseline_job,
      candidateJob: promotion.candidate_job,
    } : undefined,
    readError: summary?.__readError,
  }
}

async function listJobs(jobsDir) {
  let entries
  try {
    entries = await readdir(jobsDir, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
  const recent = await Promise.all(entries
    .filter(entry => entry.isDirectory())
    .map(async entry => ({ entry, details: await stat(path.join(jobsDir, entry.name)) })))
  recent.sort((left, right) => right.details.mtimeMs - left.details.mtimeMs)
  return Promise.all(recent
    .slice(0, MAX_JOBS)
    .map(({ entry, details }) => readJob(jobsDir, entry, details)))
}

function latestMetric(jobs) {
  const completed = jobs.find(job => job.status === 'completed' || job.status === 'partial')
  if (!completed) return undefined
  const entry = Object.entries(completed.metrics).find(([, value]) => typeof value === 'number')
  return entry ? { name: entry[0], value: entry[1] } : undefined
}

export async function readDashboardSnapshot(config, metadata = {}) {
  const projectRoot = path.resolve(config.projectRoot)
  const jobsDir = resolveWithin(projectRoot, config.jobsDir, 'jobsDir')
  const [jobs, projectRootCheck, jobsDirCheck, harborCheck, harborDshCheck] = await Promise.all([
    listJobs(jobsDir),
    directoryCheck(projectRoot),
    directoryCheck(jobsDir, { optional: true }),
    executableCheck(config.harborBin),
    executableCheck(config.harborDshBin),
  ])

  const counts = jobs.reduce((result, job) => {
    result[job.status] = (result[job.status] ?? 0) + 1
    return result
  }, {})

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    pluginVersion: metadata.pluginVersion ?? 'development',
    config: {
      projectRoot,
      jobsDir,
      dshVersion: config.dshVersion,
      agentImportPath: config.agentImportPath,
      pluginImportPath: config.pluginImportPath,
    },
    checks: {
      projectRoot: projectRootCheck,
      jobsDir: jobsDirCheck,
      harbor: harborCheck,
      harborDsh: harborDshCheck,
    },
    overview: {
      totalJobs: jobs.length,
      completedJobs: (counts.completed ?? 0) + (counts.partial ?? 0),
      activeJobs: counts.pending ?? 0,
      failedJobs: counts.failed ?? 0,
      latestMetric: latestMetric(jobs),
    },
    jobs,
  }
}
