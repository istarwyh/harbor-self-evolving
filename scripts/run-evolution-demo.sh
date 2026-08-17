#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
demo_dir="$(cd "$script_dir/.." && pwd)"
run_id="$(date +%Y%m%d-%H%M%S)"
baseline_job="candidate-v1-$run_id"
candidate_job="candidate-v2-$run_id"

"$script_dir/run-candidate.sh" v1 "$baseline_job"
"$script_dir/run-candidate.sh" v2 "$candidate_job"

PYTHONDONTWRITEBYTECODE=1 python3 "$script_dir/promotion-gate.py" \
  "$demo_dir/jobs/$baseline_job" \
  "$demo_dir/jobs/$candidate_job"
