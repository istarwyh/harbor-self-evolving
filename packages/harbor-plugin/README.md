# harbor-dsh-evolution

Harbor-side integration for DeepSeek Harness Candidate evolution.

It provides:

- `DshCandidateAgent`: verifies and uploads an immutable Candidate, installs its locked npm dependencies, and runs it through Harbor's ACP runner.
- `EvolutionPlugin`: records Candidate identity, evaluation-context identity, Trial events, and `evaluation-summary.json` for each Job.
- `harbor-dsh`: snapshots/verifies Candidates, fingerprints datasets, summarizes Jobs, and runs the deterministic Promotion Gate.

Development install:

```bash
uv sync
uv run harbor plugins list
uv run harbor-dsh --help
uv run harbor-dsh context ../../examples/deep-research/task
uv run pytest
uv build
```

Harbor and this package must be installed into the same Python environment for the `dsh-evolution` entry point to appear in `harbor plugins list`.

`snapshot` derives Candidate id and version from `package.json` unless they are explicitly supplied. Promotion rejects Jobs whose `evaluation-context` digests are missing or different.
