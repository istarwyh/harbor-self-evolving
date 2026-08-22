# 本地 DSH Web 快速开始

版本组合：DSH `0.1.0-rc.6`、Plugin + Skill `0.6.1`、Harbor Adapter `0.6.1`。

## 安装与重启

要求 Docker、Node.js 22+、pnpm、uv。在业务 Agent 工作区运行：

```bash
cd /absolute/path/to/agent-workspace
npx --yes dsh-harbor-evolution@0.6.1 setup --project-root "$PWD"
```

GitHub URL 是文档/源码入口，正式用户仍使用 npm 安装；不要直接 link 新 checkout。安装器会建立独立 Harbor venv、安装同版本 Python Adapter、把 Plugin + Skill 写入 `web` profile、保存 CLI 路径并验证 entry point。

停止旧 DSH 进程，复制安装器输出的启动命令：

```bash
cd /absolute/path/to/agent-workspace
DSH_HOME="$HOME/.dsh" pnpm dlx @deepseek-ai/dsh@0.1.0-rc.6 web
```

## 确认 UI 与能力

Web 中应出现：

1. `Harbor` Tab：轻量 Job 总览；点击 Job 打开 Evaluation Workbench。
2. “设置 → Harbor 自进化”：项目、Stack、Jobs、Harbor CLI 检查。
3. Harbor Tool 调用卡片。

工具目录应包含：

```text
harbor_candidate_snapshot
harbor_evolution_init
harbor_evolution_doctor
harbor_dataset_validate
harbor_context_preview
harbor_eval_run
harbor_eval_result
harbor_candidate_compare
```

输入 `/evolve` 应看到 `evolve-agent-with-harbor` Skill。

## 第一次初始化

```text
/evolve-agent-with-harbor
请检查当前工作区。先澄清 Candidate、Dataset、Evaluation Stack 八个角色、Judge、指标方向、baseline、允许改动面和 Policy；我确认后再初始化，不要直接运行 Job。
```

Skill 会在信息齐全后调用非覆盖式 initializer，再要求实现业务组件并运行 Dataset Validate、Architecture Doctor 和 Context Preview。初始化成功不等于正式评测就绪。

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

Workbench 会跟随 DSH 语言设置展示九个阶段。「候选版本」先固定 Candidate、Dataset、Evaluation Stack 与 Runtime 身份；「评测集」展示 Agent 实际收到的 instruction；「产物呈现」会直接展示真实 LLM 生成的 `research-report.md`；「评测器」展示统一接口、三元 Criterion、Evaluator/Rubric/Judge 源码和受控升级入口；「评测器元评测」引导建立独立 Ground Truth 并展示 ESF/SCE/RCR；「评测报告」分页对照产物、分数、原因与建议；「优化器」展示 evidence-linked 单一实验假设；「晋级门禁」展示可比性、逐指标 delta、改善/回归样本和已执行 Gate。完整 JSON 只放在折叠审计区。运行中按 Dataset 顺序增量刷新，历史 Job 仅在有安全源文件或 Trial 轨迹时回读。

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
| 工具存在但 Skill 不出现 | 确认 `harbor-evolution` 版本为 `0.6.1` 并重启 |
| `spawn harbor ENOENT` | 重新运行 setup 保存绝对 CLI 路径 |
| Harbor 找不到 `dsh-evolution` | Adapter 与 Harbor 不在同一 venv；重新 setup |
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
