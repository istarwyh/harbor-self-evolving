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

### 0.9.8 · Host 路径转换修复

- 正式 tag：[`v0.9.8`](https://github.com/istarwyh/harbor-self-evolving/releases/tag/v0.9.8)
- 兼容：Harbor `>=0.21,<0.22`
- 主要变化：Host 命令转换保留已经解析的 Trial 路径，Historical Session Observation 与 Candidate 命令不再获得重复 Host Root 前缀。
- 证据：HostEnvironment/SessionObservationAgent 专项集成测试、完整 package 测试与构建。
- 限制：源码回归使用不调用模型的合成 Observation；正式包 Historical Job 验证仍保持显式。

[阅读 0.9.8 证据摘要](https://istarwyh.github.io/harbor-self-evolving/zh/releases/0.9.8/)。

## 发布历史 {#history}

| 版本 | 产品阶段 | 证据说明 |
|---|---|---|
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
