---
title: Product
description: Understand the three deliverables, two evaluation paths, design principles, history and current limits.
type: docs
icon: fa-solid fa-cubes
sidebar_root_for: self
sidebar_root_link_self: true
outputs: [HTML, print, RSS, markdown, LLMSFULL]
menus:
  main: { identifier: product, weight: 10 }
cascade:
  type: docs
  footer_style: slim
verified_against_version: 0.9.6
source_refs: [README.md, CHANGELOG.md, packages/dsh-plugin/README.md]
---

Harbor Self-Evolving adds **continuous evaluation and controlled self-evolution** to DeepSeek Harness. It is delivered as three collaborating parts:

- **DSH Plugin** — native tools, Workbench, Host services and permission boundaries.
- **`evolve-agent-with-harbor` Skill** — the official orchestration policy maintained by this project.
- **Python Adapter** — Harbor Generator, Evaluator and Optimizer wiring plus deterministic Gate integration.

## Two evaluation paths {#paths}

| Path | Starts from | Designed to answer | Promotion evidence? |
|---|---|---|---|
| Historical diagnosis | Recent completed DSH Sessions | Where does the current Agent fail? | No—diagnostic only |
| Candidate regression | Frozen Candidate + Dataset + Stack + Context | Is one controlled change better on comparable evidence? | Eligible when policy and Gate requirements hold |

![Two-path evaluation model](https://istarwyh.github.io/harbor-self-evolving/images/diagrams/two-paths.svg "Current contract · explanatory diagram")

## Skill {#skill}

The bundled Skill chooses the lowest-friction safe path: use recent Sessions when no Dataset exists, or enter the strict Candidate pipeline when the user supplies one. It fixes identities before expensive execution, reads typed evidence rather than guessing from files, and never treats Gate as deployment authority.

## Adapter {#adapter}

The Python package `harbor-dsh-evolution` maps DSH Candidates and Tasks into Harbor's evaluation interfaces. Version 0.9.6 uses **Candidate Context v3** and **Historical Context v2**. Host execution is default; Docker is opt-in.

## Principles {#principles}

1. Identity before score.
2. Validity and coverage before averages.
3. One controlled change per iteration.
4. Evidence and policy remain separate from optimization.
5. Gate recommendation remains separate from deployment.
6. Permissions and provider boundaries are disclosed at the point of action.

## Status and roadmap {#status}

**Shipped in 0.9.6:** package setup, 19 Agent tools, Workbench, Historical diagnostics, Evaluator governance, version check, Host default and Docker opt-in.

**Development preview:** the local untagged checkout includes one-click update work. It is not a 0.9.6 capability and must not be marketed as released until profile/runtime identity preservation, concurrency, rollback and supply-chain boundaries are complete.

**Roadmap:** Candidate Context v3 Web contract repair, durable operation recovery, stronger mutation authorization, retention/GC, safer external artifact previews and broader browser/accessibility coverage.

> [!WARNING]
> **Known issue (0.9.6):** the Web Dashboard does not yet accept Candidate Context v3. The Adapter produces Candidate Context v3, but the Dashboard still evaluates it as Candidate Context v2; a real Candidate v3 Job is marked `unsupported/read-only legacy` and `invalid`, and Compare/Gate are disabled. Historical Context v2 is readable through a generic `schema_version === 2` branch and lacks a protocol-aware contract test.

## From prototype to 0.9.6 {#history}

- **0.1–0.8:** establish the Candidate/Dataset/Stack model, evaluation loop and DSH integration.
- **0.9.0–0.9.4:** native Workbench, Historical Session cold start, reviewed actions, context and evidence navigation.
- **0.9.5:** consolidated Workbench and stronger release evidence.
- **0.9.6:** Host-first execution with Docker opt-in, while preserving explicit safety boundaries.

See [Releases](https://istarwyh.github.io/harbor-self-evolving/releases/) for evidence and limitations attached to each formal version.
