---
title: 读取 Gate 并交接
book_number: 6
weight: 60
description: 把 PROMOTE 或 REJECT 理解为 policy 建议，并把部署权限交给外部 CI/CD。
---

在显式 Promotion Policy 下，把 Candidate Job 与可比 baseline 比较。整体结论必须与 regression、coverage 与 invalid criterion 一起阅读。

## 你做什么 {#you-do}

复核代表性证据，确认 policy 匹配业务风险，并决定外部 CI/CD 是否消费该建议。

## Harbor 记录什么 {#harbor-records}

Baseline/Candidate Job 身份、Policy 身份、比较细节与确定性 Gate Artifact。

## 这不能证明什么 {#does-not-prove}

`PROMOTE` 不是生产部署、Champion mutation 或通用质量保证。它只是针对冻结证据与 policy 的建议。

循环以显式交接结束；只有新证据值得下一次受控改动时才重新开始。
