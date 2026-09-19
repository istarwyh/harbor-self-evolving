# Harbor 评测任务宿主机执行模式技术方案

> 状态：方案设计，待实现
>
> 日期：2026-09-19
>
> 适用版本：`harbor-dsh-evolution 0.9.6` / `Harbor 0.21.x` 架构
>
> 核心决策：把 `host` 设为默认执行环境，Docker 改为显式可选模式；宿主机模式直接使用当前用户环境，不设计额外运行限制。

## 1. 决策摘要

当前插件的 Candidate Evaluation、Historical Generation Evaluation 和 Workbench Bounded Diagnostic 最终都会调用 `harbor run`。虽然 Candidate Agent 面向 Harbor 的 `BaseEnvironment` 编程，但三个启动入口都把 Docker 当成唯一运行环境：

- 普通 Candidate Job 在 Doctor 阶段把 `DOCKER_*` 错误作为启动阻断项；
- Historical Job 启动前固定执行 `docker-check`；
- Bounded Diagnostic 固定传入 `-e docker --delete`，并把 Docker daemon、Compose project 和本机 Unix socket 写入恢复协议；
- Dataset 和 Historical materializer 默认依赖 `environment/Dockerfile` 创建 Node、Python、ACP SDK、`/workspace`、`/logs` 等运行结构；
- Host Model Broker 默认向 Candidate 公布 `host.docker.internal`。

本方案新增 Job 级字段 `execution_environment`，取值为：

| 值 | 含义 | 默认值 | 运行语义 |
| --- | --- | --- | --- |
| `host` | 使用本插件提供的自定义 `HostEnvironment` | 是 | 当前登录用户直接在宿主机进程中执行 |
| `docker` | 沿用 Harbor `DockerEnvironment` | 否，显式选择 | 由 Docker/Harbor 提供容器运行环境 |

这里不复用现有 `execution_mode`。`execution_mode` 已经表示 `execute-candidate` 与 `observe-existing`；`execution_environment` 表示任务在哪里运行，二者正交：

```text
execution_mode
├── execute-candidate
└── observe-existing

execution_environment
├── host（默认）
└── docker（显式选择）
```

第一版作出以下决策：

1. **不修改 Harbor 上游。** Harbor 0.21 已支持通过 `-e module.path:ClassName` 加载自定义 `BaseEnvironment`，插件内实现 `harbor_dsh_evolution.host_environment:HostEnvironment`。
2. **Host 是新默认值。** Tool、Workbench、Skill 和 CLI 未指定执行环境时统一选择 Host；需要 Docker 时显式传入 `docker`。
3. **Host 是完整 Job 模式，不是简化 Runner。** Candidate、Agent setup、ACP、Verifier、Job Plugin、Trial lifecycle、Summary 和 Gate 仍走 Harbor 正式链路。
4. **Host 不增加运行限制。** 不做 chroot、容器、namespace、目录 allowlist、网络 allowlist、CPU/内存配额或额外并发上限；现有 Job 并发、诊断预算和操作流程只用于评测生命周期。
5. **不禁止 Host Job 进入 Promotion。** 但 Baseline 与 Candidate 必须使用相同的 `execution_environment` 和兼容的宿主机运行时身份；Docker Job 与 Host Job 不可比较。
6. **Dockerfile/Compose 不在 Host 模式执行。** Host 直接使用已经安装在宿主机上的依赖。插件自带的 Candidate 与 Historical Task 必须显式准备所需文件，不能再依赖 Dockerfile 的 `RUN`/`COPY` 副作用。
7. **生命周期只管理 Harbor 自己创建的运行资源。** 插件回收 Trial staging 目录和仍受控的进程组，不设计通用宿主机状态恢复机制。

## 2. 当前代码路径与 Docker 耦合

### 2.1 三条真实启动路径

