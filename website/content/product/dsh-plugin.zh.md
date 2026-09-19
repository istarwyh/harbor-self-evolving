---
title: DSH 原生评测工作台
description: 完整介绍 DSH Plugin 的 19 个工具、Workbench、Host 服务、受审动作与当前限制。
weight: 10
aliases: [/zh/product/plugin/, /zh/product/skill/, /zh/product/adapter/, /zh/product/roadmap/]
verified_against_version: 0.9.6
source_refs: [packages/dsh-plugin/index.js, packages/dsh-plugin/README.md, packages/dsh-plugin/lib/dashboard.js]
---

npm 包 `dsh-harbor-evolution` 不只是工具注册表，它承担五层职责：

1. **安装生命周期**：配置选定 DSH profile，安装 Python Adapter，暴露内置 Skill，并要求重启。
2. **Agent 编排**：注册 19 个带 typed boundary 与批准语义的严格工具。
3. **原生 Web 体验**：Workbench、Historical 启动器、Context、Evidence、Artifact、operation 与 Settings。
4. **Host 服务**：限量读取 project/job、选择 Session、代理模型调用、协调后台操作。
5. **信任边界**：脱敏、same-origin 浏览器检查、显式确认和不可信证据 envelope。

![DSH Plugin 职责层](https://istarwyh.github.io/harbor-self-evolving/images/diagrams/plugin-layers.svg "当前契约 · 解释图")

## 工具面 {#tools}

Plugin 注册 **19 个工具**。10 个 mutation 工具需要 DSH 一次性批准；9 个为只读或内存操作。逐工具契约见[工具参考](https://istarwyh.github.io/harbor-self-evolving/zh/docs/reference/tools/)。

## Workbench {#workbench}

Web 体验把严格流水线带进 DSH：

- Dashboard 与 Job/Trial 状态；
- Pipeline stage 与 preflight；
- Context、可比 baseline 与 Gate readiness；
- Trial 输出、criterion evidence 与 artifact；
- Historical Session 选择与披露；
- 受审动作草稿、确定性 preflight 与显式确认；
- 后台 operation 与恢复状态；
- Settings、执行环境和版本 UI。

![合成 Harbor Workbench](https://istarwyh.github.io/harbor-self-evolving/images/screenshots/workbench-desktop.png "v0.9.5 · 经过裁切的 synthetic component fixture · 非真实 Host/model/evaluation")

## 上下文与受审动作 {#context}

普通聊天仍是普通聊天。`@harbor` 页面上下文解析短期、owner-bound 引用；typed Evidence ref 再强制 Workspace → Job → Trial → Criterion → Evidence 祖先关系。Artifact 文本始终是不可信数据。

Ask AI 可以准备 proposal draft，但不能写文件、启动 Job、修改 Evaluator、运行 Gate 或部署。用户必须另行检查确定性 preflight，并确认精确动作。

## 当前限制 {#limits}

> [!WARNING]
> **已知问题（0.9.6）**：当前 Web Dashboard 尚未接受 Candidate Context v3。Adapter 已生成 Candidate Context v3，但 Dashboard 仍按 Candidate Context v2 判断，因此真实 Candidate v3 Job 会被标记为 `unsupported/read-only legacy` 与 `invalid`，并关闭 Compare/Gate。Historical Context v2 可以读取，但目前由通用 `schema_version === 2` 分支覆盖，尚缺 protocol-aware contract test。在修复并发布前，不应将 Candidate v3 的 Web Compare/Gate 描述为完整可用。

Same-origin 检查是浏览器 CSRF 防线，不是 caller authentication。Historical Web operation 锁为进程内状态，而部分 durable `@harbor` snapshot 可超过内存 TTL；retention 与恢复能力因 operation 而异。

本地未打 tag 的一键更新仅是**开发预览**，不属于 0.9.6。已发布版本 UI 只做版本检查，展示精确可复制命令与 release 链接，不会静默安装。
