# Harbor 科学评测与优化闭环重构技术方案

> 状态：已批准；Phase -1 至 Phase 5 已实现并通过自动回归，外部 Provider / 真实 GUI 人工验收边界见第 21 节
>
> 日期：2026-09-25
>
> 发布目标：`dsh-harbor-evolution 0.10.1` / `harbor-dsh-evolution 0.10.1` / Harbor `0.21.x`
>
> 核心决策：Harbor 的主产品从“审计与晋级工作台”重构为“可信的评测与优化闭环”。评测集、生成器、评测器（标准与指标）、优化器和评测器元评测成为用户主路径；保证可复现和防止误判的最小实验完整性继续保留在后台；Promotion Gate、Policy、完整 Artifact Registry 和细粒度审计界面降为可选治理能力。

## 1. 决策摘要

本方案不删除 Harbor 已有的严谨性，而是把它从产品主叙事中移开，并重新划分为三层：

1. **科学评测核心**：面向所有用户，直接回答“测了什么、表现如何、结果是否可信、问题在哪里、下一步改什么”。
2. **实验完整性内核**：后台保留最小身份、版本、覆盖率、证据引用和错误分类，确保结果可以复现、比较且不会把评测故障当成业务低分。
3. **可选治理扩展**：只有在正式版本对比、自动晋级或企业治理场景中才启用 Promotion Gate、Policy、完整审计、保留策略和发布交接。

默认产品不再要求用户理解 Candidate Context、Stack digest、Artifact Registry、Trial lifecycle、Policy reason code 等内部对象。它们可以继续作为内部实现或高级“实验详情”，但不能遮住评测结论。

用户级报告和 Historical 证据采用增量迁移；正式 Candidate 执行路径例外：已明确删除旧的任意 Task verifier 评分兼容层，不做双轨回退：

- 第一阶段从现有 Summary、Population、Diagnosis、Optimization 和 Meta-evaluation 产物生成新的用户级 `evaluation-report/v1`；
- 第二阶段补足历史会话的脱敏结构化执行证据，解决“工具调用很多但无法核验执行结果”的问题；
- 第三阶段把评测器元评测、优化假设和回归验证串成主流程；
- 最后再将 Promotion/Governance 从默认 Workbench 拆到可选模块。

### 1.1 已确认的产品边界

1. **“评测最近会话”是体验入口，不是正式业务评测。** 它使用内置体验 Evaluator 帮助用户理解 Dataset、Generator、Evaluator、Metrics、Optimizer 与证据不足等理念，不对业务 Agent 给出正式质量背书。
2. **正式业务评测由用户提供 Evaluator。** Harbor 负责统一协议、运行、结果解释、版本和实验闭环，不替用户定义业务上的“好”。
3. **用户看到的 Evaluator 必须就是实际执行的 Evaluator。** 配置身份、可编辑源码、运行时 bundle 和 Job 中记录的 executed identity 必须一致；不能展示 A、实际执行 B。
4. **Evaluator 是一等可编辑对象。** 修改必须创建新 Evaluator 版本；下一次 Job 执行该精确版本，并将旧 Job 保持不可变。
5. **样本有效性与 Evaluator 可靠性重要，但首阶段只保留正式位置和状态。** Dataset validity、独立 GT、Meta-evaluation 后续建设；未完成时明确显示 `not-assessed`/`unvalidated`，不阻塞体验功能。
6. **Optimizer 过拟合控制属于正式业务实验能力。** 体验入口先解释理念，不在首阶段实现训练/回归/保留集完整治理。
7. **允许导入外部真实业务结果。** 它作为独立的在线/业务观察，与离线评测并列展示和关联分析，不回写历史离线分数。
8. **Judge 成本、重试预算和失败恢复策略暂不进入本次重构范围。** 继续保留现有错误分类，不新增成本平台或复杂重试编排。

### 1.2 2026-09-25 实施快照

Phase -1 至 Phase 5 已落地并进入维护：

- `evaluation-report/v1` 已成为 Agent 结果工具和 Web Workbench 的默认结果视图；不可信 numeric score 统一抑制为 `null`，结果页显示 generator quality / evaluation health / run health。
- Candidate Job 在私有 Dataset 副本中替换全部 source `tests/`，仅通过 strict adapter 调用用户提供的 `harbor-dsh-evaluator/v2` exact bundle；native `reward.json` 不再是业务分数权威，v1 和任意 Dataset verifier 不提供执行回退。
- `effective-evaluator/v1` 记录 configured、materialized、executed identity 与 execution status；不一致或执行失败直接变成 `evaluation-error` 和 `score=null`。旧 executed bundle 即使 live Evaluator family 已替换，仍可从不可变快照分叉新版本。
- Candidate Context v3、Historical Context v3、Session Observation v2、Historical Batch v2、Artifact Registry v2、Assessment/Summary 和 Evaluation Spec 已写入共享合同；root、npm 与 Python package source 的 34 个公共 Schema 字节一致。
- Historical Evidence v2 提供 allowlist 驱动的有界工具结果摘要；`business-observation/v1` 提供不可覆盖、聚合、correlation-only 的外部业务观察。
- 正式 Experiment 固化 `evaluation-spec/v1`、repeat/seed policy、measurement identity、paired comparison 与不确定性；Historical badcase 只有人工确认 exact plan 后才能生成非 promotion-eligible 回归 Dataset 草稿。
- Meta-evaluation 绑定独立 GT 和 exact Evaluator/Rubric/Judge/Template identity，输出 ESF/SCE/RCR report；它仍是独立 report workflow，不声称存在专用 Harbor Meta Job/Gate。
- Diagnostic / Experiment / Governed 三种 Artifact Profile 已进入工具和 Workbench 导航；Compare、Gate 与完整 Audit 只在 Governed 模式出现。
- Host 明确为 unrestricted、非沙箱执行；Docker 才提供隔离边界。Governed Policy 必须要求 Docker 或显式接受 Host 风险，要求 immutable image identity 时缺失即阻断 Gate。
- 完成 Job 写入内容寻址 seal；Gate 验证 seal 并从 sealed Trial 产物重算 Summary invariants。seal 不是外部签名，不宣称抵御恶意本地所有者。

自动回归、构建结果和本轮未能完成的真实 GUI / 外部 Provider 验证边界见第 21 节及 [`docs/acceptance-status.md`](../../acceptance-status.md)。

## 2. 问题与事实依据

### 2.1 用户真正需要的结果

运行一次评测后，用户通常只想回答五个问题：

1. 最近这些任务整体做得怎么样？
2. 哪些结论可以相信，哪些证据不足？
3. 最常出现的问题是什么？
4. 应该先改生成器、评测器，还是评测数据？
5. 改完以后如何用同一把尺子验证改善？

当前 Workbench 主要围绕 Job、Trial、Pipeline、Context、Artifact、Gate 和 Audit 组织，要求用户先理解系统结构，再自行拼出上述答案。这使技术正确性高于产品可理解性。

### 2.2 2026-09-25 最近会话评测暴露的问题

本次真实 Historical Generation Evaluation 选择 4 条最近会话，运行约 49 秒，所有基础产物校验通过，但结果为：

| 项目 | 结果 |
| --- | ---: |
| 终态 Trial | 4 / 4 |
| 有效 Trial 总分 | 0 / 4 |
| `completed-unscored` | 3 |
| `evaluation-error` | 1 |
| 已评分 Criterion | 9 / 16（56.25%） |
| 可进入整体指标的值 | 无 |

三个完成 Judge 调用的 Trial 呈现相同模式：

- `goal_progress`：可评分且表现良好；
- `interaction_quality`：可评分且表现良好；
- `execution_reliability`：只能得到部分肯定；
- `evidence_alignment`：因为工具 payload 被省略而 `insufficient-evidence`。

另一个 Trial 因 Judge Broker `RuntimeError` 进入 `evaluation-error`。

系统在证据不足时拒绝编造总分，这是正确行为；但默认页面仍让用户面对 `completed`、`completed-unscored`、Criterion coverage、Gate N/A 等术语，没有首先给出：

> 最近 4 条会话中，3 条看起来完成了任务，但执行结果缺少可核验证据；另有 1 条评测失败。当前不能可靠判断整体质量，优先修复证据采集而不是修改 Agent。

### 2.3 当前架构为何显得像审计系统

当前 `.harbor/evaluation-stack.yml` 强制声明八个角色：