| 场景 | 当前入口 | Docker 耦合 |
| --- | --- | --- |
| 普通 Candidate Evaluation | [`runEvaluation`](../../../packages/dsh-plugin/lib/evolution.js) | `runDoctor(... --runtime)` 后阻断 `DOCKER_*`；Harbor 默认 `docker` |
| Historical Generation Evaluation | [`runHistoricalEvaluation`](../../../packages/dsh-plugin/lib/evolution.js) | 启动前固定 `docker-check`；Materializer 生成 Dockerfile |
| Workbench Bounded Diagnostic | [`DiagnosticRunner`](../../../packages/dsh-plugin/lib/diagnostic-runner.js) | 固定 `-e docker --delete`；固定本地 Unix socket、daemon identity 和 Compose 资源核查 |

普通 Candidate 的真正执行仍由 [`DshCandidateAgent`](../../../packages/harbor-plugin/src/harbor_dsh_evolution/agent.py) 完成。它已经只依赖 `BaseEnvironment` 的 `exec/upload_file/upload_dir` 接口，这是新增 Host 模式的主要扩展点；但它当前仍硬编码 `/opt/harbor-acp-venv`、`/installed-agent`、`/opt/harbor-dsh-candidate`、`/run/secrets` 等容器路径，需要改成环境可解析的逻辑路径。

Historical Job 的 [`SessionObservationAgent`](../../../packages/harbor-plugin/src/harbor_dsh_evolution/session_agent.py) 依赖 Dockerfile 把 `session-observation.json` 复制到 `/opt/harbor-dsh/`。Host 模式必须由 Agent setup 显式上传该文件，不能解析或模拟 Dockerfile。

### 2.2 为什么不另写一个本地 Runner

绕开 Harbor Trial，直接在 Node.js 中 `spawn` Candidate 和 Verifier，短期看更简单，但会复制或丢失以下正式语义：

- Agent install/setup/run 与 ACP trajectory；
- Trial timeout、retry、并发和取消；
- Verifier、reward、evaluation-result 和 artifact 收集；
- Job Plugin hook、trial lifecycle、Summary 与 Promotion Gate；
- 多 Trial 和 separate verifier environment。

因此宿主机模式应实现 Harbor Environment Adapter，而不是第二套评测框架。

## 3. 产品与协议设计

### 3.1 对外字段

DSH Tool、配置和内部协议统一使用：

```json
{
  "executionEnvironment": "host | docker"
}
```

落盘到 `evaluation-context.json` 和 Summary 时使用 snake_case：

```json
{
  "execution_environment": {
    "kind": "host",
    "provider": "harbor_dsh_evolution.host_environment:HostEnvironment",
    "platform": "darwin",
    "architecture": "arm64",
    "runtime_fingerprint": "sha256:..."
  }
}
```

`runtime_fingerprint` 只对稳定、可复现字段做 canonical digest，建议包含：

- OS 与 CPU architecture；
- Harbor、Python Adapter、Python、Node 和 npm 的实际版本；
- Candidate 要求的精确 Node 版本与 ACP SDK 版本；
- HostEnvironment 实现版本。

`runtime_fingerprint` 不包含每次运行都会变化的 staging 路径和时间戳，保证同一环境可以稳定比较。

### 3.2 选择与默认规则

- 插件设置增加 `executionEnvironment`，默认 `host`。
- `harbor_context_preview`、`harbor_eval_run` 增加可选 `executionEnvironment`；显式参数优先于插件默认。
- Historical Session Preview 增加环境选择，并把选择写入 15 分钟确认 Token；Run 仍只接收 Token 和可选 Job 名，不能在确认后换环境。
- Bounded Diagnostic 的 plan、materialized plan 和 Operation checkpoint 都写入环境选择；执行前重新 Preview 时必须一致。
- Web 设置和确认卡显示 `宿主机` 或 `Docker`，默认选中 `宿主机`。
- 显式选择 Docker 后，Docker preflight 失败就直接失败，不自动切换执行环境。

### 3.3 Host 模式说明

Host 是默认运行方式，不增加第二套审批、额外确认或人为门禁。界面只需说明执行语义：

> 评测任务将在当前宿主机上执行；Dockerfile 和 Docker Compose 不参与 Host 模式，任务依赖由宿主机现有环境提供。

该说明应出现在：

- Settings 的环境选择器下方；
- Context Preview / Historical Preview 的确认卡；
- Job Workbench 的身份区；
- README、Quickstart 与 Skill。

