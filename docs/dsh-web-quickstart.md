# 本地 DSH Web 快速开始

版本组合：DSH `latest`、Plugin + Skill `0.9.1`、Harbor Adapter `0.9.1`、Harbor `0.21.x`。

## 安装与重启

要求 Docker、Node.js 22+、pnpm、uv。在业务 Agent 工作区运行：

```bash
cd /absolute/path/to/agent-workspace
npx --yes dsh-harbor-evolution@0.9.1 setup --project-root "$PWD"
```

GitHub URL 是文档/源码入口，正式用户仍使用 npm 安装；不要直接 link 新 checkout。安装器会建立独立 Harbor venv、安装同版本 Python Adapter、把 Plugin + Skill 写入 `web` profile、保存 CLI 路径，并验证 `dsh-evolution` 与 `dsh-historical-evaluation` 两个 Harbor entry point。

停止旧 DSH 进程，复制安装器输出的启动命令：

```bash
cd /absolute/path/to/agent-workspace
DSH_HOME="$HOME/.dsh" pnpm dlx @deepseek-ai/dsh@latest web
```

## 确认 UI 与能力

Web 中应出现：

1. `Harbor` Tab：轻量 Job 总览；`评测最近会话` 按钮；点击 Job 打开 Evaluation Workbench。
2. “设置 → Harbor 自进化”：项目、Stack、Jobs、Harbor CLI 检查。
3. Harbor Tool 调用卡片。

工具目录应包含：

```text
harbor_candidate_snapshot
harbor_model_binding
harbor_evolution_init
harbor_evolution_doctor
harbor_quick_diagnostic_init
harbor_session_diagnostic_preview
harbor_session_diagnostic_run
harbor_dataset_validate
harbor_context_preview
harbor_eval_run
harbor_eval_result
harbor_evaluator_inspect
harbor_evaluator_update
harbor_ground_truth_init
harbor_evaluator_meta_evaluate
harbor_candidate_compare
```

输入 `/evolve` 应看到 `evolve-agent-with-harbor` Skill。

## 第一次诊断：默认复用最近会话

最简单的入口不需要输入命令：

1. 打开对话页的 `Harbor` Tab，确认当前工作空间正确。
2. 点击 `评测最近会话`。页面只读预览最多 10 条合格会话的安全元数据。
3. 核对会话数量、Evaluator/Judge、模型耦合、预计请求、有效期和本地证据目录。
4. 点击 `确认并开始评测`。Job 在后台运行；窗口可以关闭，完成后 Workbench 会自动打开对应 Job。

浏览器只持有 opaque Preview id，selection token 始终保留在 Host 内存。重复点击确认不会启动第二个 Job；刷新页面会恢复当前工作空间仍在运行的操作。页面刷新本身不会启动任何评测。

如果希望先通过对话澄清 Dataset、Evaluator 或其他业务语义，继续使用 Skill：

```text
/evolve-agent-with-harbor
请检查当前工作区，帮我初始化 Harbor 自进化流程。
```

Skill 会先扫描当前目录。

如果用户没有提供 Dataset，Skill 会先调用 `harbor_session_diagnostic_preview(limit=10)`，只读预览当前 exact-cwd 最近完成的真实业务会话。确认卡应展示安全会话元数据、排除数量、Judge provider/model、同模型 coupling、预计请求数、15 分钟 token 期限，以及 `.harbor/private` / `jobs` 的本地保留和 VCS 风险；不得展示原始 Session id 或正文。

用户明确确认后，Skill 只把 `selectionToken` 和可选 `jobName` 传给 `harbor_session_diagnostic_run`。Run 冻结脱敏 Batch，同步物化匹配的 Dataset/Stack，并以“一条会话一个 Trial”运行 `historical-generation-evaluation`。它不会重新执行 Candidate，Gate 固定 N/A，Evaluator Meta-Evaluation 固定 `not-run`。`completed-unscored` 表示证据不足的正常弃权，应看 Trial/Criterion coverage，而不是当作 0 分或错误。

如果没有合格历史，或用户显式提供 Query/Dataset，Skill 才继续四个业务概念：

1. **评测集：测什么？** 可以是一条 Query、文件、包含多个 instruction 的目录或已有 Dataset。
2. **生成器：谁来回答？** 可以给 curl、本地 Agent 文件/目录，或采用 Skill 在工作区发现的入口。
3. **评测器（评测标准）：怎样算好？** 可以给评测器 curl/路径；没有时直接用自然语言描述标准，由当前 Agent 起草版本化实现。
4. **优化器：谁根据结果改进？** 默认由当前 Agent 负责，也可选择 Codex CLI、Claude Code 或本地命令。

