---
title: Workbench、上下文与受审动作
linkTitle: Plugin Workbench
description: 在 DSH 原生 Workbench 中导航，绑定页面上下文，检查证据，并在执行前审阅动作。
weight: 30
aliases: [/zh/docs/plugin/workbench/, /zh/docs/plugin/context/, /zh/docs/plugin/actions/, /zh/docs/plugin/settings/]
verified_against_version: 0.9.7
source_refs: [packages/dsh-plugin/README.md, packages/dsh-plugin/src/client/index.jsx]
---

Harbor 页面注入现有 DSH Web GUI，复用 DSH locale、Session、conversation、composer、Settings 与 Tool View；它不是第二个聊天产品或登录系统。

## Object-first Workbench {#workbench}

一个 Job 连接八个 section：Summary、Trials、Pipeline、Optimization、Compare/Gate、Evaluator/Rubric、Artifacts、Audit。Pipeline 把 Candidate、Dataset、Integration、Renderer、Judge、Meta、Reporter、Optimizer、Gate 分开，避免把接线失败误报为低分。

Trial explorer 支持服务端分页、状态与 score-validity filter、排序、criterion evidence focus 与冻结 Trial set。业务 Artifact 始终附着在产出它的 Trial 上。

![合成响应式 Workbench](https://istarwyh.github.io/harbor-self-evolving/images/screenshots/workbench-mobile.png "v0.9.5 · synthetic 500 px component fixture · 仅证明响应式状态")

## 页面上下文 {#context}

Host 支持时，普通发送会冻结当前 Harbor 页面上下文。`Ask AI` 或显式 `@harbor` 引用优先，而且 one-shot。Host 为精确 Session、project 与 revision 解析 opaque token，再返回 typed refs 与 navigation action。Evidence 读取验证完整祖先链，并把内容视为不可信数据。

![合成原生对话上下文](https://istarwyh.github.io/harbor-self-evolving/images/screenshots/native-context.png "v0.9.4 历史图片 · synthetic controlled-model fixture · 非真实 provider")

## 受审动作 {#actions}

七类 draft 覆盖 Candidate change、Evaluator change、Compare、Diagnostic Evaluation、Infrastructure Retry、Gate Request 与 Deployment Handoff。Proposal 不是授权。

1. 用户显式请求动作。
2. AI 从新鲜页面上下文创建可过期 draft。
3. 确定性 preflight 展示 target、diff、身份与限制。
4. 用户确认精确动作。
5. Host journal 执行并展示 progress/recovery 状态。

Candidate/Gate/handoff draft 不会静默执行；Compare 只读；未注册生产动作直接拒绝。

## Settings 与 operation {#settings}

Settings 展示 project root 来源、Stack/jobs/CLI 检查、credential policy、执行环境与版本状态。Agent 工具仍以调用 Session cwd 为权威；process-local Settings root 主要服务 Web 与 fallback。

后台 operation 可以显示 progress、partial evidence、取消与导航，但持久化能力因 operation 而异。未知状态不能伪装为成功，失败也不能静默重试。

> [!WARNING]
> 0.9.7 已接受 Candidate Context v3，并显式识别 Historical Context v2。Compare/Gate 仍由 Artifact 有效性、身份可比性、mode 与 policy 控制；参见 [Plugin 边界](https://istarwyh.github.io/harbor-self-evolving/zh/product/dsh-plugin/#limits)。