## 4. HostEnvironment 设计

### 4.1 类职责

新增：

```text
packages/harbor-plugin/src/harbor_dsh_evolution/
├── host_environment.py
└── execution_environment.py
```

`HostEnvironment(BaseEnvironment)` 负责：

- 为每个 agent/verifier environment 创建独立 staging root；
- 把 Harbor 的逻辑容器路径映射到本地路径；
- 直接以当前用户执行命令；
- 合并 Harbor task env、Job env 和 phase env；
- 支持文件/目录上传下载；
- 跟踪直接创建的进程组并处理 timeout/cancel/stop；
- 只删除自己创建的 staging root；
- 提供稳定的运行时身份。

它不负责：

- 安装或解释 Dockerfile；
- 模拟 Linux root、sudo 或容器用户；
- 限制文件系统、网络、CPU、内存、GPU 或系统调用；
- 清理脱离原进程组的 daemon；
- 模拟 Docker Compose sidecar。

### 4.2 逻辑路径映射

Harbor 和当前 Adapter 使用容器绝对路径。HostEnvironment 为基础设施保留路径提供确定性映射：

| Harbor 逻辑路径 | Host 实际路径 |
| --- | --- |
| `/workspace` | `<staging>/workspace` |
| `/logs/agent` | 当前 Trial 的 `agent/` |
| `/logs/verifier` | 当前 Trial 的 `verifier/` |
| `/logs/artifacts` | 当前 Trial 的 `artifacts/logs/artifacts/` |
| `/tests` | `<staging>/tests` |
| `/solution` | `<staging>/solution` |
| `/installed-agent` | `<staging>/installed-agent` |
| `/opt/harbor-dsh-candidate` | `<staging>/candidate` |
| `/opt/harbor-dsh` | `<staging>/harbor-dsh` |
| `/run/secrets` | `<staging>/secrets` |
| `/opt/harbor-acp-venv` | 当前 Python Adapter venv |

HostEnvironment 提供 `resolve_environment_path(logical_path)`。本插件拥有的 Agent 不再把逻辑路径直接写进二次启动脚本，而是在生成 launcher、runtime config 和 observation command 前解析成实际路径。

`exec()` 只对 Harbor 自身生成的顶层命令和 `cwd` 做保留路径替换。不能依赖它改写任意 shell/Python/Node 脚本内部的绝对路径，因此插件生成的 verifier 与示例要迁移为环境变量：

```text
HARBOR_WORKSPACE_DIR
HARBOR_AGENT_LOG_DIR
HARBOR_VERIFIER_LOG_DIR
HARBOR_ARTIFACTS_DIR
HARBOR_TESTS_DIR
```

默认值仍分别回退到 `/workspace`、`/logs/...` 和 `/tests`，保证 Docker 模式不变。外部 Dataset 若在脚本正文中写死容器路径，Doctor 在 Host 模式返回 `HOST_TASK_PORTABILITY_UNPROVEN` 兼容性信息；运行仍可继续，由真实命令结果决定是否成功。

### 4.3 进程与清理

每次 `exec()` 使用独立 POSIX process group：

```text
Harbor Trial
└── HostEnvironment exec process group
    └── shell / python / ACP runner / Candidate child processes
```

- 正常完成：等待进程退出并收集 stdout/stderr/return code。
- timeout 或 cancel：向该进程组发送 `TERM`，等待固定 grace period，再发送 `KILL`。
- `stop(delete=true)`：终止仍被跟踪的进程组，删除 staging root。
- `stop(delete=false)`：停止进程但保留 staging root 用于诊断，并在 Job artifact 中记录引用。
- 已调用 `setsid`/daemonize 并脱离进程组的后代不属于 Harbor 进程组生命周期；Job 只记录受控进程组的结束状态。

`user="root"` 在 Host 模式不触发 sudo，也不提升权限；它按当前登录用户执行。若 Task 确实依赖 root 权限，命令按真实权限失败并进入基础设施错误。

### 4.4 资源与网络语义

Host 模式按用户要求不增加限制：

