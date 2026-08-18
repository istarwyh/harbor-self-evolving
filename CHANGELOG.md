# Changelog

All notable changes to this project are documented in this file.

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
