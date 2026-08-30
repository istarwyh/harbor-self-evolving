from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
from copy import deepcopy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from harbor.models.task.task import Task
from harbor_dsh_evolution.dataset import load_validated_dataset
from harbor_dsh_evolution.session_batch import (
    _default_evaluator_source,
    generation_batch_digest,
    load_generation_batch,
    materialize_historical_dataset,
    observation_digest,
)
from harbor_dsh_evolution.stack import snapshot_stack

from helpers import HISTORICAL_JUDGE_BINDING, make_historical_batch


def test_validates_batch_cross_links_and_rejects_identity_mismatch(tmp_path: Path):
    batch_path, batch, observations = make_historical_batch(tmp_path)
    loaded = load_generation_batch(batch_path, project_root=tmp_path)
    assert loaded.manifest["digest"] == batch["digest"]
    assert set(loaded.observations) == set(observations)

    observation_path = batch_path.parent / batch["records"][0]["observation_path"]
    observation = json.loads(observation_path.read_text())
    observation["source"]["ref"] = "sha256:" + "1" * 64
    observation["digest"] = observation_digest(observation)
    observation_path.write_text(json.dumps(observation))
    changed = deepcopy(batch)
    changed["records"][0]["observation_digest"] = observation["digest"]
    changed["digest"] = generation_batch_digest(changed)
    batch_path.write_text(json.dumps(changed))
    with pytest.raises(ValueError, match="source_ref mismatch"):
        load_generation_batch(batch_path, project_root=tmp_path)


@pytest.mark.parametrize("field", ["source_digest", "captured_through_seq"])
def test_rejects_other_generation_record_cross_link_mismatches(
    tmp_path: Path, field: str
):
    batch_path, batch, _ = make_historical_batch(tmp_path)
    changed = deepcopy(batch)
    if field == "source_digest":
        changed["records"][0][field] = "sha256:" + "2" * 64
    else:
        changed["records"][0][field] += 1
    changed["digest"] = generation_batch_digest(changed)
    batch_path.write_text(json.dumps(changed))
    with pytest.raises(ValueError, match=field + " mismatch"):
        load_generation_batch(batch_path, project_root=tmp_path)


def test_materializes_one_harbor_task_per_record_with_broker_templates(tmp_path: Path):
    batch_path, batch, _ = make_historical_batch(tmp_path, count=2)
    result = materialize_historical_dataset(
        project_root=tmp_path,
        batch_path=batch_path,
        output_path=tmp_path / ".harbor" / "private" / "dataset",
        **HISTORICAL_JUDGE_BINDING,
    )
    assert {"dataset_path", "stack_path", "batch_path"} <= set(result)
    dataset = Path(result["dataset_path"])
    manifest = load_validated_dataset(dataset, project_root=tmp_path)
    assert manifest["dataset_kind"] == "historical-generation"
    assert manifest["source_kind"] == "dsh-session"
    assert manifest["task_count"] == 2
    task_text = (dataset / manifest["tasks"][0]["path"] / "task.toml").read_text()
    assert 'network_mode = "public"' in task_text
    assert 'HSE_JUDGE_GATEWAY_TOKEN = "${HSE_JUDGE_GATEWAY_TOKEN}"' in task_text
    assert "job-capability-token" not in task_text
    task = Task(dataset / manifest["tasks"][0]["path"])
    assert task.config.verifier.env["HSE_JUDGE_GATEWAY_URL"] == "${HSE_JUDGE_GATEWAY_URL}"
    assert "apk add --no-cache bash" in (
        dataset / manifest["tasks"][0]["path"] / "environment" / "Dockerfile"
    ).read_text()
    task_evaluator = (
        dataset / manifest["tasks"][0]["path"] / "tests" / "evaluator.py"
    ).read_text()
    stack_evaluator = (
        Path(result["stack_path"]).parent / "evaluator" / "evaluator.py"
    ).read_text()
    assert task_evaluator == stack_evaluator
    assert repr(batch["digest"]) in task_evaluator
    assert "EXPECTED_JUDGE_PROVIDER = 'judge-provider'" in task_evaluator
    assert "EXPECTED_JUDGE_MODEL = 'judge-model'" in task_evaluator
    stack = snapshot_stack(
        Path(result["stack_path"]),
        project_root=tmp_path,
        job_kind="historical-generation-evaluation",
    )
    assert stack["judge"] == {
        "provider": "judge-provider",
        "model": "judge-model",
        "version": "dsh-host-model-gateway/v1",
        "transport": "dsh-host-broker",
        "protocol": "dsh-host-model-gateway/v1",
        "parameters": {},
        "coupling": "independent-historical-judge",
        "reasoning_effort": "high",
    }
    assert result["default_evaluator"]["judge"]["provider"] == "judge-provider"
    assert stack["components"]["evaluator"]["interface"]["schema_version"] == 2