- Integration
- Renderer
- Evaluator
- Rubric
- Diagnoser
- Optimizer
- Runner
- Reporter

同时 Job 还暴露 Candidate、Dataset、Stack、Context、Contract、Lifecycle、Registry、Summary、Population、Promotion 等对象。它们有明确的工程价值，但不应全部成为普通用户的产品概念。

Historical 默认 Stack 中，除 Evaluator/Rubric 外的多个角色只是 identity marker；这说明它们更适合作为内部编译产物，而不是用户必须理解和配置的对象。

### 2.4 当前代码路径

```text
DSH Tools / Web
→ packages/dsh-plugin/index.js
→ EvolutionService / evolution.js / model-runtime.js
→ harbor-dsh JSON CLI + harbor run
→ packages/harbor-plugin 的 Candidate 或 Historical Plugin
→ Trial Assessment / Population / Summary / Registry
→ Dashboard / Workbench / Gate / Meta-evaluation
```

关键耦合点：

- [`packages/dsh-plugin/index.js`](../../../packages/dsh-plugin/index.js) 同时组合运行服务、Broker、Historical、Web，并注册 19 个工具；
- [`packages/dsh-plugin/lib/service.js`](../../../packages/dsh-plugin/lib/service.js) 同时承担运行、读取、页面上下文、证据授权、Action、Evaluator 编辑和元评测；
- [`packages/dsh-plugin/lib/dashboard.js`](../../../packages/dsh-plugin/lib/dashboard.js) 硬编码 Artifact catalog、多个 Schema 版本和 Workbench 投影；
- [`packages/harbor-plugin/src/harbor_dsh_evolution/plugin.py`](../../../packages/harbor-plugin/src/harbor_dsh_evolution/plugin.py) 与 [`historical_plugin.py`](../../../packages/harbor-plugin/src/harbor_dsh_evolution/historical_plugin.py) 在 Job hook 中一次生成评测与治理产物；
- [`packages/harbor-plugin/src/harbor_dsh_evolution/stack.py`](../../../packages/harbor-plugin/src/harbor_dsh_evolution/stack.py) 强制八角色并同时计算 comparison/full identity；
- [`packages/dsh-plugin/src/client/index.jsx`](../../../packages/dsh-plugin/src/client/index.jsx) 把首页、Historical、Trials、Pipeline、Optimizer、Gate、Evaluator 和 Meta-evaluation 集中在同一大组件中。

这些模块是本方案的主要拆分面，但第一阶段保持现有工具名、Python entry point 和安装拓扑。

## 3. 目标与非目标

### 3.1 目标

1. 让首次使用者在 30 秒内理解一次评测的结论、可信度和下一步。
2. 建立明确的科学评测对象：评测集、生成器、评测器、指标、优化器和评测器元评测。
3. 把生成器质量、评测健康度和基础设施状态分开报告。
4. 支持固定样本、版本化评分语义、重复实验、基线对比和回归验证。
5. 提供可复用的预定义指标模板，同时允许业务自定义。
6. 让优化器只根据有效证据提出一个可验证的改动，不允许自我裁判。
7. 继续防止“评测器失败 = 生成器 0 分”“证据不足 = 质量差”等错误结论。
8. 保持现有 Job 可读、现有 Candidate/Dataset/Stack 可运行，避免大爆炸迁移。

### 3.2 非目标

1. 不在本次重构中负责生产部署、流量切换或替换 Champion。
2. 不把所有评测简化成一个万能总分。
3. 不因为追求更高覆盖率而把 `insufficient-evidence` 强制换算为 0 分或猜测分。
4. 不让待测 Evaluator 自己生成 Ground Truth 并证明自己可靠。
5. 不在默认页面暴露完整运行轨迹、密钥、原始工具 payload 或不受控本地路径。
6. 不立即删除现有 19 个工具、旧 Schema 和历史 Job 读取能力。

## 4. 新的产品概念模型

### 4.1 用户级对象

| 对象 | 用户问题 | 核心内容 |
| --- | --- | --- |
| **评测集 Dataset** | 测什么？ | 固定任务、样本分组、业务分布、Ground Truth 或参考材料 |
| **生成器 Generator** | 谁来完成？ | Agent、模型、服务或已有历史结果 |
| **评测器 Evaluator** | 什么叫好？ | 正式业务评测由用户提供；Harbor 确保展示、编辑和实际执行的是同一版本 |
| **指标 Metrics** | 怎么汇总？ | Evaluator 声明的方向、尺度、必选/可选、证据要求和聚合规则 |
| **优化器 Optimizer** | 下一步改什么？ | 根因、一个受控改动、影响指标、回归集与验证方法 |
| **元评测 Meta-evaluation** | 评分者可靠吗？ | 独立 GT、重复观测、ESF、SCE、RCR、覆盖率与偏差 |
| **实验 Experiment** | 改动真的有效吗？ | 固定尺子下的 Baseline/Candidate 配对比较与不确定性 |

Integration、Renderer、Runner、Reporter 继续存在，但作为内部执行服务。Rubric 归入 Evaluator。Diagnoser 成为报告生成的一部分。Promotion Gate 不再属于默认评测对象。

### 4.2 三种运行模式

| 模式 | 默认用户 | 目的 | 身份要求 | 结果 |
| --- | --- | --- | --- | --- |
| **体验诊断 Experience Diagnostic** | 首次使用者、最近会话 | 用真实记录演示评测理念，发现明显问题与证据缺口 | 内置体验 Evaluator + 最小实验记录 | 教学性结论、案例和下一步；不作为业务质量背书 |
| **实验 Experiment** | Agent/评测工程师 | 使用用户提供的 Evaluator 验证改动是否改善 | 固定 Dataset、Generator、Evaluator、Judge、repeat policy | 配对指标、差值、置信信息、回归 |
| **治理 Governed** | 企业与自动化流程 | 决定是否晋级 | Experiment 全部要求 + Policy/Gate/审批 | 可解释的 PROMOTE/REJECT；部署仍外部完成 |

Historical Session Evaluation 固定属于 Experience Diagnostic，并在启动页和结果页明确标记“体验评测”；普通业务 Candidate baseline/regression 属于 Experiment；只有用户显式启用时才进入 Governed。

## 5. 目标架构

```text
                         ┌──────────────────────────────┐
                         │      Evaluation Project      │
                         │ Dataset / Generator /        │
                         │ Evaluator / Metrics          │
                         └──────────────┬───────────────┘
                                        │ compile
                                        ▼
┌──────────────┐   output/evidence   ┌──────────────────┐
│  Generator   ├────────────────────►│ Evaluation Core  │
└──────┬───────┘                     │ score / abstain  │
       │                             │ coverage / error │
       │                             └────────┬─────────┘
       │                                      │
       │                                      ▼
       │                             ┌──────────────────┐
       │                             │ User Report      │
       │                             │ verdict/findings │
       │                             │ badcases/action  │
       │                             └────────┬─────────┘
       │                                      │
       │                                      ▼
       │                             ┌──────────────────┐
       └─────────────────────────────┤ Optimizer        │
                                     │ one hypothesis   │
                                     └────────┬─────────┘
                                              │ next controlled experiment
                                              └─────────────────────────────┐
                                                                            │
Independent GT ──► Meta-evaluation ──► Evaluator quality ────────────────────┘

后台横切：Experiment Receipt / version identity / evidence refs / validity
可选横切：Policy / Promotion Gate / approval journal / deployment handoff
```

### 5.1 分层边界

#### A. Evaluation Core

负责：

- 执行或读取 Generator 输出；
- 调用 Evaluator；
- 验证 Criterion 状态和分数；
- 计算指标、覆盖率和组别；
- 分离质量失败、证据不足、评测失败和基础设施失败；
- 生成标准化 `evaluation-report/v1`。

#### B. Experiment Integrity Kernel

只保留科学评测必需的后台事实：

- Dataset、Generator、Evaluator、Judge 和 Metric Template 版本；
- 输出与评测结果的引用；
- Trial 状态、attempt、覆盖率和错误分类；
- 比较所需的 Evaluation Spec identity；
- 创建时间、运行环境和随机性/repeat policy。

它不需要在默认页面显示 digest、完整 manifest 或 registry。

#### C. Governance Extension

负责：

- Promotion Policy；
- Deterministic Gate；
- 完整不可变来源快照和 Artifact Registry；
- 审批记录、保留策略、发布交接；
- 企业所需的额外身份与合规信息。

