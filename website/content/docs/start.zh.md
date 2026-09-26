---
title: 安装与开始
description: 把 registry 正式版安装到选定 DSH profile，重启，验证 Plugin，并选择评测路径。
weight: 10
aliases: [/zh/docs/start/install/, /zh/docs/start/recent-sessions/, /zh/docs/start/candidate/]
verified_against_version: 0.10.0
source_refs: [AGENTS.md, README.md, docs/dsh-web-quickstart.md]
---

## 要求 {#requirements}

- 可用的 DeepSeek Harness，以及要评测的业务 Agent 工作区。
- 用于 DSH Plugin setup 的 Node.js/npm。
- 安装 Adapter 所需的 Python 环境支持。
- Harbor `>=0.21,<0.22`。
- 只有显式选择容器执行时才需要 Docker；0.10.0 默认 Host。

## 安装 {#install}

请在**业务 Agent 工作区**运行，不要在本源码仓库运行：

```bash
npx --yes dsh-harbor-evolution@latest setup --project-root "$PWD"
```

需要固定版本时，把 `latest` 换成 `0.10.0`。Setup 会写入选定 DSH profile 依赖、配置 Harbor 项目集成、安装兼容 Python Adapter，并暴露内置 `evolve-agent-with-harbor` Skill。随后执行 setup 打印的精确重启命令。

> [!WARNING]
> 普通安装不要使用 `dsh plugin add ./packages/dsh-plugin`。这会产生机器本地 `link:` 依赖，并漏掉 Adapter setup。

## 验证 {#verify}

重启后验证三个面：

1. 选定 profile 依赖精确 registry 版本 `"dsh-harbor-evolution": "0.10.0"`，而不是 `link:...`；
2. `harbor plugins list` 同时包含 `dsh-evolution` 与 `dsh-historical-evaluation`；
3. 内置 `evolve-agent-with-harbor` Skill 存在。

然后打开 DSH 的 Harbor 导航入口。健康安装会在原生界面中暴露 Workbench、Historical Sessions、Context 与 Settings，而不是另起独立 Web server。

## 选择第一条路径 {#choose-path}

**还没有 Dataset？**从 [Historical 诊断](https://istarwyh.github.io/harbor-self-evolving/zh/docs/workflows/historical/)开始。Web 最多预览 3 条最近完成 Session（Agent 工具在 exact cwd 下最多 10 条），检查脱敏/Judge 披露后确认非晋级 Job。

**已有 Candidate 与 Dataset？**按照 [Candidate 评测](https://istarwyh.github.io/harbor-self-evolving/zh/docs/workflows/candidate/)执行 snapshot、validate、doctor、Context preview、可比 baseline、单个受控回归和 Gate。

## 源码开发 {#source-development}

只有修改本仓库的贡献者才应 clone 并运行：

```bash
./hse dsh-install-source web
```

源码 build 可能包含未发布行为，不能当作正式 0.10.0 包。早期未打 tag 的一键更新预览已在 0.9.7 前撤回；浏览器只检查版本并复制完整、可审阅的终端命令。
