# DeepResearch DSH → Harbor 示例

`candidates/v1` 与 `candidates/v2` 都是真实 Cordis composition，由官方 DSH ACP server 启动。为保证示例不需要模型密钥，它们注册确定性的本地 `LlmAdapter`。

v1 模拟三个常见失败：工具报错、空搜索、引用不存在的 source；v2 是受控修复。Verifier 将这些行为分别映射成 reward，最后由 `promotion-policy.json` 做非回归比较。

从仓库根目录运行：

```bash
./hse demo
```

两个 Job 会保存 Context v2、Dataset Manifest、Evaluation Stack Manifest、Architecture Doctor、Evaluation Contract、Trial Assessment 与 Population Report。Gate 先验证可比较 digest、产物 Schema 和基础设施异常，再比较 reward，因此这个例子证明的是“同一把尺子下 v2 优于 v1”。

严格评测身份位于：

- `.harbor/evaluation-stack.yml`
- `task/dataset-manifest.json`
- `promotion-policy.json`（Policy v2）

手动调用 `harbor_eval_run` 时还必须传 `stackPath`、显式 `mode`，以及正式评测所需的 `policyPath`。
