---
title: Native DSH evaluation workbench
description: The complete DSH Plugin surface—19 tools, Workbench, Host services, reviewed actions and current limits.
weight: 10
aliases: [/product/plugin/, /product/skill/, /product/adapter/, /product/roadmap/]
verified_against_version: 0.9.6
source_refs: [packages/dsh-plugin/index.js, packages/dsh-plugin/README.md, packages/dsh-plugin/lib/dashboard.js]
---

The npm package `dsh-harbor-evolution` is more than a tool registry. It owns five layers:

1. **Setup lifecycle** — configure the selected DSH profile, install the Python Adapter, expose the bundled Skill and request a restart.
2. **Agent orchestration** — register 19 strict tools with typed boundaries and approval semantics.
3. **Native Web experience** — Workbench, Historical launcher, Context, Evidence, Artifacts, operations and Settings.
4. **Host services** — bounded project/job reads, Session selection, model brokerage and background operation coordination.
5. **Trust boundary** — redaction, same-origin browser checks, explicit confirmation and untrusted evidence envelopes.

![DSH Plugin responsibility layers](https://istarwyh.github.io/harbor-self-evolving/images/diagrams/plugin-layers.svg "Current contract · explanatory diagram")

## Tool surface {#tools}

The Plugin registers **19 tools**. Ten mutation-capable tools require one-shot DSH approval; nine are read-only or in-memory. The complete per-tool contract is in [Tool reference](https://istarwyh.github.io/harbor-self-evolving/docs/reference/tools/).

## Workbench {#workbench}

The Web experience brings the strict pipeline into DSH:

- Dashboard and Job/Trial status;
- Pipeline stages and preflight;
- Context, comparable baselines and Gate readiness;
- Trial output, criterion evidence and artifacts;
- Historical Session selection and disclosure;
- reviewed action drafts, deterministic preflight and explicit confirmation;
- background operations and recovery states;
- Settings, execution environment and version UI.

![Synthetic Harbor Workbench](https://istarwyh.github.io/harbor-self-evolving/images/screenshots/workbench-desktop.png "v0.9.5 · cropped synthetic component fixture · not a real Host/model/evaluation")

## Context and reviewed actions {#context}

Ordinary chat remains ordinary chat. `@harbor` page context resolves a short-lived, owner-bound reference; typed Evidence refs then enforce Workspace → Job → Trial → Criterion → Evidence ancestry. Artifact text is always treated as untrusted data.

Ask AI can prepare a proposal draft, but it cannot write files, start Jobs, change Evaluators, run Gate or deploy. The user separately reviews deterministic preflight and confirms the exact action.

## Current limits {#limits}

> [!WARNING]
> **Known issue (0.9.6):** The Web Dashboard does not yet accept Candidate Context v3. The Adapter produces Candidate Context v3, but the Dashboard still evaluates it as Candidate Context v2; as a result, a real Candidate v3 Job is marked `unsupported/read-only legacy` and `invalid`, and Compare/Gate are disabled. Historical Context v2 is readable, but is currently covered by a generic `schema_version === 2` branch and lacks a protocol-aware contract test. Until a fix is released, do not describe Web Compare/Gate for Candidate v3 as fully supported.

Same-origin checks are a browser CSRF defense, not caller authentication. Historical Web operation locks are process-local, while some durable `@harbor` snapshots can outlive memory TTL; retention and recovery therefore vary by operation.

The local untagged one-click updater is **Development preview**, not 0.9.6. The shipped version UI performs a version check and shows an exact copyable update command and release link; it does not silently install.
