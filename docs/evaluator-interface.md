# Evaluator Interface v2

`harbor-dsh-evaluator/v2` 是当前正式 Candidate Experiment 唯一可执行的业务评测器接口；v1 仅用于只读解释旧产物，不提供执行兼容回退。Harbor 负责按所选 Host/Docker 环境执行 Trial 与收集 native `reward.json`；native reward 只用于运行时排错，Host 不构成隔离边界。插件固定并执行用户提供的 Evaluator bundle，规范化结果、验证 configured → materialized → executed 身份，并把实现变更纳入可比较性与 fresh-baseline 规则。

## 两种实现，共用一个结果

Evaluator Descriptor 是 Evaluation Stack 中 `components.evaluator.entry` 指向的 JSON 文件：

```json
{
  "schema_version": 2,
  "interface": "harbor-dsh-evaluator/v2",
  "evaluator_id": "search-quality-judge",
  "version": "1.0.0",
  "kind": "script",
  "protocol": {
    "input": "evaluation-input/v2",
    "output": "evaluation-result/v2"
  },
  "implementation": {
    "entry": "evaluator.py",
    "language": "python",
    "callable": "evaluate"
  },
  "input_builder": {
    "entry": "evaluator.py",
    "callable": "build_input"
  },
  "bundle_files": [
    { "path": "evaluator.py", "role": "implementation" }
  ],
  "editable_files": [
    {
      "path": "evaluator.py",
      "role": "implementation",
      "language": "python",
      "affects": ["evaluator"]
    }
  ],
  "criteria": [
    { "id": "quality", "label": "质量", "values": [0, 0.5, 1], "required": true }
  ],
  "aggregate": { "metric_id": "reward", "method": "mean", "minimum_coverage": 1 }
}
```

- `kind: script`：实现直接运行确定性规则、统计模型或本地程序。
- `kind: llm-as-judge`：实现可以调用 LLM；Descriptor 还必须声明非敏感 `judge` 配置。Endpoint、API key 等凭证只能通过环境变量或 secret file 注入，不能写入 Descriptor、Job 或 UI。

两种实现都暴露 `evaluate(payload)`。正式 Candidate Experiment 还必须提供 Descriptor 声明的 `build_input(context)`：它从 Task 目录、Candidate 输出、日志和证据构造以下规范输入；生成的 strict adapter 不猜业务文件名。`evaluate` 的输入为：

```json
{
  "schema_version": 2,
  "protocol": "evaluation-input/v2",
  "task": { "query": "...", "rubric_context": {} },
  "candidate_output": { "answer": "...", "citations": [], "searches": [] },
  "evidence": {}
}
```

输出为：

```json
{
  "schema_version": 2,
  "protocol": "evaluation-result/v2",
  "criteria": [
    {
      "id": "quality",
      "status": "scored",
      "score": 0.5,
      "reason": "缺少一个关键概念。",
      "recommendation": "补充该概念并重新运行此 Trial。",
      "evidence_refs": ["candidate_output.answer"]
    }
  ],
  "aggregate": {
    "metric_id": "reward",
    "value": 0.5,
    "scored_criteria": 1,
    "total_criteria": 1,
    "coverage": 1
  }
}
```

每个 Criterion 的 `score` 必须属于 Descriptor 声明的离散值，`reason` 与 `recommendation` 都必须是非空字符串。建议是 Evaluator 的正式输出，不由 Reporter 根据分数临时生成。聚合指标由 Adapter 计算，不能让 UI 重新解释评分。完整 Schema 随插件发布在 `dsh-harbor-evolution/schemas/evaluation-result-v2.schema.json`。

## Harbor Adapter

正式 Candidate Job 启动前，Harbor 会把 source Dataset 复制到 `.harbor/private/candidate-materializations/<job>`，删除每个 Task 原有的 `tests/`，再生成同一个 strict adapter。Adapter 读取 Task、Candidate 产物与证据，调用已固定 bundle 中的 `input_builder` 和 `evaluate`，校验执行前后的 `portable_digest`，写入 `effective-evaluator/v1`；Harbor native reward 只记录非业务的 Criterion coverage，业务分数只进入已校验的 Evaluation Result、Assessment 与 Summary。Dataset 自带 verifier 无法进入当前评分路径；不提供兼容回退。

