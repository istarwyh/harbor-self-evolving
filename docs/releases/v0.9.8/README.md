# Harbor 0.9.8：Host 路径修复与验证记录

- 归档日期（含时区）：2026-09-21 UTC+08:00 CST
- 目标发布版本 / tag：`0.9.8` / `v0.9.8`
- 被验证的产品版本 / 提交：`v0.9.8`；tag commit `47b4f4b7f87cc037ed11db9cebd1230ce350d12a`
- 验收环境：macOS 15.6.1 arm64；Python 3.12；Node.js 22.19.0
- 数据与模型：合成 Session Observation；无模型调用
- 包发布状态：npm、PyPI 与 GitHub Release 已发布并核对
- 资料归档状态：源码、本地验证与公开包核验已记录；资料 ZIP 随本记录上传

## 这次改了什么

| 改动 | 用户可见的变化或解决的问题 | 验证资料 |
| --- | --- | --- |
| Host 命令转换保护已解析路径 | Historical Session Observation 与 Candidate 命令不会再次添加 Trial Host Root，避免全部 Trial 在 Adapter 阶段因文件路径不存在而失败 | HostEnvironment 与 SessionObservationAgent 回归测试 |

## 01 · Historical Session Observation Host 回归

- 验证日期（含时区）：2026-09-21 UTC+08:00 CST
- 版本/提交与环境：`v0.9.8` / `47b4f4b7f87cc037ed11db9cebd1230ce350d12a`；macOS 15.6.1 arm64；Harbor 0.21.0
- 来源与证据类型：本次合成、无模型验证；无 UI 变化，因此不制作截图
- 操作过程：创建带有效 Digest 的 Session Observation → 由 HostEnvironment 上传到逻辑路径 → SessionObservationAgent 读取并校验 → 写入 Trial Artifact
- 预期结果：Host 执行仅转换一次 Harbor 逻辑路径，Artifact 保留原 Observation Digest
- 实际结果：通过；已解析 Host 路径保持不变，SessionObservationAgent 完成校验并写入 Artifact
- 补充证据：`uv run --project packages/harbor-plugin pytest packages/harbor-plugin/tests/test_host_environment.py packages/harbor-plugin/tests/test_session_agent.py`，5 passed
- 验证边界：该测试复现并覆盖 Adapter 路径；不调用 Judge，不代表业务评分质量
- 脱敏说明：仅使用合成 Observation，不包含用户会话内容或凭据

## 测试与发布核对

| 项目 | 版本/提交、命令或来源链接 | 实际结果与边界 |
| --- | --- | --- |
| 完整本地测试 | `NODE_ENV=development ./hse test` | 321 个 Python 测试与 596 个 Node 测试通过；npm 包与 Python wheel/sdist 构建通过 |
| npm 包与对应发布运行 | `dsh-harbor-evolution@0.9.8`；[run 35620473013](https://github.com/istarwyh/harbor-self-evolving/actions/runs/35620473013) | Trusted Publishing 通过；公开 tgz 与 Workflow Artifact 逐字节相同，SHA-256 `1e756f8dc226a09e965d3d6649595f8247f4e528b21ce476d9f06e430f06eb94` |
| PyPI wheel/sdist 与对应发布运行 | `harbor-dsh-evolution==0.9.8`；[run 35620472983](https://github.com/istarwyh/harbor-self-evolving/actions/runs/35620472983) | Trusted Publishing 通过；公开 wheel/sdist 与 Workflow Artifact 逐字节相同，SHA-256 `6084fff1cce4cca8b69cca3c025ffbdb1544dadfb67d7f91731b5bd7e6a0625f` / `6a4c740dc0713e4f1471892d358d1917029a468f511e49f11923b0458c9a3611` |
| GitHub Release 与附件 | [`v0.9.8`](https://github.com/istarwyh/harbor-self-evolving/releases/tag/v0.9.8) | 正式 Release 已包含三个与 Workflow Artifact 相同的 Package 文件；验证资料 ZIP 与校验和随最终归档上传 |

## 未完成项与验证边界

- 尚未从正式 0.9.8 安装重新运行真实历史会话 Job；仍需确认 Trial 不再在 Observation Adapter 阶段全量失败。
- 本次修复不修改 Evaluator、Judge、Rubric 或 Session 内容，因此不产生业务质量提升声明。

## 发布入口与资料包

- 版本发布页：https://github.com/istarwyh/harbor-self-evolving/releases/tag/v0.9.8
- 完整验收记录：本目录与修复提交
- 验证资料包：https://github.com/istarwyh/harbor-self-evolving/releases/download/v0.9.8/harbor-0.9.8-verification.zip