该层不参与普通 Diagnostic 的主导航，也不改变 Evaluation Core 的评分结果。

### 5.2 Artifact Profile 与 Stack 简化

当前 Job 无条件生成 Stack source snapshot、Doctor、Lifecycle/Event、Population、Diagnosis、Optimization 和 Registry，导致“最小诊断”与“完整治理包”耦合。目标上应按运行模式声明产物 Profile：

| Profile | 必需产物 | 可选产物 |
| --- | --- | --- |
| `diagnostic` | Evaluation Spec、Assessment、Summary、Evaluation Report | lifecycle snapshot、简化 diagnosis |
| `experiment` | diagnostic 全部 + repeat policy、comparison identity、paired result | source snapshot、详细事件 |
| `governed` | experiment 全部 + Doctor、Policy、Gate evidence、Artifact Registry | 发布交接附件 |

`audit-bundle` 作为可选包承载完整 source snapshot、JSONL events、raw trajectory、Artifact Registry 和排错产物，只进入 `full_digest`，不进入 measurement/comparison identity。

当前 Stack 强制八角色，但 Historical 中多个 entry 只是 identity marker，Candidate 路径中的真实 Evaluator 又由 Task verifier 执行。目标 Stack 最小必需角色调整为：

- Integration
- Renderer
- Evaluator（内含 Rubric 与 Metrics）
- 可选 semantic Runner

Diagnoser、Optimizer、Reporter 改为可选 post-processor，或明确标记为 Host 内建 hook；如果迁移期继续保留八角色，Manifest 必须区分 `declared` 与 `executed`，不能让“声明了组件”看起来像“实际执行了该 entry”。

## 6. “审计”能力的去留矩阵

| 当前能力 | 处理 | 原因 |
| --- | --- | --- |
| Dataset/Generator/Evaluator/Judge 版本 | 后台保留，结果页简化展示 | 是复现和比较的必要条件 |
| Score validity、Criterion coverage | 保留并前置 | 防止把无效结果当质量分 |
| Evidence refs | 保留，默认只显示摘要 | 优化必须有依据 |
| Trial attempt 与错误分类 | 后台保留，翻译成用户状态 | 区分质量、评测与基础设施问题 |
| Context/comparison digest | 后台保留 | 防止用不同尺子直接比较 |
| 完整 Artifact Registry | 高级/治理模式 | 普通诊断不需要理解 |
| Stack source snapshot | 实验/治理后台保留 | Evaluator 语义复现需要 |
| Audit Tab | 从默认导航移除 | 用户价值低、认知负担高 |
| Pipeline Tab | 并入“实验详情” | 仅排错时需要 |
| Policy / Promotion Gate | 可选治理模块 | 不属于诊断和一般评测 |
| VCS/retention 细节 | 首次设置和高级设置 | 不应每次评测重复干扰 |
| 一次性审批日志 | 由 DSH 平台负责 | 不应成为 Harbor 结果内容 |
| CI/CD 与部署记录 | 继续外部完成 | Harbor 只交付评测结论和被评产物身份 |

结论是：**删除默认产品中的审计展示，保留后台的最小实验完整性；企业治理另行启用。**

## 7. 核心协议设计

### 7.1 Evaluation Spec

第一阶段不要求用户直接编写新文件，由现有 Dataset Manifest、Candidate/Historical Batch、Evaluation Stack 和 Judge 身份投影得到：

```json
{
  "schema_version": 1,
  "protocol": "evaluation-spec/v1",
  "evaluation_id": "recent-session-quality",
  "mode": "diagnostic",
  "dataset": { "id": "...", "version": "..." },
  "generator": { "kind": "dsh-session", "id": "...", "version": "..." },
  "evaluator": {
    "id": "...",
    "version": "...",
    "metric_template": "general-agent-session@1"
  },
  "optimizer": { "kind": "dsh-agent", "enabled": true },
  "repeat_policy": { "repeats": 1, "seed_policy": "observed-record" }
}
```

后续可以把它升级为用户级 `.harbor/evaluation.yml`，再编译为现有严格 Stack。不能同时维护两个互相冲突的手写来源；在迁移完成前，现有 Stack 仍是执行源，Evaluation Spec 只是稳定投影。

### 7.2 Metric Template

新增版本化的 `metric-template/v1`：

```json
{
  "schema_version": 1,
  "template_id": "general-agent-session",
  "version": "1.0.0",
  "criteria": [
    {
      "id": "goal_progress",
      "label": "任务推进",
      "direction": "maximize",
      "required": true,
      "evidence_requirements": ["initial_goal", "assistant_output"]
    },
    {
      "id": "execution_reliability",
      "label": "执行可靠性",
      "direction": "maximize",
      "required": true,
      "evidence_requirements": ["tool_outcome_or_artifact"]
    }
  ],
  "aggregation": {
    "method": "weighted-mean",
    "minimum_required_coverage": 1.0
  }
}
```

每个指标必须声明：

- 适用任务类型；
- 评分方向和离散/连续尺度；
- required 或 optional；
- 所需证据类型；
- `not-applicable`、`insufficient-evidence` 和 `evaluation-error` 的处理；
- 聚合与最小覆盖规则；
- 是否影响总体质量结论。

模板不是“万能标准”。没有满足 evidence requirements 时必须弃权，并在报告中指出缺什么。

### 7.3 Effective Evaluator Contract

Evaluator 必须拥有唯一的业务语义来源：

```text
用户可查看/编辑的 Evaluator Bundle
→ Stack 引用 exact id/version/digest
→ 通用 Task Verifier Adapter 装载或物化同一 Bundle
→ 运行时执行并写出 executed attestation
→ Job/Workbench 展示该 executed identity
```

当前“Stack 声明 Evaluator、Task verifier 实际执行物化代码”的结构只有在 digest 完全一致时才可接受。目标协议增加：

```json
{
  "effective_evaluator": {
    "configured": { "id": "...", "version": "...", "digest": "sha256:..." },
    "materialized": { "digest": "sha256:..." },
    "executed": { "digest": "sha256:...", "entry": "evaluator.py" },
    "identity_match": true
  }
}
```

规则：

1. Dataset Task 中只保留通用 Verifier Adapter，不复制独立维护的业务 Rubric。
2. Materializer 可以复制 Evaluator Bundle 以满足 Harbor Task 布局，但复制结果必须由原 Bundle digest 派生并在运行时证明一致。
3. `evaluator_identity_match` 是硬性 validity requirement；不一致时 Trial 进入 `evaluation-error`，不得产生有效质量分。
4. Workbench 默认展示 `effective_evaluator.executed`，而不是只展示配置文件里声明的身份。
5. 用户从当前 Job 打开的是当时执行过的只读版本；点击“编辑”实际创建一个新 Evaluator 版本，旧 Job 和旧 Bundle 永不覆盖。
6. 新版本保存后更新 Stack 引用，下一次 Job 必须执行新 digest；保存本身不自动运行评测。
7. 内置体验 Evaluator 同样展示完整 Criteria、Rubric、Judge 和源码。用户可以基于它创建项目内新版本，但页面必须说明它原本只用于体验，不是业务标准。
8. 用户提供的业务 Evaluator 是正式 Experiment 的唯一评分语义来源；Harbor 不在 Reporter、UI 或 Optimizer 中重新解释分数。

### 7.4 Evaluation Report

新增 `evaluation-report/v1`，作为 Web 和 Agent 默认读取对象。它是现有严格产物的派生结果，不改写原始 Assessment：

```json
{
  "schema_version": 1,
  "protocol": "evaluation-report/v1",
  "run": {
    "id": "...",
    "mode": "diagnostic",
    "status": "completed-with-limitations"
  },
  "verdict": {
    "code": "insufficient-evidence",
    "headline": "当前证据不足，无法形成可靠总体评分",
    "summary": "3 条会话看起来完成任务，但执行结果无法核验；1 条评测失败。"
  },
  "sample": {
    "total": 4,
    "evaluated": 3,
    "scored": 0,
    "criterion_coverage": 0.5625
  },
  "quality": {
    "metrics": [],
    "partial_signals": [],
    "overall_score": null
  },
  "evaluation_health": {
    "status": "limited",
    "judge_completed": 3,
    "judge_failed": 1,
    "evaluator_validation": "not-run",
    "evidence_adequacy": "insufficient"
  },
  "findings": [],
  "representative_cases": [],
  "next_action": {
    "owner": "evaluation-evidence",
    "change": "保留脱敏结构化工具结果摘要",
    "verification": "使用新会话重新运行同一指标模板"
  },
  "experiment_details_ref": "experiment-receipt.json"
}
```

