import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import React from 'react'

test('built Web client registers the Evaluation Workbench, Doctor, and sixteen Tool views', async () => {
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
    'harbor_session_diagnostic_preview',
    'harbor_session_diagnostic_run',
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
  assert.match(source, /function judgeIdentityDetails[\s\S]*judge\?\.coupling[\s\S]*judge\?\.reasoning_effort[\s\S]*judge\?\.transport/, 'Judge governance must surface coupling and configured runtime identity details')
  assert.match(source, /<code>\{judgeIdentityDetails\(value\.judge\)\}<\/code>/, 'Judge identity details must be rendered in the main governance card')
  assert.match(bundle, /judgeIdentityDetails/, 'the portable Web bundle must include Judge coupling visibility')
  assert.match(source, /function TrialAssessmentReport/, 'Reporter stage must expose per-Trial scores, reasons, and recommendations')
  assert.match(source, /REPORT_PAGE_SIZE = 10/, 'Reporter stage must paginate per-Trial assessments')
  assert.match(source, /hse-report-compare/, 'Reporter stage must compare the artifact with its assessment side by side')
  assert.match(source, /function MetaEvaluationPanel/, 'Ground Truth and evaluator meta-evaluation must have a separate stage')
  assert.match(source, /function HistoricalTargetPanel/, 'Historical Jobs must replace Candidate identity with the immutable Generation Record target')
  assert.match(source, /generatorPopulation.*coverage/s, 'Historical Jobs must expose Generator population and scoring coverage')
  assert.match(source, /completed-unscored/, 'Historical abstentions must remain visible instead of becoming business score zero')
  assert.match(source, /function HistoricalMetaEvaluationPanel/, 'Historical Meta must render the status frozen in the Job context')
  assert.match(source, /downstream_analysis\?\.evaluator_meta_evaluation/, 'Historical Meta must not borrow an unrelated workspace-level meta-evaluation')
  assert.match(source, /function HistoricalGatePanel/, 'Historical Jobs must render a dedicated non-promotion Gate state')
  assert.match(source, /UNSUPPORTED_JOB_KIND_FOR_PROMOTION/, 'Historical Gate must expose the stable N\/A reason code')
  assert.match(source, /contextSupported = detail\?\.capabilities\?\.contextSupported \?\? detail\?\.capabilities\?\.contextV2/, 'both Candidate Context v2 and Historical Context v1 must be recognized as supported')
  assert.match(source, /switchProjectRoot/, 'Doctor settings must expose a hot-reloadable Web Workbench projectRoot')
  assert.match(source, /projectRootAgent/, 'Doctor settings must explain when the Workbench root follows the latest Agent session')
  assert.match(source, /workspaceSelect/, 'Workbench must expose an explicit workspace selector')
  assert.match(source, /api\('job', \{ workspace, job \}\)/, 'an open Job drawer must remain pinned to its workspace')
  assert.match(source, /credentialStoreHint/, 'Doctor settings must state the real credential persistence boundary')
  assert.match(source, /function VersionPanel/, 'Settings must present installed and latest Plugin versions')
  assert.match(source, /navigator\.clipboard\.writeText\(value\.command\)/, 'Settings must copy an exact update command without executing it')
  assert.match(source, /ESF.*SCE.*RCR/s, 'Meta-evaluation must expose the accepted reliability metrics')
  assert.match(source, /function gateReasonText/, 'Gate must render structured and legacy string reasons safely')
  assert.doesNotMatch(source, /StageSummary|hse-stage-summary|what_happened/, 'stage tabs must open directly on user-facing evidence')
  assert.ok(bundle.length > 150_000, 'the embedded ocean asset should ship in the portable client bundle')
})
