import { access, constants, lstat, readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import { resolveWithin } from './evolution.js'

const SUMMARY_NAME = 'evaluation-summary.json'
const MAX_JOBS = 50
const MAX_JSON_BYTES = 2 * 1024 * 1024
const MAX_TRIAL_LIMIT = 100
const jsonCache = new Map()
const SENSITIVE_KEY = /authorization|cookie|token|api[_-]?key|secret|password|request[_-]?headers/i

function safeSegment(value, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(String(value ?? ''))) throw new Error(`${label} is invalid`)
  return String(value)
}

function redact(value, depth = 0) {
  if (depth > 10) return '[TRUNCATED depth]'
  if (Array.isArray(value)) return value.slice(0, 10_000).map(item => redact(item, depth + 1))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(item, depth + 1)]))
  }
  if (typeof value === 'string' && value.length > 8_000) return `${value.slice(0, 8_000)}\n[TRUNCATED ${value.length - 8_000} chars]`
  return value
}

async function readJson(file, { maxBytes = MAX_JSON_BYTES } = {}) {
  try {
    const details = await lstat(file)
    if (details.isSymbolicLink()) return { __readError: `${path.basename(file)} may not be a symlink` }
    if (!details.isFile()) return { __readError: `${path.basename(file)} is not a file` }
    if (details.size > maxBytes) return { __readError: `${path.basename(file)} exceeds ${maxBytes} bytes` }
    const cached = jsonCache.get(file)
    const identity = `${details.mtimeMs}:${details.size}`
    if (cached?.identity === identity) return cached.value
    const value = redact(JSON.parse(await readFile(file, 'utf8')))
    jsonCache.set(file, { identity, value })
    return value
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    if (error instanceof SyntaxError) return { __readError: `invalid JSON in ${path.basename(file)}` }
    throw error
  }
}

async function directoryCheck(directory, { optional = false } = {}) {
  try {
    const details = await lstat(directory)
    if (details.isSymbolicLink() || !details.isDirectory()) return { status: 'error', detail: 'not a safe directory' }
    await access(directory, constants.R_OK)
    return { status: 'ok', detail: 'readable' }
  } catch (error) {
    if (optional && error.code === 'ENOENT') return { status: 'warning', detail: 'not created yet' }
    return { status: 'error', detail: error.code === 'ENOENT' ? 'not found' : 'not readable' }
  }
}

async function fileCheck(file) {
  try {
    const details = await lstat(file)
    return details.isFile() && !details.isSymbolicLink()
      ? { status: 'ok', detail: path.basename(file) }
      : { status: 'error', detail: 'not a safe file' }
  } catch (error) {
    return { status: 'error', detail: error.code === 'ENOENT' ? 'not found' : 'not readable' }
  }
}

async function executableCheck(command) {
  if (!command) return { status: 'error', detail: 'not configured' }
  if (!path.isAbsolute(command)) return { status: 'ok', detail: `${command} (PATH)` }
  try {
    await access(command, constants.X_OK)
    return { status: 'ok', detail: path.basename(command) }
  } catch (error) {
    return { status: 'error', detail: error.code === 'ENOENT' ? 'not found' : 'not executable' }
  }
}

function jobStatus(summary) {
  if (!summary) return 'pending'
  if (summary.__readError) return 'failed'
  if (Number(summary.n_trials ?? 0) > 0 && Number(summary.n_exceptions ?? 0) >= Number(summary.n_trials ?? 0)) return 'failed'
  if (Number(summary.n_exceptions ?? 0) > 0) return 'partial'
  return 'completed'
}

function primaryMetric(summary, contract) {
  const name = contract?.primary_metric
  if (name && typeof summary?.metrics?.[name] === 'number') return { name, value: summary.metrics[name] }
  const entry = Object.entries(summary?.metrics ?? {}).find(([, value]) => typeof value === 'number')
  return entry ? { name: entry[0], value: entry[1] } : undefined
}

