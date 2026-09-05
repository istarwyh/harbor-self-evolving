const HUMAN_KINDS = new Set(['user', 'steering'])
const HISTORY_LIMIT = 24

function humanText(node) {
  if (!HUMAN_KINDS.has(node?.kind) || !Array.isArray(node.content)) return ''
  return node.content.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n')
}

function humanReference(node) {
  const tokens = []
  const question = humanText(node).replace(/<harbor-context-ref\b([^<>]*)>[\s\S]*?<\/harbor-context-ref\s*>/g, (reference, attributes) => {
    const match = attributes.match(/(?:^|\s)context-snapshot-id\s*=\s*(?:"([^"]*)"|'([^']*)')/)
    const token = match?.[1] ?? match?.[2]
    if (!/^hctx_[A-Za-z0-9_-]+$/.test(token ?? '')) return reference
    tokens.push(token)
    return ''
  }).trim()
  return { tokens, question }
}

function emptyProjection() {
  return { nodes: [], originNodes: [], active: false, anchorSeq: undefined, turn: undefined, question: '', continuation: false, turns: [], selectedSeq: undefined, contextToken: undefined }
}

function humanSegments(nodes) {
  const segments = []
  let anchor
  let previous
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    if (!HUMAN_KINDS.has(node?.kind) || !Number.isFinite(node.seq)) continue
    if (previous) previous.endIndex = index
    const reference = humanReference(node)
    const attached = reference.tokens.length > 0 && reference.tokens.every(value => value === reference.tokens[0])
    if (attached) anchor = { index, seq: node.seq, contextToken: reference.tokens[0] }
    else if (reference.tokens.length) anchor = undefined
    // A mixed-token message does not own one object, so neither it nor its
    // ordinary follow-ups may inherit the preceding object's authority.
    if (!anchor) { previous = undefined; continue }
    const segment = { index, endIndex: nodes.length, seq: node.seq, question: reference.question, contextAttached: attached, contextToken: anchor.contextToken, anchor }
    segments.push(segment)
    previous = segment
  }
  return segments
}

function segmentNodes(nodes, segment) {
  const candidates = nodes.slice(segment.index + 1, segment.endIndex).filter(node => !Number.isFinite(node?.seq) || node.seq > segment.seq)
  const turn = candidates.find(node => node?.kind === 'assistant' && Number.isFinite(node.turn))?.turn
  return { nodes: candidates.filter(node => turn === undefined || !Number.isFinite(node?.turn) || node.turn === turn), turn }
}

/**
 * Read-only conversation display, separate from the strict single-turn evidence
 * projection. Ordinary follow-ups remain visible but never inherit earlier tool
 * results. Only an explicit human-authored Harbor reference starts a discussion;
 * tool or assistant text cannot bind or switch its object context. At most 24
 * human segments are offered as history, including earlier explicit contexts.
 *
 * `selectedSeq` optionally selects a historical human message. Missing/stale
 * selections follow the latest segment of the requested token. Selecting a
 * different token never adopts its live stream. `continuation` means that this
 * segment has no explicit reference of its own, not that fresh context was
 * attached. `originNodes` contains ONLY the explicit anchor's response, for
 * identity/context recovery; consumers must not treat it as this answer's
 * evidence or action results. Those remain exclusively in `nodes`.
 */
export function harborConversationProjection(nodes, token, selectedSeq) {
  if (!Array.isArray(nodes) || !/^hctx_[A-Za-z0-9_-]+$/.test(token ?? '')) return emptyProjection()
  const requestedSeq = typeof selectedSeq === 'object' && selectedSeq !== null ? selectedSeq.selectedSeq : selectedSeq
  const segments = humanSegments(nodes)
  const history = segments.slice(-HISTORY_LIMIT)
  const latestForToken = history.findLast(segment => segment.contextToken === token)
  if (!latestForToken) return emptyProjection()
  const selected = history.find(segment => segment.seq === requestedSeq) ?? latestForToken
  const projected = segmentNodes(nodes, selected)
  const origin = segments.find(segment => segment.index === selected.anchor.index)

  return {
    nodes: projected.nodes,
    originNodes: origin ? segmentNodes(nodes, origin).nodes : [],
    active: selected === latestForToken && selected.endIndex === nodes.length && selected.contextToken === token,
    anchorSeq: selected.anchor.seq,
    turn: projected.turn,
    question: selected.question,
    continuation: !selected.contextAttached,
    turns: history.map(({ seq, question, contextAttached, contextToken }) => ({ seq, question, contextAttached, contextToken })),
    selectedSeq: selected.seq,
    contextToken: selected.contextToken,
  }
}