def test_materialized_stack_marks_same_generator_and_judge_route_as_coupled(
    tmp_path: Path,
):
    batch_path, _, _ = make_historical_batch(tmp_path)
    result = materialize_historical_dataset(
        project_root=tmp_path,
        batch_path=batch_path,
        output_path=tmp_path / "dataset",
        judge_provider="test",
        judge_model="generator",
    )
    stack = snapshot_stack(
        Path(result["stack_path"]),
        project_root=tmp_path,
        job_kind="historical-generation-evaluation",
    )
    assert stack["judge"]["provider"] == "test"
    assert stack["judge"]["model"] == "generator"
    assert stack["judge"]["coupling"] == "same-host-model-diagnostic-only"
    assert "reasoning_effort" not in stack["judge"]


def test_materialized_stack_does_not_claim_independence_without_generator_route(
    tmp_path: Path,
):
    batch_path, batch, _ = make_historical_batch(tmp_path)
    changed = deepcopy(batch)
    changed["generator_population"]["model_routes"] = []
    changed["digest"] = generation_batch_digest(changed)
    batch_path.write_text(json.dumps(changed))
    result = materialize_historical_dataset(
        project_root=tmp_path,
        batch_path=batch_path,
        output_path=tmp_path / "dataset",
        judge_provider="judge-provider",
        judge_model="judge-model",
    )
    stack = snapshot_stack(
        Path(result["stack_path"]),
        project_root=tmp_path,
        job_kind="historical-generation-evaluation",
    )
    assert stack["judge"]["coupling"] == "generator-model-unknown-diagnostic-only"


def test_rejects_more_than_ten_records(tmp_path: Path):
    batch_path, batch, _ = make_historical_batch(tmp_path, count=10)
    changed = deepcopy(batch)
    changed["records"].append(deepcopy(changed["records"][0]))
    changed["records"][-1]["trial_id"] = "session-0011"
    changed["selection"]["selected_count"] = 11
    changed["digest"] = generation_batch_digest(changed)
    batch_path.write_text(json.dumps(changed))
    with pytest.raises(ValueError, match="1-10"):
        load_generation_batch(batch_path, project_root=tmp_path)


