---
title: Candidate evaluation and promotion
linkTitle: Candidate evaluation
description: Freeze identities, run a comparable regression, and obtain a deterministic promotion recommendation.
weight: 20
verified_against_version: 0.9.7
source_refs: [docs/integration.md, README.md, docs/candidate-runtime-contract.md]
---

Candidate evaluation answers a narrower question than Historical diagnosis: **did one controlled change improve a fixed business task under comparable evaluation conditions?**

![Candidate evaluation pipeline](https://istarwyh.github.io/harbor-self-evolving/images/diagrams/candidate-pipeline.svg "Current Candidate Context v3 pipeline")

## Strict sequence {#sequence}

1. **Snapshot Candidate** into an immutable manifest.
2. **Validate Dataset** identity, task uniqueness, paths, sensitive metadata and source digest.
3. **Doctor** Candidate, Dataset, Evaluation Stack and optional Promotion Policy.
4. **Preview Context v3** and discover comparable baselines before spending on a Job.
5. **Run diagnostic first** when the stack or provider path is new.
6. **Change one controlled surface**—Agent or Evaluator, not both silently.
7. **Run promotion-eligible regression** with fixed identities.
8. **Inspect progress, Trial output, criterion evidence and governance impact.**
9. **Compare and Gate** against a comparable baseline.

## Comparability {#comparability}

A baseline is not comparable merely because it used the same repository. Candidate manifest, Dataset manifest, Evaluation Stack, Context, execution environment and relevant model/Judge identities must satisfy the contract. A changed Dataset digest, stack version, provider identity or runtime boundary can require a fresh baseline.

## Gate {#gate}

The Gate is deterministic for fixed baseline Job, Candidate Job and policy inputs. It can return `PROMOTE` or `REJECT` based on valid score movement, minimum improvement, regressions, coverage and other policy conditions.

It does **not** deploy, mutate the Champion or bypass external CI/CD approval.

Version 0.9.7 accepts Candidate Context v3 in both Dashboard overview and Job detail. Compare/Gate still remain capability-gated by artifact validity, comparable identities, mode and policy.

## What a release test does not prove {#limits}

0.9.7 did not run a real provider model, real Candidate/Historical Session data, or a paid Harbor evaluation; automated tests do not establish a business-quality baseline. Your Dataset, Evaluator and production evidence must establish that baseline.
