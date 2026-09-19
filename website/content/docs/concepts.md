---
title: Concepts and trustworthy scores
linkTitle: Concepts
weight: 40
description: The four user concepts, immutable evaluation identities, score validity, coverage and promotion semantics.
verified_against_version: 0.9.6
source_refs: [README.md, docs/architecture.md]
---

## Four concepts you choose {#four-concepts}

- **Dataset** — the business cases and instructions that define what must work.
- **Generator** — how the Candidate is run to produce an answer or artifact.
- **Evaluator** — the criteria and evidence logic that decide what counts as valid quality.
- **Optimizer** — how one reviewed change is proposed from Dataset-level evidence.

Harbor compiles these into a stricter Evaluation Stack with Integration, Renderer, Judge, Contract, Reporter, Policy, Context and Gate roles. Users should not have to fill in an internal architecture questionnaire before describing the business problem.

## Identity chain {#identity}

A comparable Job binds immutable or versioned identities: Candidate Manifest, Dataset Manifest, Evaluation Stack, Context, execution environment, Candidate model binding and Judge identity. A Trial belongs to one Job and carries output, criterion observations, Evidence and Artifacts.

![Evaluation identity chain](https://istarwyh.github.io/harbor-self-evolving/images/diagrams/identity-chain.svg "Immutable identities precede Trial scores")

## Raw reward is not a valid score {#validity}

A verifier may emit a numeric raw reward even when required evidence is missing, parsing failed or the criterion abstained. Harbor keeps these states distinct:

- **valid score** — contract and evidence requirements were met;
- **invalid score** — a numeric value must not participate in aggregate quality;
- **abstention** — the Evaluator explicitly could not decide;
- **coverage** — how much of the required population produced usable evidence.

Averages without validity and coverage can reward a broken pipeline.

## PROMOTE and REJECT {#promotion}

![Deterministic Gate decision](https://istarwyh.github.io/harbor-self-evolving/images/diagrams/gate-decision.svg "Fixed Jobs and Policy produce a recommendation, not deployment")

A deterministic Gate evaluates fixed Job and policy inputs. `PROMOTE` means the Candidate satisfies that policy relative to a comparable baseline. `REJECT` means it does not. Neither word means “deployed,” and neither replaces human or CI/CD authority.
