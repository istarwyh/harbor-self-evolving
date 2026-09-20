---
title: Releases and evidence
linkTitle: Releases
description: Formal release identities, shipped capabilities, evidence types and explicit verification limits.
type: docs
icon: fa-solid fa-tags
sidebar_root_for: self
sidebar_root_link_self: true
outputs: [HTML, print, RSS, markdown, LLMSFULL]
menus:
  main: { identifier: releases, weight: 50 }
cascade:
  type: docs
  footer_style: slim
---

This page distinguishes a formal tag/public package from local development and separates package publication from verification evidence.

## Current release {#current}

### 0.9.7 · Current Context Web contracts and bilingual site

- Formal tag: [`v0.9.7`](https://github.com/istarwyh/harbor-self-evolving/releases/tag/v0.9.7)
- Compatibility: Harbor `>=0.21,<0.22`
- Main change: Candidate Context v3 and Historical Context v2 are recognized by the Web Workbench; setup persists complete installation identity; Settings remains review-only; the bilingual product/documentation site becomes part of the release.
- Evidence: automated package/source/site tests, public package checks and archived release records.
- Limit: no real provider model, real Candidate/Historical Session data or paid Harbor evaluation; automated tests do not establish a business-quality baseline.

[Read the 0.9.7 evidence summary](https://istarwyh.github.io/harbor-self-evolving/releases/0.9.7/).

## Release history {#history}

| Version | Product step | Evidence note |
|---|---|---|
| 0.9.6 | Host-first execution and environment identity | Automated package/source checks; no real-provider evaluation |
| 0.9.5 | Consolidated Workbench and release evidence gallery | Synthetic component fixtures; not real provider evaluation |
| 0.9.4 | Native page context and conversation handoff | Synthetic controlled-model interaction evidence |
| 0.9.3 | Reviewed actions and background operations | Component/service fixtures and failure states |
| 0.9.2 | Historical cold-start fixes and public package evidence | Also carried fixes after incomplete 0.9.1 publication |
| 0.9.1 | Publication incomplete | Do not treat as a normal shipped card |
| 0.8.x | Historical Generation Evaluation | Introduced redacted Session Batch and `completed-unscored` |
| 0.7.x | Four-concept onboarding and Model Broker | Lowered configuration complexity while retaining strict identities |
| 0.6.x | Evaluator governance and meta-evaluation | Separated score validity from raw rewards |
| 0.5.x | Comparable Stack/Manifest/Context architecture | Fixed “who” and “measuring stick” |
| 0.1–0.4 | Candidate prototype → packaged DSH Web integration | Established immutable Candidate, Skill, Adapter and native UI |

## Development preview {#development}

The untagged one-click updater from commit `8bb59e2` was withdrawn before 0.9.7. Settings checks versions and copies an exact command only when complete installation identity is available; the browser does not execute registry packages. Durable recovery, stronger mutation authorization and broader browser/accessibility coverage remain roadmap work.
