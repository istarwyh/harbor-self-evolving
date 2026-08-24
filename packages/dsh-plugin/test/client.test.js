import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import React from 'react'

test('built Web client registers the Evaluation Workbench, Doctor, and fourteen Tool views', async () => {
  const bundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  const source = await readFile(new URL('../src/client/index.jsx', import.meta.url), 'utf8')
  let descriptor
  const window = { __ModuleLoader__: { load(value) { descriptor = value } } }
  new Function('window', bundle)(window)
  assert.equal(descriptor.id, 'dsh-harbor-evolution')
  const plugin = descriptor.factory(id => {
    if (id === 'react') return React
    throw new Error(`unexpected client dependency: ${id}`)
  })
  assert.equal(plugin.name, 'dsh-harbor-evolution')
  assert.deepEqual(plugin.inject, ['slots', 'locale'])

  const registrations = []
  const ctx = {
    effect() { return () => {} },
    locale: {
      bind() { return key => key },
      register() { return () => {} },
    },
    slots: {
      inject(name, callback) {
        const value = callback()
        if (value?.[Symbol.iterator] && typeof value !== 'string') {
          for (const dispose of value) void dispose
        }
      },
      register(options, component) {
        registrations.push({ options, component })
        return () => {}
      },
    },
  }
  plugin.apply(ctx)
  assert.deepEqual(registrations.map(entry => entry.options.name), [
    'conversation.view',
    'settings.section',
    'tool.call.toolview',
    'tool.call.toolview',
    'tool.call.toolview',
    'tool.call.toolview',
    'tool.call.toolview',
    'tool.call.toolview',
    'tool.call.toolview',
    'tool.call.toolview',
    'tool.call.toolview',
    'tool.call.toolview',
    'tool.call.toolview',
    'tool.call.toolview',
    'tool.call.toolview',
    'tool.call.toolview',
  ])
  assert.equal(registrations[0].options.id, 'harbor-evolution')
  assert.equal(registrations[1].options.id, 'harbor-evolution')
  assert.deepEqual(registrations.slice(2).map(entry => entry.options.key), [
    'harbor_candidate_snapshot',
    'harbor_model_binding',
    'harbor_evolution_init',
    'harbor_evolution_doctor',
    'harbor_quick_diagnostic_init',
    'harbor_dataset_validate',
    'harbor_context_preview',
    'harbor_eval_run',
    'harbor_eval_result',
    'harbor_evaluator_inspect',
    'harbor_evaluator_update',
    'harbor_ground_truth_init',
    'harbor_evaluator_meta_evaluate',
    'harbor_candidate_compare',
  ])
  assert.match(source, /不可用/, 'legacy Jobs must not be presented as score-valid')
  assert.match(source, /--dsw-alias-label-primary/, 'Workbench content must follow the host light or dark theme')
  assert.match(source, /candidate: '候选版本'.*dataset: '评测集'.*renderer: '产物呈现'.*judge: '评测器'/s, 'Chinese DSH locale must localize every stage tab')
  assert.match(source, /function DatasetPanel/, 'Dataset stage must show Agent-visible instructions')
  assert.match(source, /function ArtifactPreview/, 'Renderer stage must present generated output')
  assert.match(source, /如何升级评测器/, 'Judge stage must guide evaluator evolution')
  assert.match(source, /function EvaluatorEditor/, 'Judge stage must open descriptor-authorized Evaluator source for controlled editing')
  assert.match(source, /openFile: '打开'.*editingFile: '正在修改'/s, 'Evaluator files must be presented as directly openable and editable')
  assert.match(source, /trial\.displayName \?\? trial\.datasetTrial/, 'Trial lists must lead with the user instruction instead of Harbor random IDs')
  assert.match(source, /stage === 'judge'\) content = <><GovernancePanel/, 'Judge stage must start with actionable evaluator governance')
  assert.match(source, /function TrialAssessmentReport/, 'Reporter stage must expose per-Trial scores, reasons, and recommendations')
  assert.match(source, /REPORT_PAGE_SIZE = 10/, 'Reporter stage must paginate per-Trial assessments')
  assert.match(source, /hse-report-compare/, 'Reporter stage must compare the artifact with its assessment side by side')
  assert.match(source, /function MetaEvaluationPanel/, 'Ground Truth and evaluator meta-evaluation must have a separate stage')
  assert.match(source, /switchProjectRoot/, 'Doctor settings must expose a hot-reloadable Web Workbench projectRoot')
  assert.match(source, /credentialStoreHint/, 'Doctor settings must state the real credential persistence boundary')
  assert.match(source, /function VersionPanel/, 'Settings must present installed and latest Plugin versions')
  assert.match(source, /navigator\.clipboard\.writeText\(value\.command\)/, 'Settings must copy an exact update command without executing it')
  assert.match(source, /ESF.*SCE.*RCR/s, 'Meta-evaluation must expose the accepted reliability metrics')
  assert.match(source, /function gateReasonText/, 'Gate must render structured and legacy string reasons safely')
  assert.doesNotMatch(source, /StageSummary|hse-stage-summary|what_happened/, 'stage tabs must open directly on user-facing evidence')
  assert.ok(bundle.length > 150_000, 'the embedded ocean asset should ship in the portable client bundle')
})
