import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { MANIFEST_NAME, snapshotCandidate } from './candidate.js'
import { runProcess } from './process.js'

export function resolveWithin(root, value, label) {
  const base = path.resolve(root)
  const resolved = path.resolve(base, value)
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    throw new Error(`${label} must stay under projectRoot`)
  }
  return resolved
}

export async function snapshot(config, args) {
  const candidateDir = resolveWithin(config.projectRoot, args.candidatePath, 'candidatePath')
  return snapshotCandidate(candidateDir, {
    candidateId: args.candidateId,
    version: args.version,
    runtimeVersion: config.dshVersion,
  })
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '') || 'candidate'
}

export function makeJobName(manifest, now = new Date()) {
  const timestamp = now.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '')
  const suffix = `${timestamp}-${manifest.digest.slice(7, 15)}`
  const available = 100 - suffix.length - 1
  const identity = `${slug(manifest.candidate_id)}-${slug(manifest.version)}`.slice(0, available)
  return `${identity}-${suffix}`
}

export async function runEvaluation(config, args) {
  const manifest = await snapshot(config, args)
  const candidateDir = resolveWithin(config.projectRoot, args.candidatePath, 'candidatePath')
  const dataset = resolveWithin(config.projectRoot, args.datasetPath, 'datasetPath')
  const jobsDir = resolveWithin(config.projectRoot, config.jobsDir, 'jobsDir')
  const jobName = args.jobName ?? makeJobName(manifest)
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(jobName)) throw new Error('jobName contains unsupported characters')

  const harborArgs = [
    'run', '-p', dataset,
    '-a', config.agentImportPath,
    '--ak', `candidate_path=${candidateDir}`,
    '--ak', `candidate_version=${manifest.version}`,
    '--ak', `candidate_digest=${manifest.digest}`,
    '--job-name', jobName,
    '--jobs-dir', jobsDir,
    '--plugin', config.pluginImportPath,
    '--plugin-kwarg', `candidate_manifest=${path.join(candidateDir, MANIFEST_NAME)}`,
  ]
  const result = await runProcess(config.harborBin, harborArgs, {
    cwd: config.projectRoot,
    timeoutMs: config.timeoutMs,
    env: { ...process.env, ...(config.pythonPath ? { PYTHONPATH: config.pythonPath } : {}) },
  })
  const jobDir = path.join(jobsDir, jobName)
  const summary = JSON.parse(await readFile(path.join(jobDir, 'evaluation-summary.json'), 'utf8'))
  return { manifest, jobDir, summary, process: { code: result.code } }
}

export async function readEvaluation(config, args) {
  const jobDir = resolveWithin(config.projectRoot, args.jobPath, 'jobPath')
  return JSON.parse(await readFile(path.join(jobDir, 'evaluation-summary.json'), 'utf8'))
}

export async function compareCandidates(config, args) {
  const baseline = resolveWithin(config.projectRoot, args.baselineJob, 'baselineJob')
  const candidate = resolveWithin(config.projectRoot, args.candidateJob, 'candidateJob')
  const policy = resolveWithin(config.projectRoot, args.policyPath, 'policyPath')
  const result = await runProcess(config.harborDshBin, [
    'promote', baseline, candidate, '--policy', policy,
  ], {
    cwd: config.projectRoot,
    timeoutMs: config.timeoutMs,
    // harbor-dsh uses exit 1 for a valid REJECT decision. The report remains
    // model-readable; infrastructure failures still reject the subprocess.
    allowedExitCodes: [0, 1],
  })
  return JSON.parse(result.stdout)
}
