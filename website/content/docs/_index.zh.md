---
title: 文档
description: 安装 Harbor Self-Evolving，理解证据模型，运行两条评测路径并检查精确契约。
type: docs
icon: fa-solid fa-book
sidebar_root_for: self
sidebar_root_link_self: true
outputs: [HTML, print, RSS, markdown, LLMSFULL]
menus:
  main: { identifier: docs, weight: 20 }
cascade:
  type: docs
  footer_style: slim
---

选择与你的问题匹配的路径：

- [安装并开始](https://istarwyh.github.io/harbor-self-evolving/zh/docs/start/)：把 Plugin、Adapter 与 Skill 安装到选定 DSH profile。
- [Historical 诊断](https://istarwyh.github.io/harbor-self-evolving/zh/docs/workflows/historical/)：从最近完成的 Session 学习，但不把它当晋级证据。
- [Candidate 评测](https://istarwyh.github.io/harbor-self-evolving/zh/docs/workflows/candidate/)：冻结身份，运行可比回归并应用 policy。
- [Plugin Workbench](https://istarwyh.github.io/harbor-self-evolving/zh/docs/plugin/)：理解 Context、Evidence、Artifact 与受审动作。
- [核心概念](https://istarwyh.github.io/harbor-self-evolving/zh/docs/concepts/)：理解 valid score、raw reward 与 coverage 为何不可互换。
- [架构](https://istarwyh.github.io/harbor-self-evolving/zh/docs/architecture/)：检查协议、执行环境与信任边界。
- [19 工具参考](https://istarwyh.github.io/harbor-self-evolving/zh/docs/reference/tools/)：查阅每个 Agent 工具与批准边界。
- [安全](https://istarwyh.github.io/harbor-self-evolving/zh/docs/security/)：运行不可信 Task 前先了解限制。

> [!IMPORTANT]
> 版本基线：**Harbor Self-Evolving 0.9.6（Beta）**，兼容 **Harbor `>=0.21,<0.22`**。未打 tag checkout 的开发预览行为单独标注。
