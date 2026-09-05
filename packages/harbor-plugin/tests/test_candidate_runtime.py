import copy
import hashlib
import json
from pathlib import Path

import pytest

from harbor_dsh_evolution.candidate import compute_candidate, snapshot_candidate
from harbor_dsh_evolution.candidate_runtime import load_candidate_runtime


CONTRACT = json.loads(
    (Path(__file__).parents[2] / "dsh-plugin/test/fixtures/candidate-runtime-contract.json").read_text(encoding="utf-8")
)


def write_json(root: Path, filename: str, value):
    (root / filename).write_text(json.dumps(value), encoding="utf-8")


def make_runtime(root: Path, data=None) -> Path:
    data = copy.deepcopy(data or CONTRACT)
    root.mkdir(parents=True, exist_ok=True)
    for filename, content in data["source_files"].items():
        destination = root / filename
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(content, encoding="utf-8")
    write_json(root, "candidate-runtime.json", data["descriptor"])
    write_json(root, "package.json", data["package"])
    write_json(root, "package-lock.json", data["lock"])
    return root


@pytest.mark.parametrize("vector", CONTRACT["cases"], ids=lambda vector: vector["name"])
def test_shared_node_python_contract_vectors(tmp_path: Path, vector):
    data = copy.deepcopy(CONTRACT)
    targets = {
        "descriptor": data["descriptor"],
        "package": data["package"],
        "lock": data["lock"],
        "root": data["lock"]["packages"][""],
    }
    if vector["target"] == "extra":
        targets["extra"] = copy.deepcopy(data["lock"]["packages"]["node_modules/runtime"])
        data["lock"]["packages"]["node_modules/extra"] = targets["extra"]
    targets[vector["target"]].update(vector["patch"])
    candidate = make_runtime(tmp_path, data)
    if vector["valid"]:
        assert load_candidate_runtime(candidate, required=True)["policy"] == "candidate-locked"
    else:
        with pytest.raises(ValueError, match="CANDIDATE_RUNTIME_INVALID"):
            load_candidate_runtime(candidate, required=True)


def test_runtime_owned_metadata_and_alternate_config_are_source_digested(tmp_path: Path):
    candidate = make_runtime(tmp_path)
    runtime = load_candidate_runtime(candidate, required=True)
    assert runtime == {
        "kind": "deepseek-harness", "policy": "candidate-locked", "transport": "acp",
        "descriptor": "candidate-runtime.json", "entrypoint": "run-acp.mjs", "config_path": "config/agent.yml",
        "agent_entry_id": "business-agent", "node_version": "22.22.2", "lockfile": "package-lock.json",
        **{
            key: "sha256:" + hashlib.sha256((candidate / filename).read_bytes()).hexdigest()
            for key, filename in (
                ("descriptor_digest", "candidate-runtime.json"),
                ("entrypoint_digest", "run-acp.mjs"),
                ("lockfile_digest", "package-lock.json"),
            )
        },
    }
    snapshot = snapshot_candidate(candidate)
    assert snapshot.runtime == runtime
    assert {"candidate-runtime.json", "config/agent.yml", "run-acp.mjs", "package-lock.json"} <= {
        item.path for item in snapshot.files
    }
    (candidate / "run-acp.mjs").write_text("export const ownedRuntime = false\n")
    assert load_candidate_runtime(candidate)["entrypoint_digest"] != runtime["entrypoint_digest"]
    assert compute_candidate(candidate)[0] != snapshot.digest


def test_legacy_candidate_read_does_not_bind_a_default_runtime(tmp_path: Path):
    candidate = make_runtime(tmp_path)
    (candidate / "candidate-runtime.json").unlink()
    before = compute_candidate(candidate)
    assert load_candidate_runtime(candidate) == {"kind": "deepseek-harness", "policy": "unbound", "transport": "acp"}
    with pytest.raises(ValueError, match="CANDIDATE_RUNTIME_UNBOUND.*fresh baseline"):
        load_candidate_runtime(candidate, required=True)
    assert compute_candidate(candidate) == before


@pytest.mark.parametrize("filename", ["candidate-runtime.json", "run-acp.mjs", "config/agent.yml", "package.json", "package-lock.json"])
def test_runtime_files_cannot_be_symlinks(tmp_path: Path, filename: str):
    candidate = make_runtime(tmp_path)
    source = candidate / filename
    destination = candidate / "other-source"
    destination.write_bytes(source.read_bytes())
    source.unlink()
    source.symlink_to(destination)
    with pytest.raises(ValueError, match="symlinks"):
        load_candidate_runtime(candidate)


