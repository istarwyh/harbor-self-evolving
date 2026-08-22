# Evaluator Interface v1

`harbor-dsh-evaluator/v1` 是 Harbor verifier 之上的业务评测器接口。Harbor 仍负责隔离环境、执行 Trial 与收集 `reward.json`；插件负责固定评测器身份、统一输入输出、展示实现，并把实现变更纳入可比较性与 fresh-baseline 规则。

## 两种实现，共用一个结果

Evaluator Descriptor 是 Evaluation Stack 中 `components.evaluator.entry` 指向的 JSON 文件：

```json
{
  "schema_version": 1,
  "interface": "harbor-dsh-evaluator/v1",
  "evaluator_id": "search-quality-judge",
  "version": "1.0.0",
  "kind": "script",
  "protocol": {
    "input": "evaluation-input/v1",
    "output": "evaluation-result/v1"
  },
  "implementation": {
    "entry": "evaluator.py",
    "language": "python",
    "callable": "evaluate"
  },
  "editable_files": [
    {
      "path": "evaluator.py",
      "role": "implementation",
      "language": "python",
      "affects": ["evaluator"]
    }
  ],
  "criteria": [
    { "id": "quality", "label": "质量", "values": [0, 0.5, 1] }
  ],
  "aggregate": { "metric_id": "reward", "method": "mean" }
}
```

- `kind: script`：实现直接运行确定性规则、统计模型或本地程序。
- `kind: llm-as-judge`：实现可以调用 LLM；Descriptor 还必须声明非敏感 `judge` 配置。Endpoint、API key 等凭证只能通过环境变量或 secret file 注入，不能写入 Descriptor、Job 或 UI。

两种实现都暴露 `evaluate(payload)`，输入为：

```json
{
  "schema_version": 1,
  "protocol": "evaluation-input/v1",
  "task": { "query": "...", "rubric_context": {} },
  "candidate_output": { "answer": "...", "citations": [], "searches": [] },
  "evidence": {}
}
```

输出为：

```json
{
  "schema_version": 1,
  "protocol": "evaluation-result/v1",
  "criteria": [
    {
      "id": "quality",
      "score": 0.5,
      "reason": "缺少一个关键概念。",
      "recommendation": "补充该概念并重新运行此 Trial。",
      "evidence_refs": []
    }
  ]
}
```

每个 Criterion 的 `score` 必须属于 Descriptor 声明的离散值，`reason` 与 `recommendation` 都必须是非空字符串。建议是 Evaluator 的正式输出，不由 Reporter 根据分数临时生成。聚合指标由 Adapter 计算，不能让 UI 重新解释评分。完整 Schema 随插件发布在 `dsh-harbor-evolution/schemas/evaluation-result.schema.json`。

## Harbor Adapter

每个 Harbor Task 的 `tests/test.sh` 只承担 Adapter 责任：读取 Task、Candidate 产物与证据，调用 Evaluator，再把规范化结果映射到 Harbor `reward.json`。业务 Rubric 不应散落在十几个 Task verifier 中。

Deep Research 示例以当前 Stack Descriptor 指向的 `evaluator.py` 为唯一实现源；[`materialize-dataset.py`](../examples/deep-research/materialize-dataset.py) 将同一个通用 Adapter 和实现物化到 13 个 Task（其中 3 个是显式 Badcase）。`run-demo.sh` 会先解析当前 Evaluator identity 再重新物化，因此 UI 保存后的版本目录会进入下一次 Dataset snapshot 与 Job。

## UI 受控编辑

Workbench 的「评测器」页会读取当前 Descriptor，并只允许打开 `editable_files` 中声明的文件。保存必须同时提供新的 Evaluator version 与 Stack version：

1. 服务端重新解析当前 Stack 与 Descriptor，而不是信任浏览器传来的路径。
2. 路径必须位于 `projectRoot`，且是 Descriptor 精确授权的普通文件。
3. `expectedDigest` 提供乐观并发控制，防止覆盖刚被其他进程修改的源码。
4. 插件把完整 bundle 复制到新的版本目录，原子切换 Stack；旧 Descriptor、实现与 Rubric 保持不变，任一步失败都会回滚。
5. 保存不会自动运行元评测、Agent Job 或 Gate。Reward 语义改变后必须先对齐独立维护的 GT，再建立新的 Agent Baseline。

同样的能力也提供给 Agent：`harbor_evaluator_inspect` 用于读取接口，`harbor_evaluator_update` 用于执行受控修改。

## LLM-as-Judge 实现要求

LLM Judge 仍应返回相同的 `evaluation-result/v1`。实现还应把以下内容固定进身份或审计产物：provider、model/version、temperature、prompt/template digest、结构化输出 Schema、重试策略以及解析失败规则。模型调用失败属于 `evaluation-error`，不能伪装成 Candidate 的 `0` 分。

上线前应对独立维护的 GT 运行元评测，至少观察 ESF、SCE、RCR、延迟和成本。GT 可以来自人工标注、确定性程序、多方共识、独立模型或外部标准，但必须记录来源、版本与 provenance，并且不能由待测 Evaluator 自己生成。修改 prompt、model、Rubric 或解析逻辑都会改变 reward 语义，需要新的 Evaluator/Stack 身份与 fresh baseline。

## 独立 Ground Truth 与元评测流程

插件把评测器元评测作为独立流程管理：

1. `harbor_ground_truth_init` 创建不覆盖历史版本的 `ground-truth/v1` 草稿，要求声明来源类型、说明、provenance 与 Criterion。
2. 用户补充固定产物、三元金标、权重和原因；GT 对待测 Evaluator 保持不可见。
3. 对同一批产物重复运行 Evaluator，保存为 `evaluator-observations/v1`。
4. `harbor_evaluator_meta_evaluate` 计算 ESF、SCE、RCR，并输出 `meta-evaluation-report/v1`。
5. 只有评测器通过自己的 Gate 后，才更新 Evaluation Stack 并为业务 Agent 建立新的 Baseline。

对应 Schema 随插件发布在 `schemas/ground-truth.schema.json`、`schemas/evaluator-observations.schema.json` 和 `schemas/meta-evaluation-report.schema.json`。
