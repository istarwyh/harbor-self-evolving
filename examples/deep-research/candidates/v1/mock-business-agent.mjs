import { writeFileSync } from 'node:fs'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'

const result = {
  answer: 'Acme permits refunds within 30 days.',
  tool_errors: 1,
  searches: [{ query: '', status: 'invalid' }],
  citations: [{ claim: '30-day refund policy', source_id: 'missing-source' }],
}

class CandidateAdapter extends LlmAdapter {
  async * stream() {
    writeFileSync('/app/research-result.json', `${JSON.stringify(result, null, 2)}\n`)
    const text = 'Research completed with an unverified citation.'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'deep-research-candidate-v1'
export const inject = ['llm']
export function apply(ctx) {
  ctx.llm.registerAdapter(['harbor-demo'], new CandidateAdapter())
}
