import { LlmAdapter, attributionHeaders } from '@deepseek-ai/dsh-llm'
import {
  generateResearch,
  writeFailureArtifacts,
} from './responses-research-generator.mjs'

const strategy = 'unvalidated-search'

class CandidateAdapter extends LlmAdapter {
  async * stream(options) {
    let result
    try {
      result = await generateResearch(options, {
        strategy,
        attribution: attributionHeaders(),
      })
    } catch (error) {
      writeFailureArtifacts(error, { strategy })
      throw error
    }

    const text = result.citations.length
      ? `${result.answer}\n\nSources: ${result.citations
          .map((citation) => citation.source_id)
          .join(', ')}`
      : result.answer
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield {
      type: 'block-end',
      index: 0,
      block: { type: 'text', text },
    }
    const usage = result.generator.usage
    if (usage) {
      yield {
        type: 'usage',
        usage: {
          inputTokens: Math.max(0, usage.input_tokens - usage.cached_tokens),
          outputTokens: usage.output_tokens,
          cacheReadTokens: usage.cached_tokens,
          reasoningTokens: usage.reasoning_tokens,
        },
      }
    }
    yield {
      type: 'finish',
      reason: { kind: 'stop' },
      replayState: { responseId: result.generator.response_id },
    }
  }
}

export const name = 'deep-research-candidate-v1'
export const inject = ['llm']
export function apply(ctx) {
  ctx.llm.registerAdapter(['harbor-demo'], new CandidateAdapter())
}
