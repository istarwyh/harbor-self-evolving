# 架构与稳定进步

## 三个业务角色与一个确定性 Gate

| 角色 | 落点 | 职责 |
| --- | --- | --- |
| 生成器 | DSH/Cordis Candidate | 执行业务任务并产生行为轨迹 |
| 评测器 | Harbor Dataset + Evaluation Stack | 把行为转换为 reward、诊断指标和证据 |
| 优化器 | 人或 DSH Agent | 从证据提出一个受控 Candidate 改动 |
| Promotion Gate | Policy v2 + `promotion.py` | 独立判断是否晋级，优化器不能自我裁判 |

两个 checkpoint 共同回答“评测了谁、用什么尺子、为什么晋级”：

1. Candidate checkpoint：产品身份、版本、文件清单、运行时和 digest。
2. Evaluation checkpoint：Dataset Manifest、Evaluation Stack Manifest、Context v2、Doctor、Contract、Trials、Population、Summary 和 Gate 报告。

## Evaluation Stack

`.harbor/evaluation-stack.yml` 显式定义八个角色：

- Integration：调用业务 Agent/服务。
- Renderer：把原始执行结果规范化。
- Evaluator：计算指标和结构化 findings。
- Rubric：声明判分语义。
- Diagnoser：从 evidence 分类根因。
- Optimizer：提出带 evidence reference 的改动假设。
- Runner：只负责编排。
- Reporter：把 Contract、Trial、Population 和 Gate 产物呈现出来。

Judge 的 provider/model/version/parameters 也是 Stack 身份。Doctor 会阻止把 HTTP、Rubric、Judge 和 Promotion 决策塞进一个 God Runner。

## Context v2 的两种 digest

```text
Candidate manifest ──────────────┐
Dataset manifest ────────────────┼─ full_digest（完整审计）
Evaluation Stack full identity ──┤
runtime + Job mode ──────────────┘

Dataset identity ────────────────┐
Integration/Renderer/Evaluator ──┤
Rubric/Judge ────────────────────┼─ digest（可比较性）
semantic Runner + runtime ───────┘
```

Candidate 不进入可比较 digest：v1/v2 必须是不同 Candidate digest，但必须共享同一把评测尺子。Diagnoser、Optimizer、Reporter 和 `semantic: false` Runner 会进入完整审计，却不改变 reward 可比较性。

以下变化必须建立 fresh baseline：Dataset id/version/source、Integration、Renderer、Evaluator、Rubric、Judge、语义 Runner、Harbor 或 Adapter runtime。Policy 是独立版本化的决策合同，可以在已有指标足够时重新应用，不会改写 Context。

## 严格数据流

```text
Clarify → Init → Dataset Validate → Architecture Doctor
                                    ↓
Candidate Snapshot → Context Preview → Harbor Job
                                    ↓
Contract + Trial Assessments + Population + Summary
                                    ↓
evidence-linked controlled change → next Candidate Job
                                    ↓
Context v2 comparability + Policy v2 → PROMOTE / REJECT
                                    ↓
external CI/CD promotes the same evaluated artifact
```

`promotion-eligible` Job 必须具有 Candidate Manifest、Dataset Manifest、Stack Manifest、Context v2、Policy v2 和零 Doctor error。Context v1 不提供兼容降级。

## reward 与诊断证据

DeepResearch 示例把过程失败直接写进 reward：

```text
reward = 0.4 × task_completion
       + 0.2 × tool_call_success
       + 0.2 × search_validity
       + 0.2 × citation_correctness
```

工具调用失败、空搜索和错误引用不是 prose-only 备注，而是独立指标和 Trial evidence。总 reward 用于排序，分项指标用于根因和非回归。

## 元评测

优化评测器时旋转角色：Candidate 是 Evaluator/Rubric/Judge 版本；Dataset 是带独立人工 GT 的样本；指标可包含 RCR、偏置、方差、校准、时延和成本。待优化评测器不能生成自己的 GT 或最终 Gate 决策。元评测仍使用相同 Manifest、Context v2、Doctor、Job 和 Gate 机制。
