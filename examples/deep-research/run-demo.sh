#!/usr/bin/env bash

set -euo pipefail

example_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "$example_dir/../.." && pwd)"
python_src="$repo_dir/packages/harbor-plugin/src"
run_id="$(date +%Y%m%d-%H%M%S)"

harbor_command=()
if [[ -n "${HARBOR_BIN:-}" ]]; then
  harbor_command=("$HARBOR_BIN")
elif command -v harbor >/dev/null 2>&1; then
  harbor_command=("$(command -v harbor)")
elif command -v uvx >/dev/null 2>&1; then
  harbor_command=("$(command -v uvx)" harbor==0.21.0)
else
  echo "Harbor executable not found. Set HARBOR_BIN=/absolute/path/to/harbor." >&2
  exit 1
fi

if [[ "${#harbor_command[@]}" -eq 1 ]]; then
  python_bin="$(dirname "${harbor_command[0]}")/python"
else
  python_bin="$(command -v python3)"
fi
if [[ ! -x "$python_bin" ]]; then
  python_bin="$(command -v python3)"
fi

run_candidate() {
  local label="$1"
  local version="$2"
  local job_name="deep-research-$label-$run_id"
  local candidate_dir="$example_dir/candidates/$label"

  PYTHONPATH="$python_src${PYTHONPATH:+:$PYTHONPATH}" \
    "$python_bin" -m harbor_dsh_evolution.cli snapshot \
      "$candidate_dir" --id "deep-research-agent" --version "$version" >/dev/null

  local digest
  digest="$(PYTHONPATH="$python_src${PYTHONPATH:+:$PYTHONPATH}" "$python_bin" -c \
    'import json,sys; print(json.load(open(sys.argv[1]))["digest"])' \
    "$candidate_dir/candidate-manifest.json")"

  BUILDX_CONFIG="${TMPDIR:-/tmp}/harbor-self-evolving-buildx" \
  PYTHONDONTWRITEBYTECODE=1 \
  PYTHONPATH="$python_src${PYTHONPATH:+:$PYTHONPATH}" \
    "${harbor_command[@]}" run \
      -p "$example_dir/task" \
      -a harbor_dsh_evolution.agent:DshCandidateAgent \
      --ak "candidate_path=$candidate_dir" \
      --ak "candidate_version=$version" \
      --ak "candidate_digest=$digest" \
      --job-name "$job_name" \
      --jobs-dir "$repo_dir/jobs" \
      --plugin harbor_dsh_evolution.plugin:EvolutionPlugin \
      --plugin-kwarg "candidate_manifest=$candidate_dir/candidate-manifest.json" \
      --plugin-kwarg "dataset_path=$example_dir/task" \
      --plugin-kwarg "stack_path=$example_dir/.harbor/evaluation-stack.yml" \
      --plugin-kwarg "project_root=$repo_dir" \
      --plugin-kwarg "mode=promotion-eligible" \
      --plugin-kwarg "policy_path=$example_dir/promotion-policy.json" >&2

  printf '%s\n' "$repo_dir/jobs/$job_name"
}

PYTHONPATH="$python_src${PYTHONPATH:+:$PYTHONPATH}" \
  "$python_bin" -m harbor_dsh_evolution.cli dataset snapshot \
    "$example_dir/task" --id "deep-research-regression" --version "1.0.0" >/dev/null

baseline_job="$(run_candidate v1 1.0.0 | tail -n 1)"
candidate_job="$(run_candidate v2 2.0.0 | tail -n 1)"

PYTHONPATH="$python_src${PYTHONPATH:+:$PYTHONPATH}" \
  "$python_bin" -m harbor_dsh_evolution.cli promote \
    "$baseline_job" "$candidate_job" \
    --policy "$example_dir/promotion-policy.json"
