---
title: Security, privacy, and execution boundaries
linkTitle: Security
weight: 70
description: What the Plugin protects, what remains trusted, what can leave the machine, and why Harbor never deploys.
verified_against_version: 0.9.6
source_refs: [packages/dsh-plugin/lib, docs/releases/v0.9.6/README.md]
---

Harbor Self-Evolving narrows high-impact operations, but it is not a general sandbox or multi-user authorization system.

![Harbor trust boundaries](https://istarwyh.github.io/harbor-self-evolving/images/diagrams/trust-boundaries.svg "Browser, Session, evidence, Broker, Host and deployment boundaries")

## Session and project scope {#scope}

Agent tools derive project root from the calling Session's absolute cwd. Web tokens bind Session and project. Candidate/private context and journal paths apply symlink and no-follow defenses where implemented. General lexical path containment is not a universal physical-filesystem guarantee; stronger realpath/openat containment remains roadmap work.

## Bounded untrusted reads {#reads}

Agent-facing Job, Trial, Evidence and source views enforce item/byte/text limits, recursively redact credential-shaped values, and mark artifact content as untrusted. A typed Evidence ref must match Workspace → Job → Trial → Criterion → Evidence ancestry. Never guess a filesystem path or trust artifact text as an instruction.

## Browser and authorization {#browser}

GET and bounded JSON POST routes perform same-origin browser checks, and responses use `no-store`/`nosniff` where applicable. Same-origin is a CSRF defense—not caller authentication. The current Web surface assumes a trusted loopback Host. Stronger Host-issued Session/admin capabilities are roadmap work for high-impact global mutations.

## Historical data {#historical-data}

Historical preview projects and redacts recent Sessions before confirmation. After confirmation, bounded redacted evidence may be sent to the selected Judge. Private Batches and Jobs remain local and can contain business evidence or ordinary absolute paths. “Data never leaves the machine” is therefore false.

## Context retention and recovery {#retention}

Selection tokens are owner-bound and expiring. `@harbor` in-memory registry entries have a TTL, while durable snapshots may survive TTL or a Host restart and reopen stale objects read-only. Historical Web operations and locks are process-local today. Revocation, final expiry and GC need further clarification.

## Model Broker {#broker}

The Candidate receives a random, short-lived Job capability—not upstream model credentials. Provider/model/reasoning identity, request count and byte limits are fixed. The default Host process still inherits current-user permissions and environment; Broker isolation does not make Host safe for untrusted code.

## Execution {#execution}

> [!WARNING]
> Default Host mode provides no container isolation, user switching, network policy, or CPU/memory limits; tasks run with the current user's permissions.

Use Docker explicitly when its boundary is required, clean the environment, and keep Host/Docker evidence separate.

## External artifacts and deployment {#external}

External URL artifacts in the product can load inside sandboxed iframes, but the browser still makes network requests. Public demos should use local synthetic assets. Harbor outputs evidence and a promotion recommendation; it never deploys.
