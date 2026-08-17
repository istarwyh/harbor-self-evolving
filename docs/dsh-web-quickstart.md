# 本地 DSH Web 快速开始

本指南用于把正式发布的 Harbor 自进化插件装进本地 `dsh web`，并从 Web 对话中完成第一次 Candidate 评测。固定版本为：

- DSH：`@deepseek-ai/dsh@0.1.0-rc.6`
- DSH bundle：`dsh-harbor-evolution@0.2.0`
- Harbor plugin：`harbor-dsh-evolution==0.2.0`

`0.2.0` 是首个包含本项目官方 Skill 的正式版本；源码开发可使用第 9 节的安装方式。Skill 通过 DSH 官方 Skill Registry 加载，不表示 DeepSeek 官方背书。

## 1. 理解两个安装位置

| 包 | 运行时 | 职责 |
| --- | --- | --- |
| `harbor-dsh-evolution` | Python / Harbor | Candidate Agent、Job Plugin、summary、Promotion Gate |
| `dsh-harbor-evolution` | Node.js / Cordis | 注册随附自进化 Skill，并将 Harbor 能力暴露为四个模型工具 |

只安装 npm 包时，DSH 能看到 Skill 和工具，但调用时找不到 `harbor`。只安装 Python 包时，Harbor 能运行，但 DSH 不会出现 Skill 和工具。

开始前确认 Docker、Node.js 22+、pnpm 和 uv 可用：

```bash
docker info
node --version
pnpm --version
uv --version
```

## 2. 安装 Harbor Python 插件

把 Harbor 放进固定的独立环境，避免依赖当前 shell 是否激活某个项目 venv：

```bash
HSE_RUNTIME_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/harbor-dsh-evolution"
mkdir -p "$HSE_RUNTIME_DIR"

uv venv --python 3.12 "$HSE_RUNTIME_DIR/.venv"
uv pip install --python "$HSE_RUNTIME_DIR/.venv/bin/python" \
  harbor-dsh-evolution==0.2.0
```

验证 Python CLI 和 Harbor entry point：

```bash
"$HSE_RUNTIME_DIR/.venv/bin/harbor-dsh" --help
"$HSE_RUNTIME_DIR/.venv/bin/harbor" plugins list
```

第二条命令必须出现：

```text
dsh-evolution  harbor_dsh_evolution.plugin:EvolutionPlugin
```

## 3. 安装到正确的 DSH profile

`dsh web` 是 `--profile web` 的别名，所以 Web UI 必须安装到 `web`：

```bash
pnpm dlx @deepseek-ai/dsh@0.1.0-rc.6 \
  plugin --profile web add -w dsh-harbor-evolution@0.2.0
```

这个命令会更新 `$DSH_HOME/profiles/web/package.json`；未设置 `DSH_HOME` 时默认目录是 `~/.dsh/profiles/web`。DSH 还会把声明了 `dsh.bundle` 的包加入该 profile 的 bundle 层。

如果只运行一次命令行 Agent，才安装到 `headless`：

```bash
pnpm dlx @deepseek-ai/dsh@0.1.0-rc.6 \
  plugin --profile headless add -w dsh-harbor-evolution@0.2.0
```

不同 profile 相互独立；装进 `headless` 不会让 `dsh web` 自动获得插件。

## 4. 重启并连接两个运行时

安装时已经运行的 DSH 不会自动变成新的进程配置。先在旧终端按 `Ctrl-C`，再从业务 Agent 工作区启动：

```bash
cd /absolute/path/to/your-agent-workspace

HSE_RUNTIME_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/harbor-dsh-evolution"
HARBOR_BIN="$HSE_RUNTIME_DIR/.venv/bin/harbor" \
HARBOR_DSH_BIN="$HSE_RUNTIME_DIR/.venv/bin/harbor-dsh" \
pnpm dlx @deepseek-ai/dsh@0.1.0-rc.6 web
```

默认情况下，启动目录会解析为 `projectRoot`，Job 写入其下的 `jobs/`。因此不要从用户主目录随意启动；应先进入 Candidate、Dataset 和 Promotion Policy 的共同工作区。

## 5. 在 Web UI 中确认与持久化配置

打开“设置 → 插件 → 插件列表”，搜索 Cordis 插件 ID：

```text
harbor-evolution
```

安装成功后，Agent 工具目录应包含：

- `harbor_candidate_snapshot`
- `harbor_eval_run`
- `harbor_eval_result`
- `harbor_candidate_compare`

聊天输入框输入 `/evolve` 时，Skill 菜单还应出现：

```text
evolve-agent-with-harbor
```

