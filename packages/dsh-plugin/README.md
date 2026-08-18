# dsh-harbor-evolution

Installable DeepSeek Harness Plugin + Skill for running stable Harbor evaluation and controlled Agent evolution loops, with a native DSH Web dashboard.

The package gives DSH four deterministic Harbor tools, dedicated Tool cards, a Harbor conversation tab, an installation Doctor, and the model- and user-invocable `evolve-agent-with-harbor` Skill. The Skill clarifies the evaluation contract, initializes missing structures, establishes a baseline, diagnoses evidence, limits each iteration to one controlled Candidate change, runs regression evaluation, and produces a Promotion Gate recommendation.

## Install

Requirements: Docker, Node.js 22+, pnpm, and [uv](https://docs.astral.sh/uv/). Run this from the business Agent workspace:

```bash
npx --yes dsh-harbor-evolution@latest setup --project-root "$PWD"
```

The setup command installs both required runtimes:

- `harbor-dsh-evolution==0.4.0` in a managed Python environment.
- `dsh-harbor-evolution@0.4.0` in the selected DSH profile.

It then stores the absolute Harbor executable paths and `projectRoot` in the profile's `harbor-evolution` block and verifies the integration. Existing unrelated profile entries are preserved, and rerunning setup updates the same block.

The default profile is `web`. Use `--profile headless` only when that is the profile you actually run. See all options with:

```bash
npx --yes dsh-harbor-evolution@latest setup --help
```

Stop any old DSH process and run the exact restart command printed by setup. Then invoke:

```text
/evolve-agent-with-harbor
Inspect this workspace and help me clarify and initialize a stable Harbor self-evolution loop.
```

The Plugin registers:

- `harbor_candidate_snapshot`
- `harbor_eval_run`
- `harbor_eval_result`
- `harbor_candidate_compare`

In the `web` profile, the same package also registers:

- a `Harbor` conversation tab for recent Jobs, metrics, Candidate identity, and evaluation-context digests;
- four compact result cards for the Harbor Tool calls;
- a `Harbor Evolution` Settings section that checks the configured project, Jobs directory, and CLI paths.

The Web UI is intentionally read-only. Starting an evaluation or deciding promotion remains an explicit Agent + Skill workflow, so a page refresh can never launch an expensive Job.

The shortest direct evaluation call needs `candidatePath` and `datasetPath`. Prefer the Skill for a new project because it will not run or compare Jobs until the material evaluation contract is resolved.

## What setup writes

The selected profile receives one id-targeted override:

```yaml
- id: harbor-evolution
  config:
    projectRoot: /workspace/my-agent
    jobsDir: jobs
    harborBin: /managed/runtime/.venv/bin/harbor
    harborDshBin: /managed/runtime/.venv/bin/harbor-dsh
    pythonPath: ""
```

Keep `pythonPath` empty for the published Python package. `candidatePath`, `datasetPath`, `jobPath`, and `policyPath` are constrained to `projectRoot`.

For source development from the repository:

```bash
./hse dsh-install-source web
```

Do not use `dsh plugin add ./packages/dsh-plugin` directly from a fresh checkout. pnpm records a `link:` dependency, and Node resolves imports from the real checkout path. The source installer first runs the package's locked `npm ci`, builds the portable Web client with its embedded ocean artwork, then links it and installs the local Python Adapter. Normal users should always use the registry-backed setup command above.

See the [complete DSH Web quickstart](https://github.com/istarwyh/harbor-self-evolving/blob/main/docs/dsh-web-quickstart.md) for UI verification, first evaluation, Candidate comparison, and troubleshooting.

The Plugin never deploys a Candidate or mutates the active Champion. Existing CI/CD remains responsible for building, deploying, and promoting the exact evaluated artifact.
