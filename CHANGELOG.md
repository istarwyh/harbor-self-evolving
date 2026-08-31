# Changelog

All notable changes to this project are documented in this file.

## 0.8.2 - 2026-08-31

- Add a product-first `Evaluate recent Sessions` Workbench launcher with safe Preview, explicit confirmation, background execution, refresh recovery, actionable errors, and automatic Job opening.
- Keep owner-bound Session selection tokens entirely on the Host; the browser receives only an opaque Preview id, duplicate confirmation is idempotent, and Candidate/Gate/meta-evaluation boundaries remain explicit.

## 0.8.1 - 2026-08-30

- Align the repository, npm package, Python Adapter, coding-agent installation instructions, and user guides on the 0.8 Historical Session workflow, sixteen DSH tools, and both Harbor plugin entry points.
- Add practical Preview/confirmation, privacy/retention, `completed-unscored`, error-recovery, and mixed-architecture Python installation guidance for Historical Generation Evaluation.
- Add a documentation consistency test so future releases cannot silently regress the current version, tool count, dual-plugin verification, or Historical semantics across public documentation surfaces.

## 0.8.0 - 2026-08-30

- Add Historical Generation Evaluation as a first-class `observe-existing` path: the bundled Skill previews up to ten recent completed DSH Sessions from the exact Agent workspace, asks for confirmation, and evaluates one immutable Session per Harbor Trial without rerunning or promoting a Candidate.
- Add privacy-preserving Session selection and materialization with owner-bound expiring tokens, raw Session-id canaries, transcript/tool/feedback redaction, exact source-digest revalidation, effective Agent Preset provenance, symlink-safe private storage, and explicit local retention warnings.
- Add the `dsh-historical-evaluation` Harbor plugin, deterministic Session Observation Agent, immutable Historical Batch/Dataset/Stack materialization, Evaluator v2 applicability and coverage semantics, and the normal `completed-unscored` terminal state for evidence-based abstention.
- Freeze and attest the actual Host Judge provider, model, reasoning effort, protocol, Job and Batch binding before scoring; disclose same-model diagnostic coupling and keep the short-lived Broker capability out of arguments and artifacts.
- Add Historical Summary v4 plus validated Trial assessments, Population/Diagnosis/Optimization reports, strict completion sentinels, resume-safe lifecycle recovery, missing-Trial cardinality checks, non-promotable Gate behavior, and Workbench views for generation provenance, Trial/Criterion coverage and Evaluator meta-evaluation `not-run` status.
- Validate the complete real Session Query → Preview → confirmation → Harbor/Docker → Host Judge → Summary/Workbench path. The real run also removed a non-portable default `temperature` argument rejected by `openai-codex` and now leaves Provider-specific parameters unset unless explicitly supported.

## 0.7.3 - 2026-08-25

- Make `projectRoot` visible and hot-reloadable in Settings, return path-containment errors with the active root and concrete repair guidance, and reject a different existing Stack identity with `STACK_ALREADY_EXISTS_DIFFERENT_ID` while supporting namespaced `workspaceSubdir` projects.
- Validate Dataset task resolution through Harbor's runtime parser, generate Harbor 1.4 Task templates, align Summary validity with `evaluation-result.json`, and add Docker/ACP preflight plus redacted failure tails with actionable error codes.
- Add a permanently non-promotable Quick Diagnostic scaffold for first-run wiring checks, including Doctor and Gate enforcement of its diagnostic-only identity.
- Check the npm registry from the Host only when Harbor Settings opens, cache successful checks, and show installed/latest versions plus an exact copyable update command without silently changing the user's DSH profile. Registry failures stay non-blocking and separate from installation health.
- Add an explicit, non-secret `model-binding.json` Candidate identity and `harbor_model_binding` tool. Pinned models still run exclusively through the per-Job Host Model Broker; Host OAuth/API credentials never enter the Candidate container or Harbor artifacts.
- Follow the latest published DSH and Candidate ACP runtime by default, record that maintenance policy explicitly, and require a fresh baseline on meaningful runtime drift instead of hard-coding an old release candidate.
- Remove machine-specific Workbench assumptions: activate the latest Agent session root, discover namespaced Stacks and evaluator sources inside the active project, snapshot governance sources into each Job, and keep historical reads attached to Job-owned evidence.
- Make evaluator meta-evaluation accept reviewed reports plus natural-language scores and comments, then guide the Agent to normalize only confirmed Ground Truth. Evaluation reporting now requires one evidence-linked Dataset-level conclusion and one controlled optimization recommendation synthesized from all Trial pages.

