# Harbor 0.10.4：协调发布归档维护

- 归档日期（含时区）：2026-10-04 UTC+08:00 CST
- 目标发布版本 / tag：`0.10.4` / `v0.10.4`
- 被验证的产品版本 / 提交：`0.10.4`；release preparation commit `6ca5f774438d2e146ef17fea1c5dc146be01e68c`；正式 tag commit 将在发布后核对补录
- 验收环境：macOS arm64；Node.js 22.19.0；Python 3.12 / uv；GitHub clean Linux runner（待核对）
- 数据与模型：无需评测数据或模型调用；本次为归档和协调版本维护
- 包发布状态：待核对 npm、PyPI 与 GitHub Release
- 资料归档状态：本说明已建立；测试日志、正式 workflow、公开 package artifacts、checksums 与 verification ZIP 待发布后补录

## 这次改了什么

| 改动 | 用户可见的变化或解决的问题 | 验证资料 |
| --- | --- | --- |
| 正式纳入 0.10.3 发布后核验记录 | 新 tag 的源码树包含已经核对的 0.10.3 公开制品、摘要和 Release 结果，不再只存在于上一个 tag 之后的 main | 场景 01；`git log v0.10.3..HEAD` |
| 协调版本推进 | npm Plugin、内置 Skill、Python Adapter、安装指引和网站当前版本统一为 0.10.4 | 场景 02；package metadata 与文档一致性检查 |
| 明确维护版本边界 | 不把归档维护描述成新的运行时功能或业务质量提升 | 本页与 CHANGELOG 的限制说明 |

## 01 · 发布归档进入正式源码 tag

- 验证日期（含时区）：2026-10-04 UTC+08:00 CST
- 版本/提交与环境：本地 `main`；正式 tag 待创建
- 来源与证据类型：本次源码检查；public-release archive metadata
- 操作过程：确认工作树和远端默认分支 → 检查 `v0.10.3..main` → 将发布后完成的 0.10.3 公开制品核验记录纳入 0.10.4 发布源码
- 预期结果：0.10.4 tag 包含 0.10.3 的最终公开发布核验记录
- 实际结果：本地源码已包含两次 0.10.3 发布后归档提交；tag 创建和远端可见性待核对
- 截图与补充证据：无 UI 变化；使用 Git 提交历史与公开 Release 链接作为证据
- 验证边界：归档完整性不代表新增运行时能力，也不重新证明 0.10.3 未覆盖的平台和业务场景
- 脱敏说明：仅包含公开仓库、workflow 和 registry 元数据；不包含凭据、用户会话或本机私有路径

## 02 · Plugin、Skill 与 Adapter 版本协调

- 验证日期（含时区）：2026-10-04 UTC+08:00 CST
- 版本/提交与环境：`6ca5f774438d2e146ef17fea1c5dc146be01e68c`；macOS arm64
- 来源与证据类型：本次源码、构建与 package metadata 验证；synthetic/package verification
- 操作过程：同步 Node/Python package identity、生成 client、安装文档与网站当前版本 → 运行最小必要 Node/Python 检查和 package build
- 预期结果：Node 与 Python 版本一致，生成 client 记录 0.10.4，文档一致性测试和 package 构建通过
- 实际结果：本地 Node 635 tests passed；Python 378 tests passed（20 条既有 artifact overlap warning）；生成 client 二次构建 SHA-256 保持 `d11a8446e0eb7077cc60f48596a94ca61fe4369d65ce8bb55ec6207e2f8b3e51`；npm dry-run 81 files；Python wheel/sdist 构建成功
- 截图与补充证据：无 UI 功能变化，不制造截图；记录命令、测试计数、制品摘要和 workflow 链接
- 验证边界：版本协调和构建通过不能推出真实 Provider、Candidate Job、Gate 或业务质量已验证
- 脱敏说明：公开日志仅记录工具版本、测试结果与公开制品摘要

## 测试与发布核对

| 项目 | 版本/提交、命令或来源链接 | 实际结果与边界 |
| --- | --- | --- |
| 与本次改动相关的测试/验收 | `npm run check`；生成 client 幂等校验；`npm pack --dry-run`；`uv run --frozen pytest`；`uv build` | Node 635 passed；Python 378 passed（20 条既有 overlap warning）；client 二次构建摘要不变；npm 81 files；wheel/sdist 构建成功。当前机器未安装 Hugo，网站交由 clean Linux CI 的 warning-strict job 验证 |
| npm 包与对应发布运行 | `dsh-harbor-evolution@0.10.4` | 待核对公开版本、可下载制品及对应关系 |
| PyPI wheel/sdist 与对应发布运行 | `harbor-dsh-evolution==0.10.4` | 待核对公开版本、可下载制品及对应关系 |
| GitHub Release 与附件 | `v0.10.4` | 待创建并核对图集入口、资料 ZIP、package artifacts 与 checksums |

## 未完成项与验证边界

- npm、PyPI、GitHub Release、workflow、公开制品摘要与 verification ZIP 仍需在 tag 发布后核对并补录。
- 本次没有运行付费或真实 Provider Candidate Job；没有新增 Evaluator、评分、Gate 或业务行为。
- 本次没有 UI 功能变化，因此不制造截图；版本显示由生成 client 和 package metadata 验证。

## 发布入口与资料包

- 版本发布页：https://github.com/istarwyh/harbor-self-evolving/releases/tag/v0.10.4
- 完整验收记录 / 相关提交或 PR：待发布后填写永久提交与 workflow 链接
- 验证资料包：待上传 `harbor-0.10.4-verification.zip` 后填写 Release 下载链接

发布 tag 保持不动；公开核对结果通过后续文档提交补录，不移动 tag、不覆盖 package。
