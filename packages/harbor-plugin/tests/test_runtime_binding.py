from __future__ import annotations

from pathlib import Path
import json
import math

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


def test_runtime_overlay_rejects_nested_include_target_instead_of_pretending_outer_patch_reaches_it(tmp_path: Path) -> None:
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

    with pytest.raises(ValueError, match="direct top-level.*nested include/group.*new Candidate snapshot"):
        render_runtime_config(candidate, gateway_provider="dsh-host", model="gpt-test")


def test_runtime_overlay_supports_custom_direct_config_and_preserves_guard_name(tmp_path: Path) -> None:
    candidate = tmp_path / "candidate"
    (candidate / "config").mkdir(parents=True)
    (candidate / "config/agent.yml").write_text(
        "- id: real-business-agent\n  name: ./agent.mjs\n  config:\n    tools: [read, shell]\n    model: original\n"
    )
    rendered = render_runtime_config(
        candidate, gateway_provider="dsh-host", model="gpt-test",
        config_path="config/agent.yml", agent_entry_id="real-business-agent",
        gateway_plugin="/opt/harbor-dsh-candidate/.harbor-runtime/llm_gateway.mjs",
    )
    document = yaml.load(rendered, Loader=CordisLoader)
    root = document[0]["config"]
    assert root["path"] == "../config/agent.yml"
    assert root["patches"][0] == {
        "id": "real-business-agent", "name": "./agent.mjs",
        "config": {"tools": ["read", "shell"], "provider": "dsh-host", "model": "gpt-test"},
    }
    assert root["patches"][1]["insert"][0]["name"] == "/opt/harbor-dsh-candidate/.harbor-runtime/llm_gateway.mjs"


@pytest.mark.parametrize("patch_name", ["actual-plugin", "different-plugin"])
def test_nested_patch_name_is_never_treated_as_renaming_or_creating_an_outer_target(tmp_path: Path, patch_name: str) -> None:
    candidate = tmp_path / "candidate"
    _write_candidate(candidate, yaml.safe_dump([
        {"id": "include", "name": "cordis:include", "config": {
            "path": "./base.yml", "patches": [{"id": "acp-agent", "name": patch_name, "config": {"model": "local"}}],
        }},
    ]))
    (candidate / "base.yml").write_text("- id: acp-agent\n  name: actual-plugin\n  config: {}\n")
    with pytest.raises(ValueError, match="direct top-level"):
        render_runtime_config(candidate, gateway_provider="dsh-host", model="gpt-test")


@pytest.mark.parametrize("config", [
    "- id: acp-agent\n  name: plugin\n  disabled: true\n  config: {}\n",
    "- id: acp-agent\n  name: plugin\n  disabled: !!js process.env.DISABLE_AGENT\n  config: {}\n",
])
def test_runtime_overlay_rejects_disabled_or_conditionally_disabled_direct_agent(tmp_path: Path, config: str) -> None:
    candidate = tmp_path / "candidate"
    _write_candidate(candidate, config)
    with pytest.raises(ValueError, match="disables the declared ACP entry"):
        render_runtime_config(candidate, gateway_provider="dsh-host", model="gpt-test")


@pytest.mark.parametrize("name_line", ["", "  name: ''\n", "  name: !!js process.env.AGENT_PLUGIN\n"])
def test_runtime_overlay_requires_an_explicit_static_plugin_name(tmp_path: Path, name_line: str) -> None:
    candidate = tmp_path / "candidate"
    _write_candidate(candidate, f"- id: acp-agent\n{name_line}  config: {{}}\n")
    with pytest.raises(ValueError, match="explicit plugin name"):
        render_runtime_config(candidate, gateway_provider="dsh-host", model="gpt-test")


def test_runtime_overlay_rejects_inline_group_target_and_duplicate_id_shadowing(tmp_path: Path) -> None:
    candidate = tmp_path / "candidate"
    _write_candidate(candidate, """
- id: group
  group: true
  config:
    - id: acp-agent
      name: nested-plugin
      config: {}
""".lstrip())
    with pytest.raises(ValueError, match="direct top-level"):
        render_runtime_config(candidate, gateway_provider="dsh-host", model="gpt-test")
    with (candidate / "cordis.yml").open("a") as target:
        target.write("- id: acp-agent\n  name: direct-plugin\n  config: {}\n")
    with pytest.raises(ValueError, match="multiple acp-agent"):
        render_runtime_config(candidate, gateway_provider="dsh-host", model="gpt-test")


@pytest.mark.parametrize("config", ["[]", "!!js process.env.AGENT_CONFIG", "false"])
def test_runtime_overlay_never_discards_dynamic_or_non_object_agent_configuration(tmp_path: Path, config: str) -> None:
    candidate = tmp_path / "candidate"
    _write_candidate(candidate, f"- id: acp-agent\n  name: plugin\n  config: {config}\n")
    with pytest.raises(ValueError, match="config must be a static object"):
        render_runtime_config(candidate, gateway_provider="dsh-host", model="gpt-test")


