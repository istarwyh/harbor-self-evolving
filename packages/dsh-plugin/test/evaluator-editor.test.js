import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const compiled = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/evaluator-editor.jsx', import.meta.url))],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  define: { 'process.env.NODE_ENV': '"production"' },
})
const { matchEvaluatorProposalFile, evaluatorDraftConflict, prepareEvaluatorProposal, focusEvaluatorReview } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)

function fixture() {
  const evaluatorFile = { path: 'evaluator/evaluator.py', relative_path: 'evaluator.py', role: 'implementation', digest: 'digest-code', text: 'same source' }
  const rubricFile = { path: 'evaluator/rubric.md', relative_path: 'rubric.md', role: 'rubric', digest: 'digest-rubric', text: 'same source' }
  const sourceRef = { id: 'rubric-source', job: 'job-a', sourceRole: 'rubric', sourceDigest: 'ref-digest' }
  const value = { evaluatorInterface: { evaluator: { implementation: { path: evaluatorFile.path }, editable_files: [evaluatorFile, rubricFile] } }, components: { evaluator: { source: { text: evaluatorFile.text } }, rubric: { entry: rubricFile.path, source: { text: rubricFile.text } } }, interactionObjects: [sourceRef] }
  const proposal = { draftId: 'draft-a', proposal: { sourceRef: { ...sourceRef, startLine: 1, endLine: 1 }, before: 'same source', replacement: 'proposed source' } }
  return { evaluatorFile, rubricFile, sourceRef, value, proposal }
}

function applySourceProposal(text, ref, proposal) {
  assert.equal(ref.id, proposal.sourceRef.id)
  assert.equal(ref.sourceDigest, proposal.sourceRef.sourceDigest)
  assert.equal(ref.sourceRole, proposal.sourceRef.sourceRole)
  assert.equal(text, proposal.before)
  return proposal.replacement
}

test('AI proposal selects the exact rubric rather than the first file, even when contents are identical', () => {
  const { value, proposal, rubricFile, evaluatorFile } = fixture()
  assert.equal(matchEvaluatorProposalFile(value, proposal), rubricFile)
  assert.equal(matchEvaluatorProposalFile(value, { proposal: { sourceRef: { sourceRole: 'evaluator' } } }), evaluatorFile)
})

test('ambiguous same-role source matches require an exact descriptor entry, never a filename guess', () => {
  const { value, proposal, rubricFile } = fixture()
  value.evaluatorInterface.evaluator.editable_files.push({ ...rubricFile, path: 'other/rubric.md', relative_path: 'other/rubric.md' })
  assert.equal(matchEvaluatorProposalFile(value, proposal), rubricFile)
  delete value.components.rubric.entry
  assert.equal(matchEvaluatorProposalFile(value, proposal), undefined)
})

test('changed, missing, non-editable, or role-mismatched source cannot receive an AI patch', () => {
  const { value, proposal, rubricFile } = fixture()
  rubricFile.text = 'changed live source'
  assert.equal(matchEvaluatorProposalFile(value, proposal), undefined)
  assert.equal(matchEvaluatorProposalFile(value, { proposal: { sourceRef: { sourceRole: 'runner' } } }), undefined)
  delete value.evaluatorInterface
  assert.equal(matchEvaluatorProposalFile(value, proposal), undefined)
})

test('a proposal for another Job does not redirect the current file selection even if text matches', () => {
  const { value, proposal } = fixture()
  value.job = 'other-job'
  assert.equal(matchEvaluatorProposalFile(value, proposal), undefined)
})

test('digest or baseline text drift is explicit even when the user text now equals the new server source', () => {
  const file = { digest: 'new', text: 'new source' }
  assert.equal(evaluatorDraftConflict(undefined, file), false)
  assert.equal(evaluatorDraftConflict({ baseDigest: 'new', baseText: 'new source' }, file), false)
  assert.equal(evaluatorDraftConflict({ baseDigest: 'old', baseText: 'old source', text: 'new source' }, file), true)
  assert.equal(evaluatorDraftConflict({ baseDigest: 'new', baseText: 'old source' }, file), true)
})

test('direct source review loads a validated suggestion only into the matching pristine buffer', () => {
  const { value, proposal, rubricFile } = fixture()
  const prepared = prepareEvaluatorProposal({ value, proposal, file: rubricFile, text: rubricFile.text, currentBinding: true, applySourceProposal })
  assert.deepEqual(prepared, { status: 'ready', text: 'proposed source' })
  assert.equal(rubricFile.text, 'same source')
})

