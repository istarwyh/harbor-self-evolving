#!/usr/bin/env bash

set -euo pipefail

example_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "$example_dir/../.." && pwd)"
python_src="$repo_dir/packages/harbor-plugin/src"
run_id="$(date +%Y%m%d-%H%M%S)"
llm_api_key="${HSE_DEMO_LLM_API_KEY:-sk-local-gemini}"

harbor_command=()
if [[ -n "${HARBOR_BIN:-}" ]]; then
  harbor_command=("$HARBOR_BIN")
elif command -v harbor >/dev/null 2>&1; then
  harbor_command=("$(command -v harbor)")
elif [[ -x "$repo_dir/packages/harbor-plugin/.venv/bin/harbor" ]]; then
  harbor_command=("$repo_dir/packages/harbor-plugin/.venv/bin/harbor")
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

generator_config="$example_dir/candidates/v2/generator-config.json"
llm_container_url="$("$python_bin" -c \
  'import json,sys; print(json.load(open(sys.argv[1]))["responses_url"])' \
  "$generator_config")"
llm_model="$("$python_bin" -c \
  'import json,sys; print(json.load(open(sys.argv[1]))["model"])' \
  "$generator_config")"
llm_host_url="${HSE_DEMO_LLM_URL:-${llm_container_url/host.docker.internal/127.0.0.1}}"

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
  HSE_DEMO_LLM_API_KEY="$llm_api_key" \
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
      --n-concurrent 4 \
      --plugin harbor_dsh_evolution.plugin:EvolutionPlugin \
      --plugin-kwarg "candidate_manifest=$candidate_dir/candidate-manifest.json" \
      --plugin-kwarg "dataset_path=$example_dir/task" \
      --plugin-kwarg "stack_path=$example_dir/.harbor/evaluation-stack.yml" \
      --plugin-kwarg "project_root=$repo_dir" \
      --plugin-kwarg "mode=promotion-eligible" \
      --plugin-kwarg "policy_path=$example_dir/promotion-policy.json" >&2

  printf '%s\n' "$repo_dir/jobs/$job_name"
}

active_evaluator="$({
  PYTHONPATH="$python_src${PYTHONPATH:+:$PYTHONPATH}" \
    "$python_bin" -m harbor_dsh_evolution.cli evaluator inspect \
      --project-root "$repo_dir" \
      --stack "$example_dir/.harbor/evaluation-stack.yml"
} | "$python_bin" -c 'import json,sys; print(json.load(sys.stdin)["evaluator"]["implementation"]["path"])')"

"$python_bin" "$example_dir/materialize-dataset.py" --evaluator "$repo_dir/$active_evaluator" >/dev/null

PYTHONPATH="$python_src${PYTHONPATH:+:$PYTHONPATH}" \
  "$python_bin" -m harbor_dsh_evolution.cli dataset snapshot \
  "$example_dir/task" --id "deep-research-regression" --version "4.0.0" >/dev/null

curl -fsS --max-time 10 -o /dev/null \
  -X POST "$llm_host_url" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $llm_api_key" \
  --data "{\"model\":\"$llm_model\",\"stream\":false,\"input\":\"Reply with OK.\",\"max_output_tokens\":16}" || {
    echo "Responses API is unavailable at $llm_host_url." >&2
    echo "Set HSE_DEMO_LLM_URL and HSE_DEMO_LLM_API_KEY, then retry." >&2
    exit 1
  }

baseline_job="$(run_candidate v1 1.3.0 | tail -n 1)"
candidate_job="$(run_candidate v2 2.3.0 | tail -n 1)"

PYTHONPATH="$python_src${PYTHONPATH:+:$PYTHONPATH}" \
  "$python_bin" -m harbor_dsh_evolution.cli promote \
    "$baseline_job" "$candidate_job" \
    --policy "$example_dir/promotion-policy.json"
