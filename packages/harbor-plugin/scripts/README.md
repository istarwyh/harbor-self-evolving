# Keyless real ACP verification

Run against an explicitly chosen, already-built DSH source checkout:

```sh
node packages/harbor-plugin/scripts/verify-candidate-acp.mjs \
  --dsh-checkout /absolute/path/to/xiaohui-harness
```

Use `--python /absolute/path/to/python` for a Python environment containing the
Adapter dependencies. The default is `packages/harbor-plugin/.venv/bin/python`.
`--keep` retains the isolated temporary fixture for inspection; it contains only
a test Broker capability, never Host credentials. The default removes its own
temporary directory after closing its process and Broker.

The script creates a Candidate-owned entrypoint, non-default config filename,
and non-default ACP entry ID. It mounts the real DSH core registries, Agent Loop,
JSONL persistence, checkpointing, and ACP transport directly. Neither demo
application package is part of this composition. Its Candidate-owned ordered
lifecycle quiesces ACP before checkpointing, persistence, and the core detach;
both completed and cancelled turns must reach the persisted end boundary.
It uses Python's production
`render_runtime_config` and the production `llm_gateway.mjs` and Host Broker.
Only `ctx.llm.stream` is a deterministic fixture; no provider adapter, user
settings, `.env`, or Host credential is loaded.

It verifies zero model requests before `session/prompt`, one completed controlled
request, persona and user-message preservation, real ACP assistant output,
controlled request cancellation and Host abort, JSON-RPC-only stdout, durable
session events, and clean EOF disposal. All phases have deadlines.

This check uses temporary links to existing built DSH packages. It does **not**
prove a portable npm lockfile install, a Linux container image, a real provider
response, business-task quality, or the 12-Trial product acceptance. Those remain
separate gates; do not publish this local linked fixture as a Candidate artifact.

## Actual Python adapter and Linux Docker

After explicitly building the shipped `runtime_template/Dockerfile` into a local
image, run:

```sh
node packages/harbor-plugin/scripts/verify-candidate-docker.mjs \
  --image harbor-acp-contract:verify-20260906
```

This second check uses the real `DockerEnvironment`, `DshCandidateAgent.setup`,
and `DshCandidateAgent.run`, including a fresh production `npm ci`, guarded ACP
readiness, the actual Harbor Python ACP runner, ATIF conversion, Candidate
identity, and persisted session logs. Installation accesses the public registry;
the only model response is a local controlled Host Broker stream. The driver
waits for its parent to verify zero setup requests before sending one prompt.
It uses a random owned Compose project, removes only that project's containers
and network, and preserves the supplied image. Evidence remains under the
printed temporary directory. It neither builds nor publishes an image, and
requires an existing local Docker Unix-socket context.

Verified on 2026-09-06 with **Linux arm64**, Node `22.22.2`, Python ACP SDK
`0.12.1`, and image ID
`sha256:90a4c8e2ec90da6384537676b148cac4dc1ae7540486fb715a14a98888ec09ad`:
fresh locked npm installation and real adapter readiness passed with **0** model
requests; the real adapter run used **1 controlled** request, returned
`HARBOR_ACP_OK`, produced a two-step ATIF trajectory and a persisted completed
turn, and left no owned container or network. The image was preserved. This is
not a Linux amd64 result, a real-provider test, or evidence of business-task
quality / 12-Trial acceptance.