`verdict.code` 使用固定集合：

- `reliable-result`
- `actionable-with-limitations`
- `insufficient-evidence`
- `evaluation-failed`
- `run-failed`

默认结果页必须先显示 `verdict`，再显示指标与案例；不能把 Job `completed` 当作质量结论。

### 7.5 Experiment Receipt

把当前大部分“审计”收敛为内部 `experiment-receipt/v1`：

```text
run id
Evaluation Spec identity
Dataset / Generator / Evaluator / Judge / Metric Template versions
execution environment
repeat and seed policy
artifact refs
coverage and validity
timestamps and error taxonomy
optional governance refs
```

该文件默认不进入主导航，只供复现、比较、排错和治理使用。现有 Context、Manifest、Lifecycle 和 Registry 在迁移期继续生成，并由 Receipt 引用。

### 7.6 Optimization Proposal

Optimizer 输出统一为 `optimization-proposal/v1`：

```json
{
  "hypothesis": "缺少可核验执行摘要导致可靠性与证据一致性无法评分",
  "owner": "generation-observation",
  "mutation_surface": ["session evidence projection"],
  "forbidden_surface": ["evaluator scoring scale", "ground truth"],
  "expected_metric_effect": ["execution_reliability", "evidence_alignment"],
  "representative_cases": ["..."],
  "next_experiment": {
    "dataset": "fixed-regression-set",
    "comparison": "paired",
    "success_condition": "required criterion coverage reaches 100% without secret leakage"
  },
  "rollback_condition": "credential scan failure or increased evaluation errors"
}
```

Optimizer 不能修改历史 Assessment，不能修改 Evaluator 来迎合 Generator，也不能自动运行 Gate 或部署。

## 8. 预定义指标体系

### 8.1 通用 Agent 会话模板

建议首个模板 `general-agent-session@1` 包含：

| 指标 | 作用 | 需要的证据 |
| --- | --- | --- |
| 任务推进 `goal_progress` | 是否实质推进初始目标 | 用户目标、可见输出 |
| 结果质量 `output_quality` | 输出本身是否正确、完整、适合任务 | 输出、任务要求、可选参考答案 |
| 执行可靠性 `execution_reliability` | 声称的操作是否真实完成 | 工具结果摘要、退出码、产物验证 |
| 证据一致性 `evidence_alignment` | 结论是否与证据一致 | 声明与结构化证据引用 |
| 交互质量 `interaction_quality` | 是否清楚、适度、可行动 | 可见对话 |

### 8.2 领域模板

第二批模板：

- `code-change@1`：需求覆盖、测试健康、改动范围、回归风险、交付完整性；
- `research@1`：问题回应、来源质量、引用蕴含、覆盖度、事实一致性；
- `tool-workflow@1`：步骤成功率、幂等性、失败恢复、最终状态验证；
- `conversation@1`：意图理解、澄清质量、表达、边界遵守。

领域模板应组合通用 Criterion，而不是复制一套互不兼容的同名指标。

### 8.3 统计与比较

Experiment 模式应支持：

- 同一 Dataset 上的 paired baseline/candidate Trial；
- 固定或对称 seed policy；
- `repeats > 1` 时报告均值、方差和一致性；
- 样本量足够时报告置信区间或 bootstrap interval；
- 同时报告整体差值、逐任务改善/回归和不可评比例；
- 不同 Evaluation Spec identity 的结果明确标记“不可直接比较”。

当前 deterministic Gate 可以继续用于 Governed 模式，但不能替代实验报告中的样本覆盖和不确定性。

### 8.4 首阶段预留但不实现的可信度位置

首阶段 Report 固定保留以下字段，但不尝试生成伪科学分数：

```json
{
  "dataset_validity": { "status": "not-assessed" },
  "evaluator_reliability": { "status": "unvalidated" },
  "optimization_generalization": { "status": "not-assessed" }
}
```

- Experience Diagnostic 永远允许这些状态存在，并解释“本次用于体验理念”；
- 正式 Experiment 可以由用户提供的 Dataset/Evaluator 逐步补齐；
- Governed 是否强制这些状态达到要求，由未来 Policy 明确；
- 当前阶段不实现样本代表性统计、训练/保留集治理或额外可靠性预算。

## 9. 评测器元评测

现有 `ground-truth/v1`、`evaluator-observations/v1` 和 `meta-evaluation-report/v1` 已具备正确方向，长期应成为正式业务 Experiment 的科学性能力；首阶段只在产品模型和 Report 中保留位置，不要求 Experience Diagnostic 运行。

当前实现只是对独立 GT 和 observations 计算并写出 Meta-evaluation Report，**没有创建专用 Harbor Meta Job，也没有运行 Meta Promotion Gate**。重构中的“评测器通过元评测”必须先定义专用 Job/Policy，不能把现有报告流程描述成已经完成晋级。

Meta Report 必须绑定 Evaluator、Rubric、Judge 和 Metric Template 的 id/version/digest。Workbench 当前只按 evaluation root 查找 GT/report；若身份不匹配，只能显示“其他版本报告”，不能把它挂到当前 Evaluator 上。

### 9.1 元评测流程

```text
独立 Ground Truth
→ 固定 Artifact Dataset
→ 同一 Evaluator 重复评分
→ 与 GT 对齐
→ ESF / SCE / RCR / coverage
→ Evaluator quality status
```

现有指标继续保留：

- **ESF ↑**：兼顾坏案例识别和正常案例通过能力；
- **SCE ↓**：与 GT 的平均绝对评分误差；
- **RCR ↑**：重复评分的一致性。

### 9.2 用户级状态

Evaluator 在所有业务报告中显示以下状态之一：

- `validated`：存在当前身份对应的独立 GT 元评测；
- `limited`：有元评测但覆盖不足或指标未达目标；
- `unvalidated`：尚未运行；
- `stale`：Evaluator/Judge/Rubric 改变，旧元评测不再适用；
- `failed`：元评测本身失败。

Diagnostic 可以使用 `unvalidated` Evaluator，但必须降低结论可信度；Governed 模式可以配置为必须 `validated`。

## 10. Historical Session 证据重构

### 10.1 当前问题

`session-redaction.js` 当前已经生成工具名称、是否有结果、错误标志、时间、轮次和 usage，但明确设置：

```text
tool_payloads_complete: false
attachments_complete: false
```

这能保护隐私，却使 `execution_reliability` 和 `evidence_alignment` 经常无法判断。解决办法不是发送全部原始 payload，而是生成确定性、可限界、可脱敏的结构化执行证据。

### 10.2 `dsh-session-observation/v2`

新增：

```json
{
  "execution": {
    "tools": [],
    "evidence_summaries": [
      {
        "call_ref": "sha256:...",
        "tool": "bash",
        "category": "test",
        "outcome": "succeeded",
        "exit_code": 0,
        "facts": [
          { "kind": "test-count", "passed": 120, "failed": 0 }
        ],
        "artifact_refs": [],
        "result_digest": "sha256:...",
        "redaction": { "replacements": 0, "truncated": false }
      }
    ]
  },
  "evidence_coverage": {
    "transcript": "complete",
    "tool_outcomes": "partial",
    "artifacts": "omitted",
    "feedback": "available"
  }
}
```

### 10.3 安全规则

1. 不记录工具原始参数、环境变量、Authorization/Cookie、完整文件内容或模型 reasoning。
2. 按工具类别使用 allowlist adapter，例如测试、Git、构建、文件写入和 HTTP 状态。
3. 每条摘要再次执行 credential canary 与 opaque secret 扫描。
4. 摘要和整个 Observation 分别设字节上限；超限必须标记而不是静默裁剪。
5. `result_digest` 只证明摘要对应某个结果，不允许 UI 通过 digest 任意读取源文件。
6. 未知工具默认只保留名称、成功/失败和时长，不尝试自由文本摘要。
7. 任何脱敏失败都阻断 Batch 写入，不把风险转移给 Judge。

### 10.4 责任划分

报告必须把问题分为：

- `generator`：回答或执行行为本身有问题；
- `evaluation-evidence`：可见记录不足；
- `evaluator`：Rubric、Judge 或解析失败；
- `infrastructure`：Broker、环境、超时或存储问题；
- `dataset`：样本、GT 或任务定义问题。

