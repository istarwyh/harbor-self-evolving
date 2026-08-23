# Harbor Self-Evolving

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Harbor 持续评测与受控自进化插件。

这个仓库的首要交付物不是一个需要复制后改造的业务模板，而是可安装的产品组合：

| 交付物 | 用户得到什么 |
| --- | --- |
| DSH Plugin：`dsh-harbor-evolution` | 在自己的 DSH 中获得 Evaluation Workbench、12 个严格评测工具和结构化结果卡片 |
| 本项目官方 Skill：`evolve-agent-with-harbor` | Agent 知道如何澄清、初始化 Evaluation Stack、运行 Doctor、建立 baseline、诊断、回归和 Gate |
| Harbor Adapter：`harbor-dsh-evolution` | 固化 Candidate、Dataset、Evaluation Stack、Context v2、Trial 证据与 Promotion Gate |

`examples/` 是帮助理解和二次开发的参考实现，不是使用插件的前提。这里的“本项目官方 Skill”表示由本项目维护，并不表示 DeepSeek 官方背书。

> 如果你把这个 GitHub 链接交给 DSH 或其他 Coding Agent，请让它按照根目录的 [`AGENTS.md`](AGENTS.md) 安装。GitHub URL 是产品说明和源码入口，不是 npm 包地址；正式安装不要 clone 后执行 `dsh plugin add ./packages/dsh-plugin`，否则 profile 会绑定机器本地的 `link:` 路径。

## 一条命令安装

