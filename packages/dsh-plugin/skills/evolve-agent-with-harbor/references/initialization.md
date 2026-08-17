# Initialization Reference

Load this reference only when the user needs a new Harbor self-evolution workspace or is missing one of the required contracts.

## Readiness checklist

Confirm these prerequisites before the first Job:

- Docker is available to Harbor.
- Node.js 22+, the selected DSH version, `harbor`, and `harbor-dsh` are available to the DSH process.
- `projectRoot` is the intended workspace security boundary.
- Candidate, Dataset, Job, and Promotion Policy paths stay within `projectRoot`.
- Runtime credentials use evaluation accounts and are not stored in Candidate files.

## Clarification worksheet

Use known repository evidence first. Ask the user only for unresolved choices.

| Contract field | Example | Why it matters |
| --- | --- | --- |
| Target behavior | Produce cited research answers | Defines task success |
| Candidate identity | `deep-research-agent` | Keeps v1/v2 in one product line |
| Candidate path | `candidates/deep-research/v1` | Defines what is snapshotted |
| Dataset path | `datasets/deep-research-regression` | Fixes tasks and Verifier |
| Primary metric | `reward` | Ranks Candidates |
| Minimums | completion and citation >= 0.95 | Prevents unsafe tradeoffs |
| Non-regression | tool success, latency | Protects existing capability |
| Mutation surface | prompt and search plugin only | Controls causal attribution |
| Repeat policy | 5 fixed-seed runs | Controls stochastic variance |
| Promotion owner | CI gate plus human approval | Keeps deployment external |

## Recommended layout

```text
agent-workspace/
├── candidates/
│   └── <agent-id>/
│       ├── v1/
│       │   ├── cordis.yml
│       │   ├── package.json
│       │   ├── package-lock.json
│       │   └── business plugins...
│       └── v2/
├── datasets/
│   └── <suite>/
│       ├── task.toml
│       ├── instruction.md
│       ├── environment/Dockerfile
│       └── tests/
│           ├── test.sh
│           └── verifier files...
├── policies/
│   └── <suite>.json
└── jobs/
```

Generate `candidate-manifest.json` with `harbor_candidate_snapshot`; do not hand-author it. One immutable Candidate may be evaluated by many Jobs.

## Candidate rules

A Candidate is the complete DSH/Cordis composition required to reproduce behavior:

- `package.json` supplies the default Candidate id and version.
- `cordis.yml` composes the model, tools, skills, loop, storage, and business plugins.
- A lockfile pins transitive runtime dependencies.
- Local plugin files and prompts belong in the Candidate and therefore affect its digest.
- Secrets, mutable session state, Jobs, and production deployment configuration do not belong in the Candidate.

Copy an existing known-good Candidate when possible. If none exists, create the smallest valid DSH composition for the actual business Agent; do not invent a model provider or credential scheme.

## Dataset and Verifier rules

A Harbor Dataset contains one or more fixed Tasks. Each Task should define:

- `task.toml`: Task identity, timeouts, environment, and Harbor contract.
- `instruction.md`: the behavior requested from the Candidate.
- `environment/Dockerfile`: a reproducible sandbox with required runtime dependencies.
- `tests/test.sh`: the verifier entrypoint.
- Verifier code that writes primary and diagnostic metrics to Harbor's reward output.

For a research Agent, useful diagnostic metrics include task completion, tool-call success, valid-search rate, citation correctness, latency, and cost. Keep their exact definitions in version control. Do not convert tool errors, empty searches, or invalid citations into prose-only observations; expose them as metrics or structured failure evidence.

## Promotion Policy starter

Create this only after the user accepts the metric names and thresholds:

```json
{
  "schema_version": 1,
  "primary_metric": "reward",
  "min_improvement": 0.05,
  "minimums": {
    "task_completion": 0.95
  },
  "non_regression": [
    "tool_call_success",
    "citation_correctness"
  ],
  "non_regression_tolerance": 0.0
}
```

This is a structural example, not a universal default. Thresholds must reflect business risk and sample size. Version the policy; changing it invalidates comparisons made under the old promotion contract.

## First-cycle handoff

Before calling an evaluation tool, show the user:

1. The resolved Candidate, Dataset, Job, and policy paths.
2. The metric and promotion contract.
3. The mutation and side-effect boundaries.
4. Any assumptions still being used.

Then snapshot and run the baseline. Do not initialize v2 until baseline evidence identifies a concrete hypothesis.
