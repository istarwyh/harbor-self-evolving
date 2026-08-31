import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

async function read(relativePath) {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('public documentation matches the released Historical Session surface', async () => {
  const [
    packageJson,
    pythonProject,
    rootReadme,
    agents,
    pluginReadme,
    adapterReadme,
    quickstart,
    architecture,
    integration,
    security,
    troubleshooting,
  ] = await Promise.all([
    read('packages/dsh-plugin/package.json'),
    read('packages/harbor-plugin/pyproject.toml'),
    read('README.md'),
    read('AGENTS.md'),
    read('packages/dsh-plugin/README.md'),
    read('packages/harbor-plugin/README.md'),
    read('docs/dsh-web-quickstart.md'),
    read('docs/architecture.md'),
    read('docs/integration.md'),
    read('docs/security.md'),
    read('docs/troubleshooting.md'),
  ]);

  const version = JSON.parse(packageJson).version;
  assert.match(pythonProject, new RegExp(`version = "${escapeRegExp(version)}"`));
  assert.match(packageJson, /Historical Session evaluation workflows/);
  assert.match(pythonProject, /Historical Session evaluation workflows/);

  for (const document of [rootReadme, agents, pluginReadme, adapterReadme, quickstart]) {
    assert.match(document, new RegExp(escapeRegExp(version)));
    assert.doesNotMatch(document, /0\.7\.0/);
  }

  for (const document of [rootReadme, agents, pluginReadme, adapterReadme, quickstart]) {
    assert.match(document, /dsh-evolution/);
    assert.match(document, /dsh-historical-evaluation/);
  }

  assert.match(rootReadme, /16 个确定性工具/);
  assert.match(pluginReadme, /sixteen strict Harbor tools/);
  assert.match(pluginReadme, /Historical Session cold start/);
  assert.match(pluginReadme, /completed-unscored/);
  assert.match(rootReadme, /评测最近会话/);
  assert.match(pluginReadme, /Evaluate recent Sessions/);
  assert.match(quickstart, /预览 → 用户确认|确认并开始评测/);
  assert.match(integration, /浏览器从不接收 selection token/);

  const publicTools = [
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
  ];
  for (const tool of publicTools) {
    assert.match(quickstart, new RegExp(escapeRegExp(tool)));
  }

  assert.match(architecture, /Historical Job/);
  assert.match(architecture, /completed-unscored/);
  assert.match(integration, /harbor_session_diagnostic_preview/);
  assert.match(integration, /harbor_session_diagnostic_run/);
  assert.match(security, /Historical selection token/);
  assert.match(troubleshooting, /NO_ELIGIBLE_SESSIONS/);
  assert.match(troubleshooting, /HISTORICAL_JOB_INCOMPLETE/);
});
