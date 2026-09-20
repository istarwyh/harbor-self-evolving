---
title: Evaluator governance and meta-evaluation
linkTitle: Evaluator governance
weight: 30
description: Inspect, version and independently test the Evaluator instead of treating the scoring rule as an oracle.
verified_against_version: 0.9.7
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

## The Evaluator needs train, validation and test boundaries too {#evaluator-splits}

Rubrics, Judge prompts, parsers and thresholds can all be “trained”:

- **tuning set** — find false positives/negatives and modify rubric, prompt or script;
- **validation set** — compare Evaluator versions and select thresholds or implementations;
- **meta-evaluation holdout** — reveal independent cases only after identities are frozen to estimate reliability on unseen cases.

If the same human labels guide Evaluator changes and then serve as final proof of accuracy, information has leaked. Raw human review needs independent provenance and must not be rewritten as if it came from the Candidate Evaluator.

## Governance order in the Plugin {#governance-loop}

1. `harbor_evaluator_inspect` reads the interface, Criteria and editable source boundary.
2. `harbor_ground_truth_init` creates a non-overwriting independent Ground Truth draft with provenance.
3. `harbor_evaluator_meta_evaluate` compares repeated observations with Ground Truth and writes ESF, SCE and RCR.
4. Only when evidence supports a change, `harbor_evaluator_update` replaces one authorized file under an expected digest and requires new Evaluator/Stack versions.
5. Rerun tuning and holdout meta-evaluation before using the new Evaluator for Candidate evaluation.

Meta-evaluation does not automatically update the Evaluator or run Candidate Gate. Historical evaluation is a distinct scenario: applicability, coverage and abstention matter because real Sessions may not exercise every criterion.
