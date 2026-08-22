import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DEFAULT_OUTPUT_DIR = '/app'
const DEFAULT_CATALOG_PATH = '/app/source-catalog.json'
const CANDIDATE_CONFIG = JSON.parse(
  readFileSync(new URL('./generator-config.json', import.meta.url), 'utf8'),
)
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'available', 'cite', 'find', 'for', 'from', 'in',
  'of', 'on', 'policy', 'research', 'source', 'supporting', 'the', 'to',
])

function textBlocks(message) {
  return (message?.content ?? [])
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join('\n')
}

function taskText(options) {
  const userMessages = (options.messages ?? [])
    .filter((message) => message?.role === 'user')
    .map(textBlocks)
    .filter(Boolean)
  return userMessages.at(-1) ?? 'Research the requested business fact.'
}

function responsesInput(options) {
  return (options.messages ?? [])
    .filter((message) => message?.role === 'user' || message?.role === 'assistant')
    .map((message) => ({ role: message.role, content: textBlocks(message) }))
    .filter((message) => message.content)
}

function searchTokens(value) {
  return [...new Set(
    String(value)
      .toLocaleLowerCase('en-US')
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((token) => token.length > 1 && !STOP_WORDS.has(token)) ?? [],
  )]
}

export function searchCatalog(query, catalog) {
  const tokens = searchTokens(query)
  const normalizedQuery = String(query).normalize('NFKC').toLocaleLowerCase()
  return (catalog.sources ?? [])
    .map((source) => {
      const haystack = [
        source.id, source.title, source.content, ...(source.keywords ?? []),
      ].join(' ').toLocaleLowerCase('en-US')
      const tokenScore = tokens.reduce(
        (total, token) => total + (haystack.includes(token) ? 1 : 0), 0,
      )
      const keywordScore = (source.keywords ?? []).reduce(
        (total, keyword) => total + (
          normalizedQuery.includes(String(keyword).normalize('NFKC').toLocaleLowerCase()) ? 3 : 0
        ), 0,
      )
      const score = tokenScore + keywordScore
      return { source, score }
    })
    .filter((item) => item.score > 0)
    .sort((left, right) =>
      right.score - left.score ||
      String(left.source.id).localeCompare(String(right.source.id)),
    )
    .slice(0, 1)
    .map((item) => item.source)
}

function structuredSchema(sourceIds) {
  const sourceId = { type: 'string' }
  if (sourceIds.length) sourceId.enum = sourceIds
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      answer: { type: 'string' },
      citations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            claim: { type: 'string' },
            source_id: sourceId,
          },
          required: ['claim', 'source_id'],
        },
      },
    },
    required: ['answer', 'citations'],
  }
}

function generatorInstructions(strategy, evidence) {
  const parts = [
    'You are the generator inside a business Deep Research Agent.',
    'Answer in the same language as the user and directly explain the requested concept.',
    'Make the answer engaging with one concrete example, analogy, or counterintuitive detail.',
    'Return only the requested JSON structure.',
    'Never claim that a source was used unless it appears in the supplied evidence.',
  ]
  if (strategy === 'retrieval-grounded') {
    parts.push(
      'Ground every factual claim in the supplied evidence and cite its source id.',
      `Evidence:\n${evidence.map((source) =>
        `[${source.id}] ${source.title}\nURL: ${source.url}\n${source.content}`,
      ).join('\n\n')}`,
    )
  } else {
    parts.push(
      'No evidence or search result is available. Do not invent a source id; return an empty citations array.',
    )
  }
  return parts.join('\n\n')
}

function parseEvent(block) {
  const data = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
  if (!data || data === '[DONE]') return null
  return JSON.parse(data)
}

async function* responseEvents(response) {
  if (!response.body) throw new Error('Responses API returned no response body.')
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true }).replaceAll('\r\n', '\n')
    let boundary
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      const event = parseEvent(block)
      if (event) yield event
    }
  }
  buffer += decoder.decode()
  const event = parseEvent(buffer)
  if (event) yield event
}

