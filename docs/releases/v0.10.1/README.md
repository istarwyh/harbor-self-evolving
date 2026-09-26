# Harbor 0.10.1：可信科学评测闭环正式发布与验证记录

- 归档日期（含时区）：2026-09-26 UTC+08:00 CST
- 目标发布版本 / tag：`0.10.1` / `v0.10.1`
- 被验证的产品版本 / 提交：0.10.1 发布工作树；正式 tag commit 与公开运行链接在发布完成后补录
- 验收环境：macOS 15.6.1 arm64；Node.js 22.19.0；npm 10.9.3；Python 3.12；Harbor 0.21.x；GitHub clean Linux runner
- 数据与模型：合成/固定测试数据；Deep Research 确定性 Evaluator fixture；无付费或真实供应商模型调用
- 包发布状态：待核对 npm、PyPI 与 GitHub Release
- 资料归档状态：本地自动化证据、0.10.0 失败证据和修复已归档；公开 artifact、运行链接和 verification ZIP 待发布后补录

## 这次改了什么

| 改动 | 用户可见的变化或解决的问题 | 验证资料 |
| --- | --- | --- |
| 正式 Candidate 只执行 `harbor-dsh-evaluator/v2` exact bundle | Dataset verifier、v1 执行兼容和 legacy fallback 不再能成为业务分数权威 | strict materialization、tamper 与 runtime-gating 回归 |
| 可信 Evaluation Report、Job seal、repeat-aware Compare 与严格 Gate | 无效/未 sealed/身份不一致证据不会形成可信质量结论；重复实验和不确定性可审计 | Dashboard、Report、Summary、Promotion 回归 |
| Historical、Business、Meta 与 badcase 治理 | 诊断、相关性观测、独立 GT 与人工确认回归集保持不同证据边界 | Historical、Business、Meta、Badcase 回归 |
| diagnostic / experiment / governed 产品模式 | 只有 Governed 暴露 Compare、Gate、完整 Artifact Registry 与 Audit | Product-mode、client 与 service UI 回归 |
| 34 个公共 Schema 与 Deep Research v2 示例 | root、npm 与 Python package source 使用逐字节一致契约；13 个 Task 共用严格 Evaluator | Schema parity、materialization 与 meta-evaluation fixture |
| 0.10.0 发布修复 | clean Linux 测试 helper 使用稳定导入；shared runner dashboard budget 调整为仍有界的 800 ms | 0.10.0 tag/PyPI 失败日志与 0.10.1 tag workflows |

## 01 · 发布前自动化证据

- 验证日期（含时区）：2026-09-26 UTC+08:00 CST
- 版本/提交与环境：0.10.0 runtime-equivalent source；0.10.1 仅修复 release-test portability 与 shared-runner budget
- 来源与证据类型：synthetic / deterministic fixture / source-build；不是 real-provider 或 public-release 验证
- 操作过程：重建 Web client → 完整 Node/Python suite → Schema/package/sample checks；随后从 0.10.0 GitHub runner 失败日志确认两项测试环境问题并修复
- 预期结果：受支持协议和信任边界回归通过；两个 package 契约一致；clean Linux runner 可完成构建
- 实际结果：发布前本地 Node 632 tests、Python 378 tests 通过；npm dry-run 81 files / 34 schemas；34 个 Schema 三处逐字节一致；13 个 Deep Research Task current；meta fixture 为 ESF 1.0、SCE 0.0、RCR 1.0。0.10.1 的正式 clean Linux 结果待 tag workflow 核对
- 截图与补充证据：非 UI 自动化证据，无截图；0.10.0 失败证据见 `docs/releases/v0.10.0/README.md`
- 验证边界：未完成授权 DSH GUI 人工点击；未运行真实业务 Candidate、付费模型或真实供应商质量 Job；正式 wheel/sdist 由 tag workflow 构建
- 脱敏说明：仅合成或固定 fixture；无 Session 正文、凭据、个人信息或业务私有数据

## 02 · 正式发布状态

- 验证日期（含时区）：待发布完成后补录
- 版本/提交与环境：`v0.10.1`；tag commit 待补录
- 来源与证据类型：public-release
- 操作过程：推送不可移动 tag → OIDC 分别发布 npm/PyPI → 创建 GitHub Release 并附精确 workflow artifacts 与 verification ZIP → 核对 registry
- 预期结果：npm、PyPI、GitHub Release 和 source tag 均为 0.10.1
- 实际结果：待核对
- 截图与补充证据：待补 GitHub Actions、registry 与 Release 链接
- 验证边界：npm 与 PyPI 不是原子事务，必须分别报告
- 脱敏说明：公开 workflow 与 registry 元数据不应包含凭据

## 测试与发布核对

| 项目 | 版本/提交、命令或来源链接 | 实际结果与边界 |
| --- | --- | --- |
| 本地自动化 | `npm run check`；`.venv/bin/python -m pytest tests -q` | runtime-equivalent source 为 632 Node / 378 Python passed；0.10.1 tag CI 待核对 |
| npm package | `publish-npm.yml` | 待核对公开 0.10.1 tgz 与 workflow artifact |
| PyPI wheel/sdist | `publish-pypi.yml` | 待核对公开 0.10.1 wheel/sdist 与 workflow artifacts |
| GitHub Release | `v0.10.1` | 待附 npm tgz、wheel、sdist、verification ZIP 与 checksums |

## 未完成项与验证边界

- 未执行授权 DSH GUI 人工点击验收；Web bundle 和状态机由自动化回归覆盖。
- 未运行真实业务 Candidate、付费模型或 real-provider Job；不声称真实供应商业务质量已得到证明。
- Host unrestricted、非 sandbox；Docker 才是隔离边界。Job seal 是内容完整性收据，不是外部签名。
- Historical Job 仍是诊断证据，不能进入 Promotion Gate；Evaluator 可靠性仍依赖独立 Ground Truth 和重复元评测。
- 0.10.0 只在 npm 发布且由本版本取代；其 tag 不移动、package 不覆盖。

## 发布入口与资料包

- 版本发布页：https://github.com/istarwyh/harbor-self-evolving/releases/tag/v0.10.1
- 完整验收记录：本目录、`docs/acceptance-status.md` 与 `docs/tech/202609/harbor-scientific-evaluation-refactor.md`
- 验证资料包：待上传 `harbor-0.10.1-verification.zip` 后补录

发布后使用不移动 tag 的文档提交补录 commit、Workflow/registry 链接、制品摘要和资料包状态。
