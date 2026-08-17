# Harbor Self-Evolving

一个基于 Harbor 的 Agent 自进化最小模板：固定评测环境，锁定每个 Candidate，通过独立 Job 收集证据，再由 Promotion Gate 决定新版本是否晋级。

```text
固定 Task + 固定 Verifier
          ^
          |
Candidate v1 -> Job v1 -> failure evidence
          |
          +-> controlled change
                         |
Candidate v2 -> Job v2 -> regression comparison -> promote/reject
```

Harbor 没有一个必须叫作 `Candidate` 的内置对象。这个模板把 Candidate 表示为：

```text
candidate artifact
+ candidate version
+ candidate sha256 digest
+ CandidateAgent adapter
```

生产环境可以把本地脚本替换成 `agent_image_digest + Preview URL`，生命周期不变。当前模板用预置的 v1、v2 模拟一次优化过程；接入真正的 AI Optimizer 后，才会自动读取失败证据并生成新 Candidate。

## 目录

```text
harbor-self-evolving/
├── README.md                      # 概念和运行说明
├── task/                          # 冻结的 Task、环境与 Verifier
├── candidates/
│   ├── v1/run.sh                  # 有效失败：文件存在，内容错误
│   └── v2/run.sh                  # 受控改动：修复内容
├── scripts/                       # 评测与晋级流程
│   ├── candidate_agent.py         # 把 Candidate 注入 Harbor 环境
│   ├── run-candidate.sh           # 为一个 Candidate 发起 Job
│   ├── promotion-gate.py          # 比较并决定是否晋级
│   └── run-evolution-demo.sh      # 完整运行 v1 → v2
├── jobs/                          # Harbor 运行结果
└── .runtime/docker/config.json    # 本地运行所需的 Docker 配置
```

`task/environment/Dockerfile` 使用本机已有的 `redis:7` 镜像 digest 作为一个带 `bash` 的空壳 Linux 环境。这里不运行 Redis；锁定 digest 是为了避免两个 Candidate Job 拉到不同的基础镜像。

`.runtime/docker/config.json` 不依赖当前用户配置里的 `desktop` credential helper，并显式保留 Docker Desktop 的 Compose 插件目录。

## Candidate、Job 与 Trial

它们不是一一对应关系：

```text
Candidate 1 ─── N Jobs
Job       1 ─── N Trials
```

- `Candidate` 是不可变的被评测对象，由版本和 SHA-256 digest 标识。
- `Job` 是一次评测运行；当前 demo 中，每个 Job 只绑定一个 Candidate 快照。
- `Trial` 是 Job 内对一个具体 Task 的一次执行。

同一个 Candidate 可以因为不同评测集、环境配置、重复实验或回归检查而产生多个 Job。生产环境应使用 `candidate_digest` 关联 Candidate 与其所有 Job，而不是依赖目录名。

```text
Candidate v2@sha256:xxx
├── Job: smoke-test
│   └── Trial: task-001
└── Job: full-regression
    ├── Trial: task-001
    └── Trial: task-002
```

## 环境要求

- Harbor 0.21.0（当前模板验证版本）
- Docker
- Python 3

## 运行

```bash
git clone https://github.com/istarwyh/harbor-self-evolving.git
cd harbor-self-evolving
./scripts/run-evolution-demo.sh
```

也可以分别运行：

```bash
./scripts/run-candidate.sh v1 my-candidate-v1
./scripts/run-candidate.sh v2 my-candidate-v2
python3 scripts/promotion-gate.py jobs/my-candidate-v1 jobs/my-candidate-v2
```

`run-candidate.sh` 会计算 Candidate 文件的 SHA-256，并把下面三个值传进 Agent 配置：

```text
candidate_path
candidate_version
candidate_digest
```

它们会进入 Job/Trial 的 `lock.json`。`CandidateAgent` 在执行前重新计算摘要；文件被修改但仍冒用旧 digest 时，Trial 会直接报错。

查看锁定身份：

```bash
jq '.trials[0].agent' jobs/<job-name>/lock.json
```

查看运行后证据：

```bash
jq '{agent_info, agent_result, verifier_result, exception_info}' \
  jobs/<job-name>/*/result.json
```

## 预期结果

`v1` 正常执行并创建 `/app/answer.txt`，但内容少了一个 `s`：

```json
{"file_exists": 1, "correctness": 0, "reward": 0}
```

这是一条有效失败，不是环境异常。

`v2` 只修复输出内容：

```json
{"file_exists": 1, "correctness": 1, "reward": 1}
```

`promotion-gate.py` 综合比较当前 baseline 和新 Candidate：确认两个 Trial 都没有异常、Candidate reward 高于 baseline 且 correctness 为 1，才输出：

```text
Decision: PROMOTE candidate
```

## Candidate 与自进化的边界

Candidate 是自进化的必要对象，但它本身不等于优化器。完整链路还需要一个角色读取 v1 的失败证据，提出受控修改，再生成 v2：

```text
Baseline Candidate
  -> Harbor Job
  -> result.json + verifier logs
  -> Optimizer
  -> New Candidate artifact + new digest
  -> Harbor Job
  -> Policy gate
  -> promote / reject
```

这个模板固定提供 v1 和 v2，目的是先把 Candidate 的身份、执行和晋级边界展示清楚。之后可以把“生成 v2”替换成 AI Optimizer，但它仍然必须产出一个新的、可锁定的 Candidate，不能直接修改已经完成的 Job。
