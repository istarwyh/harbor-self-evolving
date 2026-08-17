# 架构与角色

## 三个角色，一个外部 Gate

| 角色 | 在本模板中的落点 | 职责 |
| --- | --- | --- |
| 生成器 | DSH/Cordis Candidate | 执行业务任务，产生答案、工具调用和引用 |
| 评测器 | Harbor Task + Verifier | 在固定环境中把行为转换为指标和失败证据 |
| 优化器 | 人或 DSH Agent | 读取证据，只产生一个新的 Candidate |
| Promotion Gate | `promotion.py` + policy | 用确定性规则决定是否晋级，不让优化器自己裁判 |

这里的 checkpoint 不是一份随时变化的工作目录，而是两个相互关联的不可变记录：

1. Candidate checkpoint：版本、文件清单、运行时和 SHA-256 digest。
2. Evaluation checkpoint：Harbor Job 配置、Trial 结果、ACP 轨迹、指标汇总和 Gate 报告。

因此可以回答三个关键问题：评测的是谁、在什么环境评测、为什么晋级。

## 数据流

```text
Cordis composition
  └─ snapshot → candidate-manifest.json
                     ↓ digest lock
Harbor Dataset → Job → Trial(s) → Verifier rewards
                     ↓
              evaluation-summary.json
                     ↓
baseline summary + candidate summary + promotion-policy.json
                     ↓
              PROMOTE / REJECT
```

一个 Candidate 可以对应多个 Job；一个 Job 只允许绑定一个 Candidate digest。不同 Candidate 的比较必须使用同一评测集版本、环境版本和 Gate policy，生产系统还应把这些版本写进外层实验记录。

## reward 如何承载业务失败

DeepResearch 示例把结果拆成可诊断指标：

```text
reward = 0.4 × task_completion
       + 0.2 × tool_call_success
       + 0.2 × search_validity
       + 0.2 × citation_correctness
```

v1 虽然答对“30 天”，但发生工具失败、空查询和错误 source id，因此只有 0.4；v2 修复三个过程质量问题后得到 1.0。总 reward 用于排序，分项指标用于根因分析和非回归约束。

## 元评测也是同一套结构

当要优化的是评测器本身，可把角色旋转一次：

- Candidate 变为某个 Verifier / Judge 版本；
- Harbor Task 变为带人工 GT 的判分样本；
- reward 变为 RCR 等评测器对齐指标；
- Promotion Gate 要求对 GT 的一致性提升，并限制偏置、方差或成本退化。

也就是说，Harbor 既能管理“业务 Agent 是否进步”，也能管理“用于判断进步的评测器是否可靠”。两种实验必须分开建 Job 和 policy，不能让同一个待优化 Judge 同时充当自己的最终裁判。