- Harbor 启动参数固定使用 `--cpus ignore --memory ignore`；
- Task 的 CPU、memory、storage、GPU/TPU 声明只作为记录，不做分配或限制；
- `network_mode=no-network/allowlist` 和 phase network policy 不强制执行；
- 不增加 Host 专用并发上限，沿用原 Job 的 `-n`；
- Candidate/Verifier 能访问当前用户可访问的网络和文件系统。

Context 记录以下 Host 执行事实：

- `HOST_DIRECT_EXECUTION`
- `HOST_DOCKERFILE_IGNORED`
- `HOST_RESOURCE_DECLARATIONS_IGNORED`
- `HOST_NETWORK_DECLARATIONS_IGNORED`

这些字段只描述实际运行方式，不触发审批、限制或 Gate。真正无法启动的能力条件仍应失败，例如非 POSIX 平台、缺少 Candidate 要求的精确 Node、缺少 Python/ACP SDK、Task 依赖 Docker Compose sidecar。

## 5. Candidate、Historical 与 Verifier 适配

### 5.1 Candidate Agent

[`DshCandidateAgent`](../../../packages/harbor-plugin/src/harbor_dsh_evolution/agent.py) 保留现有不可变运行时契约：

- `candidate-runtime.json`、Candidate digest、npm lock v3 和精确 Node 版本继续校验；
- `npm ci --omit=dev --ignore-scripts` 仍在 Trial 内执行；
- ACP `initialize → session/new` readiness 仍必须在正式 prompt 前通过；
- Host Model Broker 调用协议保持不变；
- Candidate source 上传后再次校验 digest。

Host 差异仅包括：

- 通过 `resolve_environment_path()` 生成 launcher 与 secret/runtime 路径；
- ACP runner 使用当前 Adapter venv 中的 Python；
- macOS 不强制要求 GNU `stdbuf`，改用 unbuffered Python + `tee` 的可移植命令；
- 默认 cwd 使用 `<staging>/workspace`；
- Host Broker endpoint 公布 `127.0.0.1`，Docker 模式仍公布 `host.docker.internal`。

### 5.2 Historical Observation

[`materialize_historical_dataset`](../../../packages/harbor-plugin/src/harbor_dsh_evolution/session_batch.py) 继续生成 Dockerfile，供 Docker 模式使用；同时：

- `SessionObservationAgent.setup()` 从 Task 的 `environment/session-observation.json` 显式上传到 Environment 的逻辑 observation path；
- Agent 和 verifier 使用环境变量定位 observation、artifacts、tests 和 verifier logs；
- Host 模式不执行 Dockerfile 的 `COPY`；
- `observe-existing`、不重跑 Candidate、Gate N/A 等业务语义不变。

### 5.3 Verifier 与外部 Dataset 兼容性

插件自动生成的 Quick Diagnostic、Historical Dataset 和仓库 examples 全部改为相对路径或 `HARBOR_*_DIR`。Docker 模式使用默认容器路径，Host 模式使用真实本地路径。

外部 Dataset 的兼容规则：

- `tests/test.sh` 及其子程序若只使用相对路径或 `HARBOR_*_DIR`，可直接运行；
- Dockerfile 中安装的软件不会自动出现在 Host；用户负责预装；
- Dockerfile `COPY` 的文件不会自动复制；需要由 Agent setup、Verifier setup 或 Dataset 自身的 Host 可移植逻辑准备；
- Docker Compose sidecar、容器专属 Linux 能力或必须 root 的 Task 不属于第一版 Host 可执行能力，Doctor 返回明确 incompatibility，而不是尝试调用 Docker。

这组条件只描述 Host 与容器镜像之间的运行兼容性。

## 6. 启动链路改造

### 6.1 统一解析器

Node 与 Python 两侧都引入统一解析结果：

```json
{
  "kind": "host",
  "harborArgs": [
    "-e",
    "harbor_dsh_evolution.host_environment:HostEnvironment",
    "--cpus",
    "ignore",
    "--memory",
    "ignore"
  ],
  "gatewayAdvertisedHost": "127.0.0.1"
}
```

普通 Candidate、Historical 和 Bounded Diagnostic 必须消费同一个 resolver，禁止各自拼装环境参数。

