---
title: 把 badcase 整理成 Dataset
book_number: 4
weight: 40
description: 把重复失败模式转成可审查 Task，而不是泄露原始私有历史。
---

Dataset 是经过整理的业务意图，不是私有 transcript dump。抽象失败、保留相关约束，并创建可独立审查的期望行为。

## 你做什么 {#you-do}

去重失败模式，移除私有标识，分开 tuning/holdout，并审查每个 instruction file。

## Harbor 记录什么 {#harbor-records}

Task id、路径、instruction、敏感 metadata 检查与不可变 source digest。

## 这不能证明什么 {#does-not-prove}

干净 Dataset 不证明 population 完整，也不证明单一 metric 覆盖全部业务风险。
