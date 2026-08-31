# 首次接入与失败诊断

## projectRoot 到底是什么

Agent 工具始终以调用它的 DSH Session 工作目录作为 `projectRoot`。Web 工作台使用 Plugin 配置的根目录；在「设置 → Harbor 自进化」可以看到当前绝对路径，并即时切换、重载，无需重启 DSH。

越界错误会同时返回当前 `projectRoot`、传入路径和修复建议。不要通过 `..` 引用根目录外的 Dataset、Candidate、Stack 或 Job。

## 多个 Harbor project

初始化不会覆盖已有文件。如果根目录已有另一套 `.harbor/evaluation-stack.yml`，会返回 `STACK_ALREADY_EXISTS_DIFFERENT_ID`，而不是静默保留旧 Stack 并报告成功。为新的业务使用 `workspaceSubdir`，例如：

```text
harbor-projects/
├── search/.harbor/evaluation-stack.yml
└── research/.harbor/evaluation-stack.yml
```

## Dataset 为何 manifest 通过但 Harbor 不运行

`harbor_dataset_validate` 同时检查 manifest 和 Harbor 实际的本地 Dataset 解析规则。Dataset 必须包含一级 Task 子目录：

```text
dataset/
└── task-a/
    ├── task.toml
    ├── instruction.md
    ├── environment/Dockerfile
    └── tests/test.sh
```

`task.toml` 至少声明 `schema_version = "1.4"`，且 `[task].name` 使用 `org/name`。Task 直接放在 Dataset 根目录或嵌套多层都会得到 `HARBOR_RUNTIME_NO_TASKS` / `HARBOR_RUNTIME_TASK_UNRESOLVED`。

## 常见失败与下一步

`harbor_eval_run` 返回脱敏后的 stderr / `job.log` 尾部，并附稳定原因码：

- `AGENT_SETUP_TIMEOUT`：优先使用已包含 Python、curl、Node.js、npm、`stdbuf`、ACP/DSH 依赖的镜像。
- `EVALUATOR_RESULT_MISSING`：Verifier 除 `reward.json` 外，还必须写 `/logs/verifier/evaluation-result.json`。
- `DATASET_NOT_RESOLVED`：修复上述 Harbor 1.4 Task 结构并重新生成 Dataset Manifest。
- `DOCKER_CREDENTIAL_HELPER`：修复 Docker 配置引用的 helper，或使用已经验证存在于本机的镜像。
- `HISTORICAL_DOCKER_PREFLIGHT_FAILED`：Historical Job 尚未创建；先按返回的 `DOCKER_*` 根因修复 CLI、daemon 或 credential helper，再重新确认运行。

Doctor 的 runtime preflight 会检查 Docker daemon、credential helper、base image 本地可用性和 ACP 依赖可证明性。无法从 Dockerfile 证明的预装依赖只给 warning；Historical Session 路径还会在创建 Job 前自动运行同一组 CLI、daemon 和 helper 阻塞检查。macOS GUI 进程会在子进程 `PATH` 中补入 Docker Desktop 的 `Resources/bin`，不会修改全局环境。

### Historical Session 失败

| 原因码 | 含义 | 下一步 |
| --- | --- | --- |
| `NO_ELIGIBLE_SESSIONS` | 当前 exact-cwd 没有已完成、顶层、含直接用户输入与 Agent 输出的业务会话 | 先完成真实业务任务，确认 Session cwd，或改用显式 Query/Dataset |
| `SESSION_SELECTION_TOO_EXPENSIVE` | 候选超过 `sessionMaxReads`，当前没有 cursor | 用更窄的 ISO-8601 `createdAfter` 重新 Preview，或改用显式 Dataset |
| `SESSION_SAMPLE_CHANGED` | Preview 后会话事件、seq 或 digest 变化 | 重新 Preview；不要复用旧 token |
| `SESSION_FEEDBACK_CHANGED` | Feedback 可用性、读取状态或内容发生变化 | 重新 Preview 并重新确认 |
| `HISTORICAL_PREVIEW_INVALID` | Web 预览已过期、被消费或 Host 进程重启 | 点击“重新预览”；浏览器不会持久化或接收 selection token |
| `HISTORICAL_PREVIEW_WORKSPACE_MISMATCH` | Preview 后切换了 Harbor 工作空间 | 回到目标工作空间并重新 Preview |
| `HISTORICAL_JOB_ALREADY_RUNNING` | 当前工作空间已有 Web Historical Job 在后台运行 | 点击“查看运行状态”；不要重复启动 |
| `SESSION_OBSERVATION_TOO_LARGE` | 单条脱敏 Observation 超过安全上限 | 缩小任务证据，或把确认后的材料整理成显式 Dataset |
| `HISTORICAL_JUDGE_NOT_CONFIRMED` | Run 尝试覆盖 Preview 已冻结的 Judge | 在 Preview 选择 Judge，Run 只传 `selectionToken` 和可选 `jobName` |
| `HISTORICAL_JOB_INCOMPLETE` | Harbor 退出但没有生成有效 Summary/completion sentinel | 检查 Harbor plugin 安装、Job log 和 `dsh-historical-evaluation` 生命周期 |
| `HISTORICAL_JOB_ARTIFACT_VALIDATION_FAILED` | Summary、completion、Batch identity、coverage 或 Trial 数不一致 | 不使用该结果；保留 Job 证据并修复缺失/陈旧产物后重跑 |

`completed-unscored` 不是失败码。它表示 Trial 已完成，但至少一个 required Criterion 因证据不足而弃权；Workbench 应展示缺失 Criterion、原因和 Trial/Criterion coverage，不应显示质量 0 分。

### Apple Silicon 误选 x86_64 Python

若 setup 在 Apple Silicon 上选择了 x86_64 Miniconda Python，随后 `cryptography` 报 `can't find crate for core/std` 或缺少 `x86_64-apple-darwin` Rust target，这是本机混合架构，不是 Harbor 插件缺包。优先让 `uv` 使用匹配机器架构的 managed Python：

```bash
UV_PYTHON_PREFERENCE=only-managed \
UV_PYTHON_DOWNLOADS=automatic \
npx --yes dsh-harbor-evolution@latest setup --project-root "$PWD"
```

setup 后用 Python 的 `platform.machine()`、`harbor --version` 和 `harbor plugins list` 复核解释器架构与两个插件入口。

## 评测器产物口径

声明 `harbor-dsh-evaluator/v1` 后，每个 Trial 都必须产出 `evaluation-result/v1`，且每个 Criterion 都包含 score、reason 和 recommendation。Summary 直接复用 Trial Assessment 的有效性判断，因此不会再出现详情无效但总体仍计入分数的情况。

## Secret 分级边界

Harbor 的 Candidate、Dataset、Stack、Context、Job Summary 与错误诊断都不得保存 Authorization、Cookie、API key 或 OAuth token。当前稳定支持的是运行时环境变量/临时 capability；Web 工作台不会把明文 secret 写入项目。DSH 凭据库模式需要 Host 暴露正式 credential service 后再接入，不能用普通 `settings.yaml` 冒充凭据库。
