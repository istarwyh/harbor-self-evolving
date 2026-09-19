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

### 0.9.6 · Host-first execution

- Formal tag: [`v0.9.6`](https://github.com/istarwyh/harbor-self-evolving/releases/tag/v0.9.6)
- Compatibility: Harbor `>=0.21,<0.22`
- Main change: Host becomes the default execution environment; Docker remains opt-in; execution environment enters Context identity.
- Evidence: automated package/source tests and archived release checks.
- Limit: no real provider model, real Candidate/Historical Session data or paid Harbor evaluation; automated tests do not establish a business-quality baseline.

[Read the 0.9.6 evidence summary](https://istarwyh.github.io/harbor-self-evolving/releases/0.9.6/).

## Release history {#history}

| Version | Product step | Evidence note |
|---|---|---|
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

Local checkout commit `8bb59e2` was ahead of the formal release during site planning and included one-click update work. It remains excluded from shipped 0.9.6 claims until a new tag, public packages and release evidence agree.