它不是第五个工具，而是调用上述工具的稳定工作流：先检查工作区并澄清需求，必要时初始化 Candidate、Dataset 和 Promotion Policy，再建立 baseline、分析证据、创建一个受控 Candidate、回归评测并给出 Promotion 建议。

如果不想每次启动都设置环境变量，可在“插件配置”中为 `harbor-evolution` 保存绝对路径；等价的 profile patch 为：

```yaml
- id: harbor-evolution
  config:
    projectRoot: /absolute/path/to/your-agent-workspace
    jobsDir: jobs
    harborBin: /absolute/path/to/harbor-dsh-evolution/.venv/bin/harbor
    harborDshBin: /absolute/path/to/harbor-dsh-evolution/.venv/bin/harbor-dsh
    pythonPath: ""
```

正式 PyPI 包已经安装进 Harbor venv，因此 `pythonPath` 必须留空；只有从本仓库源码运行 Python 包时才设置源码目录。

## 6. 第一次使用 Skill

对于真实业务项目，先显式启用 Skill：

```text
/evolve-agent-with-harbor
请检查当前工作区，帮我建立业务 Agent 的 Harbor 自进化流程。
先复用已有配置，并在创建文件或运行 Job 前，帮我澄清成功指标、baseline、允许改动范围、重复次数和晋级规则。
```

Skill 会先读取已有 Candidate、Dataset 和 policy，只询问无法从项目判断的关键选择。需求确认后，它按以下顺序工作：

```text
clarify → initialize → baseline Job → diagnose
→ one controlled Candidate change → regression Job
→ deterministic Promotion Gate → PROMOTE / REJECT recommendation
```

它不会自动部署、修改 Champion 或绕过 CI/CD。真正晋级仍由你的发布平台完成。

## 7. 手动运行 DeepResearch 示例

要直接使用本仓库示例，应从仓库根目录启动 DSH，或者把插件的 `projectRoot` 指向仓库根目录。Candidate 至少包含 `cordis.yml` 和 `package.json`，推荐提交 lockfile；Dataset 是包含 `task.toml`、Environment 和 Verifier 的 Harbor Task 目录。

先评测 v1：

```text
请调用 harbor_eval_run：
candidatePath = examples/deep-research/candidates/v1
datasetPath = examples/deep-research/task
```

返回值包含自动生成的 `jobDir` 和 `evaluation-summary.json`。再评测 v2：

```text
请调用 harbor_eval_run：
candidatePath = examples/deep-research/candidates/v2
datasetPath = examples/deep-research/task
```

最后把两次返回的 `jobDir` 传给 Gate：

```text
请调用 harbor_candidate_compare：
baselineJob = jobs/<v1-job-name>
candidateJob = jobs/<v2-job-name>
policyPath = examples/deep-research/promotion-policy.json
```

正常结果是 `"decision": "PROMOTE"`。完整证据保存在：

```text
jobs/<job-name>/candidate-manifest.json
jobs/<job-name>/evaluation-context.json
jobs/<job-name>/evaluation-summary.json
jobs/<job-name>/*/agent/trajectory.json
jobs/<job-name>/*/result.json
```

## 8. 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| Web 插件列表找不到 `harbor-evolution` | 很可能装进了 `headless`；重新使用 `--profile web` 安装并重启 DSH |
| 安装时报 `ERR_PNPM_ADDING_TO_ROOT` | 安装命令漏了 `-w`；DSH profile 本身就是 pnpm workspace root |
| 调用时报 `spawn harbor ENOENT` | DSH 进程没有继承 `HARBOR_BIN`，在插件配置中填写 Harbor 的绝对路径 |
| `harbor plugins list` 没有 `dsh-evolution` | `harbor` 与 `harbor-dsh-evolution` 不在同一个 Python 环境；使用固定 venv 里的 `harbor` |
| 提示路径必须位于 `projectRoot` 内 | Candidate、Dataset、Job 或 Policy 在工作区之外；调整 `projectRoot` 或移动输入目录 |
| Harbor 无法启动 Environment | 确认 Docker daemon 正常，并检查 Task 的 `environment/Dockerfile` |
| 修改配置后工具仍未出现 | 停止旧 DSH 进程，并以相同的 `web` profile 重新启动 |
| 工具有但 `/evolve-agent-with-harbor` 不出现 | 确认安装的是包含 Skill 的 bundle 版本，重启 DSH，并检查 `harbor-evolution` 插件已启用 |

## 9. 源码开发模式

在本仓库开发插件时，可以让 helper 建立锁定环境并把本地 bundle 安装到 Web profile：

```bash
./hse dsh-install web
```

源码模式会自动发现 `packages/harbor-plugin/.venv`；正式注册表安装不要依赖这个仓库内路径。
