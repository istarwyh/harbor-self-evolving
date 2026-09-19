---
title: Evaluator governance and meta-evaluation
linkTitle: Evaluator governance
weight: 30
description: Inspect, version and independently test the Evaluator instead of treating the scoring rule as an oracle.
verified_against_version: 0.9.6
source_refs: [docs/evaluator-interface.md, schemas]
---

Candidate quality and Evaluator quality are separate governance problems.

## Interface and inspection {#interface}

Evaluators implement `harbor-dsh-evaluator/v1`. A descriptor identifies implementation kind (`script` or `llm-as-judge`), ternary Criteria and a bounded allowlist of editable source files. Inspection omits secret-shaped and local-path-shaped values.

## Controlled update {#update}

An Evaluator update replaces one descriptor-authorized source file under optimistic concurrency. The caller supplies the expected digest and **new Evaluator and Stack versions**. The update never runs evaluation or Gate automatically.

## Independent Ground Truth {#ground-truth}

Ground Truth may be human, programmatic, consensus, model or external, but provenance must be explicit and independent of the Candidate Evaluator. A draft is non-overwriting and identifies the criteria it covers.

## Meta-evaluation {#meta-evaluation}

Repeated Evaluator observations are compared with independent Ground Truth to produce:

- **ESF** — evaluator score fidelity;
- **SCE** — score calibration error;
- **RCR** — ranking consistency/reliability.

Training/tuning and holdout boundaries must remain visible. Raw human review must not be rewritten as if it came from the Candidate Evaluator.

Historical evaluation is a distinct scenario: applicability, coverage and abstention matter because real Sessions may not exercise every criterion.