只有 `generator` 类问题可以直接进入 Candidate 优化建议；其他问题先修复对应评测层。

## 11. 后端重构方案

### 11.1 运行边界与内部模块

当前调用链必须保持清楚：

```text
DSH 原生 Tool / Web
→ Node EvolutionService
→ harbor-dsh JSON CLI（控制面）/ harbor run（执行面）
→ Python Harbor Plugin
→ Candidate ACP runtime 或 Historical Observation Agent
→ Trial Assessment / Summary
```

这不是 MCP 架构：DSH 对外暴露原生 Tool；Candidate 使用 ACP；模型调用单独使用私有 HTTP/NDJSON `dsh-host-model-gateway/v1`。重构不得把三种协议混为一个“Agent 通道”。

内部模块按职责拆分：

- `evaluation-core`：纯函数，负责 Evaluator result、Assessment、指标、Summary、Comparison 和 GT meta-evaluation；
- `harbor-runtime-adapter`：负责 ACP、Harbor hooks、环境、Broker attestation 和基础 lifecycle；
- `evaluation-runner`：负责 Node 编排、CLI、model lease 和取消；
- `result-read-model`：负责有界、脱敏的 Report/Trial 读取；
- `historical-ingest`：负责 Session 选择、脱敏和物化；
- `workbench-governance`：负责页面引用、Action Draft、Evaluator 保存和 Gate；
- `web-adapter`：只负责 same-origin 传输，授权仍由 Session/project/token/revision/ancestry 校验完成。

当前 Node→Python CLI/env/plugin kwargs 与浏览器 Artifact catalog/schema version 分散硬编码。新增版本化 `bridge-contract`，从单一 Schema Registry 生成或校验 JS/Python 常量、Artifact Manifest 和 canonical digest golden vectors，逐步消除 Node/Python 双实现漂移。

`EvolutionService` 只保留组合根职责。短期不拆发布包：Setup 仍依赖两个 Harbor entry point，先使用 feature flag 和 lazy loading 解耦 Historical/Governance，再评估发布拓扑。

### 11.2 Python Adapter

建议新增：

```text
packages/harbor-plugin/src/harbor_dsh_evolution/
├── evaluation_report.py       # Candidate/Historical 共用用户报告
├── metric_templates.py        # 模板加载、版本和 evidence requirements
├── evaluator_attestation.py   # configured/materialized/executed 身份互证
├── business_observation.py    # 外部真实业务结果校验
├── evaluation_health.py       # coverage、Judge、Evaluator validity
└── experiment_receipt.py      # 内部最小实验记录
```

现有模块调整：

| 文件 | 调整 |
| --- | --- |
| `summary.py` | 保持兼容 Summary v3；调用公共 report builder |
| `historical_summary.py` | 保持 Summary v4；不再承担用户结论生成 |
| `historical_artifacts.py` | 输出责任方明确的 diagnoses 和统一 Optimization Proposal |
| `evaluator.py` | 保留 v1/v2；增加 Metric Template、evidence requirement 和 executed attestation 校验 |
| `meta_evaluation.py` | 输出 Evaluator quality status 和 identity applicability；首阶段不要求体验 Job 运行 |
| `stack.py` | 继续编译严格运行身份；Evaluator Bundle 成为唯一业务语义源；后续支持精简 Evaluation Spec 输入 |
| `promotion.py` | 移到 Governance Extension 语义，不再进入 Diagnostic 默认报告 |

`evaluation-report.json` 注册为 Reporter 派生产物，`reward_affecting: false`。它只能读取 Assessment，不能修改分数。

### 11.3 DSH Plugin 服务端

建议新增：

```text
packages/dsh-plugin/lib/
├── evaluation-report.js       # 有界读取和旧 Job 投影
├── evaluation-health.js       # 用户状态与责任方归类
├── evaluator-identity.js      # Effective Evaluator 读取与编辑绑定
├── business-results.js        # 外部业务结果导入与查询
├── metric-catalog.js          # 预定义模板目录
└── experiment-details.js      # 高级详情聚合
```

现有模块调整：

| 文件 | 调整 |
| --- | --- |
| `service.js` | `harbor_eval_result` 增加 `view=report`；接受 Job 名或安全相对路径；组合业务结果服务 |
| `dashboard.js` | 默认读取 Report；Trial identity 统一解析 execution id、dataset id、record id；展示 executed Evaluator |
| `evaluator-saves.js` | 从 Job 的 executed bundle 创建新版本，保存后更新精确 Stack 引用 |
| `session-redaction.js` | 产生 Observation v2 结构化 evidence summaries |
| `session-materializer.js` | 固定 Metric Template identity 与 evidence coverage |
| `session-diagnostic.js` | Preview 只保留用户必须确认的范围、请求次数和隐私信息 |
| `workbench-health.js` | 拆分 generator quality、evaluation health、run health |
| `interaction-objects.js` | 默认引用 finding、case、metric、next action；digest 引用降为高级详情 |

### 11.4 修复已验证的接口摩擦

1. `harbor_session_diagnostic_run` 返回 `job` 的同时返回可直接传入读取工具的 `jobPath`。
2. `harbor_eval_result` 所有 view 使用同一 Job resolver；当前 Summary view 直接把 `jobPath` 当目录，而其他 view 取最后一个 path segment，行为必须统一。
3. Trial 列表返回一个稳定的公共 `trialId`；读取端内部映射 execution id、dataset trial、generation record id 和 assessment filename。
4. Job 已完成且 Assessment 已存在时，不得再返回 `running-evidence-not-yet-available`。
5. `n_exceptions`、`n_evaluation_exceptions`、无效分和弃权在 API 与 UI 中使用一致名称和解释。
6. `normalizeTrial` 在缺少 score 且没有 exception 时不得默认 `valid: true`；统一投影为 `unknown/unverified`，禁止进入指标聚合。
7. 合同主指标缺失时不得回退到任意 numeric metric；Metric DTO 强制包含 `id/label/unit/direction/validCoverage/source`，未配置就显示“主指标未配置”。
8. 首页“最近指标”不得由当前分页中第一个 Job 决定；筛选和翻页不能改变工作空间级指标定义。
9. Meta Report 必须验证其 Evaluator/Rubric/Judge/Template 身份与当前 Job 一致，不一致时标记 `stale`。
10. 只读 result 工具不应因为宿主缺少 mutating-tool approval hook 而整体不可注册；审批依赖只挂载到真正的写入、外部调用和 Gate 动作。

### 11.5 Tool 面

短期保留现有工具，官方 Skill 改为优先调用：

```text
准备评测 → 运行评测 → 读取 evaluation-report → 提出优化 → 运行回归
```

中期增加或收敛为八个用户意图：

- Prepare Evaluation
- Run Evaluation
- Read Report
- Edit Effective Evaluator
- Propose Improvement
- Meta-evaluate Evaluator
- Import Business Results
- Compare Experiments

Candidate snapshot、Context preview、Doctor、Registry、Gate 等低层工具继续存在于 Advanced/Governance 能力中，但不应占据首次使用路径。具体是否减少 DSH 注册工具数量，需要单独评估兼容性和上下文成本，不能在本方案中直接删除。

## 12. Web 信息架构重构

### 12.1 首页

默认首页只提供：

- `体验：评测最近任务`
- `创建业务评测`
- `比较两个版本`
- `编辑/检查实际生效的评测器`
- `导入真实业务结果`

统计改为：

- 最近一次可信结论；
- 可评样本数；
- 需要处理的坏案例；
- 评测器状态。

Job、Trial、Exception 数量不再作为首屏核心价值。

### 12.2 结果页

默认六个区域：

1. **结论**：可靠、有限可用、证据不足、评测失败；
2. **指标**：总体和分项，明确有效样本与覆盖率；
3. **案例**：代表性好案例、坏案例和无法判断案例；
4. **实际生效的评测器**：executed identity、Criteria、Rubric、源码与“创建新版本”；
5. **改进**：一个优先建议、责任方和验证方案；
6. **真实业务结果**：已导入的外部指标、观察窗口和与离线结果的关联。

“样本有效性”和“评测器可靠性”作为状态位显示；首阶段分别允许 `not-assessed` 与 `unvalidated`，不伪装成已经完成的方法学验证。

高级折叠区：

- 实验身份；
- 执行流程；
- 原始产物；
- Context/Manifest/digest；
- Gate/Policy（仅 Governed）。

