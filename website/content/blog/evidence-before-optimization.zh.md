---
title: 先证据，后优化
description: 为什么 Agent 在下一次重写前，需要 validity、coverage 与可比身份。
date: 2026-09-19
tags: [评测, 证据, 设计]
---

让自进化失去可信度的最快方式，是让同一个不透明循环自己选 case、重写自己，再宣布胜利。

Harbor 反过来：先固定测什么、怎么测；再检查证据是否有效、覆盖多少 population；然后才提出一个改动，并与身份仍匹配的 baseline 比较。

这就是 Optimizer 与 Gate 分离、Historical Session 只用于诊断、raw reward 不会静默变成 valid score 的原因。

它看起来比“重写到 demo 好看”为慢，却远比上线一个无法解释分数的 regression 更快。
