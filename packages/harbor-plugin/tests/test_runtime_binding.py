from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from harbor_dsh_evolution.runtime_binding import CordisLoader, JsExpression, render_runtime_config


def _write_candidate(root: Path, cordis: str) -> None:
    root.mkdir()
    (root / "cordis.yml").write_text(cordis)


def test_runtime_overlay_preserves_agent_fields_and_replaces_only_the_model_route(
    tmp_path: Path,
) -> None:
    candidate = tmp_path / "candidate"
    _write_candidate(
        candidate,
        """
- id: acp-agent
  name: '@deepseek-ai/dsh-acp-demo'
  config:
    provider: deepseek-official
    model: deepseek-v4-pro
    persistenceRoot: !!js process.env.DSH_SESSION_ROOT
    workspaceContext: false
""".lstrip(),
    )

    rendered = render_runtime_config(
        candidate,
        gateway_provider="dsh-host",
        model="gpt-test",
    )
    document = yaml.load(rendered, Loader=CordisLoader)
    patches = document[0]["config"]["patches"]
    agent = patches[0]
    gateway = patches[1]["insert"][0]

    assert document[0]["config"]["path"] == "../cordis.yml"
    assert agent["config"]["provider"] == "dsh-host"
    assert agent["config"]["model"] == "gpt-test"
    assert isinstance(agent["config"]["persistenceRoot"], JsExpression)
    assert gateway["name"] == "./.harbor-runtime/llm_gateway.mjs"
    assert isinstance(gateway["config"]["tokenFile"], JsExpression)


def test_runtime_overlay_resolves_include_and_patch(tmp_path: Path) -> None:
    candidate = tmp_path / "candidate"
    _write_candidate(
        candidate,
        """
- id: include-base
  name: '@deepseek-ai/cordis-plugin-include'
  config:
    path: ./base.yml
    patches:
      - id: acp-agent
        config:
          provider: deepseek-official
          model: deepseek-v4-flash
          workspaceContext: false
""".lstrip(),
    )
    (candidate / "base.yml").write_text(
        """
- id: acp-agent
  name: '@deepseek-ai/dsh-acp-demo'
  config:
    provider: deepseek-official
    model: deepseek-v4-pro
    workspaceContext:
      maxBytes: 65536
""".lstrip()
    )

    rendered = render_runtime_config(candidate, gateway_provider="dsh-host", model="gpt-test")
    document = yaml.load(rendered, Loader=CordisLoader)
    assert document[0]["config"]["patches"][0]["config"] == {
        "provider": "dsh-host",
        "model": "gpt-test",
        "workspaceContext": False,
    }


@pytest.mark.parametrize(
    ("root", "message"),
    [
        (
            """
- id: include-loop
  name: cordis:include
  config: { path: ./cordis.yml }
""",
            "includes form a cycle",
        ),
        (
            """
- id: include-outside
  name: cordis:include
  config: { path: ../outside.yml }
""",
            "leaves the Candidate directory",
        ),
        (
            """
- id: acp-agent
  name: one
  config: {}
- id: acp-agent
  name: two
  config: {}
""",
            "multiple acp-agent",
        ),
    ],
)
def test_runtime_overlay_rejects_unsafe_or_ambiguous_cordis(
    tmp_path: Path, root: str, message: str
) -> None:
    candidate = tmp_path / "candidate"
    _write_candidate(candidate, root.lstrip())
    with pytest.raises(ValueError, match=message):
        render_runtime_config(candidate, gateway_provider="dsh-host", model="gpt-test")
