# dsh-harbor-evolution

Cordis bundle for evaluating immutable DeepSeek Harness Candidates with Harbor.

## Install from this checkout

```bash
npx @deepseek-ai/dsh@0.1.0-rc.6 plugin \
  --profile headless add -w ./packages/dsh-plugin
```

`-w` is required by pnpm when the DSH profile directory is its workspace root.

The bundle inserts one `harbor-evolution` entry and registers four model-facing tools:

- `harbor_candidate_snapshot`
- `harbor_eval_run`
- `harbor_eval_result`
- `harbor_candidate_compare`

Default config assumes `harbor` and `harbor-dsh` are on `PATH`. Override the inserted entry in the profile's `cordis.patch.yml` when the binaries or Python source live elsewhere:

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