默认移除独立 `Pipeline`、`Artifacts`、`Audit`、`Compare / Gate` 导航项。Compare 只在 Experiment 入口出现，Gate 只在 Governance 入口出现。

### 12.3 用户状态文案

用户视图统一为五个正交状态，不再把 Job status、progress health、attention kind、Trial phase 和 Operation status 混在一个标签里：

- `runState`：等待、运行、完成、已停止；
- `evidenceState`：充分、部分、不足、不可用；
- `qualityState`：通过、需改进、未知；
- `comparabilityState`：可比、不可比、不适用；
- `approvalState`：无需确认、待确认、受阻。

机器状态只保留在高级详情和测试属性中。默认文案映射为：

| 内部状态 | 默认用户文案 |
| --- | --- |
| `completed` | 已完成评估 |
| `completed-unscored` | 证据不足，无法评分 |
| `candidate-quality-failed` | 任务质量未达标 |
| `evaluation-error` | 评测器运行失败 |
| `infrastructure-error` | 运行环境失败 |
| `cancelled` | 已取消 |
| Job `completed` 但无有效分 | 诊断完成，但无法形成可靠结论 |

原始状态码只在技术详情中显示。

### 12.4 Historical 启动流程

保留 Preview 和明确确认，但首屏只显示决策必需信息：

- 将评测哪些会话，并允许取消个别样本后由 Host 重新冻结选择；
- 使用哪个评测模板、Evaluator 和 Judge；
- Judge 是否与 Generator 同模型耦合，以及这对独立性的影响；
- 预计模型请求数量；首阶段不建设费用估算或预算系统；
- Preview 有效期；
- 哪些内容会发送、哪些不会；
- 结果保存范围和结论属于诊断而不是正式版本比较。

当前 MVP 的 Agent Tool 和 Web Historical 都必须遵守 exact-cwd 范围。页面不必泄露绝对路径，但应明确说明“只选择当前工作目录中的最近已完成会话，结果保存到当前 Harbor 工作空间”。未来如果扩大到跨项目选择，必须先增加匿名项目分组、数量和重新冻结范围，不能静默扩大“最近会话”的含义。

Evaluator/Batch digest 和完整 retention 路径放入“高级说明”。如果当前 DSH 权限预设会直接拒绝强制审批，启动器应在 Preview 前给出可操作提示，而不是等 Run 返回通用拒绝。

确认强度按风险分层：

- 只读导航、读取报告和 Compare Preview：无需确认；
- 保存未应用的本地草稿：一个明确按钮，不再叠加 checkbox；
- 外部模型请求、文件写入、运行评测：分别展示调用数量和影响范围后一次确认；
- Gate、部署交接和生产动作：保持独立高风险确认。

刷新、恢复和重试都不得隐式复用旧授权执行新动作。

### 12.5 前端代码拆分

当前 `src/client/index.jsx` 同时承载首页、启动器、Job、Trials、Pipeline、Optimizer、Gate、Evaluator、Meta-evaluation 和 Tool 卡片，文件已接近 3000 行。建议拆分：

```text
src/client/
├── pages/EvaluationHome.jsx
├── pages/EvaluationResult.jsx
├── pages/ExperimentCompare.jsx
├── pages/EvaluatorQuality.jsx
├── pages/ExperimentDetails.jsx
├── components/VerdictCard.jsx
├── components/MetricProfile.jsx
├── components/CaseExplorer.jsx
├── components/NextActionCard.jsx
└── components/EvaluationHealth.jsx
```

现有 Bridge、页面引用、Operation 恢复和 Evaluator Editor 保持独立，不在 UI 重排中改写权限语义。

## 13. 优化闭环

目标流程：

```text
Evaluation Report
→ 选择一个高影响、证据充分的问题
→ Optimizer 产生一个 controlled hypothesis
→ 用户审阅 mutation surface
→ 创建 Candidate 新版本
→ 使用固定 Evaluation Spec 运行 paired regression
→ 查看指标差值、覆盖率、坏案例和不确定性
→ 选择继续迭代；Governed 模式下才运行 Gate
```

### 13.1 优先级算法

默认优先级由以下因素决定：

```text
影响样本比例
× 指标业务权重
× 证据可信度
× 可控改动程度
÷ 预估改动风险
```

Evaluator、Dataset 或基础设施问题不得作为 Candidate 优化任务。报告先推荐修复其拥有者。

### 13.2 坏案例固化

Historical 诊断中的代表性坏案例只有经过人工确认后，才能转换为固定回归 Dataset：

- 保存原始任务或最小复现场景；
- 明确期望行为和必要证据；
- 补充 GT 或确定性校验；
- 删除业务敏感信息；
- 固定版本和来源；
- 进入后续 Experiment，而不是直接用于 Promotion。

### 13.3 外部真实业务结果

Harbor 允许导入部署后或其他业务系统产生的真实结果，用来回答“离线指标改善是否对应真实业务改善”。新增 `business-observation/v1`：

```json
{
  "schema_version": 1,
  "protocol": "business-observation/v1",
  "observation_id": "support-resolution-2026w39",
  "source": {
    "kind": "analytics",
    "id": "support-dashboard",
    "version": "query-v3",
    "provenance": "reviewed export"
  },
  "subject": {
    "generator_id": "support-agent",
    "candidate_digest": "sha256:...",
    "deployment_id": "production-a"
  },
  "window": {
    "from": "2026-09-21T00:00:00Z",
    "through": "2026-09-27T23:59:59Z"
  },
  "metrics": [
    {
      "id": "resolution_rate",
      "value": 0.74,
      "unit": "ratio",
      "direction": "maximize",
      "sample_size": 1830
    }
  ],
  "segments": [],
  "digest": "sha256:..."
}
```

导入规则：

1. 支持人工审核文件、分析平台导出、程序接口和外部实验系统；每种来源必须记录 provenance。
2. 尽可能绑定 Candidate/Generator/Deployment 身份；无法绑定时只作为项目级背景数据，不能声称由某次改动导致。
3. 保留观察窗口、样本量、单位、方向和可选分组；不能只导入一个无上下文数字。
4. 外部结果与 Offline Evaluation 并列展示，不改写历史 Trial、reward、Summary 或 Gate 决策。
5. 首阶段只做导入、校验、趋势和并列展示；因果归因、自动回传 Optimizer 和在线 Gate 后续再做。
6. 导入前执行项目边界、Schema、敏感字段和重复 observation id 校验；原始业务明细不要求进入 Harbor。

结果页新增“真实业务结果”区域：

```text
离线评测：Candidate v2 在固定 Dataset 上提升 6%
真实业务：部署后解决率提升 2%，观察窗口 7 天，样本量 1830
关联状态：已绑定同一 Candidate；只能说明相关，尚不能证明因果
```

### 13.4 Evaluator 编辑闭环

```text
打开某次 Job
→ 查看当时实际执行的 Evaluator、Criteria、Rubric 与源码
→ 基于该只读版本创建新版本
→ 审阅 Diff，保存 exact bundle
→ Stack 引用新 id/version/digest
→ 下一次 Job 运行时 attestation
→ Workbench 展示 configured/materialized/executed 一致
```

Evaluator 编辑器不再要求用户理解“声明身份”和“真实执行代码”两套对象。若 attestation 不一致，页面阻断评分并直接指出配置/物化/执行的哪一段发生漂移。

## 14. 迁移计划

### Phase -1：合同与事实收敛（已实现并通过自动回归）

在引入新协议前先消除当前漂移：

1. 建立单一 Schema Registry 和 Node/Python bridge contract；
2. 对齐 Context v3 实现、Registry 标记和仍写 Context v2 的文档；
3. 补齐代码已支持但根 Schema 尚未覆盖的 Evaluator v2；
4. 对齐 Candidate Manifest runtime schema 与实际 locked runtime 输出；
5. 将安全文档按 Host/Docker 分栏：Host 默认无隔离、网络和资源限制，Docker 才提供容器边界；
6. 明确当前 Meta-evaluation 只是 report workflow，不是专用 Harbor Job/Gate；
7. 为 Promotion Policy 补完整 JSON Schema、类型、范围与 reason-code 校验，而不是只做浅层字符串检查；
8. 区分 Candidate locked runtime 与 Host 安装版本，移除含混的 `latest` 可复现性表述。

交付判据：文档、Schema、Node、Python 和 Artifact Registry 对同一协议版本与字段给出一致答案；golden vectors 在两种语言中产生相同 canonical digest。

