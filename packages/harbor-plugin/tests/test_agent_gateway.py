from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from harbor_dsh_evolution.agent import DshCandidateAgent
import harbor_dsh_evolution.agent as agent_module
from harbor_dsh_evolution.candidate import snapshot_candidate

from helpers import make_candidate


class FakeEnvironment:
    def __init__(self, fail: str = "") -> None:
        self.uploads: dict[str, str] = {}
        self.commands: list[str] = []
        self.directories: dict[str, list[str]] = {}
        self.fail = fail

    async def exec(self, command: str, **_kwargs):
        self.commands.append(command)
        if self.fail and self.fail in command:
            return SimpleNamespace(return_code=1, stderr="controlled setup failure", stdout="")
        return SimpleNamespace(return_code=0, stderr="", stdout="")

    async def upload_file(self, source: Path, destination: str) -> None:
        self.uploads[destination] = source.read_text()

    async def upload_dir(self, source: Path, destination: str) -> None:
        self.directories[destination] = sorted(str(item.relative_to(source)) for item in source.rglob('*') if item.is_file())


@pytest.fixture(autouse=True)
def gateway_environment(monkeypatch):
    monkeypatch.setenv("HSE_MODEL_GATEWAY_URL", "http://host.docker.internal:1234/lease")
    monkeypatch.setenv("HSE_MODEL_GATEWAY_TOKEN", "job-capability-token")
    monkeypatch.setenv("HSE_MODEL_GATEWAY_PROVIDER", "dsh-host")
    monkeypatch.setenv("HSE_MODEL_GATEWAY_PROTOCOL", "dsh-host-model-gateway/v1")
    monkeypatch.setenv("HSE_MODEL_GATEWAY_INFO", json.dumps({"id": "gpt-test", "name": "GPT"}))
    monkeypatch.setenv("CODEX_OAUTH_TOKEN", "host-oauth-must-not-enter-container")


def build_agent(candidate, tmp_path):
    manifest = snapshot_candidate(candidate)
    return DshCandidateAgent(
        logs_dir=tmp_path / "logs", candidate_path=str(candidate),
        candidate_digest=manifest.digest, candidate_model_provider="openai-codex",
        candidate_model="gpt-test", candidate_reasoning_effort="high",
    )


@pytest.mark.asyncio
async def test_candidate_container_receives_only_the_job_gateway_capability(
    tmp_path: Path, monkeypatch
) -> None:
    candidate = make_candidate(tmp_path)
    (candidate / "cordis.yml").write_text(
        """
- id: acp-agent
  name: ./plugin.mjs
  config:
    provider: deepseek-official
    model: deepseek-v4-pro
""".lstrip()
    )
    agent = build_agent(candidate, tmp_path)
    (candidate / "node_modules").mkdir()
    (candidate / "node_modules" / "host-cache").write_text("not Candidate identity")
    (candidate / "node_modules" / ".npmrc").write_text("ignored Host module config")
    environment = FakeEnvironment()
    await agent.setup(environment)

    assert environment.uploads["/run/secrets/hse-model-gateway-token"] == "job-capability-token"
    assert "host-oauth-must-not-enter-container" not in "\n".join(environment.uploads.values())
    assert "/opt/harbor-dsh-candidate/.harbor-runtime/cordis.yml" in environment.uploads
    assert "/opt/harbor-dsh-candidate/.harbor-runtime/llm_gateway.mjs" in environment.uploads
    launcher = environment.uploads["/installed-agent/acp-launch.sh"]
    assert "exec node /opt/harbor-dsh-candidate/run-acp.mjs" in launcher
    assert "check_source.py" in launcher
    assert "npx" not in launcher
    assert "dsh-acp-demo" not in launcher
    assert "TOKEN_FILE=" in launcher and "job-capability-token" not in launcher
    commands = "\n".join(environment.commands)
    assert "npm ci --omit=dev --ignore-scripts" in commands
    assert "npx " not in commands and "npm install" not in commands and "pip install" not in commands
    assert "22.22.2" in commands and 'agent-client-protocol") == "0.12.1"' in commands
    assert "node_modules/host-cache" not in environment.directories[agent._REMOTE_ROOT]
    assert "node_modules/.npmrc" not in environment.directories[agent._REMOTE_ROOT]
    assert environment.commands.index(next(c for c in environment.commands if "npm ci" in c)) < environment.commands.index(next(c for c in environment.commands if "acp_readiness.py --launcher" in c))
    runtime = json.loads((tmp_path / "logs/candidate-runtime.json").read_text())
    assert runtime["policy"] == "candidate-locked"
    assert runtime["candidate_digest"] == agent.manifest.digest


@pytest.mark.asyncio
@pytest.mark.parametrize(("failure", "code"), [
    ("for tool in", "CANDIDATE_RUNTIME_ENVIRONMENT_UNREADY"),
    ("npm ci", "CANDIDATE_RUNTIME_INSTALL_FAILED"),
    ("acp_readiness.py --launcher", "CANDIDATE_RUNTIME_HANDSHAKE_FAILED"),
])
async def test_setup_fails_closed_without_a_runtime_fallback(tmp_path, failure, code):
    candidate = make_candidate(tmp_path)
    agent = build_agent(candidate, tmp_path)
    environment = FakeEnvironment(fail=failure)
    with pytest.raises(RuntimeError, match=code):
        await agent.setup(environment)
    assert not (tmp_path / "logs/candidate-runtime.json").exists()
    assert not any("npx " in command for command in environment.commands)


@pytest.mark.asyncio
async def test_setup_reverifies_the_exact_staged_inventory(tmp_path):
    candidate = make_candidate(tmp_path)
    agent = build_agent(candidate, tmp_path)
    (candidate / "run-acp.mjs").write_text("// changed after confirmation")
    environment = FakeEnvironment()
    with pytest.raises(ValueError, match="(digest mismatch|manifest runtime)"):
        await agent.setup(environment)
    assert not environment.directories
    assert not any("npm ci" in command for command in environment.commands)


def test_unbound_candidate_is_rejected_before_gateway_credentials(tmp_path, monkeypatch):
    candidate = make_candidate(tmp_path)
    (candidate / "candidate-runtime.json").unlink()
    monkeypatch.delenv("HSE_MODEL_GATEWAY_TOKEN")
    with pytest.raises(ValueError, match="CANDIDATE_RUNTIME_UNBOUND"):
        build_agent(candidate, tmp_path)


def test_runtime_cannot_change_between_manifest_verification_and_launcher_selection(tmp_path, monkeypatch):
    candidate = make_candidate(tmp_path)
    original = agent_module.load_candidate_runtime
    monkeypatch.setattr(agent_module, "load_candidate_runtime", lambda root, **kwargs: {**original(root, **kwargs), "entrypoint": "other-agent.mjs"})
    with pytest.raises(ValueError, match="runtime changed after manifest verification"):
        build_agent(candidate, tmp_path)


def test_setup_diagnostic_never_persists_the_job_capability(tmp_path):
    agent = build_agent(make_candidate(tmp_path), tmp_path)
    detail = agent._setup_diagnostic("controlled", SimpleNamespace(stderr="failed job-capability-token", stdout=""))
    assert "job-capability-token" not in detail
    assert "job-capability-token" not in (tmp_path / "logs/setup/controlled.txt").read_text()
