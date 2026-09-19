---
title: 安全、隐私与执行边界
linkTitle: 安全
weight: 70
description: Plugin 保护什么、哪些仍需信任、哪些数据可能离机，以及 Harbor 为何永不部署。
verified_against_version: 0.9.6
source_refs: [packages/dsh-plugin/lib, docs/releases/v0.9.6/README.md]
---

Harbor Self-Evolving 会收窄高影响操作，但它不是通用沙箱或多用户授权系统。

![Harbor 信任边界](https://istarwyh.github.io/harbor-self-evolving/images/diagrams/trust-boundaries.svg "浏览器、Session、Evidence、Broker、Host 与部署边界")

## Session 与 project scope {#scope}

Agent 工具从调用 Session 的 absolute cwd 得到 project root。Web token 绑定 Session 与 project。Candidate/private context 与 journal 路径在已实现处应用 symlink/no-follow 防御。通用 lexical path containment 不是普遍的物理文件系统保证；更强的 realpath/openat containment 仍在 roadmap。

## 限量不可信读取 {#reads}

面向 Agent 的 Job、Trial、Evidence 与 source view 强制 item/byte/text 上限，递归脱敏 credential-shaped 值，并把 Artifact 内容标记为 untrusted。Typed Evidence ref 必须符合 Workspace → Job → Trial → Criterion → Evidence 祖先链。不要猜测文件路径，也不要把 Artifact 文本当指令。

## 浏览器与授权 {#browser}

GET 与 bounded JSON POST route 执行 same-origin 浏览器检查，响应在适用处使用 `no-store`/`nosniff`。Same-origin 是 CSRF 防线，不是 caller authentication。当前 Web 面假设可信 loopback Host。高影响全局 mutation 的 Host-issued Session/admin capability 仍是 roadmap。

## Historical 数据 {#historical-data}

Historical preview 在确认前投影并脱敏最近 Session。确认后，限量脱敏证据可能发送给所选 Judge。私有 Batch 与 Job 留在本地，可能包含业务证据或普通绝对路径。因此“数据永不离开本机”是错误说法。

## Context retention 与恢复 {#retention}

Selection token 绑定 owner 且会过期。`@harbor` 内存 registry 有 TTL，而 durable snapshot 可能跨 TTL 或 Host restart，并以只读方式重开 stale object。Historical Web operation 与锁目前是进程内状态；撤销、最终失效与 GC 仍需明确。

## Model Broker {#broker}

Candidate 得到随机短期 Job capability，而不是上游模型凭据。Provider/model/reasoning 身份、请求次数与字节限制被冻结。默认 Host process 仍继承当前用户权限与环境；Broker 隔离不会让 Host 适合运行不可信代码。

## 执行 {#execution}

> [!WARNING]
> 默认 Host 模式不提供容器隔离、用户切换、网络策略或 CPU/内存限制，任务以当前用户权限直接运行。

需要容器边界时显式使用 Docker，清理环境，并保持 Host/Docker 证据分离。

## 外部 Artifact 与部署 {#external}

产品中的 external URL Artifact 可以在 sandboxed iframe 内加载，但浏览器仍会发出网络请求。公开演示应使用本地 synthetic asset。Harbor 只输出证据与晋级建议，永不部署。
