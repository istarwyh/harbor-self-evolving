---
title: 为什么自我修改不等于进步
book_number: 1
weight: 10
description: 进步需要固定任务、有效证据、单个受控改动，以及独立于 Optimizer 的 policy。
---

Agent 可以重写 prompt、tool 或 Evaluator，却仍然变差。“发生变化”不等于“有所进步”。

可信循环会在改动前固定业务 case、执行身份与评分 contract，并把提出改动的 Optimizer 与决定晋级的 Gate 分开。

## 你做什么 {#you-do}

说清业务失败，并指定最终部署决策 owner。

## Harbor 记录什么 {#harbor-records}

记录日后重访主张所需的身份与证据链。

## 这不能证明什么 {#does-not-prove}

Quick diagnostic 或 Candidate 被重写，都不能证明晋级质量。