### Phase 0：Effective Evaluator 与结果可信投影（已实现并通过自动回归）

先修复“看到的不是实际执行的”和结果投影问题。实施中确认旧 Candidate 路径的 Dataset verifier 可能绕过用户 Evaluator，因此本阶段包含一次明确的不兼容切换：只保留 strict, attestable Evaluator adapter：

1. 新增 `evaluation-report/v1` 派生器；
2. 统一 Job path 与 Trial identity；
3. 增加 configured/materialized/executed Evaluator attestation；
4. Workbench 展示实际执行的 Evaluator，并支持从该只读版本创建新版本；
5. 缺 score 一律投影为 unknown，移除任意 numeric metric fallback；
6. 修复完成 Trial 仍显示无证据的问题；
7. 结果页先展示 verdict、责任方、覆盖率和 next action；
8. 将 Audit/Pipeline/Artifacts 收入高级详情；
9. 增加 Recent Sessions→结果和 Evaluator→新版本→新 Job 的完整旅程测试。

交付判据：用户看到的 Evaluator 与运行时 digest 一致；不一致时阻断有效评分。当前 4 条会话样本直接显示“证据不足，无法形成总体评分”，并把 3 条证据缺口和 1 条 Judge 错误分开。

### Phase 1：体验评测产品化（已实现并通过自动回归）

1. 将“评测最近会话”明确命名为体验诊断；
2. 在启动与结果页解释 Dataset、Generator、Evaluator、Metrics、Optimizer 的关系；
3. 增加通用体验 Metric Template；
4. 为每个 Criterion 声明 applicability 和 evidence requirements；
5. 引入 generator quality / evaluation health / run health 三分法；
6. Dataset validity 显示 `not-assessed`，Evaluator reliability 显示 `unvalidated`；
7. 支持部分信号，但禁止在 required coverage 不足时产生总体分；
8. 官方 Skill 默认报告用户级结论。

交付判据：首次用户能理解 Harbor 的评测理念，同时不会把体验 Evaluator 的结果误认为业务质量证明。

### Phase 2：Historical Evidence v2（已实现并通过自动回归）

1. 增加结构化工具结果摘要；
2. 增加 Evidence Adapter allowlist；
3. 升级 Observation、Batch、Historical Context 与对应 Schema；
4. 更新体验 Evaluator prompt 和 evidence refs；
5. 对凭据泄漏、超限、未知工具和缺失结果增加测试。

交付判据：在不暴露原始 payload 的前提下，代码/测试/Git 等常见任务可以可靠评估 execution reliability 和 evidence alignment。

### Phase 3：外部真实业务结果（已实现并通过自动回归）

1. 实现 `business-observation/v1` Schema 与校验器；
2. 支持文件和程序接口导入；
3. 绑定 Generator/Candidate/Deployment 身份和观察窗口；
4. 在结果页并列展示离线评测与真实业务指标；
5. 提供趋势和分组读取，但不做因果归因、自动优化或在线 Gate。

交付判据：用户可以把真实业务结果安全导入 Harbor，并明确看到它与哪个被评版本相关、哪些结论只是相关而非因果。

### Phase 4：正式业务 Experiment（已实现并通过自动回归）

1. 正式 Experiment 必须使用用户提供的 Evaluator；
2. Evaluation Spec 投影稳定化；
3. paired baseline/candidate comparison；
4. repeat/seed policy 与不确定性报告；
5. 标准 Optimization Proposal；
6. Historical badcase 到回归 Dataset 的人工确认流程；
7. 为 Dataset validity、Evaluator Meta-evaluation 和优化泛化保留稳定入口，具体方法后续实现。

交付判据：一次业务优化可以回答“谁定义标准、实际执行了哪个 Evaluator、改了什么、固定样本上是否改善、真实业务指标如何变化”。

### Phase 5：治理模块解耦（已实现并通过自动回归）

1. Promotion Gate 和 Policy 移出默认导航；
2. `governed` 模式显式启用；
3. 引入 diagnostic/experiment/governed Artifact Profile；
4. 完整 Artifact Registry、审计记录和发布交接只在该模式展示；
5. 现有 Gate 协议与 reason code 保持兼容；
6. Host 模式进入 Promotion 时，由 Policy 显式接受“无隔离/无限制”的环境事实，或默认要求 Docker；不能静默视为等价；
7. Evaluator reliability 的强制门槛留给未来 Governed Policy，不作为体验功能前置条件。

交付判据：普通体验诊断完全不需要理解 Gate；正式晋级仍保持原有严格性。

## 15. 兼容策略

1. 现有 Summary v2/v3/v4、Context v1/v2/v3 和 Historical Job 保持只读可访问。
2. 对旧 Job 动态生成 `evaluation-report/v1`；无法推导的字段标为 `unknown`，不伪造。
3. `evaluation-report.json` 首期为非 reward-affecting 派生产物，不改变历史分数。
4. 现有 Stack 继续是执行源；Evaluation Spec 首期只做投影。
5. Evaluator、Rubric、Judge 或 Metric Template 改变时仍需要新的身份和 fresh baseline。
6. Gate 继续只接受兼容 Context；UI 隐藏不代表放宽比较规则。
7. 工具弃用至少跨一个正式版本，并提供旧名到新意图的映射。
8. 所有新 Schema 必须进入 npm 包、Python 包、Job Artifact Validation 和跨语言 contract tests。
9. 同步根 README、`docs/architecture.md`、`docs/dsh-web-quickstart.md`、`docs/security.md`、`docs/acceptance-status.md` 与两个包 README，只保留一套用户概念和 Host/Docker 事实。

## 16. 测试方案

### 16.1 Python

新增或扩展：

- `test_evaluation_report.py`
- `test_metric_templates.py`
- `test_evaluation_health.py`
- `test_evaluator_attestation.py`
- `test_business_observation.py`
- `test_historical_observation_v2.py`
- `test_optimizer_proposal.py`
- `test_meta_evaluation.py`
- `test_summary.py`
- `test_historical_artifacts.py`

重点覆盖：

- 无有效总分但有部分 Criterion 信号；
- evidence insufficient、evaluation error、infrastructure error 分离；
- required/optional/not-applicable 聚合；
- Meta-evaluation identity stale；
- configured/materialized/executed Evaluator digest 一致与不一致；
- 外部业务 Observation 身份、时间窗、重复导入和敏感字段；
- paired comparison 与不同 Evaluation Spec 不可比；
- 旧 Job 报告投影。

### 16.2 Node / Web

新增或扩展：

- `dashboard.test.js`：Report 投影、Job resolver、Trial identity；
- `historical-launcher.test.js`：权限预检、精简确认、结果跳转；
- `client-state.test.js`：结果状态与路由；
- `session-redaction.test.js`：Evidence Adapter 脱敏与上限；
- `session-materializer.test.js`：Observation v2/Batch identity；
- 新增 `effective-evaluator.test.js`：运行时身份、只读旧版本、创建新版本和新 Job attestation；
- 新增 `business-results.test.js`：导入、绑定、趋势和与离线分数隔离；
- 新增 `evaluation-result.test.js`：verdict、指标、案例和 next action；
- 新增三条完整旅程：Recent Sessions→结果、Trial 证据→Optimizer 草稿、Evaluator Diff→保存→下一次 Job；
- 断言默认页面不出现绝对路径、digest、schema、PID/PGID、Compose 和原始 JSON；
- 断言中英文均不显示 raw machine status，缺 score 不得进入 Metrics；
- 新增可访问性测试：状态不只依赖颜色，技术详情默认折叠。

### 16.3 契约测试

必须包含一个固定回归场景：

```text
4 Trials
├── 3 Judge completed
│   ├── goal_progress scored
│   ├── interaction_quality scored
│   ├── execution_reliability partial
│   └── evidence_alignment insufficient-evidence
└── 1 evaluation-error
```

预期：

- `overall_score = null`；
- `verdict = insufficient-evidence`；
- generator partial signals 仍可见；
- next action owner 是 `evaluation-evidence`；
- Judge 错误单独归类；
- 页面不得把结果显示为 0 分或“全部完成且健康”。

## 17. 验收标准

### 17.1 用户价值

