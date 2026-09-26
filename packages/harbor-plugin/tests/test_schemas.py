import json
import subprocess
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from helpers import make_candidate, make_context, make_dataset, make_stack
from helpers import make_historical_batch
from harbor_dsh_evolution.bridge_contract import BRIDGE_CONTRACT
from harbor_dsh_evolution.historical_context import build_historical_context
from harbor_dsh_evolution.identity import canonical_digest, canonical_json
from harbor_dsh_evolution.historical_summary import summarize_historical_payloads
from harbor_dsh_evolution.session_batch import materialize_historical_dataset


SCHEMA_ROOT = Path(__file__).parents[3] / "schemas"
DSH_SCHEMA_ROOT = SCHEMA_ROOT.parent / "packages" / "dsh-plugin" / "schemas"
PYTHON_SCHEMA_ROOT = Path(__file__).parents[1] / "src" / "harbor_dsh_evolution" / "schemas"
DSH_EXPORTED_SCHEMAS = tuple(sorted(path.name for path in SCHEMA_ROOT.glob("*.json")))


def load(name: str):
    return json.loads((SCHEMA_ROOT / name).read_text())


def test_all_public_schemas_are_valid_json_schema():
    for path in SCHEMA_ROOT.glob("*.schema.json"):
        Draft202012Validator.check_schema(json.loads(path.read_text()))


def test_bridge_contract_is_identical_in_root_node_and_python():
    expected = json.loads((SCHEMA_ROOT / "bridge-contract.json").read_text())
    packaged = json.loads((DSH_SCHEMA_ROOT / "bridge-contract.json").read_text())
    script = "import { BRIDGE_CONTRACT } from './packages/dsh-plugin/lib/bridge-contract.js'; console.log(JSON.stringify(BRIDGE_CONTRACT))"
    completed = subprocess.run(
        ["node", "--input-type=module", "--eval", script],
        cwd=SCHEMA_ROOT.parent,
        check=True,
        capture_output=True,
        text=True,
    )
    assert expected == packaged == BRIDGE_CONTRACT == json.loads(completed.stdout)


def test_canonical_json_uses_javascript_utf16_key_order_and_rejects_lossy_integers():
    assert canonical_json({"\ue000": 1, "😀": 2}) == '{"😀":2,"":1}'
    with pytest.raises(ValueError, match="IEEE-754"):
        canonical_json(9_007_199_254_740_993)


def test_canonical_digest_golden_vectors_match_node_and_python():
    vectors = json.loads((SCHEMA_ROOT / "canonical-digest-vectors.json").read_text())
    script = """
import { canonicalDigest } from './packages/dsh-plugin/lib/bridge-contract.js'
const vectors = JSON.parse(process.argv[1])
console.log(JSON.stringify(vectors.map(item => canonicalDigest(item.value, item.namespace))))
"""
    completed = subprocess.run(
        ["node", "--input-type=module", "--eval", script, json.dumps(vectors["vectors"], ensure_ascii=False)],
        cwd=SCHEMA_ROOT.parent,
        check=True,
        capture_output=True,
        text=True,
    )
    node_digests = json.loads(completed.stdout)
    expected = [item["digest"] for item in vectors["vectors"]]
    python_digests = [canonical_digest(item["value"], namespace=item["namespace"]) for item in vectors["vectors"]]
    assert expected == python_digests == node_digests


def test_historical_batch_schema_accepts_history_scope_and_optional_scan_provenance(tmp_path: Path):
    _, batch, _ = make_historical_batch(tmp_path, count=2)
    validator = Draft202012Validator(load("historical-generation-batch.schema.json"))
    validator.validate(batch)
    batch["selection"]["scan"] = {
        "scope": "exact-cwd", "listed_count": 2, "candidate_count": 2,
        "read_count": 2, "unscanned_count": 0, "partial": False,
        "window_order": "all-candidates", "selection_order": "last-activity-desc",
    }
    validator.validate(batch)
    batch["selection"]["scope"] = "dsh-history"
    batch["selection"]["scan"] = {
        "scope": "dsh-history", "listed_count": 20, "candidate_count": 12,
        "read_count": 4, "unscanned_count": 8, "partial": True,
        "window_order": "created-at-desc", "selection_order": "last-activity-desc",
    }
    for index, record in enumerate(batch["records"]):
        record["source_project_digest"] = "sha256:" + str(index) * 64
    validator.validate(batch)
    batch["records"][0]["source_project_digest"] = "/private/raw-project-path"
    with pytest.raises(ValidationError):
        validator.validate(batch)


