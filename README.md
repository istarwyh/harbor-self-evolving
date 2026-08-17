# Harbor Self-Evolving

基于 [Harbor](https://github.com/laude-institute/harbor) 的业务 Agent 自进化模板，并提供 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) / Cordis 接入。

它解决的不是“让模型随意改自己”，而是把每次优化变成一条可追踪、可复现、可拒绝的工程流程：

```text
DSH Candidate snapshot
        ↓
Harbor Job（固定 Task / Environment / Verifier）
        ↓
指标 + 失败样本 + ACP 轨迹 + Candidate / Context digest
        ↓
人或 Optimizer 提出一个受控改动
        ↓
新 Candidate → 新 Job → Promotion Gate
        ↓
PROMOTE / REJECT（部署由既有 CI/CD 负责）
```

## 已实现

- 不可变 `Candidate`：Cordis 配置、插件代码和 lockfile 生成统一 SHA-256 manifest；运行前再次校验。
- Harbor Agent：通过 Harbor 内置 ACP runner 启动真实 DSH composition。
- Harbor Job Plugin：把 Candidate 身份、Trial 事件和稳定的指标汇总写入 Job。
- DSH Cordis bundle：向 DSH Agent 注册 snapshot、run、result、compare 四个工具。
- 本项目官方 Skill：让 Agent 先澄清评测契约并初始化所需结构，再稳定执行 baseline、受控改动、回归比较和晋级建议。
- 可比性保护：为 Dataset、Task、Environment、Verifier 和运行时版本生成 `evaluation-context` digest。
- Promotion Gate：先确认两个 Job 上下文一致，再要求主指标提升、关键指标达标、回归指标不下降且无执行异常。
- DeepResearch 示例：明确展示工具调用失败、无效搜索和错误引用如何进入 reward。

这版不会自动修改 Champion、不会部署生产环境，也不内置一个不受约束的 Optimizer。它提供的是 Optimizer 可以安全调用的评测闭环。

## 仓库结构

```text
harbor-self-evolving/
├── packages/
│   ├── harbor-plugin/       # Python: Candidate、ACP Agent、Job Plugin、Gate
│   └── dsh-plugin/          # npm: DSH/Cordis bundle、随附 Skill 与模型工具
├── examples/
│   ├── deep-research/       # DSH ACP → Harbor → Promotion 的完整示例
│   └── shell-minimal/       # 不依赖 DSH 的最小 Harbor Candidate 示例
├── schemas/                 # Candidate 与 Promotion Policy 的稳定契约
├── docs/                    # 架构、接入和安全边界
└── jobs/                    # 本地运行证据（不提交 Git）
```

`Candidate` 和 `Job` 不是一一对应：一个不可变 Candidate 可以跑 smoke、full regression、不同数据集和多次重复实验；每个 Job 绑定一个 Candidate digest，一个 Job 内可以包含多个 Trial。

## 两条命令跑通

要求：Docker、Node.js 22+、npm、pnpm、[uv](https://docs.astral.sh/uv/)；Python 3.12 与 Harbor 0.21.x 由 `uv` 自动建立。

```bash
git clone https://github.com/istarwyh/harbor-self-evolving.git
cd harbor-self-evolving
./hse doctor
./hse demo
```

`demo` 会自动建立锁定的 Python 环境，然后依次评测 v1、v2 并执行 Gate。常用入口：

| 命令 | 用途 |
| --- | --- |
| `./hse demo` | 一键运行完整的真实 Harbor 示例 |
| `./hse setup` | 安装 Python 与 Node.js 锁定依赖 |
| `./hse doctor` | 检查 Docker、Node、uv、Harbor 插件 |
| `./hse test` | 运行两端测试、构建和 shell 检查 |
| `./hse context <dataset>` | 查看评测环境的可比性指纹 |
| `./hse dsh-install [profile]` | 用固定版本的 DSH CLI 安装 Cordis bundle |

预期结果：

| Candidate | task completion | tool success | valid search | citation | reward |
| --- | ---: | ---: | ---: | ---: | ---: |
| v1 | 1 | 0 | 0 | 0 | 0.4 |
| v2 | 1 | 1 | 1 | 1 | 1.0 |

最终 Gate 输出 `"decision": "PROMOTE"`。每个 Job 的关键证据是：

```text
candidate-manifest.json     # 本次到底评测了谁
evaluation-context.json     # Dataset/Verifier/环境是否与 baseline 相同
candidate-events.jsonl      # Trial 完成事件
evaluation-summary.json     # 稳定指标汇总
*/agent/trajectory.json     # ACP 执行轨迹
*/result.json               # Harbor 原始 Trial 结果
promotion-report.json       # 晋级或拒绝及原因
```

## 在本地 DSH Web 中安装

集成由两个正式包组成，必须都安装：

| 包 | 安装位置 | 作用 |
| --- | --- | --- |
| `harbor-dsh-evolution` | 独立 Python 环境 | Harbor Agent、Job Plugin、结果汇总与 Gate |
| `dsh-harbor-evolution` | 当前 DSH profile | 注册本项目自进化 Skill 与四个评测工具 |

包含本项目官方 Skill 的正式 bundle 版本为 `0.2.0`；源码开发也可以使用 `./hse dsh-install web`。这里的 Skill 通过 DSH 官方 Skill Registry 加载，不表示 DeepSeek 官方背书。

先建立 Harbor 运行环境：

```bash
HSE_RUNTIME_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/harbor-dsh-evolution"
mkdir -p "$HSE_RUNTIME_DIR"
uv venv --python 3.12 "$HSE_RUNTIME_DIR/.venv"
uv pip install --python "$HSE_RUNTIME_DIR/.venv/bin/python" \
  harbor-dsh-evolution==0.2.0

"$HSE_RUNTIME_DIR/.venv/bin/harbor" plugins list
"$HSE_RUNTIME_DIR/.venv/bin/harbor-dsh" --help
```

截图中的本地 Web UI 使用 `web` profile，因此 npm bundle 也要安装到 `web`；只有命令行 Agent 才改用 `headless`：

```bash
pnpm dlx @deepseek-ai/dsh@0.1.0-rc.6 \
  plugin --profile web add -w dsh-harbor-evolution@0.2.0
```

安装后先停止旧的 DSH 进程，再从业务 Agent 工作区启动。启动目录就是默认 `projectRoot`：

```bash
cd /absolute/path/to/your-agent-workspace

HSE_RUNTIME_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/harbor-dsh-evolution"
HARBOR_BIN="$HSE_RUNTIME_DIR/.venv/bin/harbor" \
HARBOR_DSH_BIN="$HSE_RUNTIME_DIR/.venv/bin/harbor-dsh" \
pnpm dlx @deepseek-ai/dsh@0.1.0-rc.6 web
```

打开 DSH 的“设置 → 插件 → 插件列表”，搜索插件 ID `harbor-evolution`。它同时注册：

- `evolve-agent-with-harbor`：Plugin 随附 Skill，负责需求澄清、初始化、评测闭环和 Promotion 建议；输入 `/evolve-agent-with-harbor` 可显式启用。

- `harbor_candidate_snapshot`：把当前 composition 固化为 Candidate；默认从 `package.json` 读取名称和版本。
- `harbor_eval_run`：自动命名 Job、发起评测，并直接返回 summary。
- `harbor_eval_result`：读取规范化指标与失败证据。
- `harbor_candidate_compare`：执行确定性的 Promotion Gate。

第一次运行建议先让 Skill 帮你建立评测契约：

```text
/evolve-agent-with-harbor
请先检查当前工作区，帮我澄清并初始化一个 Harbor 自进化项目；
在运行任何 Job 前，列出仍需要我确认的指标、基线和允许改动范围。
```

它会先复用现有文件，只追问无法从项目中确定的关键选择。若只是调试工具，也可以直接说：

```text
请调用 harbor_eval_run：
candidatePath = examples/deep-research/candidates/v1
datasetPath = examples/deep-research/task
```

`candidatePath`、`datasetPath`、`jobPath` 和 `policyPath` 都必须位于 `projectRoot` 内。完整的 UI 配置、v1/v2 比较流程和排错方法见 [本地 DSH Web 快速开始](docs/dsh-web-quickstart.md)。源码开发仍可使用 `./hse dsh-install web`。

开发与验证：

```bash
./hse test
```

## 生产接入边界

本仓库负责 `Candidate → evaluation evidence → promotion decision`。真正生效仍应走已有平台：PR/配置变更 → CI 构建不可变 image → 测试部署 → Harbor 评测 → Gate → CD 晋级。Harbor 不替代镜像仓库、发布审批或线上流量切换。

详见 [架构与角色](docs/architecture.md)、[接入指南](docs/integration.md) 和 [安全边界](docs/security.md)。

## License

本项目基于 [MIT License](LICENSE) 开源。
