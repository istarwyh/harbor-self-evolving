const ALL_PIPELINE_STAGES = ['candidate', 'dataset', 'integration', 'renderer', 'judge', 'meta', 'reporter', 'optimizer', 'gate']

export function deriveArtifactProfile({ historical = false, context, registry, job } = {}) {
  if (historical) return 'diagnostic'
  const profile = context?.artifact_profile
    ?? registry?.artifact_profile
    ?? job?.artifactProfile
    ?? job?.evaluationType
    ?? (job?.mode === 'promotion-eligible' ? 'governed' : 'experiment')
  return ['diagnostic', 'experiment', 'governed'].includes(profile) ? profile : 'experiment'
}

export function sectionsForArtifactProfile(profile, { historical = false } = {}) {
  if (historical) return {
    primary: ['summary', 'trials', 'optimization', 'evaluator'],
    advanced: ['pipeline'],
  }
  return {
    primary: ['summary', 'trials', 'optimization', 'evaluator', ...(profile === 'governed' ? ['compare'] : [])],
    advanced: profile === 'governed'
      ? ['pipeline', 'artifacts', 'audit']
      : profile === 'experiment' ? ['pipeline', 'artifacts'] : ['pipeline'],
  }
}

export function pipelineStagesForArtifactProfile(profile) {
  return profile === 'governed'
    ? [...ALL_PIPELINE_STAGES]
    : ALL_PIPELINE_STAGES.filter(stage => stage !== 'gate')
}