def test_generated_context_and_dataset_match_public_schemas(tmp_path: Path):
    candidate = make_candidate(tmp_path)
    dataset = make_dataset(tmp_path)
    stack = make_stack(tmp_path)
    context = make_context(tmp_path, candidate, dataset, stack)
    Draft202012Validator(load("candidate-manifest.schema.json")).validate(
        json.loads((candidate / "candidate-manifest.json").read_text())
    )
    Draft202012Validator(load("evaluation-context.schema.json")).validate(context)
    Draft202012Validator(load("dataset-manifest.schema.json")).validate(
        json.loads((dataset / "dataset-manifest.json").read_text())
    )


def test_historical_runtime_artifacts_match_public_schemas(tmp_path: Path):
    batch_path, batch, observations = make_historical_batch(tmp_path, count=2)
    Draft202012Validator(load("historical-generation-batch.schema.json")).validate(
        batch
    )
    observation_validator = Draft202012Validator(
        load("dsh-session-observation.schema.json")
    )
    for observation in observations.values():
        observation_validator.validate(observation)

    materialized = materialize_historical_dataset(
        project_root=tmp_path,
        batch_path=batch_path,
        output_path=tmp_path / "materialized" / "dataset",
        judge_provider="judge-provider",
        judge_model="judge-model",
        judge_reasoning_effort="high",
    )
    descriptor = json.loads(
        (Path(materialized["stack_path"]).parent / "evaluator" / "evaluator.json").read_text()
    )
    Draft202012Validator(load("evaluator.schema.json")).validate(descriptor)
    task_path = (
        Path(materialized["dataset_path"])
        / materialized["dataset_manifest"]["tasks"][0]["path"]
    )
    evaluator_materialization = json.loads(
        (task_path / "tests" / "evaluator-materialization.json").read_text()
    )
    runtime_identity = evaluator_materialization["materialized"]
    effective_evaluator = {
        "schema_version": 1,
        "protocol": "effective-evaluator/v1",
        "configured": evaluator_materialization["configured"],
        "materialized": runtime_identity,
        "executed": runtime_identity,
        "identity_match": True,
    }
    Draft202012Validator(load("effective-evaluator.schema.json")).validate(
        effective_evaluator
    )
    context = build_historical_context(
        project_root=tmp_path,
        batch_path=batch_path,
        dataset_path=Path(materialized["dataset_path"]),
        stack_path=Path(materialized["stack_path"]),
    )
    Draft202012Validator(load("historical-evaluation-context.schema.json")).validate(
        context
    )
    evaluator_result = {
        "schema_version": 2,
        "protocol": "evaluation-result/v2",
        "criteria": [
            {
                "id": "goal_progress",
                "status": "insufficient-evidence",
                "score": None,
                "reason": "The frozen evidence is intentionally incomplete.",
                "recommendation": "Collect a new complete record.",
                "evidence_refs": ["generation_record.completeness"],
            }
        ],
        "aggregate": {
            "metric_id": "reward",
            "value": None,
            "scored_criteria": 0,
            "total_criteria": 1,
            "coverage": 0,
        },
        "effective_evaluator": effective_evaluator,
    }
    Draft202012Validator(load("evaluation-result-v2.schema.json")).validate(
        evaluator_result
    )
    summary = summarize_historical_payloads(
        [],
        job_name="historical-schema-test",
        evaluation_context=context,
        artifact_validation={"valid": True, "findings": []},
        dataset_manifest=materialized["dataset_manifest"],
        assessments=[],
    )
    Draft202012Validator(load("historical-evaluation-summary.schema.json")).validate(
        summary
    )
    Draft202012Validator(load("evaluation-summary.schema.json")).validate(summary)


