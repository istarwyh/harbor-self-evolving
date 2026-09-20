---
title: 19 Harbor Agent tools
linkTitle: 19 tools
weight: 10
description: Every Plugin tool, its input boundary, mutation/approval semantics, output evidence and intended next step.
verified_against_version: 0.9.7
source_refs: [packages/dsh-plugin/index.js, README.md]
---

The Plugin exposes **19 strict tools**: ten workspace/Job mutations enter DSH one-shot approval; nine operations are read-only or in-memory. If the Host lacks the approval seam, mutation tools fail closed.

| Tool | Purpose and minimum boundary | Mode / result |
|---|---|---|
| `harbor_candidate_snapshot` | Freeze one Cordis composition as an immutable Candidate Manifest. | **Writes local artifact · approval.** Next: Dataset/Stack doctor or Context preview. |
| `harbor_model_binding` | Read the current DSH default provider/model/reasoning identity. | **Read-only/in-memory.** Returns a non-secret binding draft; never credentials. |
| `harbor_evolution_init` | Compile an accepted Dataset/Generator/Evaluator/Optimizer card into a non-overwriting Stack project. | **Writes local artifacts · approval.** Does not run evaluation. |
| `harbor_evolution_doctor` | Validate Candidate, Dataset, Stack, optional Policy and execution architecture before cost. | **Read-only.** Returns blocking diagnostics. |
| `harbor_quick_diagnostic_init` | Create one Query, minimal Host-model Candidate, runnable Task and non-promotion Evaluator. | **Writes local artifacts · approval.** Wiring diagnostic only. |
| `harbor_session_diagnostic_preview` | Preview 1–10 recent completed top-level Sessions in exact current workspace. | **Read-only/in-memory.** Safe metadata + 15-minute owner-bound selection token. |
| `harbor_session_diagnostic_run` | Revalidate a selection token, freeze a private redacted Batch and run one Trial per Session. | **Starts evaluation · writes · approval.** Historical, Gate N/A. |
| `harbor_dataset_validate` | Validate manifest, Task uniqueness, instructions, paths, sensitive metadata and source digest. | **Read-only.** Does not repair or rewrite identity. |
| `harbor_context_preview` | Refresh Candidate manifest, preview Context v3 and find comparable baselines. | **Writes refreshed manifest · approval.** No Job. |
| `harbor_eval_run` | Run strict diagnostic or promotion-eligible Candidate Job with frozen identities. | **Starts evaluation · writes · approval.** Returns Job identity. |
| `harbor_eval_result` | Read summary, Job, Dataset, progress, Trial or governance view. | **Read-only.** Bounded, recursively redacted, explicitly untrusted envelope. |
| `harbor_resolve_page_context` | Resolve exact-session opaque `@harbor` page context and current revision. | **Read-only.** Returns narrow metadata, typed refs and navigation action. |
| `harbor_get_evidence` | Read one Evidence item through an exact typed ancestry ref. | **Read-only.** Never accepts a guessed path/id. |
| `harbor_propose_action` | Draft one expiring Workbench action from an explicit user request and fresh context. | **In-memory draft.** Never writes resources, starts a Job, Gates or deploys. |
| `harbor_evaluator_inspect` | Inspect active descriptor, implementation kind, ternary Criteria and bounded editable source. | **Read-only.** Secret/local-path-shaped source is omitted. |
| `harbor_evaluator_update` | Replace one allowlisted source with optimistic concurrency and new Evaluator/Stack versions. | **Writes local artifacts · approval.** No automatic evaluation or Gate. |
| `harbor_ground_truth_init` | Create a non-overwriting independent Ground Truth draft with explicit provenance. | **Writes local artifact · approval.** Human/programmatic/consensus/model/external. |
| `harbor_evaluator_meta_evaluate` | Compare repeated observations with independent GT and emit ESF/SCE/RCR. | **Writes report · approval.** Evaluator governance, not Candidate promotion. |
| `harbor_candidate_compare` | Apply deterministic Promotion Gate to comparable Baseline and Candidate Jobs under Policy. | **Writes Gate artifact · approval · promotion eligible.** Never deploys. |

## Badge meanings {#badges}

- **Read-only:** does not modify workspace evaluation state.
- **Writes local artifacts:** creates or versions files in the bounded Harbor workspace.
- **Starts evaluation:** can incur runner/Judge/model work after approval.
- **Promotion eligible:** produces evidence or decisions usable by a promotion policy; Historical and quick diagnostic paths do not.

Tool success means the declared operation completed—not that Candidate quality improved or production changed.
