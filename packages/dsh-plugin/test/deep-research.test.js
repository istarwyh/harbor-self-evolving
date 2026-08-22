import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { generateResearch } from '../../../examples/deep-research/candidates/v2/responses-research-generator.mjs'

const catalogPath = fileURLToPath(
  new URL(
    '../../../examples/deep-research/task/01-color/environment/source-catalog.json',
    import.meta.url,
  ),
)

function sseResponse(output, requestRecord) {
  const response = {
    id: 'resp-test',
    model: 'gpt-test',
    usage: {
      input_tokens: 20,
      input_tokens_details: { cached_tokens: 3 },
      output_tokens: 8,
      output_tokens_details: { reasoning_tokens: 2 },
    },
  }
  const text = [
    `event: response.created\ndata: ${JSON.stringify({ type: 'response.created', response })}\n\n`,
    `event: response.output_text.delta\ndata: ${JSON.stringify({ type: 'response.output_text.delta', delta: output.slice(0, 17) })}\n\n`,
    `event: response.output_text.delta\ndata: ${JSON.stringify({ type: 'response.output_text.delta', delta: output.slice(17) })}\n\n`,
    `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response })}\n\n`,
  ].join('')
  const split = Math.floor(text.length / 3)
  const chunks = [text.slice(0, split), text.slice(split, split * 2), text.slice(split * 2)]
  return async (url, init) => {
    requestRecord.url = url
    requestRecord.init = init
    const encoder = new TextEncoder()
    return new Response(
      new ReadableStream({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
          controller.close()
        },
      }),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    )
  }
}

test('Responses generator streams a grounded report and records real search evidence', async () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'hse-deep-research-'))
  const request = {}
  try {
    const result = await generateResearch(
      {
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: '请回答：什么是颜色？' }],
          },
        ],
      },
      {
        strategy: 'retrieval-grounded',
        fetchImpl: sseResponse(
          JSON.stringify({
            answer: '颜色是光、物体与视觉系统共同形成的知觉。',
            citations: [{ claim: '颜色是一种视觉知觉', source_id: 'cie-color' }],
          }),
          request,
        ),
        outputDir,
        catalogPath,
        responsesUrl: 'http://model.test/v1/responses',
        apiKey: 'test-key',
        model: 'gpt-test',
        attribution: { 'user-agent': 'hse-test' },
      },
    )

    assert.equal(result.searches[0].status, 'ok')
    assert.deepEqual(result.searches[0].matched_source_ids, ['cie-color'])
    assert.equal(result.citations[0].source_id, 'cie-color')
    assert.equal(result.generator.streaming, true)
    assert.deepEqual(result.generator.usage, {
      input_tokens: 20,
      output_tokens: 8,
      cached_tokens: 3,
      reasoning_tokens: 2,
    })
    const body = JSON.parse(request.init.body)
    assert.equal(body.stream, true)
    assert.deepEqual(
      body.text.format.schema.properties.citations.items.properties.source_id.enum,
      ['cie-color'],
    )
    assert.equal(request.init.headers.authorization, 'Bearer test-key')
    assert.match(readFileSync(join(outputDir, 'research-report.md'), 'utf8'), /cie-color/)
    assert.equal(
      JSON.parse(readFileSync(join(outputDir, 'research-result.json'), 'utf8')).answer,
      result.answer,
    )
  } finally {
    rmSync(outputDir, { recursive: true, force: true })
  }
})

test('v1 and v2 use the same Responses client implementation', () => {
  const v1 = readFileSync(
    fileURLToPath(
      new URL(
        '../../../examples/deep-research/candidates/v1/responses-research-generator.mjs',
        import.meta.url,
      ),
    ),
    'utf8',
  )
  const v2 = readFileSync(
    fileURLToPath(
      new URL(
        '../../../examples/deep-research/candidates/v2/responses-research-generator.mjs',
        import.meta.url,
      ),
    ),
    'utf8',
  )
  assert.equal(v1, v2)

  const v1Config = readFileSync(
    fileURLToPath(
      new URL(
        '../../../examples/deep-research/candidates/v1/generator-config.json',
        import.meta.url,
      ),
    ),
    'utf8',
  )
  const v2Config = readFileSync(
    fileURLToPath(
      new URL(
        '../../../examples/deep-research/candidates/v2/generator-config.json',
        import.meta.url,
      ),
    ),
    'utf8',
  )
  assert.equal(v1Config, v2Config)
})

test('Deep Research sample materializes 13 real questions, controlled badcases, and a ternary Evaluator Interface', () => {
  const specPath = fileURLToPath(new URL('../../../examples/deep-research/dataset-spec.json', import.meta.url))
  const spec = JSON.parse(readFileSync(specPath, 'utf8'))
  assert.equal(spec.tasks.length, 13)
  assert.equal(spec.tasks[0].question, '什么是颜色？')
  assert.equal(spec.tasks.at(-1).question, '两个现象总是一起出现，就能说明一个导致了另一个吗？')
  assert.equal(spec.tasks.filter(item => item.badcase).length, 3)

  const descriptor = JSON.parse(readFileSync(fileURLToPath(new URL('../../../examples/deep-research/stack/evaluator/evaluator.json', import.meta.url)), 'utf8'))
  assert.equal(descriptor.interface, 'harbor-dsh-evaluator/v1')
  assert.equal(descriptor.kind, 'script')
  assert.deepEqual(descriptor.criteria.map(item => item.label), ['回应问题', '有趣性', '引用规范性'])
  assert.ok(descriptor.criteria.every(item => JSON.stringify(item.values) === '[0,0.5,1]'))

  const evaluator = readFileSync(fileURLToPath(new URL('../../../examples/deep-research/stack/evaluator/evaluator.py', import.meta.url)), 'utf8')
  assert.match(evaluator, /recommendation/)

  const materializer = fileURLToPath(new URL('../../../examples/deep-research/materialize-dataset.py', import.meta.url))
  const check = spawnSync('python3', [materializer, '--check'], { encoding: 'utf8' })
  assert.equal(check.status, 0, check.stderr || check.stdout)
})