def test_node_generated_session_observation_matches_public_schema():
    repository = SCHEMA_ROOT.parent
    script = r'''
import { buildSessionObservation } from './packages/dsh-plugin/lib/session-redaction.js'
const events = [
  { type: 'turn/start', seq: 0, time: 1000, data: { turn: 0 } },
  { type: 'user/message', seq: 1, time: 1001, surfaceOp: 'append', data: { id: 'user', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Run the tests' }] } },
  { type: 'assistant/message', seq: 2, time: 1002, surfaceOp: 'append', data: { turn: 0, message: { id: 'assistant', role: 'assistant', source: { kind: 'model', provider: 'test', model: 'model' }, content: [{ type: 'text', text: 'Tests completed.' }] }, usage: { inputTokens: 3, outputTokens: 2 } } },
  { type: 'tool/call', seq: 3, time: 1003, data: { turn: 0, callId: 'call-1', name: 'bash', arguments: JSON.stringify({ command: 'pytest -q' }) } },
  { type: 'tool/result', seq: 4, time: 1004, data: { turn: 0, message: { id: 'tool', role: 'user', source: { kind: 'tool', callId: 'call-1' }, content: [{ type: 'tool-result', toolCallId: 'call-1', content: [{ type: 'text', text: '3 passed\n[exit code: 0]' }] }] } } },
  { type: 'turn/end', seq: 5, time: 1005, data: { turn: 0, reason: { kind: 'completed' } } },
]
const selected = {
  rawSessionId: 'session', header: { version: 1, id: 'session', createdAt: 1000, cwd: '/tmp/project', agentPreset: 'default' }, events,
  index: { lastActivityAt: 1005, lastSeq: 5, openTurn: false, turnCount: 1, humanMessageCount: 1, assistantMessageCount: 1, toolCallCount: 1, lastTurnReason: 'completed', effectiveAgentPreset: 'default', modelRoutes: [{ provider: 'test', model: 'model' }], modelSegments: [{ from_seq: 0, through_seq: 5, provider: 'test', model: 'model' }] },
  sourceDigest: `sha256:${'a'.repeat(64)}`, sourceRef: `sha256:${'b'.repeat(64)}`, capturedThroughSeq: 5, trialId: 'session-fixture',
}
console.log(JSON.stringify(buildSessionObservation(selected)))
'''
    completed = subprocess.run(
        ["node", "--input-type=module", "--eval", script],
        cwd=repository, check=True, capture_output=True, text=True,
    )
    observation = json.loads(completed.stdout)
    Draft202012Validator(load("dsh-session-observation.schema.json")).validate(observation)


def test_dsh_package_exports_exact_public_schemas():
    for name in DSH_EXPORTED_SCHEMAS:
        assert json.loads((DSH_SCHEMA_ROOT / name).read_text()) == load(name)


def test_python_package_contains_all_exact_public_schemas():
    for name in DSH_EXPORTED_SCHEMAS:
        assert (PYTHON_SCHEMA_ROOT / name).read_bytes() == (SCHEMA_ROOT / name).read_bytes()


def test_javascript_report_projection_matches_the_public_schema():
    repository = SCHEMA_ROOT.parent
    script = r'''
import { buildEvaluationReport } from './packages/dsh-plugin/lib/evaluation-report.js'
const identity = { id: 'quality-evaluator', version: '2.0.0', portable_digest: `sha256:${'a'.repeat(64)}` }
const assessment = {
  trial_id: 'trial-a', dataset_trial: 'task-a', status: 'completed',
  score: { value: 0.5, valid: true, invalid_reasons: [] },
  requirements: { evaluator_identity_match: true },
  criteria: [{ id: 'quality', label: 'Quality', score: 0.5, status: 'measured', reason: 'Partially correct.', recommendation: 'Add evidence.', evidence_refs: ['output'] }],
  findings: [], recommendations: [], output: { content: 'answer' },
}
const report = buildEvaluationReport({
  job: 'strict-candidate-job',
  summary: {
    schema_version: 3, job: 'strict-candidate-job', job_kind: 'candidate-evaluation', mode: 'diagnostic',
    n_trials: 1, n_completed_trials: 1, n_valid_scores: 1, n_invalid_scores: 0,
    status_counts: { completed: 1 }, metrics: { reward: 0.5 }, trials: [{ id: 'trial-a', status: 'completed' }],
    artifact_validation: { valid: true, findings: [] },
    effective_evaluator: { schema_version: 1, protocol: 'effective-evaluator/v1', configured: identity, materialized: { ...identity, bundle_complete: true }, executed: { ...identity, bundle_complete: true }, identity_match: true, execution: { status: 'succeeded', error_type: null } },
  },
  stack: { stack_id: 'quality-stack', version: '2.0.0', digest: `sha256:${'b'.repeat(64)}`, components: { evaluator: { id: identity.id, version: identity.version, interface: { portable_digest: identity.portable_digest } } }, judge: { provider: 'local', model: 'judge', version: '1' } },
  context: { schema_version: 3, protocol: 'candidate-evaluation-context/v3', digest: `sha256:${'c'.repeat(64)}`, mode: 'diagnostic', dataset: { id: 'dataset', version: '1', digest: `sha256:${'d'.repeat(64)}`, task_count: 1 }, candidate: { id: 'candidate', version: '1', digest: `sha256:${'e'.repeat(64)}` } },
  contract: { schema_version: 1, contract_id: 'quality', version: '1', primary_metric: 'reward', metrics: [{ id: 'reward', direction: 'maximize' }] },
  assessments: [assessment],
})
console.log(JSON.stringify(report))
'''
    completed = subprocess.run(
        ["node", "--input-type=module", "--eval", script],
        cwd=repository,
        check=True,
        capture_output=True,
        text=True,
    )
    report = json.loads(completed.stdout)
    Draft202012Validator(load("evaluation-report.schema.json")).validate(report)
    Draft202012Validator(json.loads((DSH_SCHEMA_ROOT / "evaluation-report.schema.json").read_text())).validate(report)
