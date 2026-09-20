---
title: 产品
description: 了解三个交付物、两条评测路径、设计原则、历史和当前限制。
type: docs
icon: fa-solid fa-cubes
sidebar_root_for: self
sidebar_root_link_self: true
outputs: [HTML, print, RSS, markdown, LLMSFULL]
menus:
  main: { identifier: product, weight: 10 }
cascade:
  type: docs
  footer_style: slim
verified_against_version: 0.9.6
source_refs: [README.md, CHANGELOG.md, packages/dsh-plugin/README.md]
---

Harbor Self-Evolving 为 DeepSeek Harness 增加**持续评测与受控自进化**，由三个部分协作交付：

- **DSH Plugin**：原生工具、Workbench、Host 服务与权限边界。
- **`evolve-agent-with-harbor` Skill**：由本项目维护的官方编排策略。
- **Python Adapter**：Harbor Generator、Evaluator、Optimizer 接线与确定性 Gate 集成。

## 从 Dataset 到元评测 {#evaluation-roles}

插件不是只调用一个 Judge，而是把完整评测闭环拆成可治理角色：

| 角色 | 插件如何支持 |
|---|---|
| **Dataset（评测数据集）** | 校验 Task、instruction、路径与 source digest；区分用于修复的训练数据、用于选择方案的验证数据和最终 holdout。 |
| **Generator（生成器）** | Adapter 在冻结的 Candidate、model binding、Context 与 Host/Docker 环境中运行 Agent，保存 output 与 Artifact。 |
| **Evaluator（评估器）** | 统一 `script` / `llm-as-judge` 接口，按 criterion 记录 Evidence、validity、abstention 与 coverage。 |
| **Optimizer（优化器）** | Skill 和 Agent 从 Trial 证据提出一个受审改动；它不拥有评分、Gate 或部署权限。 |
| **Meta-Evaluation（元评测）** | 用独立 Ground Truth 检查 Evaluator 的 fidelity、calibration 与 ranking reliability，防止用一把未经验证的尺子优化 Agent。 |

机器学习中的训练集、验证集和测试集不是三种文件格式，而是三种信息边界：用于修改 Candidate 的 case 已经是训练信息；反复用于选方案的数据会成为验证信息；只有在最终运行前未向 Optimizer 暴露答案的 holdout，才适合估计泛化。详见[核心概念与可信分数](https://istarwyh.github.io/harbor-self-evolving/zh/docs/concepts/)与[Evaluator 治理](https://istarwyh.github.io/harbor-self-evolving/zh/docs/workflows/evaluator/)。

## 两条评测路径 {#paths}

| 路径 | 从哪里开始 | 回答什么问题 | 可作为晋级证据？ |
|---|---|---|---|
| Historical 诊断 | 最近完成的 DSH Session | 当前 Agent 失败在哪里？ | 否，仅诊断 |
| Candidate 回归 | 冻结的 Candidate + Dataset + Stack + Context | 单个受控改动在可比证据上是否更好？ | 满足 policy 与 Gate 条件时可以 |

![双路径评测模型](https://istarwyh.github.io/harbor-self-evolving/images/diagrams/two-paths.svg "当前契约 · 解释图")

## Skill {#skill}

内置 Skill 选择摩擦最小且安全的路径：没有 Dataset 时使用最近 Session；用户提供 Candidate 后进入严格流水线。昂贵执行前先固定身份，从 typed evidence 读取结果，并且从不把 Gate 当作部署权限。

## Adapter {#adapter}

Python 包 `harbor-dsh-evolution` 把 DSH Candidate 与 Task 映射到 Harbor 评测接口。0.9.6 使用 **Candidate Context v3** 和 **Historical Context v2**。Host 为默认执行环境，Docker 为显式 opt-in。

## 设计原则 {#principles}

1. 先身份，后分数。
2. 先有效性与 coverage，后平均值。
3. 每轮只做一个受控改动。
4. 证据和 policy 与优化器分离。
5. Gate 建议与部署分离。
6. 在动作发生处披露权限与 provider 边界。

## 状态与路线图 {#status}

**0.9.6 已交付：**包安装、19 个 Agent 工具、Workbench、Historical 诊断、Evaluator 治理、版本检查、Host 默认与 Docker opt-in。

**开发预览：**本地未打 tag 的 checkout 包含一键更新工作，不属于 0.9.6。在 profile/runtime 身份继承、并发、回滚和供应链边界补齐前，不得宣传为已发布能力。

**路线图：**修复 Candidate Context v3 Web 合约、持久化操作恢复、强化 mutation 授权、retention/GC、更安全的外部 Artifact 预览，以及更完整的浏览器与无障碍覆盖。

> [!WARNING]
> **已知问题（0.9.6）**：当前 Web Dashboard 尚未接受 Candidate Context v3。Adapter 已生成 Candidate Context v3，但 Dashboard 仍按 Candidate Context v2 判断，因此真实 Candidate v3 Job 会被标记为 `unsupported/read-only legacy` 与 `invalid`，并关闭 Compare/Gate。Historical Context v2 可以读取，但目前由通用 `schema_version === 2` 分支覆盖，尚缺 protocol-aware contract test。

## 从原型到 0.9.6 {#history}

- **0.1–0.8：**建立 Candidate/Dataset/Stack 模型、评测循环与 DSH 集成。
- **0.9.0–0.9.4：**原生 Workbench、Historical Session 冷启动、受审动作、上下文与证据导航。
- **0.9.5：**合并 Workbench，并强化发布证据。
- **0.9.6：**Host-first 执行，Docker 显式 opt-in，同时保留安全边界。

每个正式版本的证据与限制见[发布](https://istarwyh.github.io/harbor-self-evolving/zh/releases/)。
