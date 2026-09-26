---
title: Evaluator 治理与元评测
linkTitle: Evaluator 治理
weight: 30
description: 检查、版本化并独立测试 Evaluator，而不是把评分规则当作神谕。
verified_against_version: 0.9.7
source_refs: [docs/evaluator-interface.md, schemas]
---

Candidate 质量与 Evaluator 质量是两个独立治理问题。

## 接口与检查 {#interface}

正式 Candidate Evaluator 实现 `harbor-dsh-evaluator/v2`。Descriptor 标识 implementation kind（`script` 或 `llm-as-judge`）、ternary Criteria，以及 bounded editable source allowlist。Inspection 会省略 secret-shaped 与 local-path-shaped 值。

## 受控更新 {#update}

Evaluator update 在 optimistic concurrency 下替换一个 descriptor-authorized source file。调用方提供 expected digest 以及**新的 Evaluator 和 Stack 版本**。更新不会自动运行评测或 Gate。

## 独立 Ground Truth {#ground-truth}

Ground Truth 可以来自 human、programmatic、consensus、model 或 external，但 provenance 必须明确，并且独立于 Candidate Evaluator。Draft non-overwriting，并标明覆盖哪些 criterion。

## 元评测 {#meta-evaluation}

把重复 Evaluator observation 与独立 Ground Truth 对比，生成：

- **ESF**：evaluator score fidelity；
- **SCE**：score calibration error；
- **RCR**：ranking consistency/reliability。

## Evaluator 自己也需要训练、验证与测试边界 {#evaluator-splits}

评估器的 rubric、Judge prompt、解析器和阈值都可能被“训练”：

- **tuning set**：用于发现漏判、误判并修改 rubric、prompt 或脚本；
- **validation set**：用于比较多个 Evaluator 版本、选择阈值与实现；
- **meta-evaluation holdout**：在版本冻结后才揭示的独立样本，用于估计 Evaluator 对未知 case 的可靠性。

如果同一批人工标签既指导修改 Evaluator，又被用于最终宣称“评估器准确”，结果会有信息泄漏。人工 raw review 必须保持独立 provenance，不能被改写成 Candidate Evaluator 的输出。

## 在插件中的治理顺序 {#governance-loop}

1. `harbor_evaluator_inspect` 读取接口、Criteria 与允许修改的源码边界；
2. `harbor_ground_truth_init` 创建 non-overwriting、带 provenance 的独立 Ground Truth 草稿；
3. `harbor_evaluator_meta_evaluate` 比较重复 observations 与 Ground Truth，写出 ESF、SCE、RCR；
4. 只有证据支持时，`harbor_evaluator_update` 才以 expected digest 更新一个授权文件，并强制新的 Evaluator / Stack 版本；
5. 更新后重新运行 tuning 与 holdout 元评测，再决定是否让新 Evaluator 参与 Candidate 评测。

元评测不会自动修改 Evaluator，也不会运行 Candidate Gate。Historical evaluation 还是不同场景：真实 Session 未必触发每条 criterion，因此 applicability、coverage 与 abstention 很重要。
