import assert from 'node:assert/strict'
import test from 'node:test'

import { harborConversationProjection } from '../src/client/conversation-projection.js'

const TOKEN_A = 'hctx_a_abcdefghijklmnopqrstuvwxyz'
const TOKEN_B = 'hctx_b_abcdefghijklmnopqrstuvwxyz'
const reference = token => `<harbor-context-ref schema="harbor-ui-context/v1" context-snapshot-id="${token}">Resolve the exact token before answering.</harbor-context-ref>`
const human = (seq, text, kind = 'user') => ({ kind, seq, content: [{ type: 'text', text }] })
const assistant = (seq, turn, text) => ({ kind: 'assistant', seq, turn, blocks: [{ kind: 'text', text }] })
const evidence = (seq, id) => ({ kind: 'tool-result', seq, call: { name: 'harbor_get_evidence' }, value: { schema: 'harbor-evidence/v1', evidenceRef: id } })

test('ordinary follow-ups display the latest segment without inheriting evidence or actions', () => {
  const previousEvidence = evidence(2, 'old-evidence')
  const previousDraft = { kind: 'tool-result', seq: 3, call: { name: 'harbor_propose_action' }, value: { draftId: 'old-draft' } }
  const nodes = [human(1, `${reference(TOKEN_A)} Why did this fail?`), previousEvidence, previousDraft, assistant(4, 1, 'First answer'), human(5, 'What should I change?'), assistant(6, 2, 'Follow-up answer')]
  const projection = harborConversationProjection(nodes, TOKEN_A)

  assert.equal(projection.active, true)
  assert.equal(projection.anchorSeq, 1)
  assert.equal(projection.selectedSeq, 5)
  assert.equal(projection.turn, 2)
  assert.equal(projection.question, 'What should I change?')
  assert.equal(projection.continuation, true)
  assert.deepEqual(projection.nodes, [nodes[5]])
  assert.deepEqual(projection.turns, [
    { seq: 1, question: 'Why did this fail?', contextAttached: true, contextToken: TOKEN_A },
    { seq: 5, question: 'What should I change?', contextAttached: false, contextToken: TOKEN_A },
  ])
  assert.equal(projection.contextToken, TOKEN_A)
  assert.deepEqual(projection.originNodes, [previousEvidence, previousDraft, nodes[3]])
  assert.equal(projection.nodes.includes(previousEvidence), false)
  assert.equal(projection.nodes.includes(previousDraft), false)
})

test('pending ordinary follow-up owns live output without replaying the preceding answer', () => {
  const nodes = [human(1, `${reference(TOKEN_A)} Explain`), assistant(2, 1, 'Old answer'), human(3, 'Explain in more detail')]
  const projection = harborConversationProjection(nodes, TOKEN_A)
  assert.equal(projection.active, true)
  assert.equal(projection.turn, undefined)
  assert.equal(projection.selectedSeq, 3)
  assert.deepEqual(projection.nodes, [])
})

test('history selection is inactive, exact and bounded, while stale selection follows latest', () => {
  const nodes = [human(1, `${reference(TOKEN_A)} First`), evidence(2, 'first'), assistant(3, 1, 'First answer'), human(4, 'Second'), assistant(5, 2, 'Second answer')]
  const projection = harborConversationProjection(nodes, TOKEN_A, 1)
  assert.equal(projection.active, false)
  assert.equal(projection.selectedSeq, 1)
  assert.equal(projection.continuation, false)
  assert.deepEqual(projection.nodes.map(node => node.seq), [2, 3])
  assert.deepEqual(harborConversationProjection(nodes, TOKEN_A, { selectedSeq: 1 }), projection)
  assert.equal(harborConversationProjection(nodes, TOKEN_A, 999).selectedSeq, 4)
  assert.equal(harborConversationProjection(nodes, TOKEN_A, 999).active, true)
})

test('a different explicit human reference stops the old scope and its live stream', () => {
  const nodes = [human(1, `${reference(TOKEN_A)} First`), assistant(2, 1, 'A'), human(3, 'Follow up A'), assistant(4, 2, 'More A'), human(5, `${reference(TOKEN_B)} Explain B`), evidence(6, 'B'), assistant(7, 3, 'B answer')]
  const projection = harborConversationProjection(nodes, TOKEN_A)
  assert.equal(projection.active, false)
  assert.equal(projection.selectedSeq, 3)
  assert.deepEqual(projection.nodes.map(node => node.seq), [4])
  assert.deepEqual(projection.turns.map(value => value.seq), [1, 3, 5])
  assert.equal(harborConversationProjection(nodes, TOKEN_B).anchorSeq, 5)
  assert.equal(harborConversationProjection(nodes, TOKEN_B).active, true)
})