class _JudgeHandler(BaseHTTPRequestHandler):
    response_value: dict = {}
    attestation_value: dict = {}
    observed_authorization: str | None = None
    observed_get_authorization: str | None = None
    observed_payload: dict | None = None
    post_count = 0

    def do_GET(self):  # noqa: N802
        type(self).observed_get_authorization = self.headers.get("authorization")
        body = (json.dumps(type(self).attestation_value) + "\n").encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):  # noqa: N802
        type(self).post_count += 1
        length = int(self.headers["content-length"])
        type(self).observed_authorization = self.headers.get("authorization")
        type(self).observed_payload = json.loads(self.rfile.read(length))
        text = json.dumps(type(self).response_value)
        chunks = [
            {"type": "text-delta", "index": 0, "text": text[: len(text) // 2]},
            {"type": "text-delta", "index": 0, "text": text[len(text) // 2 :]},
            {"type": "block-end", "index": 0, "block": {"type": "text", "text": text}},
            {"type": "finish"},
        ]
        body = "".join(json.dumps(item) + "\n" for item in chunks).encode()
        self.send_response(200)
        self.send_header("content-type", "application/x-ndjson")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format, *_args):
        return


def _scored_judge_result():
    return {
        "criteria": [
            {
                "id": identity,
                "status": "scored",
                "score": 1,
                "reason": "The visible record supports this score.",
                "recommendation": "Preserve the observed behavior.",
                "evidence_refs": ["generation_record.visible_transcript"],
            }
            for identity in (
                "goal_progress",
                "execution_reliability",
                "evidence_alignment",
                "interaction_quality",
            )
        ]
    }


def _judge_attestation(batch_digest: str) -> dict:
    return {
        "protocol": "dsh-host-model-gateway/v1",
        "candidate_digest": batch_digest,
        "job": "historical-test",
        "binding": {
            "provider": "judge-provider",
            "model": "judge-model",
            "reasoning_effort": "high",
        },
    }


def _judge_lease_info(batch_digest: str) -> dict:
    return {
        **_judge_attestation(batch_digest),
        "model_info": {
            "provider": "judge-provider",
            "id": "judge-model",
            "name": "Judge Model",
        },
    }


@pytest.mark.parametrize(
    "model_info",
    (
        {"provider": "judge-provider", "id": "judge-model", "name": "Judge Model"},
        {},
    ),
)
def test_generated_evaluator_calls_mock_host_broker_and_parses_ndjson(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    model_info: dict,
):
    _, batch, observations = make_historical_batch(tmp_path)
    _JudgeHandler.response_value = _scored_judge_result()
    _JudgeHandler.attestation_value = _judge_attestation(batch["digest"])
    _JudgeHandler.post_count = 0
    server = ThreadingHTTPServer(("127.0.0.1", 0), _JudgeHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setenv(
        "HSE_JUDGE_GATEWAY_URL", f"http://127.0.0.1:{server.server_port}/judge"
    )
    monkeypatch.setenv("HSE_JUDGE_GATEWAY_TOKEN", "job-capability-token")
    monkeypatch.setenv("HSE_JUDGE_GATEWAY_PROTOCOL", "dsh-host-model-gateway/v1")
    lease_info = _judge_lease_info(batch["digest"])
    lease_info["model_info"] = model_info
    monkeypatch.setenv("HSE_JUDGE_GATEWAY_INFO", json.dumps(lease_info))
    namespace: dict = {}
    try:
        exec(
            _default_evaluator_source(
                batch_digest=batch["digest"],
                judge_provider="judge-provider",
                judge_model="judge-model",
                judge_reasoning_effort="high",
            ),
            namespace,
        )
        result = namespace["evaluate"](
            {
                "schema_version": 2,
                "protocol": "evaluation-input/v2",
                "generation_record": next(iter(observations.values())),
            }
        )
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
    assert result["aggregate"] == {
        "metric_id": "reward",
        "value": 1.0,
        "scored_criteria": 4,
        "total_criteria": 4,
        "coverage": 1.0,
    }
    assert _JudgeHandler.observed_get_authorization == "Bearer job-capability-token"
    assert _JudgeHandler.observed_authorization == "Bearer job-capability-token"
    assert _JudgeHandler.post_count == 1
    request = _JudgeHandler.observed_payload
    assert isinstance(request["system"], str)
    assert "temperature" not in request
    assert len(request["messages"]) == 1
    assert request["messages"][0] == {
        "id": "historical-evaluator-input",
        "role": "user",
        "source": {"kind": "user"},
        "content": [
            {
                "type": "text",
                "text": request["messages"][0]["content"][0]["text"],
            }
        ],
    }
    assert "generation_record" in json.loads(
        request["messages"][0]["content"][0]["text"]
    )


@pytest.mark.parametrize(
    "mismatch",
    (
        "attested-protocol",
        "attested-provider",
        "attested-model",
        "attested-reasoning",
        "attested-batch-digest",
        "lease-info-protocol",
        "lease-info-batch-digest",
        "lease-info-job",
        "lease-info-provider",
        "lease-info-model",
        "lease-info-reasoning",
        "model-info-provider",
        "model-info-model",
    ),
)
def test_generated_evaluator_rejects_wrong_broker_attestation_or_info_before_post(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mismatch: str,
):
    _, batch, observations = make_historical_batch(tmp_path)
    attestation = _judge_attestation(batch["digest"])
    lease_info = _judge_lease_info(batch["digest"])
    if mismatch == "attested-protocol":
        attestation["protocol"] = "other-protocol/v1"
    elif mismatch == "attested-provider":
        attestation["binding"]["provider"] = "other-provider"
    elif mismatch == "attested-model":
        attestation["binding"]["model"] = "other-model"
    elif mismatch == "attested-reasoning":
        attestation["binding"]["reasoning_effort"] = "low"
    elif mismatch == "attested-batch-digest":
        attestation["candidate_digest"] = "sha256:" + "0" * 64
    elif mismatch == "lease-info-protocol":
        lease_info["protocol"] = "other-protocol/v1"
    elif mismatch == "lease-info-batch-digest":
        lease_info["candidate_digest"] = "sha256:" + "0" * 64
    elif mismatch == "lease-info-job":
        lease_info["job"] = "other-job"
    elif mismatch == "lease-info-provider":
        lease_info["binding"]["provider"] = "other-provider"
    elif mismatch == "lease-info-model":
        lease_info["binding"]["model"] = "other-model"
    elif mismatch == "lease-info-reasoning":
        lease_info["binding"]["reasoning_effort"] = "low"
    elif mismatch == "model-info-provider":
        lease_info["model_info"]["provider"] = "other-provider"
    else:
        lease_info["model_info"]["id"] = "other-model"
    _JudgeHandler.response_value = _scored_judge_result()
    _JudgeHandler.attestation_value = attestation
    _JudgeHandler.post_count = 0
    server = ThreadingHTTPServer(("127.0.0.1", 0), _JudgeHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setenv(
        "HSE_JUDGE_GATEWAY_URL", f"http://127.0.0.1:{server.server_port}/judge"
    )
    monkeypatch.setenv("HSE_JUDGE_GATEWAY_TOKEN", "job-capability-token")
    monkeypatch.setenv("HSE_JUDGE_GATEWAY_PROTOCOL", "dsh-host-model-gateway/v1")
    monkeypatch.setenv("HSE_JUDGE_GATEWAY_INFO", json.dumps(lease_info))
    namespace: dict = {}
    try:
        exec(
            _default_evaluator_source(
                batch_digest=batch["digest"],
                judge_provider="judge-provider",
                judge_model="judge-model",
                judge_reasoning_effort="high",
            ),
            namespace,
        )
        result = namespace["evaluate"](
            {
                "schema_version": 2,
                "protocol": "evaluation-input/v2",
                "generation_record": next(iter(observations.values())),
            }
        )
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
    assert {item["status"] for item in result["criteria"]} == {"evaluation-error"}
    assert result["aggregate"]["value"] is None
    assert _JudgeHandler.post_count == 0


def test_materialized_verifier_uses_mock_broker_and_writes_v2_artifacts(tmp_path: Path):
    batch_path, batch, observations = make_historical_batch(tmp_path)
    result = materialize_historical_dataset(
        project_root=tmp_path,
        batch_path=batch_path,
        output_path=tmp_path / "dataset",
        **HISTORICAL_JUDGE_BINDING,
    )
    dataset = Path(result["dataset_path"])
    task = next(path for path in dataset.iterdir() if path.is_dir())
    verifier_dir = tmp_path / "verifier-output"
    _JudgeHandler.response_value = _scored_judge_result()
    _JudgeHandler.attestation_value = _judge_attestation(batch["digest"])
    _JudgeHandler.post_count = 0
    server = ThreadingHTTPServer(("127.0.0.1", 0), _JudgeHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    env = {
        **os.environ,
        "HSE_JUDGE_GATEWAY_URL": f"http://127.0.0.1:{server.server_port}/judge",
        "HSE_JUDGE_GATEWAY_TOKEN": "job-capability-token",
        "HSE_JUDGE_GATEWAY_PROTOCOL": "dsh-host-model-gateway/v1",
        "HSE_JUDGE_GATEWAY_INFO": json.dumps(_judge_lease_info(batch["digest"])),
        "HSE_SESSION_OBSERVATION_PATH": str(
            task / "environment" / "session-observation.json"
        ),
        "HSE_VERIFIER_LOG_DIR": str(verifier_dir),
    }
    try:
        completed = subprocess.run(
            [sys.executable, str(task / "tests" / "verify.py")],
            cwd=task / "tests",
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
    assert completed.returncode == 0, completed.stderr
    evaluation = json.loads((verifier_dir / "evaluation-result.json").read_text())
    reward = json.loads((verifier_dir / "reward.json").read_text())
    assert evaluation["protocol"] == "evaluation-result/v2"
    assert evaluation["aggregate"]["value"] == 1.0
    assert reward == {"reward": 1.0}
    assert "evaluation-result/v2" in completed.stdout