# Observed against the installed include@1.0.6 js-yaml.JSON_SCHEMA, rather than
# treating PyYAML's default schema as interchangeable with Cordis.
@pytest.mark.parametrize(("source", "expected"), [
    ("no", "no"), ("on", "on"), ("off", "off"), ("yes", "yes"),
    ("true", True), ("False", False), ("null", None), ("NULL", None), ("~", None),
    ("0o17", 15), ("0x10", 16), ("017", 17), ("0b11", 3),
    ("1e3", 1000.0), ("1.25e-2", 0.0125), (".5", 0.5), ("-.5", "-.5"),
    ("1_000", "1_000"), ("1:20", "1:20"), ("2026-09-06", "2026-09-06"),
    ("+12", 12), ("-0", 0),
])
def test_cordis_scalar_schema_preserves_the_observed_js_yaml_values(source, expected):
    actual = yaml.load(source, Loader=CordisLoader)
    assert actual == expected
    assert type(actual) is type(expected)


def test_overlay_preserves_business_scalar_values_and_quoted_numeric_strings(tmp_path: Path):
    candidate = tmp_path / "candidate"
    _write_candidate(candidate, """
- id: acp-agent
  name: ./real-agent.mjs
  config:
    mode: on
    disabledTool: no
    date: 2026-09-06
    octal: 0o17
    leadingZero: 017
    exponent: 1e3
    literalExponent: '1e3'
    literalOctal: '0o17'
    flag: true
    empty: NULL
    persistenceRoot: !!js process.env.DSH_SESSION_ROOT
""".lstrip())
    rendered = render_runtime_config(candidate, gateway_provider="dsh-host", model="gpt-test")
    config = yaml.load(rendered, Loader=CordisLoader)[0]["config"]["patches"][0]["config"]
    assert config == {
        "mode": "on", "disabledTool": "no", "date": "2026-09-06", "octal": 15,
        "leadingZero": 17, "exponent": 1000.0, "literalExponent": "1e3", "literalOctal": "0o17",
        "flag": True, "empty": None, "persistenceRoot": JsExpression("process.env.DSH_SESSION_ROOT"),
        "provider": "dsh-host", "model": "gpt-test",
    }
    assert isinstance(config["persistenceRoot"], JsExpression)
    assert "literalExponent: '1e3'" in rendered
    assert "literalOctal: '0o17'" in rendered


@pytest.mark.parametrize("source", [".inf", "+.Inf", "-.INF", ".NaN"])
def test_explicit_json_schema_nonfinite_scalars_are_preserved(source: str):
    actual = yaml.load(source, Loader=CordisLoader)
    if "nan" in source.lower():
        assert math.isnan(actual)
    else:
        assert actual == (-math.inf if source.startswith("-") else math.inf)


@pytest.mark.parametrize("source", [
    "value: !!bool yes", "value: !!int 1:20", "value: !!timestamp 2026-09-06",
    "value: 9007199254740993", "value: 1e999", "true: value", "value: 1\nvalue: 2",
])
def test_unsupported_or_ambiguous_cordis_yaml_fails_closed(source: str):
    with pytest.raises((ValueError, yaml.constructor.ConstructorError)):
        yaml.load(source, Loader=CordisLoader)


def test_runtime_overlay_supports_real_json_config_without_yaml_scalar_coercion(tmp_path: Path):
    candidate = tmp_path / "candidate"
    candidate.mkdir()
    (candidate / "agent.json").write_text(json.dumps([
        {"id": "business-agent", "name": "./business.mjs", "config": {
            "mode": "on", "literal": "1e3", "enabled": True, "optional": None,
        }},
    ]))
    result = render_runtime_config(
        candidate, config_path="agent.json", agent_entry_id="business-agent",
        gateway_provider="dsh-host", model="gpt-test",
    )
    config = yaml.load(result, Loader=CordisLoader)[0]["config"]["patches"][0]["config"]
    assert config == {"mode": "on", "literal": "1e3", "enabled": True, "optional": None, "provider": "dsh-host", "model": "gpt-test"}


@pytest.mark.parametrize(("filename", "source", "message"), [
    ("agent.json", "- id: acp-agent\n  name: plugin\n", "not valid json"),
    ("agent.json", '[{"id":"acp-agent","name":"plugin","config":{"value":NaN}}]', "non-JSON constant"),
    ("agent.yml", "- id: acp-agent\n  config: [unterminated", "not valid yml"),
    ("agent.yaml", "- id: acp-agent\n  name: !!python/object:unknown {}", "not valid yaml"),
    ("agent.txt", "- id: acp-agent\n  name: plugin\n", "requires a .json, .yml, or .yaml"),
])
def test_runtime_overlay_parser_failures_are_actionable_value_errors(tmp_path: Path, filename, source, message):
    candidate = tmp_path / "candidate"
    candidate.mkdir()
    (candidate / filename).write_text(source)
    with pytest.raises(ValueError, match=message):
        render_runtime_config(candidate, config_path=filename, gateway_provider="dsh-host", model="gpt-test")


def test_nested_json_include_obeys_json_parser_and_reports_value_error(tmp_path: Path):
    candidate = tmp_path / "candidate"
    _write_candidate(candidate, """
- id: acp-agent
  name: ./agent.mjs
- id: extra-config
  name: cordis:include
  config: { path: ./extra.json }
""".lstrip())
    (candidate / "extra.json").write_text("- id: extra\n  name: ./tool.mjs\n")
    with pytest.raises(ValueError, match="not valid json"):
        render_runtime_config(candidate, gateway_provider="dsh-host", model="gpt-test")


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