## 0.7.2 - 2026-08-24

- Resolve every Agent-facing Harbor Tool against the calling session's absolute working directory instead of the Plugin's process-wide fallback `projectRoot`. Each call receives an immutable request-local Service, so concurrent workspaces remain isolated while all existing path-containment checks stay active.

## 0.7.1 - 2026-08-23

- Add a per-Job Host Model Broker: a Candidate now reuses the DSH Agent's frozen current provider, model, and reasoning effort through a random, short-lived capability rather than receiving any provider credential. Explicit Candidate provider/model overrides remain available only as a complete pair.
- Add the generic `dsh-host` Candidate adapter, `dsh-host-broker` transport, and `dsh-host-model-gateway/v1` protocol. `openai-codex` runs fail fast when GPT Auth is not signed in.
- Generate an isolated Candidate `.harbor-runtime` Cordis Overlay inside the task container, including Include/Patch safety, an ACP uniqueness check, a `0600` Job token file, and broker reachability preflight. Runtime state cannot be pre-created or enter the Candidate digest.
- Bind provider, model, reasoning effort, transport, and protocol into Context v2 comparison identity, so a model change requires a fresh baseline.

## 0.7.0 - 2026-08-23

- Replace the first-run architecture questionnaire with a progressive four-concept intake: Dataset, Generator, Evaluator plus criteria, and Optimizer. Inspect the workspace first, infer internal identities, require one confirmation card before writes, classify single-Query runs as diagnostic-only, and defer promotion, Ground Truth, and deployment governance until they are relevant.
- Add bundled Skill onboarding evals covering a blank workspace, a single-Query diagnostic, and curl/local-Agent inputs with credential redaction.

## 0.6.1 - 2026-08-23

- Install the prebuilt registry Plugin with lifecycle scripts disabled so pnpm 11 does not reject unrelated DSH native dependencies as newly unapproved builds.
- Add a setup regression assertion for the script-free registry install path.

## 0.6.0 - 2026-08-23

- Add `harbor-dsh-evaluator/v1` for script and LLM-as-Judge implementations, with bundle identity, ternary Criteria validation, Agent tools, and descriptor-authorized Workbench source editing using optimistic concurrency and atomic version updates.
- Expand the Deep Research example to 13 realistic Chinese questions, including three explicit Badcases, and score 回应问题、有趣性、引用规范性 on `0 / 0.5 / 1` through one shared Evaluator implementation.
- Add a formal append-only Trial Lifecycle with Dataset-stable order, explicit active/terminal phases, atomic progress snapshots, preserved retry attempts, and 2.5-second incremental Workbench polling.
- Introduce Trial Assessment v2 and Summary v3: quality score value and validity are separate, invalid infrastructure/evaluation rewards remain audit-only, and Population aggregates include valid scores only.
- Add explicit Evidence Provenance so Real Renderer output, ACP Agent Output Fallback, Judge explanations, and deterministic diagnosis cannot be confused.
- Add the Job Artifact Registry, Diagnosis Report, Population Report v2, and Optimization Report v2 with non-reward post-processing identities and controlled-experiment guardrails.
- Rebuild the ocean/whale Workbench around Candidate → Dataset → Integration → Renderer → Judge → Evaluator Meta-evaluation → Reporter → Optimizer → Gate, with running-Trial detail, stable filters/sorts, split evidence view, compare preview, and actionable Evaluator governance.
- Capability-detect older Jobs as read-only history instead of synthesizing new semantics; a missing 0.6 artifact is shown as unavailable.
- Strengthen Promotion Gate with valid-score coverage checks, Trial/population deltas, new-exception detection, and artifact regression evidence. Diagnostic Jobs and UI reads never auto-Gate, promote, deploy, publish, or replace a Champion.
- Upgrade the bundled Skill and initializer to require Score Validity checks before Candidate optimization and to create new evaluator identities plus fresh baselines for reward-affecting changes.
- Localize all nine stage tabs through the DSH locale service; snapshot and display Agent-visible Dataset instructions; collect and safely preview generated page/document/structured artifacts; and make Evaluator/Rubric/Judge source plus the independent Ground Truth meta-evaluation workflow directly visible.
- Require every Evaluator criterion to return a non-empty reason and recommendation through the packaged `evaluation-result/v1` schema, and compare each Trial artifact with its scores, reasons, and recommendations in a paginated report.
- Add versioned, provenance-bearing Ground Truth plus `evaluator-observations/v1` and `meta-evaluation-report/v1`, with ESF, SCE, RCR, coverage, disagreement, and Badcase reporting for Evaluator optimization.
- Replace the hard-coded DeepResearch Candidate output with a real streaming Responses API generator: v1 records an invalid search without evidence, while v2 retrieves a Task-owned Source Catalog and constrains the same model to grounded citations; collect readable Markdown plus structured JSON artifacts and keep API credentials runtime-only.

