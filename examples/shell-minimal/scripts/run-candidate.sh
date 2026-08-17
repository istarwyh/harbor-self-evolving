#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
demo_dir="$(cd "$script_dir/.." && pwd)"
repo_dir="$(cd "$demo_dir/../.." && pwd)"
candidate_label="${1:-}"

case "$candidate_label" in
  v1)
    candidate_version="1.0.0"
    ;;
  v2)
    candidate_version="2.0.0"
    ;;
  *)
    echo "Usage: $0 <v1|v2> [job-name]" >&2
    exit 2
    ;;
esac

candidate_path="$demo_dir/candidates/$candidate_label/run.sh"
candidate_sha="$(shasum -a 256 "$candidate_path" | awk '{print $1}')"
candidate_digest="sha256:$candidate_sha"
job_name="${2:-candidate-$candidate_label-$(date +%Y%m%d-%H%M%S)}"

harbor_command=()
if [[ -n "${HARBOR_BIN:-}" ]]; then
  harbor_command=("$HARBOR_BIN")
elif command -v harbor >/dev/null 2>&1; then
  harbor_command=("$(command -v harbor)")
elif command -v uvx >/dev/null 2>&1; then
  harbor_command=("$(command -v uvx)" harbor)
else
  for cached_harbor in "$HOME"/.cache/uv/archive-v0/*/bin/harbor; do
    if [[ -x "$cached_harbor" ]] && [[ "$($cached_harbor --version 2>/dev/null)" == "0.21.0" ]]; then
      harbor_command=("$cached_harbor")
      break
    fi
  done
fi

if [[ "${#harbor_command[@]}" -eq 0 ]]; then
  echo "Harbor executable not found. Set HARBOR_BIN=/absolute/path/to/harbor." >&2
  exit 1
fi

printf 'Candidate: %s\n' "$candidate_label"
printf 'Version:   %s\n' "$candidate_version"
printf 'Digest:    %s\n' "$candidate_digest"
printf 'Job:       %s\n' "$job_name"

BUILDX_CONFIG="${TMPDIR:-/tmp}/harbor-minimal-demo-buildx" \
PYTHONDONTWRITEBYTECODE=1 \
PYTHONPATH="$script_dir${PYTHONPATH:+:$PYTHONPATH}" \
  "${harbor_command[@]}" run \
    -p "$demo_dir/task" \
    -a candidate_agent:CandidateAgent \
    --ak "candidate_path=$candidate_path" \
    --ak "candidate_version=$candidate_version" \
    --ak "candidate_digest=$candidate_digest" \
    --job-name "$job_name" \
    --jobs-dir "$repo_dir/jobs"

printf 'Job directory: %s\n' "$repo_dir/jobs/$job_name"
