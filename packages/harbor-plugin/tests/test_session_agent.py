from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from harbor.models.agent.context import AgentContext

from harbor_dsh_evolution.session_agent import SessionObservationAgent


class FakeEnvironment:
    def __init__(self, digest: str):
        self.digest = digest
        self.calls = []

    async def exec(self, command, **kwargs):
        self.calls.append((command, kwargs))
        if command.startswith("test -r"):
            return SimpleNamespace(return_code=0, stdout="", stderr="")
        return SimpleNamespace(
            return_code=0,
            stdout=json.dumps({"status": "observed", "digest": self.digest}) + "\n",
            stderr="",
        )


@pytest.mark.asyncio
async def test_session_observation_agent_is_deterministic_and_model_free(tmp_path: Path):
    digest = "sha256:" + "a" * 64
    environment = FakeEnvironment(digest)
    agent = SessionObservationAgent(logs_dir=tmp_path)
    context = AgentContext()
    await agent.setup(environment)
    await agent.run("ignored model prompt", environment, context)
    assert agent.name() == "dsh-session-observation-adapter"
    assert agent.version() == "1.0.0"
    assert agent.model_name is None
    assert "hashlib" in environment.calls[1][0]
    assert "Session Observation digest mismatch" in environment.calls[1][0]
    assert context.metadata == {
        "execution_adapter": {
            "id": "dsh-session-observation-adapter",
            "version": "1.0.0",
            "execution_mode": "observe-existing",
            "model_invocation": False,
            "tool_reexecution": False,
        },
        "observation": {
            "digest": digest,
            "artifact": "/logs/artifacts/session-observation.json",
        },
    }


@pytest.mark.asyncio
async def test_session_observation_agent_fails_closed_when_record_is_missing(tmp_path: Path):
    class MissingEnvironment(FakeEnvironment):
        async def exec(self, command, **kwargs):
            return SimpleNamespace(return_code=1, stdout="", stderr="missing")

    with pytest.raises(RuntimeError, match="unavailable"):
        await SessionObservationAgent(logs_dir=tmp_path).setup(
            MissingEnvironment("sha256:" + "a" * 64)
        )