`bundle_files` 必须声明运行时会导入或读取的全部文件；loader 核对目录后导出的 `bundle_complete` 必须为 `true`。Job 开始时会把 exact bundle 固化到 `evaluator-bundle/`，而 manifest 写在同级 `evaluator-bundle-manifest.json`，不会污染完整 bundle。身份不一致时 Trial 为 `evaluation-error`，业务分数为 `null`。

Deep Research 示例仍用 [`materialize-dataset.py`](../examples/deep-research/materialize-dataset.py) 保持 13 个 source Task（其中 3 个显式 Badcase）一致；这些 source tests 只用于 Dataset 自检。正式 Job 仍由 strict materializer 替换它们，并以 Stack Descriptor 的 Evaluator 作为唯一分数权威。

## UI 受控编辑

Workbench 的「评测器」页只把 verified Effective Evaluator 标记为“本 Job 实际执行的评测器”。live Stack 身份一致时读取 live bundle；live Stack 已升级时读取 Job 的不可变 `evaluator-bundle/` 并从它分叉；没有 attestation 的旧 Job 只读且不得声称源码已执行。页面只允许打开 `editable_files` 中声明的文件。保存必须同时提供新的 Evaluator version 与 Stack version：

1. 服务端重新解析当前 Stack 与 Descriptor，而不是信任浏览器传来的路径。
2. 路径必须位于 `projectRoot`，且是 Descriptor 精确授权的普通文件。
3. `expectedDigest` 提供乐观并发控制，防止覆盖刚被其他进程修改的源码。
4. 插件把完整 bundle 复制到新的版本目录，原子切换 Stack；旧 Descriptor、实现与 Rubric 保持不变，任一步失败都会回滚。
5. 保存不会自动运行元评测、Agent Job 或 Gate。Reward 语义改变后必须先对齐独立维护的 GT，再建立新的 Agent Baseline。

同样的能力也提供给 Agent：`harbor_evaluator_inspect` 用于读取接口，`harbor_evaluator_update` 用于执行受控修改。

## LLM-as-Judge 实现要求

LLM Judge 也必须返回相同的 `evaluation-result/v2`。实现还应把以下内容固定进身份或审计产物：provider、model/version、temperature、prompt/template digest、结构化输出 Schema、重试策略以及解析失败规则。模型调用失败属于 `evaluation-error`，不能伪装成 Candidate 的 `0` 分。

上线前应对独立维护的 GT 运行元评测，至少观察 ESF、SCE、RCR、延迟和成本。GT 可以来自人工标注、确定性程序、多方共识、独立模型或外部标准，但必须记录来源、版本与 provenance，并且不能由待测 Evaluator 自己生成。修改 prompt、model、Rubric 或解析逻辑都会改变 reward 语义，需要新的 Evaluator/Stack 身份与 fresh baseline。

## 独立 Ground Truth 与元评测流程

插件把评测器元评测作为独立流程管理：

1. `harbor_ground_truth_init` 创建不覆盖历史版本的 `ground-truth/v1` 草稿，要求声明来源类型、说明、provenance 与 Criterion。
2. 用户补充固定产物、三元金标、权重和原因；GT 对待测 Evaluator 保持不可见。
3. 对同一批产物重复运行 Evaluator，保存为 `evaluator-observations/v1`。
4. `harbor_evaluator_meta_evaluate` 计算 ESF、SCE、RCR，并输出 `meta-evaluation-report/v1`。
5. 当前实现生成 Meta-evaluation Report，但不创建专用 Harbor Meta Job 或 Gate。用户根据预先声明的可靠性标准决定是否采用新 Evaluator；一旦采用，就更新 Evaluation Stack 并为业务 Agent 建立新的 Baseline。

对应 Schema 随插件发布在 `schemas/ground-truth.schema.json`、`schemas/evaluator-observations.schema.json` 和 `schemas/meta-evaluation-report.schema.json`。
