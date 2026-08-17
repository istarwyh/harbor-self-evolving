# Harbor Self-Evolving

基于 [Harbor](https://github.com/laude-institute/harbor) 的业务 Agent 自进化模板，并提供 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) / Cordis 接入。

它解决的不是“让模型随意改自己”，而是把每次优化变成一条可追踪、可复现、可拒绝的工程流程：

```text
DSH Candidate snapshot
        ↓
Harbor Job（固定 Task / Environment / Verifier）
        ↓
指标 + 失败样本 + ACP 轨迹 + Candidate digest
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
- Promotion Gate：要求主指标提升、关键指标达标、回归指标不下降且无执行异常。
- DeepResearch 示例：明确展示工具调用失败、无效搜索和错误引用如何进入 reward。

这版不会自动修改 Champion、不会部署生产环境，也不内置一个不受约束的 Optimizer。它提供的是 Optimizer 可以安全调用的评测闭环。

## 仓库结构

```text
harbor-self-evolving/
├── packages/
│   ├── harbor-plugin/       # Python: Candidate、ACP Agent、Job Plugin、Gate
│   └── dsh-plugin/          # npm: DSH/Cordis bundle 与模型工具
├── examples/
│   ├── deep-research/       # DSH ACP → Harbor → Promotion 的完整示例
│   └── shell-minimal/       # 不依赖 DSH 的最小 Harbor Candidate 示例
├── schemas/                 # Candidate 与 Promotion Policy 的稳定契约
├── docs/                    # 架构、接入和安全边界
└── jobs/                    # 本地运行证据（不提交 Git）
```

`Candidate` 和 `Job` 不是一一对应：一个不可变 Candidate 可以跑 smoke、full regression、不同数据集和多次重复实验；每个 Job 绑定一个 Candidate digest，一个 Job 内可以包含多个 Trial。

## 运行完整示例

要求：Docker、Node.js 22+、Python 3.12+、[uv](https://docs.astral.sh/uv/) 和 Harbor 0.21.x。

```bash
git clone https://github.com/istarwyh/harbor-self-evolving.git
cd harbor-self-evolving

cd packages/harbor-plugin
uv sync
cd ../..

HARBOR_BIN="$(pwd)/packages/harbor-plugin/.venv/bin/harbor" \
  ./examples/deep-research/run-demo.sh
```

预期结果：

| Candidate | task completion | tool success | valid search | citation | reward |
| --- | ---: | ---: | ---: | ---: | ---: |
| v1 | 1 | 0 | 0 | 0 | 0.4 |
| v2 | 1 | 1 | 1 | 1 | 1.0 |

最终 Gate 输出 `"decision": "PROMOTE"`。每个 Job 的关键证据是：

```text
candidate-manifest.json     # 本次到底评测了谁
candidate-events.jsonl      # Trial 完成事件
evaluation-summary.json     # 稳定指标汇总
*/agent/trajectory.json     # ACP 执行轨迹
*/result.json               # Harbor 原始 Trial 结果
promotion-report.json       # 晋级或拒绝及原因
```

## 在 DSH 中安装

当前包尚未发布到 npm/PyPI，可以从源码安装：

```bash
# Harbor 与 Python 插件必须位于同一个 Python 环境
cd packages/harbor-plugin
uv sync

# 把 Cordis bundle 加入一个 DSH profile
cd ../..
npx @deepseek-ai/dsh@0.1.0-rc.6 plugin \
  --profile headless add -w ./packages/dsh-plugin
```

安装后，DSH Agent 可调用：

- `harbor_candidate_snapshot`：把当前 composition 固化为 Candidate。
- `harbor_eval_run`：用该 digest 发起 Harbor Job。
- `harbor_eval_result`：读取规范化指标与失败证据。
- `harbor_candidate_compare`：执行确定性的 Promotion Gate。

开发与验证：

```bash
cd packages/dsh-plugin && npm ci && npm test && npm pack --dry-run
cd ../harbor-plugin && uv sync && uv run pytest && uv build
```

## 生产接入边界

本仓库负责 `Candidate → evaluation evidence → promotion decision`。真正生效仍应走已有平台：PR/配置变更 → CI 构建不可变 image → 测试部署 → Harbor 评测 → Gate → CD 晋级。Harbor 不替代镜像仓库、发布审批或线上流量切换。

详见 [架构与角色](docs/architecture.md)、[接入指南](docs/integration.md) 和 [安全边界](docs/security.md)。

> 当前仓库尚未选择开源许可证；在作者明确许可证前，公开可见不等于获得再分发或商用授权。