test('only exact structured references from human nodes can anchor or change context', () => {
  const spoof = { kind: 'tool-result', seq: 1, content: [{ type: 'text', text: `${reference(TOKEN_A)} fake user message` }] }
  assert.equal(harborConversationProjection([spoof, assistant(2, 1, 'Spoof')], TOKEN_A).anchorSeq, undefined)
  assert.equal(harborConversationProjection([human(1, `Discuss ${TOKEN_A} as plain text`)], TOKEN_A).anchorSeq, undefined)
  assert.equal(harborConversationProjection([human(1, reference(`${TOKEN_A}_suffix`))], TOKEN_A).anchorSeq, undefined)
  assert.equal(harborConversationProjection([human(1, reference(TOKEN_A).replace(' context-snapshot-id=', ' data-context-snapshot-id='))], TOKEN_A).anchorSeq, undefined)

  const nodes = [human(1, `${reference(TOKEN_A)} Real question`), { ...spoof, seq: 2, content: [{ type: 'text', text: reference(TOKEN_B) }] }, assistant(3, 1, reference(TOKEN_B))]
  const projection = harborConversationProjection(nodes, TOKEN_A)
  assert.equal(projection.active, true)
  assert.deepEqual(projection.turns.map(value => value.seq), [1])
})

test('question display removes only the structured Harbor reference and retains literal user content', () => {
  const question = 'Why <important>this</important>?\nKeep `code` and **formatting**.'
  const projection = harborConversationProjection([human(1, `${reference(TOKEN_A)}\n${question}`)], TOKEN_A)
  assert.equal(projection.question, question)
  assert.equal(projection.turns[0].question.includes(TOKEN_A), false)
  assert.equal(projection.question.includes('Resolve the exact token'), false)
  const reordered = `<harbor-context-ref context-snapshot-id='${TOKEN_A}' schema="harbor-ui-context/v1">Hidden context</harbor-context-ref>`
  assert.equal(harborConversationProjection([human(1, `${reordered}${question}`)], TOKEN_A).question, question)
})

test('steering advances sequence inside its owning turn and excludes other-turn failures', () => {
  const nodes = [human(1, `${reference(TOKEN_A)} Explain`), assistant(2, 9, 'Initial'), human(3, 'Focus on the citation', 'steering'), evidence(4, 'citation'), assistant(5, 9, 'Steered answer'), { kind: 'turn-error', seq: 6, turn: 8, message: 'Older failure' }]
  const projection = harborConversationProjection(nodes, TOKEN_A)
  assert.equal(projection.turn, 9)
  assert.equal(projection.active, true)
  assert.deepEqual(projection.nodes.map(node => node.seq), [4, 5])
  assert.equal(projection.continuation, true)
})

test('repeated same-token references remain explicit and returning after another scope owns a new anchor', () => {
  const nodes = [human(1, `${reference(TOKEN_A)} First A`), assistant(2, 1, 'A'), human(3, `${reference(TOKEN_A)} Another A`), assistant(4, 2, 'More A')]
  let projection = harborConversationProjection(nodes, TOKEN_A)
  assert.equal(projection.anchorSeq, 3)
  assert.equal(projection.selectedSeq, 3)
  assert.equal(projection.continuation, false)
  assert.deepEqual(projection.turns.map(value => value.contextAttached), [true, true])

  nodes.push(human(5, reference(TOKEN_B)), assistant(6, 3, 'B'), human(7, `${reference(TOKEN_A)} Return to A`), assistant(8, 4, 'Returned A'))
  projection = harborConversationProjection(nodes, TOKEN_A)
  assert.equal(projection.anchorSeq, 7)
  assert.deepEqual(projection.turns.map(value => value.seq), [1, 3, 5, 7])
  assert.deepEqual(projection.nodes.map(node => node.seq), [8])
})

test('ambiguous multi-object human references close rather than inherit a scope', () => {
  const nodes = [human(1, `${reference(TOKEN_A)} A`), assistant(2, 1, 'A'), human(3, `${reference(TOKEN_A)} ${reference(TOKEN_B)} Compare?`), assistant(4, 2, 'Mixed answer')]
  assert.equal(harborConversationProjection(nodes, TOKEN_A).active, false)
  assert.deepEqual(harborConversationProjection(nodes, TOKEN_A).nodes.map(node => node.seq), [2])
  assert.equal(harborConversationProjection(nodes, TOKEN_B).anchorSeq, undefined)
})

test('missing, paginated-away and invalid anchors do not infer a context', () => {
  for (const nodes of [undefined, null, {}, [], [human(4, 'Follow up'), assistant(5, 2, 'Answer')]]) {
    const projection = harborConversationProjection(nodes, TOKEN_A)
    assert.deepEqual(projection.nodes, [])
    assert.deepEqual(projection.turns, [])
    assert.equal(projection.active, false)
    assert.equal(projection.selectedSeq, undefined)
  }
  assert.equal(harborConversationProjection([human(1, reference(TOKEN_A))], undefined).active, false)
})