如果还没有 Harbor 目录，Skill 会提议在当前目录下使用 `./harbor-evolution/` 作为托管工作空间。它会把底层版本、身份、适配器、产物呈现、诊断和报告配置汇总成确认卡；你选择“开始初始化”后才调用非覆盖式 initializer。单条 Query 默认只是诊断，不会被包装成可晋级证据。只有在真正需要时才继续询问专业治理信息：正式回归前确认阈值、非回归指标、重复策略和副作用边界；优化评测器时单独建立独立 Ground Truth；Gate 建议晋级后才讨论 CI/CD 与部署权限。

## DeepResearch 严格示例

该示例默认连接宿主机 `http://127.0.0.1:8317/v1/responses`，Candidate 内固定使用 `host.docker.internal`，模型为 `gpt-5.6-luna`。运行 `./hse demo` 前需确保接口可用；API key 使用 `HSE_DEMO_LLM_API_KEY` 注入。endpoint/model 是 Candidate 身份的一部分，切换时应修改 `generator-config.json`、升级 Candidate version 并重新 snapshot，不能在同一个 digest 下静默替换。

在本仓库源码模式中，v1/v2 调用都需要：

```text
candidatePath = examples/deep-research/candidates/v1  # 或 v2
datasetPath = examples/deep-research/task
stackPath = examples/deep-research/.harbor/evaluation-stack.yml
mode = promotion-eligible
policyPath = examples/deep-research/promotion-policy.json
```

先运行 v1 baseline，再运行 v2，最后：

```text
baselineJob = jobs/<v1-job>
candidateJob = jobs/<v2-job>
policyPath = examples/deep-research/promotion-policy.json
```

Workbench 会跟随 DSH 语言设置展示九个阶段。「候选版本」先展示 Candidate、Dataset、Evaluation Stack、模型身份与“运行时追随最新版”策略；「评测集」展示 Agent 实际收到的 instruction；「产物呈现」会直接展示真实 LLM 生成的 `research-report.md`；「评测器」展示统一接口、三元 Criterion、Evaluator/Rubric/Judge 源码和受控升级入口；「评测器元评测」引导建立独立 Ground Truth 并展示 ESF/SCE/RCR；「评测报告」分页对照产物、分数、原因与建议；「优化器」展示 evidence-linked 单一实验假设；「晋级门禁」展示可比性、逐指标 delta、改善/回归样本和已执行 Gate。完整 JSON 只放在折叠审计区。运行中按 Dataset 顺序增量刷新，历史 Job 仅从 Job 自身快照或安全的旧版回退中读取源码与 Trial 证据。

## Profile 配置

安装器只维护一个 id-targeted override：

```yaml
- id: harbor-evolution
  config:
    projectRoot: /absolute/path/to/agent-workspace
    jobsDir: jobs
    harborBin: /managed/runtime/.venv/bin/harbor
    harborDshBin: /managed/runtime/.venv/bin/harbor-dsh
    pythonPath: ""
```

正式 PyPI 安装保持 `pythonPath` 为空。所有业务路径必须在 `projectRoot` 内。

## 常见问题

| 现象 | 处理 |
| --- | --- |
| 插件没有 Harbor Tab | 确认装入 `web` profile，停止旧进程并重启 |
| 工具存在但 Skill 不出现 | 确认 `harbor-evolution` 版本为 `0.9.1` 并重启 |
| `spawn harbor ENOENT` | 重新运行 setup 保存绝对 CLI 路径 |
| Harbor 找不到 `dsh-evolution` 或 `dsh-historical-evaluation` | Adapter 与 Harbor 不在同一 venv，或仍是旧版；重新运行 0.9.1 setup |
| Preview 报 `NO_ELIGIBLE_SESSIONS` | 当前 exact-cwd 没有合格已完成业务会话；先完成真实任务或提供显式 Query/Dataset |
| Historical Job 显示 `completed-unscored` | 正常证据弃权；查看缺失 Criterion 和 coverage，不要当成质量 0 分 |
| Apple Silicon 安装时编译 `cryptography` 失败 | 检查是否误选 x86_64 Python；按 troubleshooting 使用 `uv` managed Python |
| Dataset digest mismatch | intentional change 时升级 Dataset version 并重新 snapshot |
| Doctor 报 God Runner | 拆出 Integration、Rubric、Judge 或 Promotion 逻辑 |
| Context Preview 要 fresh baseline | 评测尺子发生变化；不要和旧 Job 声称可比 |
| `link:` 缺 `schemastery` | 正式用户改用 npm setup；源码开发使用 `./hse dsh-install-source web` |

## 源码开发

```bash
./hse dsh-install-source web
./hse test
```

源码安装会先执行锁定依赖安装并构建 Web client，再 link Plugin 并安装本地 Python Adapter。