1. 首屏不出现必须先理解的 Stack、Context、Registry、Gate、digest、绝对路径、schema、operation id、PID/PGID、Compose 或原始 JSON。
2. 用户无需展开详情即可复述总体结论、可信度、主要问题和下一步。
3. 无可靠总分时明确显示“无法评分”，不显示 0，也不只显示 `completed-unscored`。
4. 每个主要 finding 都有责任方、受影响样本和代表性案例。
5. 一次评测最多给出一个最高优先级 next action。
6. 首页和结果页分别能回答 Dataset、Generator、实际生效的 Evaluator、Metrics、Optimizer 与 Meta-evaluation 的当前状态。
7. 最近会话入口和结果都明确标记为“体验评测”，不会被误认为正式业务标准。
8. 用户可从 Job 查看当时执行的 Evaluator，并基于它创建新版本。
9. 外部业务结果与离线评测并列显示，明确身份、窗口、样本量和“相关不等于因果”。
10. 中英文默认界面都不得原样显示机器状态码。

### 17.2 科学性

1. Dataset、Generator、Evaluator、Judge、Metric Template 和 repeat policy 可复现。
2. configured/materialized/executed Evaluator identity 必须一致，用户看到的是 executed identity。
3. 业务质量和评测健康度完全分离。
4. Required Criterion 覆盖不足时不能产生总体质量结论。
5. Evaluator 未元评测时必须显示 `unvalidated`；体验功能允许该状态。
6. Baseline/Candidate 只在相同 Evaluation Spec identity 下比较。
7. 随机运行不能挑选最好 attempt；重试与 repeat policy 必须显式。
8. Optimizer 建议必须引用有效 evidence，并限定 mutation surface。
9. 外部业务 Observation 不得改写离线 Assessment 或历史指标。

### 17.3 安全与治理

1. Observation v2 不泄漏工具参数、凭据、reasoning 和原始附件。
2. 所有 evidence summary 经过确定性 allowlist 和 secret scan。
3. 高级实验详情继续使用当前有界、递归脱敏的读取方式。
4. Governance 关闭时不会运行 Gate；开启时不降低现有 Gate 条件。
5. Harbor 仍不执行生产部署。

## 18. 主要风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 隐藏审计后用户误以为结论没有依据 | 结果页固定显示“评分依据”和“实验详情”入口，后台保留 Receipt |
| 为提高可读性而弱化 Score Validity | 报告由严格 Assessment 派生，UI 不重新计算分数 |
| 结构化工具摘要泄漏敏感信息 | allowlist、secret scan、字节上限、fail closed、未知工具最小化 |
| 预定义指标被误当成万能标准 | 体验模板明确只用于教学；正式业务标准由用户提供 Evaluator |
| UI 展示 Evaluator A、Task 实际执行 B | configured/materialized/executed attestation；不一致即 evaluation-error |
| Meta-evaluation 变成自证 | GT 必须独立，记录 provenance，待测 Evaluator 不可生成 GT；首阶段仅预留状态 |
| 外部业务结果被误作因果证明 | 绑定身份、窗口和样本量；默认只表述相关，不自动回写离线分数 |
| 新旧协议并存导致双重真相 | 旧产物是评分权威，Report 是只读投影；后续再单独迁移执行源 |
| Gate 被隐藏后正式流程误操作 | Governed 模式显式入口，API 继续强制 Policy 和兼容 Context |
| Comparison digest 包含非测量代码，频繁触发 fresh baseline | 拆分 measurement identity 与 full/audit identity；用 golden vectors 验证 |
| Same-origin 被误当成完整授权 | 继续强制 Session、project、token、revision 和 evidence ancestry 校验 |
| UI 拆分破坏页面引用和操作恢复 | 保持 Bridge/Context/Operation 协议不变，先做组件提取再改导航 |

## 19. 代码改动优先级

### P0：立即处理

1. 合同/Schema/文档事实收敛与 bridge contract；
2. Effective Evaluator 单一语义源和运行时 attestation；
3. 从已执行只读版本创建可编辑的新 Evaluator 版本；
4. `evaluation-report/v1` 与结果页 Verdict；
5. Job path、Trial identity、unknown score 和 primary metric 一致性；
6. 默认隐藏 Audit/Pipeline/Artifacts/Gate；
7. 最近会话入口明确标记为体验评测。

### P1：让体验评测真正可理解

1. Session Observation v2；
2. Evidence Adapter；
3. 体验 Metric Template 与 evidence requirements；
4. 生成器质量 / 评测健康 / 运行健康三分法；
5. Dataset validity 与 Evaluator reliability 预留状态；
6. 用户级理念说明、坏案例和唯一 next action。

### P2：外部业务结果

1. `business-observation/v1`；
2. 文件/API 导入；
3. Candidate/Deployment 身份绑定；
4. 离线与真实业务指标并列展示；
5. 不做因果归因和自动优化。

### P3：正式实验与后续科学性

1. 用户提供业务 Evaluator；
2. Evaluation Spec、paired comparison 和 repeat/seed policy；
3. 不确定性与分组报告；
4. Dataset validity 和 Evaluator Meta-evaluation 逐步实现；
5. 优化集/回归集/保留集治理；
6. Governance 模块解耦。

## 20. 最终产品边界

Harbor 默认承诺：

> 用用户提供且实际执行、可查看、可版本化修改的 Evaluator，在固定样本和明确指标下评估 Agent；区分生成器问题、评测器问题和证据缺口；允许导入真实业务结果，并用同一把尺子验证受控改动是否变好。

Harbor 不默认承诺：

- 最近会话体验评测等于正式业务质量证明；
- 一次诊断就得到可信总分；
- LLM Judge 天然可靠；
- Historical Session 可以直接用于 Promotion；
- 外部业务结果与离线提升的相关性天然构成因果证明；
- 优化建议会自动修改或部署 Agent；
- 隐藏审计界面等于取消实验完整性。

本次重构的核心不是删除严谨性，而是把严谨性放回后台，让用户首先获得评测结论、可信度和下一步。

## 21. 完成矩阵与验证边界

| 阶段 | 实现证据 | 自动验收 |
| --- | --- | --- |
| Phase -1 | 单一 root Schema source + 同步脚本；Context/Registry/Manifest/Policy/Host-Docker 事实收敛；JS 兼容数字 canonical serializer | 34 个 root/npm/Python Schema 字节一致；跨语言 golden vectors 通过 |
| Phase 0 | strict Candidate materializer；Evaluator v2 exact bundle；Effective Evaluator；Job seal；可信 Report 投影；从 executed bundle 分叉 | arbitrary verifier / v1 执行拒绝；bundle tamper、unattested/unsealed/tampered score suppression 与旧 family fork 回归通过 |
| Phase 1 | Experience Diagnostic 边界；理念引导；Metric applicability/evidence requirements；质量/评测/运行三分法；唯一 next action | 原 4 Session fixture 保持 3 个 evidence gap、1 个 Judge failure、0/4 总分、9/16 Criterion、`insufficient-evidence` |
| Phase 2 | Observation v2、Batch v2、Historical Context v3、allowlist Evidence Adapter、coverage 声明 | secret、超限、未知工具、缺失结果、Schema 与实际 Historical artifact 回归通过 |
| Phase 3 | `business-observation/v1` 文件/结构化导入、不可覆盖存储、Candidate/Deployment/Window 绑定、correlation-only 投影 | Python/Node 导入、digest、列表、报告关联与“不影响 reward/Gate”回归通过 |
| Phase 4 | `evaluation-spec/v1`、repeat/seed、measurement identity、paired comparison/uncertainty、Optimization Proposal、人工确认 badcase Dataset、exact Meta identity | Spec schema/identity、mismatch、repeat、badcase stale/confirmation、ESF/SCE/RCR 与 stale meta report 回归通过 |
| Phase 5 | diagnostic/experiment/governed profiles；导航与 Artifact Registry 分层；Host risk Policy；Docker image ID；Gate 重算 invariant | product-mode、Doctor、image capture、image identity Gate、seal tamper 与 Summary invariant 回归通过 |

本轮最终自动证据：Node `npm run check` 为 632 tests passed；Python `pytest` 为 378 tests passed；npm dry-run 包含 34 个公共 Schema。Web client 已重建。

未被夸大为已完成的外部证据：临时浏览器标签无法取得当前 DSH Web 的授权 URL，因此没有真实 GUI 点击截图；本轮没有运行需要真实业务 Candidate / 外部模型的付费 Job；环境缺少 Python build backend，因此没有新建 wheel。以上不改变代码与合同完成状态，但在发布交接时仍应补做 wheel/sdist build、授权 GUI journey 和所选真实 Provider/业务 Baseline 验证。