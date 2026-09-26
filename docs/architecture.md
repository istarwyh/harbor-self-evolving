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
2. Evaluation checkpoint：Dataset Manifest、Evaluation Stack Manifest、Candidate Context v3（Historical Context v3）、Doctor、Contract、Trials、Population、Summary 和 Gate 报告。

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

正式 Candidate Experiment 只接受 [`harbor-dsh-evaluator/v2`](evaluator-interface.md) 的 `script` 或 `llm-as-judge` 实现；v1 仅用于读取旧产物，不进入当前 Candidate 执行路径。Descriptor 固定输入/输出协议、可编辑文件和 Criterion 离散值；实现 bundle 的摘要进入 Evaluation Stack comparability identity。Workbench 只允许修改 Descriptor 精确授权的项目内文件，并强制创建新的 Evaluator 与 Stack 版本。

## Candidate Context v3 的两种 digest

```text
Candidate manifest ──────────────┐
Dataset manifest ────────────────┼─ full_digest（完整审计）
Evaluation Stack full identity ──┤
Candidate model binding ─────────┤
Harbor/Adapter runtime + mode ──┘

Dataset identity ────────────────┐
Integration/Renderer/Evaluator ──┤
Rubric/Judge ────────────────────┼─ digest（可比较性）
Candidate model binding ─────────┤
semantic Runner + integration ───┘
```

Candidate 不进入可比较 digest：两个待比较版本必须是不同 Candidate digest，但必须共享同一把评测尺子。Diagnoser、Optimizer、Reporter 和 `semantic: false` Runner 会进入完整审计，却不改变 reward 可比较性。

以下变化必须建立 fresh baseline：Dataset id/version/source、Integration、Renderer、Evaluator、Rubric、Judge、语义 Runner、Candidate provider/model/reasoning effort、Harbor 或 Adapter integration identity。Policy 是独立版本化的决策合同，可以在已有指标足够时重新应用，不会改写 Context。

Host DSH 的安装版本与 Candidate 运行时分别管理。Candidate 通过 `candidate-runtime.json` 声明自己的 ACP 入口、配置、Agent ID 和精确 Node 版本，完整 npm lockfile 随 Candidate digest 固定。Adapter 不选择 demo 包、不执行 `npx …@latest`，只安装已验证的锁文件并启动该入口。没有严格 runtime binding 的旧 Candidate 不进入当前执行路径；如需重跑，必须建立新 Candidate 和 fresh baseline。详见 [Candidate runtime contract](candidate-runtime-contract.md)。

### Host Model Broker

每个 Plugin Job 都在 Host 侧冻结当前 DSH Agent 模型，然后创建仅绑定本机的短期 Broker。Candidate 通过临时 `.harbor-runtime` 的 `dsh-host` Adapter 发起请求；Broker 以固定模型身份转发给 Host `llm.stream()`，并忽略 Candidate 伪造的 provider、model 与 signal。运行环境只拥有随机 Job Token 文件（`0600`），不拥有 GPT Auth/Codex OAuth 或任何上游 API Key。Job 结束、失败或超时时 Broker 会 abort 尚未完成的推理并释放 Server。

Host 是默认执行模式，但它不是安全沙箱：Candidate/Task 进程仍拥有宿主用户可见的权限边界。需要隔离不可信代码、文件系统或网络时必须显式选择 Docker；Docker 才是隔离边界。短期 Broker token 只限制模型通道，不能把 Host 进程变成容器。

## 已有生成结果的 Historical 路径

当用户没有提供 Dataset 时，原 DSH Agent 仍是生成器；最近完成的真实 Session 是它已经产生的行为证据。Historical Generation Evaluation 不创建或执行 Candidate：

```text
exact-cwd DSH Sessions
→ safe Preview + explicit confirmation
→ redacted historical-generation-batch/v2（Session Observation v2）
→ matching Harbor 1.4 Dataset + immutable Historical Stack
→ SessionObservationAgent（1 Session = 1 Trial）
→ Evaluator v2 applicability / Criterion coverage
→ Summary v4 + Historical Workbench
```

`dsh-historical-evaluation` 在 Job 创建前要求 Batch、Dataset 和 Stack 已同步物化；Observation Agent 只读取冻结记录，不调用模型或工具重放原任务。Judge 的 provider/model/reasoning、Broker protocol、Job 和 Batch digest 会在评分前互证。若 Judge 与历史生成器使用同一模型，Context 明确标记 `same-host-model-diagnostic-only`，不能声称独立裁判。

Historical Job 固定为 `observe-existing`、diagnostic、Gate N/A。它不包含 Candidate，也不在 Job 内证明 Evaluator 可靠；严格的 Evaluator Meta-Evaluation 仍需要独立 Ground Truth。required Criterion 因证据不足正常弃权时，Trial 是 `completed-unscored`，不是质量 0 分或评测错误。

## 外部真实业务观察

`business-observation/v1` 是项目级、不可覆盖的外部聚合指标，不是 Job Artifact。Python Adapter 是 Schema、敏感字段、时间窗、Metric/Segment 语义、canonical digest、项目边界和重复 observation id 的唯一校验权威；Node 服务只通过 CLI 导入或读取。存储位于工作区 `.harbor/business-observations/`，不会写入历史 Job 目录或 Artifact Registry。