### 6.2 模式化 Preflight

把当前 `docker-check` 上移为通用命令：

```text
harbor-dsh environment-check --kind docker
harbor-dsh environment-check --kind host [--candidate <path>] [--dataset <path>]
```

为兼容已有脚本保留 `docker-check` alias。

Host preflight 只检查能否真实启动：

- POSIX shell 环境；
- 当前用户可创建/执行 staging 目录；
- `bash`、`python3`、`node`、`npm`、`tee`；
- Candidate 声明的精确 Node 版本；
- Adapter venv 的 `agent-client-protocol` 精确版本；
- loopback Host Broker 可达；
- Dataset 是否依赖 Compose/容器专属能力；
- Dockerfile/资源/网络声明在 Host 模式下的实际处理方式。

Preflight 必须发生在 Model Broker lease 和 Harbor Job 创建之前。

### 6.3 三条启动路径

#### 普通 Candidate Job

```text
resolve execution environment
→ Candidate/Dataset/Stack static validation
→ environment-check(kind)
→ Context v3 preview
→ open mode-aware Host Broker lease
→ harbor run + resolved environment args
→ Summary / lifecycle / cleanup
```

#### Historical Job

```text
Preview binds executionEnvironment
→ freeze Batch + materialize Dataset/Stack
→ environment-check(kind)
→ build Historical Context v2
→ open Judge lease
→ harbor run + resolved environment args
→ Summary / lifecycle / cleanup
```

#### Bounded Diagnostic

Docker 模式保留现有 daemon identity、Unix socket pinning 与 Compose reconciliation。Host 模式改为记录：

- Host runtime fingerprint；
- Harbor process PID/process group；
- Trial staging owner token/digest；
- 每个 Trial 的 lifecycle terminal state；
- staging 是否仍存在；
- 受控进程组是否仍存在。

Host recovery 以插件拥有的 staging 和受控进程组作为可恢复运行对象。

## 7. Context、可比性与 Promotion

Candidate Evaluation Context 从 v2 升级为 v3，把 `execution_environment` 放入 comparison identity 与 full audit identity。Historical Context 升级为 `historical-generation-evaluation-context/v2`。

原因是执行环境会改变依赖、OS 行为、文件系统、网络和性能，属于 reward-affecting runtime，不能只作为展示字段。

Promotion 规则：

| Baseline | Candidate | 结果 |
| --- | --- | --- |
| Docker | Docker，Context/Stack/Dataset 等身份一致 | 允许继续 Gate |
| Host | Host，runtime fingerprint 一致 | 允许继续 Gate |
| Docker | Host | `EXECUTION_ENVIRONMENT_MISMATCH` |
| Host A | Host B，OS/arch/runtime fingerprint 不同 | `HOST_RUNTIME_MISMATCH` |

Host 模式不会因为直接运行在宿主机而被 Gate 拒绝。Workbench 和 promotion report 只展示 `execution_environment=host` 及 runtime fingerprint。

旧 Context v2 Job 保持可读；新版本不与旧 Job 自动比较，升级后的第一次正式评测需要建立新 Baseline。这也避免把过去隐式 Docker 证据与新增执行环境协议混为一谈。

## 8. 代码改造清单