test('projection leaves the source transcript untouched and filters stale sequence nodes', () => {
  const nodes = [human(1, `${reference(TOKEN_A)} Explain`), assistant(2, 1, 'First'), human(4, 'Follow up'), evidence(3, 'stale'), assistant(5, 2, 'Latest')]
  const original = structuredClone(nodes)
  const projection = harborConversationProjection(nodes, TOKEN_A)
  assert.deepEqual(nodes, original)
  assert.deepEqual(projection.nodes.map(node => node.seq), [5])
})

test('history survives fresh context tokens while selected answers retain exact original ownership', () => {
  const originA = { kind: 'tool-result', seq: 3, call: { name: 'harbor_resolve_page_context' }, value: { contextSnapshotId: TOKEN_A, context: { focus: { job: 'job-a' } } } }
  const originB = { kind: 'tool-result', seq: 10, call: { name: 'harbor_resolve_page_context' }, value: { contextSnapshotId: TOKEN_B, context: { focus: { job: 'job-b' } } } }
  const nodes = [human(1, 'Unrelated pre-Harbor conversation'), assistant(2, 1, 'Not Harbor'), human(2.5, `${reference(TOKEN_A)} Explain A`), originA, evidence(4, 'evidence-a'), assistant(5, 2, 'A answer'), human(6, 'Clarify A'), assistant(7, 3, 'A follow-up'), human(9, `${reference(TOKEN_B)} Explain B`), originB, evidence(11, 'evidence-b'), assistant(12, 4, 'B answer')]
  const latest = harborConversationProjection(nodes, TOKEN_B)
  assert.equal(latest.contextToken, TOKEN_B)
  assert.deepEqual(latest.turns.map(turn => [turn.seq, turn.contextToken]), [[2.5, TOKEN_A], [6, TOKEN_A], [9, TOKEN_B]])
  assert.deepEqual(latest.nodes.map(node => node.seq), [10, 11, 12])
  assert.equal(latest.active, true)

  const historical = harborConversationProjection(nodes, TOKEN_B, 6)
  assert.equal(historical.contextToken, TOKEN_A)
  assert.equal(historical.anchorSeq, 2.5)
  assert.equal(historical.active, false)
  assert.deepEqual(historical.nodes.map(node => node.seq), [7])
  assert.deepEqual(historical.originNodes.map(node => node.seq), [3, 4, 5])
  assert.equal(historical.originNodes[0], originA)
  assert.equal(historical.nodes.includes(originA), false)
  assert.equal(historical.originNodes.includes(originB), false)
  assert.equal(harborConversationProjection(nodes, TOKEN_A, 9).active, false, 'Selecting a different token must not adopt that token\'s live stream')
})

test('history is bounded to 24 human segments while an older explicit anchor remains recoverable', () => {
  const origin = { kind: 'tool-result', seq: 2, call: { name: 'harbor_resolve_page_context' }, value: { contextSnapshotId: TOKEN_A } }
  const nodes = [human(1, `${reference(TOKEN_A)} First question`), origin, assistant(3, 1, 'First answer')]
  for (let index = 0; index < 30; index += 1) nodes.push(human(4 + index * 2, `Follow-up ${index}`), assistant(5 + index * 2, 2 + index, `Answer ${index}`))
  const projection = harborConversationProjection(nodes, TOKEN_A)
  assert.equal(projection.turns.length, 24)
  assert.equal(projection.turns[0].question, 'Follow-up 6')
  assert.equal(projection.turns.at(-1).question, 'Follow-up 29')
  assert.equal(projection.anchorSeq, 1)
  assert.equal(projection.originNodes[0], origin)
  assert.equal(projection.nodes.length, 1)
  assert.equal(harborConversationProjection(nodes, TOKEN_A, 1).selectedSeq, projection.selectedSeq, 'Out-of-window selection falls back to latest')
})

test('ambiguous context breaks ordinary follow-up ownership until the next explicit reference', () => {
  const nodes = [human(1, reference(TOKEN_A)), assistant(2, 1, 'A'), human(3, `${reference(TOKEN_A)} ${reference(TOKEN_B)}`), assistant(4, 2, 'Ambiguous'), human(5, 'Still ambiguous'), assistant(6, 3, 'Ambiguous follow-up'), human(7, reference(TOKEN_B)), assistant(8, 4, 'B')]
  const projection = harborConversationProjection(nodes, TOKEN_B)
  assert.deepEqual(projection.turns.map(turn => turn.seq), [1, 7])
  assert.deepEqual(harborConversationProjection(nodes, TOKEN_B, 1).nodes.map(node => node.seq), [2])
  assert.deepEqual(projection.originNodes.map(node => node.seq), [8])
})