async function readJob(jobsDir, entry, details) {
  const directory = path.join(jobsDir, entry.name)
  const [summary, context, promotion, contract] = await Promise.all([
    readJson(path.join(directory, SUMMARY_NAME)),
    readJson(path.join(directory, 'evaluation-context.json')),
    readJson(path.join(directory, 'promotion-report.json')),
    readJson(path.join(directory, 'evaluation-contract.json')),
  ])
  const evaluationContext = summary?.evaluation_context ?? context
  if (evaluationContext?.schema_version !== 2) return undefined
  return {
    name: entry.name,
    updatedAt: details.mtime.toISOString(),
    status: jobStatus(summary),
    mode: summary?.mode,
    nTrials: Number(summary?.n_trials ?? 0),
    nExceptions: Number(summary?.n_exceptions ?? 0),
    primaryMetric: primaryMetric(summary, contract),
    metrics: summary?.metrics ?? {},
    candidate: summary?.candidate,
    evaluationContext,
    artifactValidation: summary?.artifact_validation,
    promotion: promotion ? { decision: promotion.decision, reasons: promotion.reasons ?? [], baselineJob: promotion.baseline_job } : undefined,
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
  const directories = entries.filter(entry => entry.isDirectory() && !entry.isSymbolicLink())
  const recent = await Promise.all(directories.map(async entry => ({ entry, details: await stat(path.join(jobsDir, entry.name)) })))
  recent.sort((left, right) => right.details.mtimeMs - left.details.mtimeMs)
  const jobs = await Promise.all(recent.map(({ entry, details }) => readJob(jobsDir, entry, details)))
  return jobs.filter(Boolean).slice(0, MAX_JOBS)
}

function jobsDirectory(config) {
  return resolveWithin(path.resolve(config.projectRoot), config.jobsDir, 'jobsDir')
}

function jobDirectory(config, job) {
  return path.join(jobsDirectory(config), safeSegment(job, 'job'))
}

export async function readDashboardSnapshot(config, metadata = {}) {
  const projectRoot = path.resolve(config.projectRoot)
  const jobsDir = jobsDirectory(config)
  const [jobs, projectRootCheck, jobsDirCheck, harborCheck, harborDshCheck, stackCheck] = await Promise.all([
    listJobs(jobsDir),
    directoryCheck(projectRoot),
    directoryCheck(jobsDir, { optional: true }),
    executableCheck(config.harborBin),
    executableCheck(config.harborDshBin),
    fileCheck(path.join(projectRoot, '.harbor', 'evaluation-stack.yml')),
  ])
  const counts = jobs.reduce((result, job) => ({ ...result, [job.status]: (result[job.status] ?? 0) + 1 }), {})
  const latestMetric = jobs.find(job => job.primaryMetric)?.primaryMetric
  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    pluginVersion: metadata.pluginVersion ?? 'development',
    config: { jobsDir: config.jobsDir, dshVersion: config.dshVersion, agentImportPath: config.agentImportPath, pluginImportPath: config.pluginImportPath },
    checks: { projectRoot: projectRootCheck, jobsDir: jobsDirCheck, harbor: harborCheck, harborDsh: harborDshCheck, evaluationStack: stackCheck },
    overview: {
      totalJobs: jobs.length,
      completedJobs: (counts.completed ?? 0) + (counts.partial ?? 0),
      activeJobs: counts.pending ?? 0,
      failedJobs: counts.failed ?? 0,
      latestMetric,
    },
    jobs,
  }
}

const DETAIL_ARTIFACTS = {
  summary: 'evaluation-summary.json',
  candidate: 'candidate-manifest.json',
  dataset: 'dataset-manifest.json',
  stack: 'evaluation-stack-manifest.json',
  context: 'evaluation-context.json',
  contract: 'evaluation-contract.json',
  doctor: 'architecture-doctor.json',
  population: 'population-report.json',
  optimization: 'optimization-report.json',
  promotion: 'promotion-report.json',
}

