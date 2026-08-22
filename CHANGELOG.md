# Changelog

All notable changes to this project are documented in this file.

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
