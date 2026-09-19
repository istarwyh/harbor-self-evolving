---
title: 19 个 Harbor Agent 工具
linkTitle: 19 个工具
weight: 10
description: 每个 Plugin 工具的输入边界、mutation/approval 语义、输出证据与下一步。
verified_against_version: 0.9.6
source_refs: [packages/dsh-plugin/index.js, README.md]
---

Plugin 暴露 **19 个严格工具**：10 个 workspace/Job mutation 进入 DSH 一次性 approval；9 个为只读或内存操作。Host 缺少 approval seam 时，mutation tool fail closed。

| Tool | 用途与最小边界 | 模式 / 结果 |
|---|---|---|
| `harbor_candidate_snapshot` | 把一个 Cordis composition 固定为不可变 Candidate Manifest。 | **写本地 Artifact · approval。**下一步：Doctor 或 Context preview。 |
| `harbor_model_binding` | 读取当前 DSH 默认 provider/model/reasoning 身份。 | **只读/内存。**返回非敏感 binding draft，不返回凭据。 |
| `harbor_evolution_init` | 把已确认四概念卡编译成 non-overwriting Stack project。 | **写本地 Artifact · approval。**不运行评测。 |
| `harbor_evolution_doctor` | 在产生费用前检查 Candidate、Dataset、Stack、可选 Policy 与执行架构。 | **只读。**返回阻断诊断。 |
| `harbor_quick_diagnostic_init` | 创建一个 Query、最小 Host-model Candidate、可运行 Task 与非晋级 Evaluator。 | **写本地 Artifact · approval。**只证明 wiring。 |
| `harbor_session_diagnostic_preview` | 在 exact current workspace 预览 1–10 个最近完成顶层 Session。 | **只读/内存。**安全 metadata + 15 分钟 owner-bound token。 |
| `harbor_session_diagnostic_run` | 重新验证 token，冻结私有脱敏 Batch，每条 Session 运行一个 Trial。 | **启动评测 · 写入 · approval。**Historical，Gate N/A。 |
| `harbor_dataset_validate` | 验证 manifest、Task 唯一性、instruction、路径、敏感 metadata 与 source digest。 | **只读。**不修复或重写身份。 |
| `harbor_context_preview` | 刷新 Candidate manifest，预览 Context v3 并寻找可比 baseline。 | **刷新 manifest · approval。**不运行 Job。 |
| `harbor_eval_run` | 使用冻结身份运行 strict diagnostic 或 promotion-eligible Candidate Job。 | **启动评测 · 写入 · approval。**返回 Job 身份。 |
| `harbor_eval_result` | 读取 summary、Job、Dataset、progress、Trial 或 governance view。 | **只读。**bounded、递归脱敏、显式 untrusted envelope。 |
| `harbor_resolve_page_context` | 解析 exact-session opaque `@harbor` 页面上下文与当前 revision。 | **只读。**返回窄 metadata、typed ref 与 navigation action。 |
| `harbor_get_evidence` | 通过精确 typed ancestry ref 读取一个 Evidence。 | **只读。**不接受猜测 path/id。 |
| `harbor_propose_action` | 从显式用户请求与新鲜上下文起草一个可过期 Workbench action。 | **内存 draft。**不写资源、不启动 Job、不 Gate、不部署。 |
| `harbor_evaluator_inspect` | 检查 active descriptor、implementation kind、ternary Criteria 与 bounded editable source。 | **只读。**省略 secret/local-path-shaped source。 |
| `harbor_evaluator_update` | 以 optimistic concurrency 替换一个 allowlisted source，并生成新 Evaluator/Stack 版本。 | **写本地 Artifact · approval。**不自动评测或 Gate。 |
| `harbor_ground_truth_init` | 创建 non-overwriting 独立 Ground Truth draft，并记录 provenance。 | **写本地 Artifact · approval。**支持 human/programmatic/consensus/model/external。 |
| `harbor_evaluator_meta_evaluate` | 对比重复 observation 与独立 GT，产出 ESF/SCE/RCR。 | **写报告 · approval。**治理 Evaluator，不晋级 Candidate。 |
| `harbor_candidate_compare` | 在 Policy 下对可比 Baseline/Candidate Job 应用确定性 Promotion Gate。 | **写 Gate Artifact · approval · 可晋级。**永不部署。 |

## 徽标含义 {#badges}

- **Read-only**：不修改 workspace 评测状态。
- **Writes local artifacts**：在 bounded Harbor workspace 创建或版本化文件。
- **Starts evaluation**：批准后可能发生 runner/Judge/model 工作。
- **Promotion eligible**：证据或结论可进入 promotion policy；Historical 与 quick diagnostic 不可。

Tool success 只表示声明操作完成，不代表 Candidate 质量提升或生产环境变化。
