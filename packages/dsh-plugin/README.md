# dsh-harbor-evolution

Cordis bundle for evaluating immutable DeepSeek Harness Candidates with Harbor.

## Install

Install `harbor-dsh-evolution` into the same Python environment as Harbor, then add this bundle to the DSH profile:

```bash
uv venv .venv
uv pip install --python .venv/bin/python harbor-dsh-evolution
source .venv/bin/activate
pnpm dlx @deepseek-ai/dsh@0.1.0-rc.6 plugin --profile headless add dsh-harbor-evolution
```

For development from this repository:

```bash
./hse dsh-install headless
```

`-w` is required by pnpm when the DSH profile directory is its workspace root.

The bundle inserts one `harbor-evolution` entry and registers four model-facing tools:

- `harbor_candidate_snapshot`
- `harbor_eval_run`
- `harbor_eval_result`
- `harbor_candidate_compare`

The shortest evaluation call needs only `candidatePath` and `datasetPath`. Candidate identity defaults to `package.json`, the Job name is generated automatically, and `harbor_eval_run` returns the completed evaluation summary directly.

The helper launches a fixed DSH version through `pnpm dlx`, so it does not conflict with a long-running `npx` DSH process. When installed from this monorepo, the bundle automatically discovers the sibling Python virtual environment created by `./hse dsh-install`. Otherwise it uses `HARBOR_BIN` / `HARBOR_DSH_BIN`, then falls back to `PATH`. Override the inserted entry in the profile's `cordis.patch.yml` when the binaries or Python source live elsewhere:

```yaml
- id: harbor-evolution
  config:
    projectRoot: /workspace/my-agent
    jobsDir: jobs
    harborBin: /workspace/venv/bin/harbor
    harborDshBin: /workspace/venv/bin/harbor-dsh
    pythonPath: /workspace/harbor-self-evolving/packages/harbor-plugin/src
```

This replaces the complete config for the entry, following DSH patch semantics.

The plugin never mutates the active DSH profile and never deploys a Candidate. Another system updates the Champion only after the external Promotion Gate passes.
