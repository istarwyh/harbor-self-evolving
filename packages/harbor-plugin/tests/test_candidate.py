import json
from pathlib import Path

import pytest

from harbor_dsh_evolution.candidate import (
    CandidateManifest,
    compute_candidate,
    snapshot_candidate,
    verify_candidate,
)
from harbor_dsh_evolution.agent import _responses_environment


def make_candidate(tmp_path: Path) -> Path:
    candidate = tmp_path / "candidate"
    candidate.mkdir()
    (candidate / "cordis.yml").write_text("- name: example\n")
    (candidate / "package.json").write_text('{"name":"candidate"}\n')
    (candidate / "package-lock.json").write_text(
        '{"name":"candidate","lockfileVersion":3}\n'
    )
    (candidate / "plugin.mjs").write_text("export const name = 'example'\n")
    return candidate


def test_snapshot_is_stable_and_ignores_manifest(tmp_path: Path):
    candidate = make_candidate(tmp_path)
    first = snapshot_candidate(candidate, candidate_id="demo", version="1.0.0")
    second = snapshot_candidate(candidate, candidate_id="demo", version="1.0.0")
    assert first.digest == second.digest
    assert verify_candidate(candidate).digest == first.digest


def test_snapshot_derives_identity_from_package_json(tmp_path: Path):
    candidate = make_candidate(tmp_path)
    (candidate / "package.json").write_text(
        '{"name":"business-agent","version":"2.1.0"}\n'
    )
    manifest = snapshot_candidate(candidate)
    assert manifest.candidate_id == "business-agent"
    assert manifest.version == "2.1.0"


def test_verify_detects_candidate_mutation(tmp_path: Path):
    candidate = make_candidate(tmp_path)
    snapshot_candidate(candidate, candidate_id="demo", version="1.0.0")
    (candidate / "plugin.mjs").write_text("export const name = 'changed'\n")
    with pytest.raises(ValueError, match="digest mismatch"):
        verify_candidate(candidate)


def test_manifest_contains_no_secret_values(tmp_path: Path):
    candidate = make_candidate(tmp_path)
    manifest = snapshot_candidate(candidate, candidate_id="demo", version="1.0.0")
    payload = json.dumps(manifest.to_dict())
    assert "candidate-manifest.json" not in [item.path for item in manifest.files]
    assert str(candidate) not in payload


def test_snapshot_requires_lockfile_and_rejects_credential_files(tmp_path: Path):
    candidate = make_candidate(tmp_path)
    (candidate / "package-lock.json").unlink()
    with pytest.raises(ValueError, match="lockfile"):
        snapshot_candidate(candidate, candidate_id="demo", version="1.0.0")
    (candidate / "package-lock.json").write_text(
        '{"name":"candidate","lockfileVersion":3}\n'
    )
    (candidate / ".env.production").write_text("TOKEN=do-not-store\n")
    with pytest.raises(ValueError, match="credential-bearing"):
        snapshot_candidate(candidate, candidate_id="demo", version="1.0.0")


def test_digest_matches_cross_language_test_vector(tmp_path: Path):
    candidate = tmp_path / "candidate"
    candidate.mkdir()
    (candidate / "cordis.yml").write_text("- name: example\n")
    (candidate / "package.json").write_text('{"name":"candidate"}\n')
    (candidate / "插件.mjs").write_text("export const name = 'example'\n")
    digest, _ = compute_candidate(candidate)
    assert digest == "sha256:870d96928d1d3ae7617c1ead379c258c8b4fe3607ee34010206a42f8dd332ebf"


def test_rejects_unknown_manifest_schema():
    with pytest.raises(ValueError, match="schema_version"):
        CandidateManifest.from_dict(
            {
                "schema_version": 2,
                "candidate_id": "demo",
                "version": "1.0.0",
                "digest": "sha256:" + "0" * 64,
                "created_at": "2026-01-01T00:00:00Z",
                "runtime": {},
                "files": [],
                "metadata": {},
            }
        )


def test_responses_environment_only_injects_runtime_credential(monkeypatch):
    monkeypatch.delenv("HSE_DEMO_LLM_API_KEY", raising=False)
    assert _responses_environment() == {}

    monkeypatch.setenv("HSE_DEMO_LLM_API_KEY", "test-key")
    assert _responses_environment() == {
        "HSE_RESPONSES_API_KEY_FILE": "/run/secrets/hse-responses-api-key",
    }
    assert "test-key" not in json.dumps(_responses_environment())
