from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from harbor.agents.installed.acp import AcpAgent
from harbor_dsh_evolution.agent import DshCandidateAgent
from harbor_dsh_evolution.candidate import snapshot_candidate

from helpers import make_candidate


class FakeEnvironment:
    def __init__(self) -> None:
        self.uploads: dict[str, str] = {}
        self.commands: list[str] = []

    async def exec(self, command: str, **_kwargs):
        self.commands.append(command)
        return SimpleNamespace(return_code=0, stderr="", stdout="")

    async def upload_file(self, source: Path, destination: str) -> None:
        self.uploads[destination] = source.read_text()

    async def upload_dir(self, _source: Path, _destination: str) -> None:
        return None


@pytest.mark.asyncio
async def test_candidate_container_receives_only_the_job_gateway_capability(
    tmp_path: Path, monkeypatch
) -> None:
    candidate = make_candidate(tmp_path)
    (candidate / "cordis.yml").write_text(
        """
- id: acp-agent
  name: '@deepseek-ai/dsh-acp-demo'
  config:
    provider: deepseek-official
    model: deepseek-v4-pro
""".lstrip()
    )
    manifest = snapshot_candidate(candidate)
    monkeypatch.setenv("HSE_MODEL_GATEWAY_URL", "http://host.docker.internal:1234/lease")
    monkeypatch.setenv("HSE_MODEL_GATEWAY_TOKEN", "job-capability-token")
    monkeypatch.setenv("HSE_MODEL_GATEWAY_PROVIDER", "dsh-host")
    monkeypatch.setenv("HSE_MODEL_GATEWAY_PROTOCOL", "dsh-host-model-gateway/v1")
    monkeypatch.setenv("HSE_MODEL_GATEWAY_INFO", json.dumps({"id": "gpt-test", "name": "GPT"}))
    monkeypatch.setenv("CODEX_OAUTH_TOKEN", "host-oauth-must-not-enter-container")

    async def no_op_setup(self, environment):
        return None

    monkeypatch.setattr(AcpAgent, "setup", no_op_setup)
    agent = DshCandidateAgent(
        logs_dir=tmp_path / "logs",
        candidate_path=str(candidate),
        candidate_digest=manifest.digest,
        candidate_model_provider="openai-codex",
        candidate_model="gpt-test",
        candidate_reasoning_effort="high",
    )
    environment = FakeEnvironment()
    await agent.setup(environment)

    assert environment.uploads["/run/secrets/hse-model-gateway-token"] == "job-capability-token"
    assert "host-oauth-must-not-enter-container" not in "\n".join(environment.uploads.values())
    assert "/opt/harbor-dsh-candidate/.harbor-runtime/cordis.yml" in environment.uploads
    assert "/opt/harbor-dsh-candidate/.harbor-runtime/llm_gateway.mjs" in environment.uploads
