---
title: Architecture and trust boundaries
linkTitle: Architecture
weight: 50
description: DSH Plugin, Skill, Python Adapter, two Context protocols, execution environments and the deterministic Gate.
verified_against_version: 0.9.7
source_refs: [packages/dsh-plugin/index.js, packages/harbor-plugin/src/harbor_dsh_evolution/context.py, packages/harbor-plugin/src/harbor_dsh_evolution/historical_context.py]
---

![Harbor Self-Evolving architecture](https://istarwyh.github.io/harbor-self-evolving/images/diagrams/system-architecture.svg "Current 0.9.7 contract and explicit safety boundaries")

## Three product roles {#roles}

- **Plugin:** the user-facing DSH integration and permission boundary.
- **Skill:** the workflow policy that chooses the smallest safe evaluation path.
- **Adapter:** the Harbor runtime bridge that materializes Jobs, Trials, Evidence and Context.

The **Gate** remains a separate deterministic policy function; it is not part of the Optimizer and has no deployment capability.

## Eight-role Evaluation Stack {#stack}

Generator, Integration, Renderer, Evaluator/Judge, Contract, Reporter, Optimizer and Policy/Gate separate execution, observation, interpretation, reporting, change proposal and promotion. This avoids a single opaque prompt both changing the system and grading itself.

## Two Context protocols {#protocols}

| Protocol | Schema | Purpose |
|---|---:|---|
| Candidate evaluation context | v3 | Comparable Candidate Job: manifests, runtime/model identities, stack and baseline search |
| Historical generation evaluation context | v2 | Non-promotion diagnosis of frozen, redacted Session Batches |

They share some identity concepts but are not interchangeable. Historical v2 must not be accepted merely because any object says `schema_version: 2`; protocol-aware validation is required.

## Execution environments {#execution}

0.9.7 defaults to **Host**. Docker is explicit opt-in. Execution environment identity enters Context so Host and Docker results are not silently treated as comparable.

> [!WARNING]
> Default Host mode provides no container isolation, user switching, network policy, or CPU/memory limits; tasks run with the current user's permissions.

The Model Broker gives a Candidate a random, short-lived Job capability and keeps upstream model credentials from the Candidate. It limits requests and byte sizes, but does not prove the Host environment contains no other secrets and is not a provider billing hard cap.

## Artifact and evidence flow {#evidence}

Task output becomes Trial output; Evaluators emit observations and typed Evidence; validity and coverage are computed before aggregation; Job summaries and governance views remain bounded and redacted when exposed to the Agent. The user can navigate from a narrow typed ref back to the exact criterion without allowing arbitrary file reads.
