import assert from 'node:assert/strict'
import test from 'node:test'

import { hasHarborReference, rawHarborReferenceRanges, stripHarborReferences, withHarborReference } from '../lib/composer-context.js'

const OLD_TOKEN = 'hctx_abcdefghijklmnopqrstuvwxyz012345'
const NEW_TOKEN = 'hctx_9876543210zyxwvutsrqponmlkjihg'
const oldReference = `@harbor(${OLD_TOKEN})`
const newReference = `@harbor(${NEW_TOKEN})`

test('literal Harbor references can be replaced or cleared without losing user draft text', () => {
  const draft = `Keep my opening. ${oldReference} Keep my conclusion.`

  assert.equal(hasHarborReference(draft, [], OLD_TOKEN), true)
  assert.equal(stripHarborReferences(draft, [], OLD_TOKEN), 'Keep my opening. Keep my conclusion.')
  assert.equal(
    withHarborReference(draft, newReference, 'fallback must not replace the draft'),
    `${newReference} Keep my opening. Keep my conclusion.`,
  )
})

test('structured Harbor occurrences use their exact ranges and retain surrounding draft text', () => {
  const renderedReference = '＠Harbor Current Trial'
  const draft = `before ${renderedReference} after`
  const occurrences = [{
    source: 'harbor',
    ref: OLD_TOKEN,
    offset: 'before '.length,
    length: renderedReference.length,
  }]

  assert.equal(hasHarborReference(draft, occurrences, OLD_TOKEN), true)
  assert.equal(stripHarborReferences(draft, occurrences, OLD_TOKEN), 'before after')
  assert.equal(withHarborReference(draft, newReference, '', occurrences), `${newReference} before after`)
})

test('multiple stale Harbor occurrences collapse to one reference while preserving authored content', () => {
  const draft = `${oldReference} first\n@harbor[Trial 2](${NEW_TOKEN}) second`

  assert.equal(stripHarborReferences(draft), 'first\nsecond')
  assert.equal(withHarborReference(draft, newReference), `${newReference} first\nsecond`)
})

test('a suggested question is only used when the draft has no user-authored body', () => {
  assert.equal(withHarborReference(oldReference, newReference, 'Why did this fail?'), `${newReference} Why did this fail?`)
  assert.equal(withHarborReference(`${oldReference} My own question`, newReference, 'fallback'), `${newReference} My own question`)
})

test('literal Harbor-looking text inside another structured reference is owned by that source', () => {
  const draft = `@file ${oldReference}`
  const occurrences = [{ source: 'file', offset: 0, length: draft.length }]
  assert.deepEqual(rawHarborReferenceRanges(draft, occurrences), [])
  assert.equal(hasHarborReference(draft, occurrences, OLD_TOKEN), false)
  assert.equal(stripHarborReferences(draft, occurrences), draft)
  assert.equal(rawHarborReferenceRanges(draft, []).length, 1)
})