test('AI never overwrites human edits or silently accepts a changed original baseline', () => {
  const { value, proposal, rubricFile } = fixture()
  let calls = 0
  const apply = () => { calls += 1; return 'must not load' }
  const args = { value, proposal, file: rubricFile, text: 'human edits', currentBinding: true, applySourceProposal: apply }
  assert.deepEqual(prepareEvaluatorProposal(args), { status: 'merge' })
  assert.deepEqual(prepareEvaluatorProposal({ ...args, text: rubricFile.text, record: { baseDigest: 'previous', baseText: 'previous source' } }), { status: 'merge' })
  assert.equal(calls, 0)
})

test('stale context and unverifiable saved-source identity preserve the proposal without loading it', () => {
  const { value, proposal, rubricFile, evaluatorFile } = fixture()
  const args = { value, proposal, file: rubricFile, text: rubricFile.text, currentBinding: true, applySourceProposal }
  assert.deepEqual(prepareEvaluatorProposal({ ...args, currentBinding: false }), { status: 'unavailable' })
  assert.deepEqual(prepareEvaluatorProposal({ ...args, file: evaluatorFile }), { status: 'unavailable' })
  proposal.proposal.sourceRef.sourceDigest = 'old-ref-digest'
  assert.deepEqual(prepareEvaluatorProposal(args), { status: 'unavailable' })
  assert.equal(proposal.proposal.replacement, 'proposed source')
})

test('oversized proposed replacement cannot bypass the bounded editor', () => {
  const { value, proposal, rubricFile } = fixture()
  const args = { value, proposal, file: rubricFile, text: rubricFile.text, currentBinding: true, applySourceProposal: () => 'x'.repeat(256 * 1024 + 1) }
  assert.deepEqual(prepareEvaluatorProposal(args), { status: 'unavailable' })
})

test('an explicit review selects its exact file before focusing, without changing the human buffer', () => {
  const actions = []
  const element = { value: 'human edits', scrollIntoView: options => actions.push(['scroll', options]), focus: options => actions.push(['focus', options]) }
  const args = { requestId: 'review-1', previousRequestId: '', selectedPath: 'evaluator.py', proposedPath: 'rubric.md', element, selectFile: path => actions.push(['select', path]) }
  assert.equal(focusEvaluatorReview(args), '')
  assert.deepEqual(actions, [['select', 'rubric.md']])
  actions.length = 0
  assert.equal(focusEvaluatorReview({ ...args, selectedPath: 'rubric.md' }), 'review-1')
  assert.deepEqual(actions, [['scroll', { block: 'center', inline: 'nearest', behavior: 'instant' }], ['focus', { preventScroll: true }]])
  assert.equal(element.value, 'human edits')
})

test('ordinary mounts and rerenders do not steal focus; a new review request can reopen the same old proposal', () => {
  const actions = []
  const args = { previousRequestId: 'review-1', selectedPath: 'evaluator.py', proposedPath: 'rubric.md', element: { scrollIntoView() { actions.push('scroll') }, focus() { actions.push('focus') } }, selectFile: path => actions.push(path) }
  assert.equal(focusEvaluatorReview(args), 'review-1')
  assert.equal(focusEvaluatorReview({ ...args, requestId: 'review-1' }), 'review-1')
  assert.deepEqual(actions, [])
  assert.equal(focusEvaluatorReview({ ...args, requestId: 'review-2' }), 'review-1')
  assert.deepEqual(actions, ['rubric.md'])
  actions.length = 0
  assert.equal(focusEvaluatorReview({ ...args, requestId: 'review-2', selectedPath: 'rubric.md' }), 'review-2')
  assert.deepEqual(actions, ['scroll', 'focus'])
})

test('unavailable or read-only editor never redirects focus into the saved-source viewer', () => {
  const args = { requestId: 'review-1', previousRequestId: '', selectedPath: 'rubric.md', proposedPath: 'rubric.md', selectFile() { assert.fail('unexpected file selection') } }
  for (const element of [undefined, { disabled: true }, { readOnly: true }]) assert.equal(focusEvaluatorReview({ ...args, element }), '')
  assert.equal(focusEvaluatorReview({ ...args, proposedPath: undefined }), '')
})
