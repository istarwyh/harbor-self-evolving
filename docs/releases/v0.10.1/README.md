# Harbor 0.10.1：可信科学评测闭环正式发布与验证记录

- 归档日期（含时区）：2026-09-26 UTC+08:00 CST
- 目标发布版本 / tag：`0.10.1` / `v0.10.1`
- 被验证的产品版本 / 提交：`v0.10.1`；tag commit `b22823ae1b4fa12f60d1db4477c057a4ee7fc215`
- 验收环境：macOS 15.6.1 arm64；Node.js 22.19.0；npm 10.9.3；Python 3.12；Harbor 0.21.x；GitHub clean Linux runner
- 数据与模型：合成/固定测试数据；Deep Research 确定性 Evaluator fixture；无付费或真实供应商模型调用
- 包发布状态：npm、PyPI 与 GitHub Release 已发布；registry 文件摘要与 workflow artifacts 一致
- 资料归档状态：0.10.0 失败证据、0.10.1 测试/发布证据、package artifacts、checksums 与 verification ZIP 已归档

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
- 版本/提交与环境：`v0.10.1` / `b22823ae1b4fa12f60d1db4477c057a4ee7fc215`；0.10.1 仅修复 release-test portability 与 shared-runner budget
- 来源与证据类型：synthetic / deterministic fixture / source-build；不是 real-provider 或 public-release 验证
- 操作过程：重建 Web client → 完整 Node/Python suite → Schema/package/sample checks；随后从 0.10.0 GitHub runner 失败日志确认两项测试环境问题并修复
- 预期结果：受支持协议和信任边界回归通过；两个 package 契约一致；clean Linux runner 可完成构建
- 实际结果：发布前本地 Node 632 tests、Python 378 tests 通过；npm dry-run 81 files / 34 schemas；34 个 Schema 三处逐字节一致；13 个 Deep Research Task current；meta fixture 为 ESF 1.0、SCE 0.0、RCR 1.0。0.10.1 tag CI 的 Node、Python、warning-strict website 和 Python build 全部通过
- 截图与补充证据：非 UI 自动化证据，无截图；0.10.0 失败证据见 `docs/releases/v0.10.0/README.md`
- 验证边界：未完成授权 DSH GUI 人工点击；未运行真实业务 Candidate、付费模型或真实供应商质量 Job；正式 wheel/sdist 由 tag workflow 构建
- 脱敏说明：仅合成或固定 fixture；无 Session 正文、凭据、个人信息或业务私有数据

## 02 · 正式发布状态

- 验证日期（含时区）：2026-09-26 UTC+08:00 CST
- 版本/提交与环境：`v0.10.1`；tag commit `b22823ae1b4fa12f60d1db4477c057a4ee7fc215`
- 来源与证据类型：public-release
- 操作过程：推送不可移动 tag → OIDC 分别发布 npm/PyPI → 下载精确 workflow artifacts 并计算 SHA-256 → 创建 GitHub Release，附 package artifacts、checksums 与 verification ZIP → 核对 registry
- 预期结果：npm、PyPI、GitHub Release 和 source tag 均为 0.10.1
- 实际结果：tag CI、npm Trusted Publishing 与 PyPI Trusted Publishing 全部成功；公开 PyPI wheel/sdist 与 workflow artifacts 摘要逐字节一致；npm registry 已由成功 OIDC workflow 发布并在公开元数据传播后核对
- 截图与补充证据：[tag CI 36215314532](https://github.com/istarwyh/harbor-self-evolving/actions/runs/36215314532)、[npm run 36215314693](https://github.com/istarwyh/harbor-self-evolving/actions/runs/36215314693)、[PyPI run 36215314784](https://github.com/istarwyh/harbor-self-evolving/actions/runs/36215314784)
- 验证边界：npm 与 PyPI 不是原子事务；本记录分别报告两处成功结果
- 脱敏说明：公开 workflow 与 registry 元数据不应包含凭据

## 测试与发布核对

| 项目 | 版本/提交、命令或来源链接 | 实际结果与边界 |
| --- | --- | --- |
| 本地与 tag 自动化 | 本地完整 suites；[tag CI 36215314532](https://github.com/istarwyh/harbor-self-evolving/actions/runs/36215314532) | 632 Node / 378 Python tests；committed client、npm pack、Python build 与 warning-strict website 全部通过 |
| npm package | [`dsh-harbor-evolution@0.10.1`](https://www.npmjs.com/package/dsh-harbor-evolution/v/0.10.1)；[run 36215314693](https://github.com/istarwyh/harbor-self-evolving/actions/runs/36215314693) | OIDC 发布成功；workflow tgz SHA-256 `ceb100bf1ce3739c312b3e0a705b1b73e05b27c23f14983618c945e2440a41fc` |
| PyPI wheel/sdist | [`harbor-dsh-evolution==0.10.1`](https://pypi.org/project/harbor-dsh-evolution/0.10.1/)；[run 36215314784](https://github.com/istarwyh/harbor-self-evolving/actions/runs/36215314784) | OIDC 发布成功；公开 wheel SHA-256 `c73dca93ca4ec2e42f6b594b067f46b291cd1cd3bdb58dad8bbe41c861191e71`，sdist `a8e80c5c7b22d623a351c97ff4baa32ac37f864baf05a0a95657516d127fa70f`，与 workflow artifacts 一致 |
| GitHub Release | [`v0.10.1`](https://github.com/istarwyh/harbor-self-evolving/releases/tag/v0.10.1) | 附 npm tgz、wheel、sdist、verification ZIP 与 SHA256SUMS |

## 未完成项与验证边界

- 未执行授权 DSH GUI 人工点击验收；Web bundle 和状态机由自动化回归覆盖。
- 未运行真实业务 Candidate、付费模型或 real-provider Job；不声称真实供应商业务质量已得到证明。
- Host unrestricted、非 sandbox；Docker 才是隔离边界。Job seal 是内容完整性收据，不是外部签名。
- Historical Job 仍是诊断证据，不能进入 Promotion Gate；Evaluator 可靠性仍依赖独立 Ground Truth 和重复元评测。
- 0.10.0 只在 npm 发布且由本版本取代；其 tag 不移动、package 不覆盖。

## 发布入口与资料包

- 版本发布页：https://github.com/istarwyh/harbor-self-evolving/releases/tag/v0.10.1
- 完整验收记录：本目录、`docs/acceptance-status.md` 与 `docs/tech/202609/harbor-scientific-evaluation-refactor.md`
- 验证资料包：https://github.com/istarwyh/harbor-self-evolving/releases/download/v0.10.1/harbor-0.10.1-verification.zip

发布 tag 保持不动；本页通过后续文档提交记录实际 public-release 结果。
