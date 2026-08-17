# 本地 DSH Web 快速开始

本指南用于把 Harbor Self-Evolving 的 Plugin + Skill 安装进本地 `dsh web`，并完成第一次业务 Agent 评测。

版本组合：

- DSH：`@deepseek-ai/dsh@0.1.0-rc.6`
- DSH Plugin + Skill：`dsh-harbor-evolution@0.3.0`
- Harbor Adapter：`harbor-dsh-evolution==0.3.0`

Skill 由本项目维护并通过 DSH 官方 Skill Registry 加载，不表示 DeepSeek 官方背书。

## 1. 一条命令安装

先确认 Docker、Node.js 22+、pnpm 和 uv 可用：

```bash
docker info
node --version
pnpm --version
uv --version
```

进入 Candidate、Dataset、Promotion Policy 和 Jobs 的共同工作区：

```bash
cd /absolute/path/to/your-agent-workspace
npx dsh-harbor-evolution@0.3.0 setup --project-root "$PWD"
```

默认安装到 `web` profile。安装器会：

1. 在 `~/.local/share/harbor-dsh-evolution/.venv` 建立独立 Python 环境。
2. 安装 Harbor、`harbor-dsh-evolution` 和 `harbor-dsh`。
3. 把 npm Plugin + Skill 安装进 `$DSH_HOME/profiles/web`。
4. 只新增或更新 `cordis.patch.yml` 中的 `harbor-evolution` 条目。
5. 验证 Harbor 可以发现 `dsh-evolution` entry point。

如果 Docker daemon 暂时没有运行，安装仍会完成并给出警告；真正运行 Job 前必须启动 Docker。

使用隔离的 DSH home 或其他 profile：

```bash
npx dsh-harbor-evolution@0.3.0 setup \
  --project-root "$PWD" \
  --dsh-home /absolute/path/to/dsh-home \
  --profile web
```

不同 profile 相互独立。`dsh web` 使用 `web`；只有实际运行命令行 Agent 时才改为 `headless`。

## 2. 重启 DSH 并确认 UI

安装时已经运行的 DSH 不会热加载新的进程配置。先在旧终端按 `Ctrl-C`，然后复制安装器最后打印的启动命令。默认形式是：

```bash
cd /absolute/path/to/your-agent-workspace
DSH_HOME="$HOME/.dsh" pnpm dlx @deepseek-ai/dsh@0.1.0-rc.6 web
```

打开“设置 → 插件 → 插件列表”，搜索 Cordis 插件 ID：

```text
harbor-evolution
```

Agent 工具目录应包含：

- `harbor_candidate_snapshot`
- `harbor_eval_run`
- `harbor_eval_result`
- `harbor_candidate_compare`

聊天输入框输入 `/evolve` 时，Skill 菜单应出现：

```text
evolve-agent-with-harbor
```

它不是第五个工具，而是稳定调用四个工具的工作流。

## 3. 第一次使用 Skill

对于真实业务项目，先让 Skill 检查工作区和评测契约：

```text
/evolve-agent-with-harbor
请检查当前工作区，帮我建立业务 Agent 的 Harbor 自进化流程。
先复用已有配置，并在创建文件或运行 Job 前，帮我澄清成功指标、baseline、允许改动范围、重复次数和晋级规则。
```

Skill 会先读取已有 Candidate、Dataset 和 policy，只询问无法从项目判断的关键选择。需求确认后按以下顺序工作：

```text
clarify → initialize → baseline Job → diagnose
→ one controlled Candidate change → regression Job
→ deterministic Promotion Gate → PROMOTE / REJECT recommendation
```

它不会自动部署、修改 Champion 或绕过 CI/CD。真正晋级仍由你的发布平台完成。

## 4. 手动运行 DeepResearch 示例

要直接使用本仓库示例，应把 `projectRoot` 指向仓库根目录。先评测 v1：

```text
请调用 harbor_eval_run：
candidatePath = examples/deep-research/candidates/v1
datasetPath = examples/deep-research/task
```

再评测 v2：

```text
请调用 harbor_eval_run：
candidatePath = examples/deep-research/candidates/v2
datasetPath = examples/deep-research/task
```

最后执行 Gate：

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

## 5. setup 的持久化配置

安装器会在选定 profile 的 `cordis.patch.yml` 中维护一个 id-targeted override：

```yaml
- id: harbor-evolution
  config:
    projectRoot: /absolute/path/to/your-agent-workspace
    jobsDir: jobs
    harborBin: /absolute/path/to/managed/.venv/bin/harbor
    harborDshBin: /absolute/path/to/managed/.venv/bin/harbor-dsh
    pythonPath: ""
```

正式 PyPI 包已经安装进 Harbor venv，因此 `pythonPath` 必须留空。`candidatePath`、`datasetPath`、`jobPath` 和 `policyPath` 都必须位于 `projectRoot` 内。

再次运行相同 `setup` 会更新这个条目并保留其他 profile patch；如果文件中已经存在多个同名条目，安装器会停止并要求先消除歧义。

## 6. 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| Web 插件列表找不到 `harbor-evolution` | 很可能装进了其他 profile；重新使用 `--profile web` 安装并重启 DSH |
| 安装时报 `ERR_PNPM_ADDING_TO_ROOT` | 请使用一键 `setup`；它会为 DSH profile 正确传入 workspace-root 参数 |
| 调用时报 `spawn harbor ENOENT` | profile 没有保存 Harbor 绝对路径；重新运行 `setup` |
| `harbor plugins list` 没有 `dsh-evolution` | Python Adapter 与 Harbor 不在同一环境；重新运行 `setup` |
| 提示路径必须位于 `projectRoot` 内 | 调整 `projectRoot`，或把 Candidate、Dataset、Job、Policy 移入工作区 |
| Harbor 无法启动 Environment | 启动 Docker daemon，并检查 Task 的 `environment/Dockerfile` |
| 修改配置后工具仍未出现 | 停止旧 DSH 进程，并以相同 `web` profile 重新启动 |
| 工具有但 Skill 不出现 | 确认 `harbor-evolution` 已启用，版本为 `0.3.0`，然后重启 DSH |

## 7. 源码开发模式

在本仓库开发时，使用相同安装流程把本地两端源码装进 Web profile：

```bash
./hse dsh-install web
```

它等价于给 `setup` 传入本地 `--plugin-spec` 和 `--python-spec`，并将 `projectRoot` 指向仓库根目录。正式注册表安装不依赖源码路径。

如果需要完全手工排查，两端包必须安装到不同位置：Python Adapter 与 Harbor 位于同一 venv，npm Plugin 位于实际运行的 DSH profile。只安装其中一端都无法从 DSH 完成评测闭环。
