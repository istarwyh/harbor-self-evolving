# DeepResearch DSH → Harbor 示例

`candidates/v1` 与 `candidates/v2` 都是真实 Cordis composition，由官方 DSH ACP server 启动。两者通过自定义 `LlmAdapter` 调用 OpenAI Responses 兼容接口，以 SSE 接收结构化生成结果；模型不是 mock，默认使用本机 `gpt-5.6-luna`。

这里的 `task/` 是一个 Harbor Dataset 根目录，包含 13 个独立 Task：10 个常规概念问题，以及“重物下落”“抗生素”“相关与因果”3 个显式 Badcase。每个 Task 都有自己的 `task.toml`、完整 `instruction.md`、Source Catalog、环境与 verifier Adapter；`dataset-manifest.json` 固化 13 个 Query、Topic、Badcase 类型、路径和源码摘要。Workbench 的「评测集」页会直接展示这些 Query 与 Agent 实际收到的 instruction。

同一个生成器有两个受控策略：

- v1 `unvalidated-search`：执行一个未校验的空搜索，真实 LLM 仍会生成答案，但没有可用证据，因而不能产生可信引用。
- v2 `retrieval-grounded`：先搜索 Task 镜像内的 Source Catalog，只把命中的证据交给同一个 LLM，并用 JSON Schema 限制引用只能指向已检索 source。

搜索状态与 `tool_errors` 来自生成器执行轨迹，不由模型自报。统一的 [`harbor-dsh-evaluator/v1`](../../docs/evaluator-interface.md) 实现位于 `stack/evaluator/`，按三个维度评分：

- 回应问题：`0 / 0.5 / 1`
- 有趣性：`0 / 0.5 / 1`
- 引用规范性：`0 / 0.5 / 1`

`reward` 是三项算术平均。`materialize-dataset.py` 将同一个实现与通用 Harbor Adapter 物化到 13 个 Task，避免多份判分逻辑漂移；`promotion-policy.json` 再做非回归比较。

从仓库根目录运行：

```bash
./hse demo
```

只检查 Dataset 是否与声明源一致：

```bash
python3 examples/deep-research/materialize-dataset.py --check
```

默认运行时配置为：

```text
host URL       http://127.0.0.1:8317/v1/responses
container URL  http://host.docker.internal:8317/v1/responses
API key        sk-local-gemini
model          gpt-5.6-luna
```

API key 可以覆盖；`HSE_DEMO_LLM_URL` 仅在宿主机预检地址与 Candidate 中的容器地址不能通过 `host.docker.internal` 自动换算时使用：

```bash
HSE_DEMO_LLM_URL="https://your-host/v1/responses" \
HSE_DEMO_LLM_API_KEY="..." \
./hse demo
```

`generator-config.json` 中的容器 endpoint 与 model 属于 Candidate 行为，必须进入 Candidate digest；如果要切换它们，应修改 v1/v2 配置、升级 Candidate version 后重新 snapshot。API key 会被上传为容器内临时 secret file，ACP launcher 只保存文件路径；key 不进入 Candidate Manifest、Dataset Manifest、Job launcher 或生成报告。

两个 Job 除严格评测产物外，还会从 Trial 收集 `research-report.md` 和 `research-result.json`。DSH Workbench 的「产物呈现」会优先展示可读报告，并保留模型、response id、检索策略和 token usage。Gate 先验证可比较 digest、产物 Schema 和基础设施异常，再比较 reward，因此这个例子证明的是“同一模型、同一数据集、同一把尺子下，检索增强策略优于无效搜索策略”。

严格评测身份位于：

- `.harbor/evaluation-stack.yml`
- `task/dataset-manifest.json`
- `stack/evaluator/evaluator.json`（Evaluator Interface）
- `stack/evaluator/evaluator.py`（当前 script 实现）
- `stack/evaluator/rubric.md`（三元 Rubric）
- `promotion-policy.json`（Policy v2）

手动调用 `harbor_eval_run` 时还必须传 `stackPath`、显式 `mode`，以及正式评测所需的 `policyPath`。
