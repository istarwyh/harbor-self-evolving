---
title: 故障排查
weight: 80
description: 诊断安装、profile、Dataset、Context、Historical 与执行环境问题，不夸大成功。
verified_against_version: 0.9.7
source_refs: [docs/dsh-web-quickstart.md, docs/troubleshooting.md]
---

## 找不到 Harbor 页面 {#missing-page}

确认 setup 修改了 DSH 实际运行的 profile，按输出命令重启，并验证依赖为精确 registry 版本而非 `link:`。检查两个 Harbor plugin 与内置 Skill 都存在。

## Plugin 已加载但评测命令失败 {#entrypoints}

检查受管 Python 环境与 `harbor plugins list`。普通安装必须同时包含 `dsh-evolution` 和 `dsh-historical-evaluation`；只添加 npm 源码目录是不完整安装。

## Dataset 校验失败 {#dataset}

检查 Dataset manifest、重复 Task id、instruction file、路径、敏感 metadata 与不可变 source digest。不要通过静默覆盖身份来“修复” digest mismatch。

## 没有可比 baseline {#baseline}

比较 Candidate、Dataset、Evaluation Stack、Context、model/Judge 与执行环境身份。Host 结果不会静默与 Docker 可比；相关身份变化后应运行新 baseline。

## Historical preview 为空 {#historical}

Web 只看到当前 DSH 可访问、最近完成的顶层 Session。Agent preview 还要求 exact cwd。Running、nested、out-of-scope 或被 feedback policy 排除的 Session 会被省略；请读 preview reason count，不要把零结果当 crash。

## Job 完成但没有分数 {#unscored}

`completed-unscored` 可能表示没有适用 valid criterion、证据不足或 abstention。读取 Trial 与 criterion reason code；不能把执行完成转成零分或通过分。

## Apple Silicon 与 Docker {#apple-silicon}

0.9.7 Host-first，因此 Docker 不是默认前置条件。显式使用 Docker 时，单独验证 image architecture 与 runtime，并且不要把证据和 Host baseline 混用。

## Web Compare/Gate 被关闭 {#context-v3}

0.9.7 Dashboard 已支持 Candidate Context v3。如果 Job 仍显示 unsupported 或 invalid，请检查精确 Context schema、protocol、Artifact validation、mode 与可比身份；不要重写或降级 Context Artifact。
