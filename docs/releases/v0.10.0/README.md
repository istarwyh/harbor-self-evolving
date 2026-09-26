# Harbor 0.10.0：可信科学评测闭环与验证记录

- 归档日期（含时区）：2026-09-26 UTC+08:00 CST
- 目标发布版本 / tag：`0.10.0` / `v0.10.0`
- 被验证的产品版本 / 提交：`v0.10.0`；tag commit `97a385062ba194d5496ba2d98c45a3701d08c01d`
- 验收环境：macOS 15.6.1 arm64；Node.js 22.19.0；npm 10.9.3；Python 3.12；Harbor 0.21.x
- 数据与模型：合成/固定测试数据；Deep Research 确定性 Evaluator fixture；无付费或真实供应商模型调用
- 包发布状态：**发布不完整**；npm 0.10.0 已发布，PyPI 在构建前因 clean Linux 测试收集错误停止，未创建正式 GitHub Release；由 0.10.1 取代
- 资料归档状态：失败状态和本地自动化边界已归档；0.10.0 不制作“完整发布”资料包

## 这次改了什么

| 改动 | 用户可见的变化或解决的问题 | 验证资料 |
| --- | --- | --- |
| 正式 Candidate 只执行 `harbor-dsh-evaluator/v2` exact bundle | Dataset 自带 verifier、v1 执行兼容和 legacy fallback 不再能成为业务分数权威 | Node/Python strict materialization、tamper 与 runtime-gating 回归 |
| 可信 Evaluation Report、Job seal 与 score suppression | 未 sealed、身份不一致、执行失败或覆盖不足的结果不会显示为可信质量分数 | Dashboard、Evaluation Report、Result Safety 与 Promotion 回归 |
| repeat-aware Experiment 与严格 Gate | Summary 区分 task/trial/repeat；Compare 展示 paired 统计与不确定性；Gate 重算 sealed invariants | Summary、Comparison、Promotion 回归 |
| Experience Diagnostic、Business Observation、Meta-evaluation 与 badcase 治理 | Historical 证据保持诊断边界；外部指标仅相关性展示；GT/身份漂移 fail closed；回归 Dataset 必须人工确认 exact plan | Historical、Business、Meta、Badcase 回归 |
| diagnostic / experiment / governed 产品模式 | 只有 Governed 暴露 Compare、Gate、完整 Artifact Registry 与 Audit | Product-mode、client 与 service UI 回归 |
| 34 个公共 Schema 与 Deep Research v2 示例 | root、npm 与 Python package source 使用逐字节一致的契约；13 个示例 Task 共用严格 Evaluator | Schema parity、materialization check 与 meta-evaluation fixture |

## 01 · 完整自动化回归与 Web bundle

- 验证日期（含时区）：2026-09-26 UTC+08:00 CST
- 版本/提交与环境：0.10.0 发布前工作树；环境见本页顶部
- 来源与证据类型：本次 synthetic / deterministic fixture / source-build 自动化验证；不是 real-provider 或 public-release 验证
- 操作过程：重建 Web client → 执行完整 Node suite → 执行完整 Python suite → 检查 Schema parity、npm package 内容、Deep Research materialization 与 meta-evaluation fixture
- 预期结果：所有受支持协议和信任边界回归通过；生成 client 与源码一致；两个 package 包含相同公共 Schema
- 实际结果：Node `npm run check` 632 tests passed；Python `.venv/bin/python -m pytest tests -q` 378 tests passed；npm dry-run 为 81 files / 34 schemas；34 个 Schema 在 root/npm/Python 中逐字节一致；13 个 Deep Research Task materialization current；meta-evaluation fixture 得到 ESF 1.0、SCE 0.0、RCR 1.0
- 截图与补充证据：非 UI 自动化证据，无截图；实现与边界见 `docs/tech/202609/harbor-scientific-evaluation-refactor.md` 和 `docs/acceptance-status.md`
- 验证边界：未完成授权 DSH GUI 的人工点击验收；未运行真实业务 Candidate、付费模型或真实供应商质量 Job；本地环境没有 `uv`/`build`/`hatchling`，因此本地未构建 wheel/sdist，正式制品由 tag workflow 构建
- 脱敏说明：测试使用合成或固定 fixture；归档不含 Session 正文、凭据、个人信息或业务私有数据