Workbench 用 Job 的精确 Candidate digest 查询匹配观察，并把 Offline Evaluation 与真实业务指标并列展示。Generator/Deployment/project-only 观察只能作为版本不明确的背景。趋势按完整 subject 身份分开，页面始终显示“相关而非因果”，且投影不参与 verdict、Summary、reward、Optimizer、Compare 或 Gate。详见 [External business observations](business-observations.md)。

## 严格数据流

```text
Clarify → Init → Dataset Validate → Architecture Doctor
                                    ↓
Candidate Snapshot → strict Dataset/Evaluator materialization → Context v3 Preview → Harbor Job
                                    ↓
统一 adapter 调用已固定 input_builder + Evaluator，并写入 runtime attestation
                                    ↓
Trial Lifecycle → Contract + Assessment v2/v3 + Artifact Registry v2
                                    ↓
Reporter → Diagnoser → Optimizer → Artifact validation → Summary v3/v4
                                    ↓
evidence-linked controlled change → next Candidate Job
                                    ↓
Candidate Context v3 comparability + Policy v2 → PROMOTE / REJECT
                                    ↓
external CI/CD promotes the same evaluated artifact
```

`promotion-eligible` Job 必须具有 Candidate Manifest、严格物化的 Dataset、Stack Manifest、Candidate Context v3、Policy v2、verified Effective Evaluator 和零 Doctor error。旧 Candidate Context 或自定义 Task verifier 不提供兼容降级。

## Trial Lifecycle 与分数可信度

Job 启动时按 Dataset 顺序预登记全部 Trial。Harbor Hook 只推进状态：

```text
queued → preparing-environment → preparing-agent → running-agent
       → running-integration → rendering → evaluating
       → completed | candidate-quality-failed | infrastructure-error
                   | evaluation-error | completed-unscored | cancelled
```

`trial-events.jsonl` 追加写历史，`trial-lifecycle.json` 原子更新当前快照。Retry 创建新 `attempt`，旧 attempt 与 assessment 永不覆盖。Job 进度的分母来自 Dataset total，而不是已经被发现的 Trial 数。

Trial Assessment v2 分离：

```text
raw_rewards: Harbor 原生 verifier 输出，仅用于排错，不是业务质量权威
score.value: 由实际执行且通过 attestation 的 Stack Evaluator 产生，可进入质量聚合的主指标值
score.valid: 是否满足输入、Agent/Observation、Integration、Renderer、Judge、Evaluator identity、Schema 硬约束
```

基础设施或评测器失败时，即使 raw reward 是数字，`score.value` 仍为 `null`，UI 显示 `—`。Population 和 Gate 只使用有效分数。

`completed-unscored` 只用于 Historical Trial 的正常证据弃权：它计入 Trial/Criterion coverage 和状态人口，但不进入 reward 聚合，也不增加 invalid-score 数。

## Post-processing 与 Gate 边界

Reporter、Diagnoser 和 Optimizer 在 reward 计算后运行，身份与版本写入产物，默认 `reward_affecting: false`。它们不能修改 Evaluation Contract 或历史 Assessment。优化假设必须指向 evidence refs、允许/禁止改动面、护栏、回滚条件和唯一下一实验。

Workbench 的 Compare 只是只读预览。Historical Session 启动器是一个独立、同源且必须二次确认的窄写路径：浏览器只获得 Preview id，Host 保留 selection token 并在确认后异步启动不可晋级的诊断 Job。页面刷新只恢复正在运行的 operation，不会启动新 Job。Diagnostic Job、Reporter、Diagnoser、Optimizer 都不会运行 Gate，更不会部署、发布或替换 Champion。

## reward 与诊断证据

正式 Candidate Experiment 不再信任 Dataset 自带的任意 `tests/test.sh` 判分。Job 启动前会为每个 Task 生成统一 verifier：它从完整 Evaluator bundle 调用已声明的 `input_builder` 组装业务输入，再调用同一 bundle 中的 `evaluate`。执行前后都计算 `portable_digest`；configured、materialized、executed 任一不一致，`score.value` 为 `null`，状态为 `evaluation-error`。

Task 的原始运行产物、工具调用、搜索状态和引用仍是 Evaluator 可读取的 evidence；它们应成为独立 Criterion，而不是藏在 prose-only 备注或未受信任的 native reward 中。分项指标用于根因和非回归，aggregate 只来自已验证的 Evaluator Result。

## 元评测

优化评测器时旋转角色：Candidate 是 Evaluator/Rubric/Judge 版本；Dataset 是带独立 GT 的固定产物；指标至少包含 ESF、SCE 与 RCR，也可加入时延和成本。GT 可以是人工、程序、多方共识、独立模型或外部标准，但必须有 provenance、独立于待测 Evaluator，且不能由待测评测器生成。当前实现只根据独立 GT 与重复 observations 生成 Meta-evaluation Report；它尚未创建专用 Harbor Meta Job，也不运行 Meta Promotion Gate。
