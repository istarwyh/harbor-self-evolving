---
title: 架构与信任边界
linkTitle: 架构
weight: 50
description: DSH Plugin、Skill、Python Adapter、两套 Context 协议、执行环境与确定性 Gate。
verified_against_version: 0.9.7
source_refs: [packages/dsh-plugin/index.js, packages/harbor-plugin/src/harbor_dsh_evolution/context.py, packages/harbor-plugin/src/harbor_dsh_evolution/historical_context.py]
---

![Harbor Self-Evolving 架构](https://istarwyh.github.io/harbor-self-evolving/images/diagrams/system-architecture.svg "当前 0.9.7 契约与显式安全边界")

## 三个产品角色 {#roles}

- **Plugin**：面向用户的 DSH 集成与权限边界。
- **Skill**：选择最小安全评测路径的工作流 policy。
- **Adapter**：物化 Job、Trial、Evidence 与 Context 的 Harbor runtime bridge。

**Gate** 保持独立确定性 policy function；它不是 Optimizer 的一部分，也没有部署能力。

## 八角色 Evaluation Stack {#stack}

Generator、Integration、Renderer、Evaluator/Judge、Contract、Reporter、Optimizer、Policy/Gate 把执行、观察、解释、报告、变更建议与晋级分开，避免一个不透明 prompt 同时改系统又给自己打分。

## 两套 Context 协议 {#protocols}

| 协议 | Schema | 用途 |
|---|---:|---|
| Candidate evaluation context | v3 | 可比 Candidate Job：manifest、runtime/model 身份、Stack 与 baseline 发现 |
| Historical generation evaluation context | v2 | 冻结脱敏 Session Batch 的非晋级诊断 |

它们共享部分身份概念，但不能互换。Historical v2 不能只因为对象写着 `schema_version: 2` 就被接受；必须做 protocol-aware 验证。

## 执行环境 {#execution}

0.9.7 默认 **Host**，Docker 为显式 opt-in。执行环境身份进入 Context，因此 Host 与 Docker 结果不会静默视为可比。

> [!WARNING]
> 默认 Host 模式不提供容器隔离、用户切换、网络策略或 CPU/内存限制，任务以当前用户权限直接运行。

Model Broker 给 Candidate 随机、短期 Job capability，不向 Candidate 下发上游模型凭据。它限制请求数与字节数，但不能证明 Host 环境没有其他 secret，也不是 provider 计费 hard cap。

## Artifact 与 Evidence 流 {#evidence}

Task output 成为 Trial output；Evaluator 产出 observation 与 typed Evidence；先计算 validity 与 coverage，再聚合；面向 Agent 的 Job summary 与 governance view 保持 bounded、redacted。用户可从窄 typed ref 导航回精确 criterion，但不能任意读取文件。
