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

Doctor 的 runtime preflight 会检查 Docker daemon、credential helper、base image 本地可用性和 ACP 依赖可证明性。无法从 Dockerfile 证明的预装依赖只给 warning；Docker 不可用则在 Job 前快速失败。

## 评测器产物口径

声明 `harbor-dsh-evaluator/v1` 后，每个 Trial 都必须产出 `evaluation-result/v1`，且每个 Criterion 都包含 score、reason 和 recommendation。Summary 直接复用 Trial Assessment 的有效性判断，因此不会再出现详情无效但总体仍计入分数的情况。

## Secret 分级边界

Harbor 的 Candidate、Dataset、Stack、Context、Job Summary 与错误诊断都不得保存 Authorization、Cookie、API key 或 OAuth token。当前稳定支持的是运行时环境变量/临时 capability；Web 工作台不会把明文 secret 写入项目。DSH 凭据库模式需要 Host 暴露正式 credential service 后再接入，不能用普通 `settings.yaml` 冒充凭据库。
