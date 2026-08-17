# Harbor Self-Evolving

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Harbor 持续评测与受控自进化插件。

这个仓库的首要交付物不是一个需要复制后改造的业务模板，而是可安装的产品组合：

| 交付物 | 用户得到什么 |
| --- | --- |
| DSH Plugin：`dsh-harbor-evolution` | 在自己的 DSH 中直接获得四个 Harbor 评测工具 |
| 本项目官方 Skill：`evolve-agent-with-harbor` | Agent 知道如何澄清需求、初始化、建立 baseline、诊断、回归和提出晋级建议 |
| Harbor Adapter：`harbor-dsh-evolution` | 在隔离的 Python 环境中执行 Candidate、Job、证据汇总和 Promotion Gate |

`examples/` 是帮助理解和二次开发的参考实现，不是使用插件的前提。这里的“本项目官方 Skill”表示由本项目维护，并不表示 DeepSeek 官方背书。

## 一条命令安装

要求：Docker、Node.js 22+、pnpm 和 [uv](https://docs.astral.sh/uv/)。进入你的业务 Agent 工作区后执行：

```bash
cd /absolute/path/to/your-agent-workspace
npx dsh-harbor-evolution@0.3.0 setup --project-root "$PWD"
```

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
请检查当前工作区，先帮我澄清成功指标、baseline、允许改动范围和晋级规则，再初始化 Harbor 自进化流程。
```

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

Plugin 注册四个确定性工具：

- `harbor_candidate_snapshot`：把当前 Cordis composition 固化为不可变 Candidate。
- `harbor_eval_run`：创建 Harbor Job，返回指标、失败样本与执行轨迹。
- `harbor_eval_result`：读取规范化 summary 和失败证据。
- `harbor_candidate_compare`：确认评测上下文可比后执行 Promotion Gate。

Skill 负责稳定使用这些工具，而不是让 Agent 无约束地“改自己”：

```text
澄清评测契约 → 初始化 Candidate / Dataset / Policy
        ↓
Baseline Job → 读取指标、失败样本和轨迹 → 根因分析
        ↓
一个受控改动 → Regression Job → Promotion Gate
        ↓
PROMOTE / REJECT 建议 → 交给既有 CI/CD 发布
```

它会优先复用项目已有文件，只追问无法从工作区确定的关键选择。它不会自动修改 Champion、部署生产环境或绕过发布审批。

## Candidate、Job 与可比性

`Candidate` 和 `Job` 不是一一对应。一个不可变 Candidate 可以运行 smoke、full regression、不同数据集和多次重复实验；每个 Job 只绑定一个 Candidate digest，一个 Job 内可以包含多个 Trial。

每次运行会保留：

```text
candidate-manifest.json     # 本次到底评测了谁
evaluation-context.json     # Dataset / Verifier / 环境是否可比
candidate-events.jsonl      # Trial 完成事件
evaluation-summary.json     # 稳定指标与失败证据
*/agent/trajectory.json     # ACP 执行轨迹
*/result.json               # Harbor 原始 Trial 结果
promotion-report.json       # 晋级或拒绝及原因
```

Promotion Gate 会先检查 Dataset、Task、Environment、Verifier 和运行时版本的 context digest，再判断主指标提升、关键指标达标、回归指标不下降且无执行异常。Harbor Job 跑完不等于 Candidate 已通过 Gate。

## 示例与源码开发

如果你想先理解完整机制，再接入自己的业务 Agent，可以运行仓库中的 DeepResearch 示例：

```bash
git clone https://github.com/istarwyh/harbor-self-evolving.git
cd harbor-self-evolving
./hse doctor
./hse demo
```

它会真实评测 v1、v2，并展示工具调用失败、无效搜索和错误引用如何进入 reward，最终由 Gate 决定是否 `PROMOTE`。不依赖 DSH 的最小例子位于 `examples/shell-minimal/`。

从源码把当前 Plugin + Skill 安装进本地 Web profile：

```bash
./hse dsh-install web
```

运行两端测试、构建和 shell 检查：

```bash
./hse test
```

仓库结构：

```text
packages/dsh-plugin/       # npm Plugin、Skill、工具与一键安装器
packages/harbor-plugin/    # Python Adapter、Job Plugin、summary 与 Gate
examples/deep-research/    # DSH ACP → Harbor → Promotion 参考实现
examples/shell-minimal/    # 最小 Harbor Candidate 参考实现
schemas/                   # Candidate、Context 与 Policy 稳定契约
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