| 层 | 文件 | 改造 |
| --- | --- | --- |
| Python Environment | 新增 `host_environment.py` | `BaseEnvironment` 实现、路径映射、进程组、文件传输、cleanup、runtime identity |
| Python protocol | 新增 `execution_environment.py` | kind 校验、canonical identity、状态与错误代码 |
| Candidate | [`agent.py`](../../../packages/harbor-plugin/src/harbor_dsh_evolution/agent.py) | 环境路径解析、Host venv、可移植 ACP 命令 |
| Historical | [`session_agent.py`](../../../packages/harbor-plugin/src/harbor_dsh_evolution/session_agent.py)、[`session_batch.py`](../../../packages/harbor-plugin/src/harbor_dsh_evolution/session_batch.py) | 显式 observation 上传、Host 可移植 verifier |
| Doctor/CLI | [`doctor.py`](../../../packages/harbor-plugin/src/harbor_dsh_evolution/doctor.py)、[`cli.py`](../../../packages/harbor-plugin/src/harbor_dsh_evolution/cli.py) | `environment-check`、模式化 runtime findings、兼容 alias |
| Context/Gate | [`context.py`](../../../packages/harbor-plugin/src/harbor_dsh_evolution/context.py)、[`historical_context.py`](../../../packages/harbor-plugin/src/harbor_dsh_evolution/historical_context.py)、[`promotion.py`](../../../packages/harbor-plugin/src/harbor_dsh_evolution/promotion.py) | Context v3/v2、environment comparison identity、mismatch reasons |
| DSH config/tools | [`index.js`](../../../packages/dsh-plugin/index.js)、[`service.js`](../../../packages/dsh-plugin/lib/service.js) | 配置项、Tool 参数、Preview/Run 绑定 |
| DSH setup | [`setup.js`](../../../packages/dsh-plugin/lib/setup.js) | 安装流程不再默认检查 Docker；只有显式 Docker 配置才执行 Docker readiness |
| Job launch | [`evolution.js`](../../../packages/dsh-plugin/lib/evolution.js) | 统一 resolver、模式化 preflight/Harbor args/Broker endpoint |
| Bounded runner | [`diagnostic-runner.js`](../../../packages/dsh-plugin/lib/diagnostic-runner.js)、[`diagnostic-observation.js`](../../../packages/dsh-plugin/lib/diagnostic-observation.js) | Host plan/checkpoint/reconciliation；Docker 路径不变 |
| Model Broker | [`model-runtime.js`](../../../packages/dsh-plugin/lib/model-runtime.js) | lease 级 advertised host，避免全局 Docker 假设 |
| Workbench | [`src/client/index.jsx`](../../../packages/dsh-plugin/src/client/index.jsx) | 环境 badge、默认 Host、Context/Job 展示 |
| 文档/Skill | [`README.md`](../../../README.md)、[`dsh-web-quickstart.md`](../../dsh-web-quickstart.md)、[`SKILL.md`](../../../packages/dsh-plugin/skills/evolve-agent-with-harbor/SKILL.md) | Host 默认、Docker 可选、运行依赖与选择流程 |

## 9. 状态与错误协议

建议新增稳定代码：

### 阻断错误

- `EXECUTION_ENVIRONMENT_INVALID`
- `HOST_RUNTIME_UNAVAILABLE`
- `HOST_RUNTIME_VERSION_MISMATCH`
- `HOST_OS_UNSUPPORTED`
- `HOST_TASK_COMPOSE_UNSUPPORTED`
- `HOST_PROCESS_CLEANUP_INCOMPLETE`
- `EXECUTION_ENVIRONMENT_MISMATCH`
- `HOST_RUNTIME_MISMATCH`

### 运行事实

- `HOST_DIRECT_EXECUTION`
- `HOST_DOCKERFILE_IGNORED`
- `HOST_RESOURCE_DECLARATIONS_IGNORED`
- `HOST_NETWORK_DECLARATIONS_IGNORED`
- `HOST_TASK_PORTABILITY_UNPROVEN`
- `HOST_DETACHED_PROCESS_CLEANUP_UNPROVEN`

这些运行事实进入 Context 和 Workbench，不触发 Host 专用限制或审批。

## 10. 测试与验收

### 10.1 Python 单元与契约测试

- HostEnvironment 的 start/exec/upload/download/stop 生命周期；
- `/workspace`、`/logs`、`/tests`、Candidate、secret 和 ACP venv 映射；
- 当前用户语义，不发生 sudo/root 提权；
- timeout/cancel 后进程组 TERM → KILL；
- cleanup 只删除 owned staging，不删除相邻目录；
- Host preflight 在 Docker CLI 完全不存在时仍通过；
- Candidate 精确 Node/ACP SDK 不匹配时在 lease/Job 前失败；
- Session Observation 在不执行 Dockerfile 的情况下可用；
- Host runtime identity 在相同版本环境下保持稳定；
- Context v3 与 Historical Context v2 digest 稳定；
- Host↔Docker 和不同 Host runtime 的 Gate mismatch。

### 10.2 Node 单元与集成测试

