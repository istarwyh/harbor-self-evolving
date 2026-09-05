import assert from 'node:assert/strict'
import test from 'node:test'
import { harborQuestionKeys, harborQuestionLabelKey, JOURNEY_MESSAGES } from '../src/client/workbench-journey.js'

test('suggestions fit the selected object and never ask about a nonexistent Trial on home', () => {
  assert.deepEqual(harborQuestionKeys({ workspace: 'a' }), ['askGettingStarted'])
  assert.deepEqual(harborQuestionKeys({ object: { job: 'a' } }), ['askHealth', 'suggestedQuestion4'])
  assert.deepEqual(harborQuestionKeys({ object: { job: 'a', trial: 't' } }), ['suggestedQuestion1', 'suggestedQuestion3', 'askCandidateChange'])
  assert.deepEqual(harborQuestionKeys({ selection: [{ kind: 'evaluator-source', sourceRole: 'rubric' }] }), ['askSource', 'askSourceChange'])
  assert.deepEqual(harborQuestionKeys({ selection: [{ kind: 'trial-set', selectionCount: 12 }] }), ['askSelectedTrials', 'suggestedQuestion3'])
})

test('long intent prompts use compact bilingual labels and keep execution boundaries explicit', () => {
  for (const locale of ['zh', 'en']) {
    for (const key of ['askSourceChange', 'askSelectedTrials', 'askCandidateChange', 'askGettingStarted']) {
      const labels = JOURNEY_MESSAGES[locale]
      assert.ok(labels[harborQuestionLabelKey(key)].length < labels[key].length)
      assert.match(labels[key], /不要|不运行|Do not/i)
    }
  }
})
