---
title: Evaluator 治理与元评测
linkTitle: Evaluator 治理
weight: 30
description: 检查、版本化并独立测试 Evaluator，而不是把评分规则当作神谕。
verified_against_version: 0.9.6
source_refs: [docs/evaluator-interface.md, schemas]
---

Candidate 质量与 Evaluator 质量是两个独立治理问题。

## 接口与检查 {#interface}

Evaluator 实现 `harbor-dsh-evaluator/v1`。Descriptor 标识 implementation kind（`script` 或 `llm-as-judge`）、ternary Criteria，以及 bounded editable source allowlist。Inspection 会省略 secret-shaped 与 local-path-shaped 值。

## 受控更新 {#update}

Evaluator update 在 optimistic concurrency 下替换一个 descriptor-authorized source file。调用方提供 expected digest 以及**新的 Evaluator 和 Stack 版本**。更新不会自动运行评测或 Gate。

## 独立 Ground Truth {#ground-truth}

Ground Truth 可以来自 human、programmatic、consensus、model 或 external，但 provenance 必须明确，并且独立于 Candidate Evaluator。Draft non-overwriting，并标明覆盖哪些 criterion。

## 元评测 {#meta-evaluation}

把重复 Evaluator observation 与独立 Ground Truth 对比，生成：

- **ESF**：evaluator score fidelity；
- **SCE**：score calibration error；
- **RCR**：ranking consistency/reliability。

Tuning 与 holdout 边界必须可见；人工 raw review 不能被改写成 Candidate Evaluator 的输出。

Historical evaluation 是不同场景：真实 Session 未必触发每条 criterion，因此 applicability、coverage 与 abstention 很重要。
