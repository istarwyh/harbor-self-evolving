# dsh-harbor-evolution

Cordis bundle for evaluating immutable DeepSeek Harness Candidates with Harbor.

## Install

Install `harbor-dsh-evolution` into the same Python environment as Harbor, then add this bundle to the DSH profile you actually run. Use `web` for `dsh web`; use `headless` only for the command-line Agent:

```bash
uv venv .venv
uv pip install --python .venv/bin/python harbor-dsh-evolution
source .venv/bin/activate
pnpm dlx @deepseek-ai/dsh@0.1.0-rc.6 plugin --profile web add -w dsh-harbor-evolution@0.2.0
```

Restart DSH after installation. Launch it from the Agent workspace and expose the two Python executables to the DSH process:

```bash
cd /absolute/path/to/your-agent-workspace
HARBOR_BIN=/absolute/path/to/.venv/bin/harbor \
HARBOR_DSH_BIN=/absolute/path/to/.venv/bin/harbor-dsh \
pnpm dlx @deepseek-ai/dsh@0.1.0-rc.6 web
```

In the Web UI, search for the Cordis plugin id `harbor-evolution`. See the [complete local DSH Web quickstart](https://github.com/istarwyh/harbor-self-evolving/blob/main/docs/dsh-web-quickstart.md) for persistent configuration, a first evaluation, Candidate comparison, and troubleshooting.

For development from this repository:

```bash
./hse dsh-install web
```

`-w` is required because the DSH profile directory is its pnpm workspace root.

The bundle inserts one `harbor-evolution` entry and registers this project's model- and user-invocable Skill through the official DSH Skill Registry:

- `evolve-agent-with-harbor`

The Skill guides the Agent through workspace inspection, requirements clarification, safe initialization, baseline evaluation, evidence-based diagnosis, one controlled Candidate change, regression comparison, and a Promotion Gate recommendation. Invoke it explicitly from Web or TUI with:

```text
/evolve-agent-with-harbor
Inspect this workspace and help me clarify and initialize a stable Harbor self-evolution loop.
```

The Agent can also select it automatically when the request matches its catalog description. The Skill orchestrates four model-facing tools:

- `harbor_candidate_snapshot`
- `harbor_eval_run`
- `harbor_eval_result`
- `harbor_candidate_compare`

The shortest direct evaluation call needs only `candidatePath` and `datasetPath`. Candidate identity defaults to `package.json`, the Job name is generated automatically, and `harbor_eval_run` returns the completed evaluation summary directly. Prefer the Skill for a new project because it will not run or compare Jobs until the material evaluation contract is resolved.

The helper launches a fixed DSH version through `pnpm dlx`, so it does not conflict with a long-running `npx` DSH process. When installed from this monorepo, the bundle automatically discovers the sibling Python virtual environment created by `./hse dsh-install`. Otherwise it uses `HARBOR_BIN` / `HARBOR_DSH_BIN`, then falls back to `PATH`. Override the inserted entry in the profile's `cordis.patch.yml` when the binaries or Python source live elsewhere:

```yaml
- id: harbor-evolution
  config:
    projectRoot: /workspace/my-agent
    jobsDir: jobs
    harborBin: /workspace/venv/bin/harbor
    harborDshBin: /workspace/venv/bin/harbor-dsh
    pythonPath: ""
```

Keep `pythonPath` empty when using the published PyPI package. Set it only when developing the Python package from a source checkout.

This replaces the complete config for the entry, following DSH patch semantics.

The plugin never mutates the active DSH profile and never deploys a Candidate. Another system updates the Champion only after the external Promotion Gate passes.