- 默认未指定时生成 Host custom import path，且不调用 `docker-check`/Docker context；
- 显式 Docker 时生成 Docker 参数并执行 Docker preflight；
- 显式 Docker failure 不会自动切换回 Host；
- Historical Preview Token 与 Bounded Diagnostic plan 绑定环境选择；
- Host Broker lease 使用 loopback，Docker lease 保持 `host.docker.internal`；
- Workbench 显示环境和 runtime fingerprint 摘要；
- Host Operation 恢复不调用 Docker，也不扫描/删除未知进程或目录。

### 10.3 无 Docker 真实验收

在 Docker daemon 停止、`docker` 从本次测试 PATH 移除的条件下完成：

1. `harbor-dsh environment-check --kind host`；
2. 一个 Quick Diagnostic Candidate 的真实 `DshCandidateAgent.setup/run → ACP → Host Broker → Verifier`；
3. 一个 Historical Generation Evaluation Trial；
4. Job Summary、Context、trajectory、evaluation-result 和 lifecycle 完整；
5. setup 阶段模型请求为 0；
6. 正常结束后受控进程组退出、owned staging 删除；
7. 人工取消一次长任务，确认取消、Trial 终态和清理可见；
8. Docker 回归 Job 仍通过，现有镜像、Compose cleanup 和 Docker identity 逻辑不变。

### 10.4 Promotion 验收

- 两个相同 Host runtime identity 的 `promotion-eligible` Job 可以进入现有 Gate；
- Host 与 Docker Job 明确拒绝比较；
- Host runtime fingerprint 改变时要求 fresh baseline；
- Gate 报告继续区分 Job 完成、分数有效和最终 Promotion decision；
- Host 运行事实可见，但不会单独导致 Gate fail。

## 11. 实施顺序

1. **协议与 Environment Adapter**：完成 resolver、HostEnvironment、preflight、路径映射和 Python 测试。
2. **Candidate + Historical 真实链路**：消除插件生成内容对 Dockerfile 副作用和容器绝对路径的依赖。
3. **DSH 三入口统一接入**：普通 Job、Historical Job、Bounded Diagnostic 共用环境选择和 mode-aware Broker。
4. **证据与 Gate**：Context 版本升级、Summary/Workbench 展示、可比性与恢复协议。
5. **无 Docker E2E 与文档**：完成真实 ACP/Judge/取消/清理验收，再修改 README 的安装要求并对外声明可用。

实现期间不得以“Host 命令退出码为 0”代替完整验收。至少要验证一次真实 Candidate、一次真实 Historical Trial、可见 artifacts、取消和 owned-resource cleanup。

## 12. 迁移与回滚

- 默认切换为 `host`；仍需要 Docker 的安装和自动化必须显式配置 `executionEnvironment=docker`。
- `docker-check` 保留兼容 alias；旧 Tool 调用不带新字段时按新默认进入 Host。
- Host Job 使用新 Context 协议；旧 Context 只读且不能与新 Job 自动比较。
- Host 实现出现问题时可从 Settings 切回 Docker；两类 Job artifacts 并存，身份不会混淆。
- 不提供 Docker→Host 自动 fallback，也不把历史 Docker Job 改写成 Host Job。
- 无数据库迁移；变化只涉及配置、Job context/artifacts 和运行时实现。

## 13. 完成定义

以下条件全部满足后，才可以称插件支持“不需要 Docker 的宿主机模式”：

1. 没有 Docker CLI/daemon 且未指定执行环境时，默认完成真实 Host Candidate Job；
2. Candidate 仍使用不可变 runtime、真实 ACP 和 Host Broker，不被替换为简单模型调用；
3. 普通、Historical、Bounded Diagnostic 三条入口行为一致；
4. Dockerfile、资源策略、网络策略未执行的事实可见且进入证据；
5. Host 模式不增加目录、网络、资源、并发或 Promotion 限制；
6. Baseline/Candidate 的执行环境可比性被严格识别；
7. 取消与 cleanup 能正确结束受控进程组并回收 Trial staging；
8. 显式 Docker 路径及现有 Docker 回归测试保持通过。
