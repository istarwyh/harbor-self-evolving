---
title: 核心概念与可信分数
linkTitle: 核心概念
weight: 40
description: 四个用户概念、不可变评测身份、score validity、coverage 与晋级语义。
verified_against_version: 0.9.6
source_refs: [README.md, docs/architecture.md]
---

## 由你选择的四个概念 {#four-concepts}

- **Dataset**：定义“必须做好什么”的业务 case 与指令。
- **Generator**：如何运行 Candidate 以产出回答或 Artifact。
- **Evaluator**：哪些 criterion 与 Evidence 才算有效质量。
- **Optimizer**：如何基于 Dataset 级证据提出一个受审改动。

Harbor 会把它们编译为更严格的 Evaluation Stack，其中包含 Integration、Renderer、Judge、Contract、Reporter、Policy、Context 与 Gate。用户不应在讲业务问题前先填写内部架构问卷。

## 身份链 {#identity}

可比 Job 绑定不可变或版本化身份：Candidate Manifest、Dataset Manifest、Evaluation Stack、Context、执行环境、Candidate model binding 与 Judge identity。Trial 属于一个 Job，并携带 output、criterion observation、Evidence 与 Artifact。

![评测身份链](https://istarwyh.github.io/harbor-self-evolving/images/diagrams/identity-chain.svg "不可变身份先于 Trial 分数")

## Raw reward 不等于 valid score {#validity}

即使缺少必要证据、解析失败或 criterion abstain，verifier 仍可能输出数字 raw reward。Harbor 保持以下状态区分：

- **valid score**：满足 contract 与证据要求；
- **invalid score**：数字不得参与质量聚合；
- **abstention**：Evaluator 明确无法判断；
- **coverage**：所需 population 中有多少产出了可用证据。

不展示 validity 与 coverage 的平均值，可能奖励一条坏掉的流水线。

## PROMOTE 与 REJECT {#promotion}

![确定性 Gate 决策](https://istarwyh.github.io/harbor-self-evolving/images/diagrams/gate-decision.svg "固定 Job 与 Policy 产出建议，而不是部署")

确定性 Gate 评估固定 Job 与 policy 输入。`PROMOTE` 表示相对可比 baseline 满足 policy；`REJECT` 表示不满足。两者都不代表“已部署”，也不替代人工或 CI/CD 权限。