function parseModelOutput(text) {
  const cleaned = text.trim()
    .replace(/^\`\`\`(?:json)?\s*/i, '')
    .replace(/\s*\`\`\`$/, '')
  const value = JSON.parse(cleaned)
  if (
    !value || typeof value !== 'object' ||
    typeof value.answer !== 'string' || !Array.isArray(value.citations)
  ) {
    throw new Error('Responses API returned an invalid research result.')
  }
  for (const citation of value.citations) {
    if (
      !citation || typeof citation.claim !== 'string' ||
      typeof citation.source_id !== 'string'
    ) {
      throw new Error('Responses API returned an invalid citation.')
    }
  }
  return value
}

function normalizeUsage(response) {
  const usage = response?.usage
  if (!usage) return null
  return {
    input_tokens: Number(usage.input_tokens ?? 0),
    output_tokens: Number(usage.output_tokens ?? 0),
    cached_tokens: Number(usage.input_tokens_details?.cached_tokens ?? 0),
    reasoning_tokens: Number(usage.output_tokens_details?.reasoning_tokens ?? 0),
  }
}

export async function generateResearch(options, {
  strategy,
  fetchImpl = fetch,
  outputDir = DEFAULT_OUTPUT_DIR,
  catalogPath = DEFAULT_CATALOG_PATH,
  responsesUrl = CANDIDATE_CONFIG.responses_url,
  apiKey,
  model = CANDIDATE_CONFIG.model,
  attribution = {},
}) {
  apiKey = apiKey || process.env.HSE_RESPONSES_API_KEY
  if (!apiKey && process.env.HSE_RESPONSES_API_KEY_FILE) {
    apiKey = readFileSync(process.env.HSE_RESPONSES_API_KEY_FILE, 'utf8').trim()
  }
  if (!responsesUrl || !apiKey || !model) {
    throw new Error(
      'Candidate generator config and HSE_RESPONSES_API_KEY are required.',
    )
  }

  const task = taskText(options)
  let evidence = []
  const searches = []
  if (strategy === 'retrieval-grounded') {
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
    evidence = searchCatalog(task, catalog)
    searches.push({
      query: task,
      status: evidence.length ? 'ok' : 'no-results',
      matched_source_ids: evidence.map((source) => source.id),
    })
  } else if (strategy === 'unvalidated-search') {
    searches.push({
      query: '',
      status: 'invalid',
      matched_source_ids: [],
    })
  }

  const response = await fetchImpl(responsesUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      ...attribution,
    },
    body: JSON.stringify({
      model,
      stream: true,
      instructions: generatorInstructions(strategy, evidence),
      input: responsesInput(options),
      max_output_tokens: options.maxTokens ?? 800,
      text: {
        format: {
          type: 'json_schema',
          name: 'deep_research_result',
          strict: true,
          schema: structuredSchema(evidence.map((source) => source.id)),
        },
      },
    }),
    signal: options.signal,
  })
  if (!response.ok) {
    throw new Error(`Responses API returned HTTP ${response.status}.`)
  }

  let outputText = ''
  let responseId = null
  let responseModel = model
  let usage = null
  let completed = false
  for await (const event of responseEvents(response)) {
    if (event.type === 'response.created') {
      responseId = event.response?.id ?? responseId
      responseModel = event.response?.model ?? responseModel
    } else if (event.type === 'response.output_text.delta') {
      outputText += event.delta ?? ''
    } else if (event.type === 'response.output_text.done' && !outputText) {
      outputText = event.text ?? ''
    } else if (event.type === 'response.completed') {
      completed = true
      responseId = event.response?.id ?? responseId
      responseModel = event.response?.model ?? responseModel
      usage = normalizeUsage(event.response)
    } else if (
      event.type === 'response.failed' || event.type === 'response.incomplete'
    ) {
      throw new Error(`Responses API ended with ${event.type}.`)
    }
  }
  if (!completed) throw new Error('Responses API stream ended before completion.')

  const generated = parseModelOutput(outputText)
  const allowedSources = new Set(evidence.map((source) => source.id))
  if (
    strategy === 'retrieval-grounded' &&
    generated.citations.some((citation) => !allowedSources.has(citation.source_id))
  ) {
    throw new Error('The generated answer cited evidence that was not retrieved.')
  }

  const result = {
    schema_version: 1,
    task,
    answer: generated.answer.trim(),
    tool_errors: strategy === 'retrieval-grounded' ? 0 : 1,
    searches,
    citations: generated.citations,
    evidence: evidence.map(({ id, title, url }) => ({
      source_id: id, title, url,
    })),
    generator: {
      api: CANDIDATE_CONFIG.api,
      model: responseModel,
      response_id: responseId,
      strategy,
      streaming: true,
      usage,
    },
  }
  writeResearchArtifacts(result, outputDir)
  return result
}

function markdownReport(result) {
  const lines = [
    '# Deep Research Report', '', result.answer || '_No answer was generated._',
    '', '## Search trace', '',
  ]
  if (result.searches.length) {
    for (const search of result.searches) {
      lines.push(
        `- **${search.status}** — ${search.query} → ${search.matched_source_ids.join(', ') || 'no result'}`,
      )
    }
  } else {
    lines.push('- No search was executed.')
  }
  lines.push('', '## Citations', '')
  if (result.citations.length) {
    for (const citation of result.citations) {
      const source = result.evidence.find(
        (item) => item.source_id === citation.source_id,
      )
      const suffix = source ? ` — ${source.title} (${source.url})` : ''
      lines.push(`- [${citation.source_id}] ${citation.claim}${suffix}`)
    }
  } else {
    lines.push('- No grounded citation was produced.')
  }
  lines.push(
    '', '## Generator provenance', '',
    `- Strategy: \`${result.generator.strategy}\``,
    `- API: \`${result.generator.api}\``,
    `- Model: \`${result.generator.model}\``,
    `- Response: \`${result.generator.response_id ?? 'unavailable'}\``,
    '- Streaming: true',
    '',
  )
  return lines.join('\n')
}

export function writeResearchArtifacts(result, outputDir = DEFAULT_OUTPUT_DIR) {
  const root = resolve(outputDir)
  mkdirSync(root, { recursive: true })
  writeFileSync(
    resolve(root, 'research-result.json'),
    `${JSON.stringify(result, null, 2)}\n`,
  )
  writeFileSync(resolve(root, 'research-report.md'), markdownReport(result))
}

export function writeFailureArtifacts(error, {
  strategy,
  outputDir = DEFAULT_OUTPUT_DIR,
  model = CANDIDATE_CONFIG.model,
}) {
  const result = {
    schema_version: 1,
    task: 'Deep Research generation failed.',
    answer: '',
    tool_errors: 1,
    searches: [],
    citations: [],
    evidence: [],
    generator: {
      api: CANDIDATE_CONFIG.api,
      model,
      response_id: null,
      strategy,
      streaming: true,
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error
          ? error.message
          : 'Unknown generator failure.',
      },
    },
  }
  writeResearchArtifacts(result, outputDir)
}
