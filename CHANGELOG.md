# Changelog

All notable changes to this project are documented in this file.

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
