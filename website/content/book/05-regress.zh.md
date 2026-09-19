---
title: 运行一次受控回归
book_number: 5
weight: 50
description: 冻结身份，建立可比 baseline，只改一个面，并检查 Trial 级证据。
---

Snapshot Candidate、验证 Dataset、Doctor Stack、预览 Context；新路径先运行 diagnostic，再运行 promotion-eligible Job。

## 你做什么 {#you-do}

声明一个假设和一个允许的改动。保持 Dataset、criterion、provider 与 runtime 不变，除非改动明确要求新 baseline。

## Harbor 记录什么 {#harbor-records}

Manifest digest、Context v3、model/Judge 身份、Trial output、criterion Evidence、validity、coverage 与 governance impact。

## 这不能证明什么 {#does-not-prove}

如果证据无效、coverage 下降或 baseline 不可比，更高 raw reward 也不是进步。