function schemaIssue(key, value) {
  if (value === undefined) return undefined
  if (value?.__readError) return value.__readError
  if (!isObject(value)) return 'artifact must be an object'
  const version = { summary: 2, candidate: 1, dataset: 1, stack: 1, context: 2, contract: 1, doctor: 1, population: 1, optimization: 1, promotion: 2 }[key]
  if (value.schema_version !== version) return `schema_version must be ${version}`
  const required = {
    summary: ['job', 'candidate', 'evaluation_context', 'metrics'],
    candidate: ['candidate_id', 'version', 'digest'],
    dataset: ['dataset_id', 'version', 'source_digest', 'tasks'],
    stack: ['stack_id', 'version', 'digest', 'comparison_digest', 'components', 'judge'],
    context: ['digest', 'full_digest', 'candidate', 'dataset', 'evaluation_stack', 'runtime'],
    contract: ['contract_id', 'version', 'primary_metric', 'metrics'],
    doctor: ['promotion_ready', 'findings'],
    population: ['population_size', 'groups', 'metrics'],
    optimization: ['hypotheses'],
    promotion: ['decision', 'reasons', 'policy_digest'],
  }[key] ?? []
  const missing = required.filter(field => value[field] === undefined)
  return missing.length ? `missing fields: ${missing.join(', ')}` : undefined
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export async function readJobDetail(config, args) {
  const job = safeSegment(args.job, 'job')
  const directory = jobDirectory(config, job)
  const check = await directoryCheck(directory)
  if (check.status !== 'ok') throw new Error('Job not found')
  const values = await Promise.all(Object.values(DETAIL_ARTIFACTS).map(name => readJson(path.join(directory, name))))
  const artifacts = Object.fromEntries(Object.keys(DETAIL_ARTIFACTS).map((key, index) => [key, values[index]]))
  if (artifacts.summary && !artifacts.summary.__readError) {
    const { trials: _trials, ...lightSummary } = artifacts.summary
    artifacts.summary = lightSummary
  }
  const validation = Object.fromEntries(Object.entries(artifacts).map(([key, value]) => {
    const issue = schemaIssue(key, value)
    return [key, value === undefined ? { status: 'missing' } : issue ? { status: 'invalid', error: issue } : { status: 'valid' }]
  }))
  if (validation.context.status !== 'valid') throw new Error('Job is not a Context v2 evaluation')
  return { schemaVersion: 1, job, artifacts, validation }
}

export async function readTrialsPage(config, args) {
  const job = safeSegment(args.job, 'job')
  const offset = Math.max(0, Number.parseInt(args.offset ?? 0, 10) || 0)
  const limit = Math.min(MAX_TRIAL_LIMIT, Math.max(1, Number.parseInt(args.limit ?? 50, 10) || 50))
  const query = String(args.query ?? '').trim().toLowerCase()
  const status = String(args.status ?? '')
  const summary = await readJson(path.join(jobDirectory(config, job), SUMMARY_NAME))
  if (!summary || summary.__readError) throw new Error('Job summary is unavailable')
  let trials = Array.isArray(summary.trials) ? summary.trials : []
  if (query) trials = trials.filter(trial => `${trial.id ?? ''} ${trial.name ?? ''}`.toLowerCase().includes(query))
  if (status) trials = trials.filter(trial => (trial.exception ? 'infrastructure-error' : 'assessed') === status)
  const items = trials.slice(offset, offset + limit).map(trial => ({
    id: trial.id ?? trial.name,
    name: trial.name,
    status: trial.exception ? 'infrastructure-error' : 'assessed',
    rewards: trial.rewards ?? {},
    exception: trial.exception ? { type: trial.exception.type, classification: trial.exception.classification } : undefined,
  }))
  return { schemaVersion: 1, job, offset, limit, total: trials.length, items, hasMore: offset + items.length < trials.length }
}

function assessmentName(id) {
  return `${String(id).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '') || 'trial'}.json`
}

export async function readTrialDetail(config, args) {
  const job = safeSegment(args.job, 'job')
  const trial = safeSegment(args.trial, 'trial')
  const directory = jobDirectory(config, job)
  const assessment = await readJson(path.join(directory, 'trial-assessments', assessmentName(trial)))
  if (!assessment || assessment.__readError) throw new Error('Trial assessment not found')
  return { schemaVersion: 1, job, trial, assessment }
}
