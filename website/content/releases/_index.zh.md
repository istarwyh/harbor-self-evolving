---
title: 发布与证据
linkTitle: 发布
description: 正式发布身份、已交付能力、证据类型与显式验证限制。
type: docs
icon: fa-solid fa-tags
sidebar_root_for: self
sidebar_root_link_self: true
outputs: [HTML, print, RSS, markdown, LLMSFULL]
menus:
  main: { identifier: releases, weight: 50 }
cascade:
  type: docs
  footer_style: slim
---

本页区分正式 tag/公开 package 与本地开发，也把 package 发布与验证证据分开。

## 当前发布 {#current}

### 0.10.4 · 协调发布归档维护

- 正式 tag：[`v0.10.4`](https://github.com/istarwyh/harbor-self-evolving/releases/tag/v0.10.4)
- 兼容：Harbor `>=0.21,<0.22`
- 主要变化：已完成核验的 0.10.3 公开制品记录进入正式 tag 源码，同时 npm Plugin、内置 Skill、Python Adapter、安装指引和网站身份一致推进。
- 证据：协调版本检查、生成 client 校验、package 构建以及公开 registry/release 核对。
- 限制：运行时评测行为与 0.10.3 相同；本版本不新增真实 provider 或业务质量证据。

[阅读 0.10.4 证据摘要](https://istarwyh.github.io/harbor-self-evolving/zh/releases/0.10.4/)。

## 发布历史 {#history}

| 版本 | 产品阶段 | 证据说明 |
|---|---|---|
| 0.10.3 | 可操作的项目目录权限恢复 | 针对性 service/client/setup 检查以及一致的公开 npm/PyPI 制品 |
| 0.10.2 | 稳定 Workbench 样式 | 针对性 client 生命周期/布局检查与协调 package 发布 |
| 0.10.1 | 可信科学评测闭环 | npm/PyPI 协调发布，包含完整自动化 package 与确定性 fixture 证据 |
| 0.10.0 | 发布不完整 | npm 已发布；PyPI/tag CI 在 Python artifact 构建前失败；由 0.10.1 取代 |
| 0.9.8 | Host 路径转换修复 | 合成 Host 集成与完整 package 检查；无模型调用 |
| 0.9.7 | Context Web 合约修复与双语站点 | 自动化 package/source/site 与公开制品检查；无真实 provider evaluation |
| 0.9.6 | Host-first 执行与环境身份 | 自动化 package/source 检查；无真实 provider evaluation |
| 0.9.5 | 合并 Workbench 与 release evidence gallery | Synthetic component fixture，非真实 provider evaluation |
| 0.9.4 | 原生页面上下文与对话交接 | Synthetic controlled-model interaction evidence |
| 0.9.3 | 受审动作与后台 operation | Component/service fixture 与失败状态 |
| 0.9.2 | Historical 冷启动修复与公开 package 证据 | 同时承接 0.9.1 未完整发布后的修复 |
| 0.9.1 | 发布未完成 | 不作为普通已交付卡片 |
| 0.8.x | Historical Generation Evaluation | 引入脱敏 Session Batch 与 `completed-unscored` |
| 0.7.x | 四概念 onboarding 与 Model Broker | 降低配置复杂度，同时保留严格身份 |
| 0.6.x | Evaluator 治理与元评测 | 把 score validity 与 raw reward 分离 |
| 0.5.x | 可比 Stack/Manifest/Context 架构 | 固定“谁”与“尺子” |
| 0.1–0.4 | Candidate 原型 → packaged DSH Web 集成 | 建立不可变 Candidate、Skill、Adapter 与原生 UI |

## 开发预览 {#development}

`8bb59e2` 中未打 tag 的一键更新预览已在 0.9.7 前撤回。Settings 只在完整安装身份可用时检查版本并复制精确命令；浏览器不会执行 registry 包。持久化恢复、强化 mutation 授权和更完整的浏览器/无障碍覆盖仍在路线图中。
