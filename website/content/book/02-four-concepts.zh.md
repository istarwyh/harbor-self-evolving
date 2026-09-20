---
title: 定义四个概念
book_number: 2
weight: 20
description: 用业务语言理解 Dataset、Generator、Evaluator、Optimizer，以及训练集、验证集、测试集和元评测。
---

自进化不是“让模型改自己”，而是建立一条可检查的学习链：**用 Dataset 规定问题，让 Generator 产出结果，让 Evaluator 依据证据判断，再让 Optimizer 只提出一个受控改动。** Evaluator 自己还要接受 Meta-Evaluation（元评测）。

## 先认识四个角色 {#four-roles}

- **Dataset（评测数据集）**：代表业务任务与失败模式的 case 集合，回答“测什么”。
- **Generator（生成器）**：运行 Candidate 并生成回答或 Artifact，回答“谁来答、怎样答”。
- **Evaluator（评估器）**：依据 criterion 与 Evidence 判断质量，回答“什么算好、证据是否够”。
- **Optimizer（优化器）**：从失败证据提出一个新版本改动，回答“下一步改什么”。

这四个名称来自评测与机器学习，但在 Agent 系统里都比单个模型更宽：Generator 包括 prompt、Skill、工具和运行环境；Evaluator 包括 rubric、Judge、解析与有效性规则；Optimizer 也可能是受 Skill 约束的 Coding Agent。

## 为什么要区分训练、验证与测试 {#splits}

把数据分层的核心目的是防止“看过答案之后再参加考试”。

| 数据层 | 用途 | 能否指导改动 |
|---|---|---|
| 训练 / 修复集 | 暴露已知 badcase，修改 prompt、Skill、代码或工具策略 | 可以，正是为了指导改动 |
| 验证 / 回归集 | 比较多个 Candidate、调整阈值、选择方案 | 可以看结果，因此会被逐渐过拟合 |
| 测试 / holdout 集 | 在身份冻结后估计未知 case 的表现 | 最终运行前不应向 Optimizer 暴露答案 |

同一 case 一旦被用于修改 Candidate，就不能继续假装是“从未见过”的测试样本。样本不多时，可以不机械地三等分，但必须记录每个 case 的用途和泄漏历史。

Historical Session 适合发现真实失败并形成训练/修复 case；它不是晋级证据。经过审查、脱敏和版本化后，这些 badcase 才能进入 Dataset。最终 Candidate 回归应使用固定 Dataset、Stack、Context 和 baseline。

## 插件怎样运行这一闭环 {#plugin-loop}

1. **整理 Dataset**：检查 Task 唯一性、路径、instruction 与 immutable source digest。
2. **冻结 Generator**：记录 Candidate manifest、模型绑定和 Host/Docker 环境。
3. **执行 Evaluator**：为每条 criterion 产生 observation、Evidence、validity、abstention 与 coverage。
4. **约束 Optimizer**：只允许在明确表面上提出一个受审改动，并生成新身份。
5. **重新回归**：不覆盖旧 Job，让 baseline 与 Candidate 证据可比较。
6. **执行 Gate**：固定输入下返回 `PROMOTE` 或 `REJECT` 建议，但不部署。

## 为什么 Evaluator 也要被评测 {#meta-evaluation}

评估器不是神谕。Judge 可能受措辞、位置、模型版本或解析失败影响；确定性脚本也可能把错误字段当成成功。

插件允许建立独立 Ground Truth，把重复 Evaluator observations 与之比较，计算 ESF、SCE 和 RCR。用于改 rubric 的数据是 evaluator tuning set；证明 Evaluator 可靠的数据应来自独立 holdout。Candidate Evaluator 不能自己制造“标准答案”再证明自己正确。

## 你做什么 {#you-do}

选择代表性 case，标记它属于训练、验证还是 holdout；定义 Agent 产物；为 criterion 写证据要求；指定允许改变的表面，并审查每次 proposal。

## Harbor 记录什么 {#harbor-records}

Dataset/Stack manifest、criterion 与 Evaluator 身份、Candidate/model binding、执行环境、Trial Evidence、coverage、元评测 provenance 与 Gate receipt。

## 这不能证明什么 {#does-not-prove}

Manifest 有效只证明结构与身份；训练集变好不证明泛化；测试集分数高不证明 Evaluator 正确；Gate 通过也不代表已经部署。可信改进需要这些边界同时成立。

更完整的术语、数据分层与插件映射见[核心概念与可信分数](https://istarwyh.github.io/harbor-self-evolving/zh/docs/concepts/)。
