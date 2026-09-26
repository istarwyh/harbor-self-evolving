import assert from 'node:assert/strict'
import test from 'node:test'

import { deriveArtifactProfile, pipelineStagesForArtifactProfile, sectionsForArtifactProfile } from '../src/client/product-modes.js'

test('Experience Diagnostic hides compare, Gate, full artifacts, and Audit', () => {
  const profile = deriveArtifactProfile({ historical: true, context: { artifact_profile: 'governed' } })
  const sections = sectionsForArtifactProfile(profile, { historical: true })
  assert.equal(profile, 'diagnostic')
  assert.equal(sections.primary.includes('compare'), false)
  assert.equal(sections.advanced.includes('artifacts'), false)
  assert.equal(sections.advanced.includes('audit'), false)
  assert.equal(pipelineStagesForArtifactProfile(profile).includes('gate'), false)
})

test('Experiment exposes reproducibility artifacts without governance controls', () => {
  const profile = deriveArtifactProfile({ context: { artifact_profile: 'experiment' } })
  const sections = sectionsForArtifactProfile(profile)
  assert.deepEqual(sections.advanced, ['pipeline', 'artifacts'])
  assert.equal(sections.primary.includes('compare'), false)
  assert.equal(pipelineStagesForArtifactProfile(profile).includes('gate'), false)
})

test('Governed mode alone exposes compare, Gate, Audit, and full artifacts', () => {
  const profile = deriveArtifactProfile({ job: { mode: 'promotion-eligible' } })
  const sections = sectionsForArtifactProfile(profile)
  assert.equal(profile, 'governed')
  assert.equal(sections.primary.includes('compare'), true)
  assert.deepEqual(sections.advanced, ['pipeline', 'artifacts', 'audit'])
  assert.equal(pipelineStagesForArtifactProfile(profile).includes('gate'), true)
})