def test_runtime_config_cannot_traverse_a_symlink(tmp_path: Path):
    candidate = make_runtime(tmp_path)
    (candidate / "config-link").symlink_to(candidate / "config", target_is_directory=True)
    descriptor = {**CONTRACT["descriptor"], "config_path": "config-link/agent.yml"}
    write_json(candidate, "candidate-runtime.json", descriptor)
    with pytest.raises(ValueError, match="symlinks"):
        load_candidate_runtime(candidate)


@pytest.mark.parametrize("relative", [" run-acp.mjs", "run-acp.mjs ", "./run-acp.mjs", "config//agent.yml", "config/../run-acp.mjs", "C:\\run-acp.mjs", "config:agent.yml", "a" * 1025])
def test_unsafe_source_paths_are_rejected(tmp_path: Path, relative: str):
    candidate = make_runtime(tmp_path)
    write_json(candidate, "candidate-runtime.json", {**CONTRACT["descriptor"], "entrypoint": relative})
    with pytest.raises(ValueError, match="safe Candidate-relative"):
        load_candidate_runtime(candidate)


@pytest.mark.parametrize("location", ["node_modules/.git/runtime", "node_modules/.harbor-runtime/runtime", "node_modules/../runtime", "node_modules/runtime\n", "packages/runtime"])
def test_lockfile_rejects_reserved_or_unsafe_package_locations(tmp_path: Path, location: str):
    data = copy.deepcopy(CONTRACT)
    data["lock"]["packages"][location] = copy.deepcopy(data["lock"]["packages"]["node_modules/runtime"])
    candidate = make_runtime(tmp_path, data)
    with pytest.raises(ValueError, match="registry packages"):
        load_candidate_runtime(candidate)


@pytest.mark.parametrize("kind", ["dependencies", "optionalDependencies", "devDependencies", "peerDependencies"])
@pytest.mark.parametrize("invalid", [None, [], "1.2.3", {"runtime": "latest"}])
def test_all_root_dependency_maps_must_be_exact_objects(tmp_path: Path, kind, invalid):
    data = copy.deepcopy(CONTRACT)
    data["package"][kind] = invalid
    data["lock"]["packages"][""][kind] = invalid
    candidate = make_runtime(tmp_path, data)
    with pytest.raises(ValueError, match="root .*must"):
        load_candidate_runtime(candidate)


@pytest.mark.parametrize("kind", ["dependencies", "optionalDependencies", "devDependencies", "peerDependencies"])
def test_every_direct_dependency_requires_an_exact_installed_lock_record(tmp_path: Path, kind):
    data = copy.deepcopy(CONTRACT)
    data["package"][kind] = {"missing": "1.2.3"}
    data["lock"]["packages"][""][kind] = {"missing": "1.2.3"}
    candidate = make_runtime(tmp_path, data)
    with pytest.raises(ValueError, match="dependency must resolve to its exact locked version"):
        load_candidate_runtime(candidate)


@pytest.mark.parametrize("version", ["1.2.3-01", "1.2.3-alpha.01", "1٢.2.3", "1.٢.3", "v1.2.3", "1.2.3\n"])
def test_semver_syntax_matches_node_ascii_and_prerelease_rules(tmp_path: Path, version):
    data = copy.deepcopy(CONTRACT)
    data["lock"]["packages"]["node_modules/extra"] = {**data["lock"]["packages"]["node_modules/runtime"], "version": version}
    candidate = make_runtime(tmp_path, data)
    with pytest.raises(ValueError, match="exact version"):
        load_candidate_runtime(candidate)


@pytest.mark.parametrize("content", [b'{"schema_version":NaN}', b'{"schema_version":Infinity}', b'{"x":"\xff"}', b"[1]", b"{" ])
def test_metadata_is_strict_utf8_json(tmp_path: Path, content: bytes):
    candidate = make_runtime(tmp_path)
    (candidate / "candidate-runtime.json").write_bytes(content)
    with pytest.raises(ValueError, match="CANDIDATE_RUNTIME_INVALID"):
        load_candidate_runtime(candidate)


def test_metadata_size_is_bounded(tmp_path: Path):
    candidate = make_runtime(tmp_path)
    (candidate / "candidate-runtime.json").write_bytes(b" " * (4 * 1024 * 1024 + 1))
    with pytest.raises(ValueError, match="metadata size limit"):
        load_candidate_runtime(candidate)