要求：Docker、Node.js 22+、pnpm 和 [uv](https://docs.astral.sh/uv/)。进入你的业务 Agent 工作区后执行：

```bash
cd /absolute/path/to/your-agent-workspace
npx --yes dsh-harbor-evolution@latest setup --project-root "$PWD"
```

安装器会让 npm Plugin 与 Python Adapter 使用同一个正式版本；需要完全固定版本时，把 `latest` 改为 `0.7.1`。

默认安装到 DSH 的 `web` profile。`setup` 会一次完成：

1. 建立独立的 Harbor Python 环境并安装匹配版本的 Adapter。
2. 把 Plugin + Skill 安装进选定的 DSH profile。
3. 持久化 `projectRoot`、Job 目录和两个 Harbor 可执行文件路径。
4. 验证 Harbor、`dsh-evolution` entry point 和 `harbor-dsh` CLI。

它只更新 profile 中的 `harbor-evolution` 配置块，不会覆盖其他用户配置；重复执行会更新同一个安装，不会产生重复条目。

安装完成后，停止旧的 DSH 进程，并执行安装器打印出的启动命令。默认形式是：

```bash
cd /absolute/path/to/your-agent-workspace
DSH_HOME="$HOME/.dsh" pnpm dlx @deepseek-ai/dsh@0.1.0-rc.6 web
```

然后在聊天中输入：

```text
/evolve-agent-with-harbor
请检查当前工作区，帮我初始化 Harbor 自进化流程。
```

Skill 会先检查文件，再围绕四个用户可理解的概念补齐必要信息：**评测集（测什么）**、**生成器（谁来回答）**、**评测器/评测标准（怎样算好）**、**优化器（谁根据结果改进）**。单条 Query、文件路径、curl 和本地 Agent 路径都可以直接提供；其余版本标识、适配器、产物呈现、诊断与报告配置由 Skill 推断并汇总成一张确认卡。只有用户选择“查看高级配置”时，才展开 Evaluation Stack、Judge、Contract 和 Policy 等专业字段。

在 Web profile 中还会出现三个可见入口：

- 对话页的 `Harbor` Tab：先看轻量 Job 结果，再打开按需加载的 Evaluation Workbench。
- Job 工作台：九个阶段跟随 DSH 语言设置；先直接展示固定的 Candidate / Dataset / Evaluation Stack / Runtime 身份，再展示 Agent 收到的 query 与 instruction、Harbor 收集的页面/文档/结构化产物、评测器 Ground Truth 元评测、逐 Trial 判分、Population 有效覆盖、受控优化假设和 Baseline 回归 Gate。完整 JSON 只留在折叠审计区。
- 评测器页：直接查看 `script` 或 `llm-as-judge` 的统一接口、三元 Criterion、Rubric 与实现源码；只能受控修改 Descriptor 授权的文件，并强制创建新的 Evaluator / Stack 身份。
- `harbor-dsh-evaluator/v1`：统一 `script` 与 `llm-as-judge` 的输入、三元 Criteria 输出、实现身份和可编辑文件；详情见 [`docs/evaluator-interface.md`](docs/evaluator-interface.md)。
- 工具调用中的 Harbor 专属卡片：直接理解初始化、Doctor、Context 预览、评测与 Gate。
- “设置 → Harbor 自进化”：检查项目目录、Evaluation Stack、Jobs 和两个 Harbor CLI 是否就绪。

GUI 当前是观察与诊断面，评测、比较等高成本动作仍由官方 Skill 在澄清需求后调用工具执行；它不会在浏览器后台静默启动 Job。

常用安装选项：

| 选项 | 默认值 | 用途 |
| --- | --- | --- |
| `--profile web` | `web` | 安装到实际运行的 DSH profile；CLI Agent 可改为 `headless` |
| `--project-root <path>` | 当前目录 | Candidate、Dataset、Policy 和 Jobs 的共同安全边界 |
| `--jobs-dir <path>` | `jobs` | Job 证据目录，必须位于 `projectRoot` 内 |
| `--dsh-home <path>` | `$DSH_HOME` 或 `~/.dsh` | 使用隔离或自定义的 DSH 状态目录 |
| `--runtime-dir <path>` | `~/.local/share/harbor-dsh-evolution` | Harbor Python 运行环境 |

完整的 UI 确认、首次评测和排错方法见 [本地 DSH Web 快速开始](docs/dsh-web-quickstart.md)。

## 用户实际获得的能力

Plugin 注册 12 个确定性工具：

- `harbor_candidate_snapshot`：固化不可变 Candidate。
- `harbor_evolution_init`：在需求确认后创建不覆盖已有文件的标准 Evaluation Stack 结构。
- `harbor_evolution_doctor`：检查角色边界、God Runner、Dataset、Candidate 和 Policy。
- `harbor_dataset_validate`：验证任务、路径、敏感字段和 Dataset source digest。
- `harbor_context_preview`：预览 Context v2、可比 baseline 和 fresh-baseline 要求。
- `harbor_eval_run`：运行显式的 `diagnostic` 或 `promotion-eligible` Job。
- `harbor_eval_result`：读取规范化 Summary，或按 `view=job|progress|dataset|trial|governance` 读取脱敏后的阶段、指令、生成产物与评测器治理证据。
- `harbor_evaluator_inspect`：查看统一 Evaluator 接口、Rubric、实现身份和声明授权的可编辑文件。
- `harbor_evaluator_update`：用摘要锁与新版本身份受控修改声明授权的实现文件；不会自动运行评测或 Gate。
- `harbor_ground_truth_init`：建立不覆盖已有文件、带来源与 provenance 的独立 Ground Truth 草稿。
- `harbor_evaluator_meta_evaluate`：用固定产物、Ground Truth 和重复观测计算 ESF、SCE、RCR、覆盖率与分歧。
- `harbor_candidate_compare`：执行严格、可解释、带原因码的 Promotion Gate。

Skill 负责稳定使用这些工具，而不是让 Agent 无约束地“改自己”。用户入口保持为四个概念，内部再编译为严格架构：

```text
评测集 + 生成器 + 评测器（评测标准） + 优化器 → 用户确认
        ↓
自动生成 Candidate / Dataset / Evaluation Stack / Policy 草案
        ↓
Dataset Validate → Architecture Doctor → Context Preview
        ↓
Baseline Job → 读取指标、Trial assessment 和证据 → 根因分析
        ↓
一个受控改动 → Regression Job → Promotion Gate
        ↓
PROMOTE / REJECT 建议 → 交给既有 CI/CD 发布
```

它会优先复用项目已有文件，只追问无法从工作区确定的关键选择。它不会自动修改 Champion、部署生产环境或绕过发布审批。

## Candidate、Job 与可比性

`Candidate` 和 `Job` 不是一一对应。一个不可变 Candidate 可以运行 smoke、full regression 和多次重复实验；每个 Job 只绑定一个 Candidate digest，一个 Job 内可以包含多个 Trial。不同 Dataset/Stack 的 Job 可以存在，但不能被当成同一次进步比较。

每次运行会保留：

```text
candidate-manifest.json     # 本次到底评测了谁
dataset-manifest.json       # 任务人口、路径和 source digest
evaluation-stack-manifest.json # 八个角色、Judge 与完整/可比 digest
evaluation-context.json     # Context v2：本次是否可与 baseline 比较
architecture-doctor.json   # 角色边界和正式评测阻断项
evaluation-contract.json   # 指标语义、方向、分组和硬约束
candidate-events.jsonl      # Trial 完成事件
trial-events.jsonl          # 追加写的 Trial Lifecycle 事件
trial-lifecycle.json        # Dataset 稳定顺序与当前 phase/attempt 快照
evaluation-summary.json     # Summary v3；只聚合有效业务分数
trial-assessments/*.json    # Assessment v2；score 与 validity 分离
population-report.json      # Population v2；有效覆盖率、分组和聚合
artifact-registry.json      # role/path/schema/reward 影响的产物注册表
diagnosis-report.json       # 非 reward 的确定性根因归类
optimization-report.json    # 带护栏和回滚条件的下一实验
*/agent/trajectory.json     # ACP 执行轨迹
*/result.json               # Harbor 原始 Trial 结果
promotion-report.json       # 晋级或拒绝及原因
```

Promotion Gate 会先检查 Context v2、Dataset、Integration、Renderer、Evaluator、Rubric、Judge、语义 Runner、产物 Schema、Trial 覆盖、Score Validity 和基础设施异常，再按指标方向判断提升、最小/最大阈值与非回归。Harbor Job 跑完不等于 Candidate 已通过 Gate；Diagnostic Job、Reporter 和 Optimizer 都不能自动 Gate。

### Candidate 复用当前 DSH 模型

通过 Plugin 启动的 Job 会在启动前冻结当前 DSH Agent 的 `provider`、`model` 与 `reasoning_effort`，并为该 Job 创建一个只绑定本机、随机路径与随机 Bearer capability 的 Model Broker：

```text
DSH 当前模型 → Job Host Model Broker → Harbor Python Agent
       ↑                                      ↓
       └── Candidate 的 dsh-host LLM Adapter ← 临时 .harbor-runtime
```

Candidate 只得到 Job Token 文件（容器内 `0600`）；不会得到 GPT Auth / Codex OAuth、DeepSeek Key 或其他 Host 凭证。Candidate 传来的 provider、model、reasoning 参数也不会影响已冻结的 Host 选择。`openai-codex` 会在 Job 启动前确认 GPT Auth 已登录。

默认继承当前模型；工具调用可以同时传入 `candidateProvider` 和 `candidateModel` 覆盖，禁止只传其一。模型身份会写入 `evaluation-context.json` 的 `candidate_model_binding`，因此改变 provider、model 或推理强度时，旧 baseline 会显示为不可比，必须重新建立。

## 示例与源码开发

如果你想先理解完整机制，再接入自己的业务 Agent，可以运行仓库中的 DeepResearch 示例：

```bash
git clone https://github.com/istarwyh/harbor-self-evolving.git
cd harbor-self-evolving
./hse doctor
./hse demo
```

它会让 v1、v2 针对 13 个真实中文概念问题（含 3 个显式 Badcase），通过 DSH ACP 调用真实 Responses API：v1 的无效搜索没有证据，v2 检索每个 Task 的 Source Catalog 后再让同一个 LLM 生成带引用的报告。统一 Evaluator 按「回应问题 / 有趣性 / 引用规范性」做 `0 / 0.5 / 1` 三元评分并返回原因与建议，最终由 Gate 决定是否 `PROMOTE`。接口配置和产物说明见 [`examples/deep-research/README.md`](examples/deep-research/README.md)。不依赖 DSH 的最小例子位于 `examples/shell-minimal/`。

安装正式发布的 Plugin + Skill：

```bash
./hse dsh-install web
```

只有要修改或调试本仓库源码时，才使用本地 link 模式：

```bash
./hse dsh-install-source web
```

源码安装器会先在 `packages/dsh-plugin/` 执行锁定的 `npm ci` 并构建 Web client，再创建 `link:`；不要直接对一个全新 checkout 执行 `dsh plugin add ./packages/dsh-plugin`。

运行两端测试、构建和 shell 检查：

```bash
./hse test
```

仓库结构：

```text
packages/dsh-plugin/       # npm Plugin、Skill、Web GUI、工具与一键安装器
packages/harbor-plugin/    # Python Adapter、Job Plugin、summary 与 Gate
examples/deep-research/    # DSH ACP → Harbor → Promotion 参考实现
examples/shell-minimal/    # 最小 Harbor Candidate 参考实现
schemas/                   # Evaluator、Stack、Dataset、Context v2、Trial、Population、Optimization 与 Gate 契约
docs/                      # 架构、接入、Web 快速开始与安全边界
```

## 生产接入边界

本项目负责 `Candidate → evaluation evidence → promotion decision`。真正生效仍应走已有平台：

```text
受控改动 → CI 构建不可变 image → 测试部署 → Harbor Job
→ Promotion Gate → 将同一 image digest 交给 CD 晋级
```

Harbor 不替代镜像仓库、发布审批或线上流量切换。详见 [架构与角色](docs/architecture.md)、[接入指南](docs/integration.md) 和 [安全边界](docs/security.md)。

## License

本项目基于 [MIT License](LICENSE) 开源。
