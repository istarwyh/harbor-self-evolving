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
verified_against_version: 0.9.7
source_refs: [README.md, CHANGELOG.md, packages/dsh-plugin/README.md]
---

Harbor Self-Evolving adds **continuous evaluation and controlled self-evolution** to DeepSeek Harness. It is delivered as three collaborating parts:

- **DSH Plugin** — native tools, Workbench, Host services and permission boundaries.
- **`evolve-agent-with-harbor` Skill** — the official orchestration policy maintained by this project.
- **Python Adapter** — Harbor Generator, Evaluator and Optimizer wiring plus deterministic Gate integration.

## From Dataset to meta-evaluation {#evaluation-roles}

The Plugin does more than call a Judge. It separates the evaluation loop into governable roles:

| Role | How the Plugin supports it |
|---|---|
| **Dataset** | Validate Tasks, instructions, paths and source digest; distinguish training/fix data, validation data and final holdout. |
| **Generator** | Run the Agent through the Adapter under frozen Candidate, model binding, Context and Host/Docker identities, preserving output and Artifacts. |
| **Evaluator** | Unify `script` and `llm-as-judge`, recording Evidence, validity, abstention and coverage for each criterion. |
| **Optimizer** | Let the Skill and Agent propose one reviewed change from Trial evidence without owning scoring, Gate or deployment authority. |
| **Meta-Evaluation** | Compare the Evaluator with independent Ground Truth for fidelity, calibration and ranking reliability, so the Agent is not optimized against an untested measuring instrument. |

Training, validation and test sets are information boundaries rather than file formats. A case that changes the Candidate is training information; repeatedly selecting with a set turns it into validation information; only a holdout whose answers remain hidden from the Optimizer can estimate final generalization. See [Concepts and trustworthy scores](https://istarwyh.github.io/harbor-self-evolving/docs/concepts/) and [Evaluator governance](https://istarwyh.github.io/harbor-self-evolving/docs/workflows/evaluator/).

## Two evaluation paths {#paths}

| Path | Starts from | Designed to answer | Promotion evidence? |
|---|---|---|---|
| Historical diagnosis | Recent completed DSH Sessions | Where does the current Agent fail? | No—diagnostic only |
| Candidate regression | Frozen Candidate + Dataset + Stack + Context | Is one controlled change better on comparable evidence? | Eligible when policy and Gate requirements hold |

![Two-path evaluation model](https://istarwyh.github.io/harbor-self-evolving/images/diagrams/two-paths.svg "Current contract · explanatory diagram")

## Skill {#skill}

The bundled Skill chooses the lowest-friction safe path: use recent Sessions when no Dataset exists, or enter the strict Candidate pipeline when the user supplies one. It fixes identities before expensive execution, reads typed evidence rather than guessing from files, and never treats Gate as deployment authority.

## Adapter {#adapter}

The Python package `harbor-dsh-evolution` maps DSH Candidates and Tasks into Harbor's evaluation interfaces. Version 0.9.7 uses **Candidate Context v3** and **Historical Context v2**, and the Web Workbench recognizes both current contracts. Host execution is default; Docker is opt-in.

## Principles {#principles}

1. Identity before score.
2. Validity and coverage before averages.
3. One controlled change per iteration.
4. Evidence and policy remain separate from optimization.
5. Gate recommendation remains separate from deployment.
6. Permissions and provider boundaries are disclosed at the point of action.

## Status and roadmap {#status}

**Shipped in 0.9.7:** package setup, 19 Agent tools, Workbench, Historical diagnostics, Evaluator governance, Host-first execution, Candidate Context v3/Historical Context v2 Web support, and a review-only version command bound to complete installation identity.

**Withdrawn preview:** the untagged browser one-click updater was removed before release. The browser does not execute registry packages; users review and run the exact setup command in a terminal.

**Roadmap:** durable operation recovery, stronger mutation authorization, retention/GC, safer external artifact previews and broader browser/accessibility coverage.

> [!WARNING]
> Same-origin is a browser CSRF defense, not caller authentication. Host execution is not a sandbox, and Gate remains a deterministic recommendation for fixed inputs—not deployment authority.

## From prototype to 0.9.7 {#history}

- **0.1–0.8:** establish the Candidate/Dataset/Stack model, evaluation loop and DSH integration.
- **0.9.0–0.9.4:** native Workbench, Historical Session cold start, reviewed actions, context and evidence navigation.
- **0.9.5:** consolidated Workbench and stronger release evidence.
- **0.9.6:** Host-first execution with Docker opt-in, while preserving explicit safety boundaries.
- **0.9.7:** repair current Context Web contracts, preserve update identity and publish the bilingual product/documentation site.

See [Releases](https://istarwyh.github.io/harbor-self-evolving/releases/) for evidence and limitations attached to each formal version.
