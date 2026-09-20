---
title: Workbench, context, and reviewed actions
linkTitle: Plugin Workbench
description: Navigate the native DSH Workbench, bind page context, inspect evidence and review actions before execution.
weight: 30
aliases: [/docs/plugin/workbench/, /docs/plugin/context/, /docs/plugin/actions/, /docs/plugin/settings/]
verified_against_version: 0.9.7
source_refs: [packages/dsh-plugin/README.md, packages/dsh-plugin/src/client/index.jsx]
---

The Harbor page is injected into the existing DSH Web GUI. It reuses DSH locale, Session, conversation, composer, Settings and Tool View surfaces; it is not a second chat product or login system.

## Object-first Workbench {#workbench}

A Job opens into eight connected sections: Summary, Trials, Pipeline, Optimization, Compare/Gate, Evaluator/Rubric, Artifacts and Audit. The Pipeline tracks Candidate, Dataset, Integration, Renderer, Judge, Meta, Reporter, Optimizer and Gate separately so a wiring failure is not mislabeled as a low score.

The Trial explorer supports server-side pagination, status and score-validity filters, sorting, criterion evidence focus and frozen Trial sets. Business artifacts stay attached to the Trial that produced them.

![Synthetic responsive Workbench](https://istarwyh.github.io/harbor-self-evolving/images/screenshots/workbench-mobile.png "v0.9.5 · synthetic 500 px component fixture · responsive evidence only")

## Page context {#context}

When supported, ordinary send freezes the current Harbor page context. `Ask AI` or an explicit `@harbor` reference takes precedence and is one-shot. The Host resolves the opaque token for the exact Session, project and revision, then returns typed refs and a navigation action. Evidence reading validates the complete ancestry and treats content as untrusted.

![Synthetic native conversation context](https://istarwyh.github.io/harbor-self-evolving/images/screenshots/native-context.png "v0.9.4 historical image · synthetic controlled-model fixture · not a real provider")

## Reviewed actions {#actions}

Seven draft kinds cover Candidate change, Evaluator change, Compare, Diagnostic Evaluation, Infrastructure Retry, Gate Request and Deployment Handoff. Proposal creation is not authorization.

1. A user explicitly requests an action.
2. AI creates an expiring draft from fresh page context.
3. Deterministic preflight shows target, diff, identities and limits.
4. The user confirms the exact action.
5. The Host journals execution and exposes progress/recovery state.

Candidate/Gate/handoff drafts do not silently execute. Compare is read-only. Unsupported production actions are denied.

## Settings and operations {#settings}

Settings exposes project root source, Stack/jobs/CLI checks, credential policy, execution environment and version status. Agent tools continue to use the calling Session cwd as authority; the process-local Settings root mainly serves Web and fallback behavior.

Background operations can expose progress, partial evidence, cancellation and navigation, but durability varies. Unknown state must not be rendered as success, and failure must not trigger silent retry.

> [!WARNING]
> 0.9.7 accepts Candidate Context v3 and explicitly recognizes Historical Context v2. Compare/Gate remain gated by artifact validity, comparable identities, mode and policy; see [Plugin limits](https://istarwyh.github.io/harbor-self-evolving/product/dsh-plugin/#limits).
