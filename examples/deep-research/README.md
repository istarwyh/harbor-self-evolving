# DeepResearch DSH → Harbor 示例

`candidates/v1` 与 `candidates/v2` 都是真实 Cordis composition，由官方 DSH ACP server 启动。为保证示例不需要模型密钥，它们注册确定性的本地 `LlmAdapter`。

v1 模拟三个常见失败：工具报错、空搜索、引用不存在的 source；v2 是受控修复。Verifier 将这些行为分别映射成 reward，最后由 `promotion-policy.json` 做非回归比较。

从仓库根目录运行：

```bash
HARBOR_BIN="$(pwd)/packages/harbor-plugin/.venv/bin/harbor" \
  ./examples/deep-research/run-demo.sh
```