## 0.5.0 - 2026-08-21

- Replace the Dataset-tree Context v1 contract with strict Candidate + Dataset Manifest + Evaluation Stack + Context v2 identities; no legacy promotion path is retained.
- Add first-class Integration, Renderer, Evaluator, Rubric, Diagnoser, Optimizer, Runner, Reporter, Judge, and Evaluation Contract manifests.
- Add non-overwriting project initialization, Dataset validation, Architecture Doctor, Context preview, and structured Promotion Gate reason codes.
- Separate comparison digest from full audit digest so non-reward Diagnoser/Optimizer/Reporter changes remain comparable while reward-affecting changes require a fresh baseline.
- Generate and validate Evaluation Contract, Trial Assessment, Population, Summary, and Promotion artifacts with infrastructure exceptions kept separate from capability metrics.
- Replace the Job list-only UI with an outcome-first Evaluation Workbench and server-side paginated Trial APIs.
- Add mtime caching, same-origin read-only routes, path/symlink containment, artifact size limits, evidence truncation, and sensitive-field redaction.
- Upgrade the bundled Skill with Architecture mode, strict initialization worksheet, Doctor-first promotion flow, evidence-linked optimization, and evaluator meta-evaluation guidance.

## 0.4.0 - 2026-08-19

- Add a native Harbor conversation tab for Job status, Candidate identity, evaluation-context digests, metrics, exceptions, and Promotion decisions.
- Add dedicated DSH Tool cards for Candidate snapshots, evaluations, results, and Promotion Gate reports.
- Add a Harbor Evolution Settings section that diagnoses project paths and both Harbor CLIs without rewriting Cordis configuration.
- Serve a same-origin, read-only, non-cacheable Host snapshot and cap the dashboard at the 50 most recent Jobs.
- Ship an original embedded ocean-and-whale visual, responsive layouts, bilingual copy, and a portable Web client bundle.
- Build the Web client automatically for registry packages and linked source-development installations.

## 0.3.1 - 2026-08-18

- Direct Agents that receive the GitHub URL to the registry-backed one-command installer instead of a machine-local `link:` dependency.
- Prepare locked Node.js dependencies before linking an explicit source checkout, preventing missing `@deepseek-ai/schemastery` and host peer imports.
- Separate released installation (`dsh-install`) from source-development installation (`dsh-install-source`).
- Save registry-backed DSH profile dependencies as exact versions instead of floating caret ranges.

## 0.3.0 - 2026-08-17

- Position the project primarily as an installable DSH Plugin + Skill; keep the templates as reference implementations.
- Add one repeatable `dsh-harbor setup` command that installs the matching Python runtime and DSH bundle.
- Persist the Agent workspace and Harbor executable paths in the selected DSH profile without replacing unrelated user patch entries.
- Verify Harbor and its `dsh-evolution` entry point during setup, and print the exact DSH restart command and first Skill invocation.
- Keep registry and source-checkout installation on the same workflow.

## 0.2.0 - 2026-08-17

- Bundle this project's official `evolve-agent-with-harbor` DSH Skill with the Cordis plugin.
- Guide Agents through requirements clarification, safe initialization, baseline evaluation, controlled optimization, regression comparison, and promotion reporting.
- Add initialization contracts for Candidates, Harbor Datasets, Verifiers, and Promotion Policies.
- Register the Skill through DSH's official Skill Registry while preserving the four deterministic evolution tools.
- Keep the Python Harbor adapter and npm DSH bundle on the shared `0.2.0` release line.

## 0.1.0 - 2026-08-17

First public release of the Harbor-based Agent self-evolution template.

- Snapshot immutable DeepSeek Harness Candidates with reproducible manifests.
- Evaluate Candidates through Harbor's ACP runner and preserve Job evidence.
- Compare evaluation contexts and apply deterministic promotion gates.
- Expose snapshot, run, result, and compare tools as a DSH Cordis bundle.
- Include DeepResearch and shell examples for end-to-end validation.
