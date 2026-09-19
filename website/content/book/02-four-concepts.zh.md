---
title: 定义四个概念
book_number: 2
weight: 20
description: 先用业务语言描述 Dataset、Generator、Evaluator 与 Optimizer，再编译严格 Stack。
---

从四个面向用户的概念开始：case、执行、判断与受控改动。业务 contract 清晰后，Harbor 再编译内部角色。

## 你做什么 {#you-do}

选择代表性 case，定义 Agent 产物，为 criterion 写证据要求，并约束允许改变的面。

## Harbor 记录什么 {#harbor-records}

Dataset/Stack manifest、criterion 身份、Candidate binding 与执行环境。

## 这不能证明什么 {#does-not-prove}

Manifest 有效只证明结构与身份，不证明 case 代表生产，也不证明 Evaluator 正确。