## 02 · 正式发布状态

- 验证日期（含时区）：2026-09-26 UTC+08:00 CST
- 版本/提交与环境：`v0.10.0`；tag commit `97a385062ba194d5496ba2d98c45a3701d08c01d`
- 来源与证据类型：public-release / failed-release evidence
- 操作过程：推送正式 tag → npm OIDC 发布成功 → PyPI workflow 在 Node validation 阶段停止；tag CI 同时暴露 clean Linux Python collection error
- 预期结果：npm、PyPI 与 GitHub Release 的版本和 source tag 均为 0.10.0
- 实际结果：npm 成功；PyPI 未构建/未发布；不创建宣称完整交付的 GitHub Release。因为 npm 不可覆盖且公开 tag 不移动，修复以 0.10.1 发布
- 截图与补充证据：[npm run 36214908745](https://github.com/istarwyh/harbor-self-evolving/actions/runs/36214908745) 成功；[PyPI run 36214908723](https://github.com/istarwyh/harbor-self-evolving/actions/runs/36214908723) 失败；[tag CI 36214908708](https://github.com/istarwyh/harbor-self-evolving/actions/runs/36214908708) 失败
- 验证边界：npm 与 PyPI 不是原子事务；0.10.0 只在 npm 存在，不能称为协调完成的版本
- 脱敏说明：公开 workflow 与 registry 元数据不应包含凭据

## 测试与发布核对

| 项目 | 版本/提交、命令或来源链接 | 实际结果与边界 |
| --- | --- | --- |
| 完整本地自动化 | `npm run check`；`.venv/bin/python -m pytest tests -q` | 632 个 Node tests 与 378 个 Python tests 通过；不代表真实 Provider 或完整人工 GUI 验收 |
| npm package | [`dsh-harbor-evolution@0.10.0`](https://www.npmjs.com/package/dsh-harbor-evolution/v/0.10.0)；run 36214908745 | OIDC 发布成功；该版本只存在于 npm，由 0.10.1 取代 |
| PyPI wheel/sdist | run 36214908723 | Node response-budget test 在 shared runner 用时 372 ms、超过原 300 ms 阈值，workflow 在构建 Python 制品前停止 |
| GitHub tag CI / Release | tag CI 36214908708；`v0.10.0` | clean Linux 还发现两个测试模块使用 `tests.helpers` 导致 collection error；未创建完整 GitHub Release |

## 未完成项与验证边界

- 未执行授权 DSH GUI 的人工点击验收；Web bundle 和状态机由自动化回归覆盖。
- 未运行真实业务 Candidate、付费模型或 real-provider Job；本版本不声称业务质量已由真实供应商评测证明。
- Host 是 unrestricted、非 sandbox；Docker 才是隔离边界。Job seal 是内容完整性收据，不是抵御本地恶意所有者的外部签名。
- Historical Job 仍是诊断证据，不能进入 Promotion Gate；Evaluator 可靠性仍依赖独立 Ground Truth 和重复元评测。
- 0.10.0 的 PyPI/tag CI 失败已保留；该版本不得声称完整发布成功，使用修复后的 0.10.1。

## 发布入口与资料包

- 不完整 tag：https://github.com/istarwyh/harbor-self-evolving/tree/v0.10.0
- 完整验收记录：本目录、`docs/acceptance-status.md` 与 `docs/tech/202609/harbor-scientific-evaluation-refactor.md`
- 后继正式版本：`v0.10.1`

0.10.0 的公开 tag 不移动、npm package 不覆盖；发布修复只进入 0.10.1。
