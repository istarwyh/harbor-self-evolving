---
title: 评测最近 Session
description: 把限量、脱敏的最近 DSH Session 转成非晋级 Historical evaluation Job。
weight: 10
verified_against_version: 0.9.7
source_refs: [docs/integration.md, docs/dsh-web-quickstart.md, packages/dsh-plugin/README.md]
---

当你已有真实 Agent 交互、却没有整理好的 Dataset 时，Historical evaluation 是冷启动入口。它用于**诊断**，不是晋级证据。

![Historical 评测流程](https://istarwyh.github.io/harbor-self-evolving/images/diagrams/historical-flow.svg "当前 Historical Context v2 流程")

## Web 路径 {#web}

1. 在 DSH Harbor 页面打开 **Historical Sessions**。
2. 预览当前 DSH 工作区可见、最近完成的顶层 Session，最多 **3 条**。
3. 检查冻结的 Judge 身份、投影字段、脱敏策略以及成本/数据披露。
4. 选择 Session 并确认。
5. Plugin 写入私有脱敏 Batch，每条 Session 物化为一个 Harbor Trial，并启动非晋级 Historical Job。

Agent 工具路径最多预览 **10 条**，但只允许 exact current working directory。Preview 返回安全 metadata 与短期 owner-bound selection token，而不是原始 Session id 或 transcript。

![合成 Historical 预览](https://istarwyh.github.io/harbor-self-evolving/images/screenshots/historical-preview.png "v0.9.3 历史图片 · synthetic component/service fixture · controlled runner · 无真实模型或 Harbor Job")

## 哪些数据会交给 Judge {#data-boundary}

经过限量、投影和 credential-shaped 脱敏的证据可以发送给所选 Judge。原始 Session id、完整工具 payload、reasoning 与附件不会直接作为 Judge 输入。私有 Batch 与 Job Artifact 留在本地，可能包含业务证据和普通绝对路径。

因此不能宣传“数据永不离开本机”。

## 如何读结果 {#result}

- 每条所选 Session 生成一个 Trial；
- criterion 可以 valid、invalid 或 abstained；
- 除分数外，还要看 coverage 与 reason code；
- `completed-unscored` 是有意义的结果，不是成功；
- Candidate rerun、可比 baseline 与 Gate 对此路径**不适用**。

把重复 badcase 整理成 Dataset，再进入 Candidate 流水线。

## 恢复边界 {#recovery}

当前 Historical Web operation 状态与锁是进程内的。Host 重启后，即使磁盘 Artifact 仍在，也可能无法重新挂接。这与 durable `@harbor` snapshot 和其他 operation journal 不同，必须按 operation 说明恢复保证。
