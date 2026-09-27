# Harbor 0.10.2：Workbench 样式生命周期与 Job 状态布局修复

- 归档日期（含时区）：2026-09-27 UTC+08:00 CST
- 目标发布版本 / tag：`0.10.2` / `v0.10.2`
- 被验证的产品版本 / 提交：`v0.10.2`；tag commit `a2665ed5e5b9d963dfe245ed22aabe834b3acddf`
- 验收环境：macOS 15.6.1 arm64；Node.js 22.19.0；npm 10.9.3；YourBuddy / DSH Web；GitHub clean Linux runner
- 数据与模型：无需评测数据或模型调用；本次为 Web client 样式生命周期与布局修复
- 包发布状态：npm、PyPI 与 GitHub Release 已发布；registry 文件摘要与 workflow artifacts 一致
- 资料归档状态：源码、构建产物、针对性回归、公开 workflow、package artifacts、checksums 与 verification ZIP 已归档

## 这次改了什么

| 改动 | 用户可见的变化或解决的问题 | 验证资料 |
| --- | --- | --- |
| 样式标签生命周期隔离 | 插件重复实例或热重载时，旧实例销毁不会再移除当前 Workbench 的样式，避免 Harbor 页面退化为无样式 HTML | 场景 01；`packages/dsh-plugin/test/client.test.js` |
| Job 状态布局 | 状态文字固定在卡片右上角，不随标题区高度拉伸；移除状态文字外层背景圈 | 场景 02；源码断言与构建后 client bundle |
| 协调版本 | npm Plugin、Skill 与 Python Adapter 对齐为 0.10.2 | package metadata 与正式 workflow artifacts |

## 01 · Workbench 样式生命周期回归

- 截图/验证日期（含时区）：2026-09-27 UTC+08:00 CST
- 版本/提交与环境：`v0.10.2` / `a2665ed5e5b9d963dfe245ed22aabe834b3acddf`；macOS arm64；Node.js 22.19.0；GitHub clean Linux runner
- 来源与证据类型：本次源码实测；synthetic component lifecycle
- 操作过程：构造两个重叠的 client-plugin 生命周期 → 分别安装样式 → 销毁旧实例 → 检查新实例的样式标签仍存在
- 预期结果：旧实例只清理自己拥有的 `<style>`；当前 Workbench 样式不被移除
- 实际结果：针对性 Node 测试通过；销毁旧实例后仍保留替代实例的 `.hse-root` 样式
- 截图与补充证据：`node --test test/client.test.js`，2 tests passed；Web client 由 `npm run build` 成功生成
- 验证边界：证明样式所有权与生成 bundle；未把会话中的诊断截图复制进公开归档，也未执行跨平台浏览器矩阵
- 脱敏说明：公开归档不包含用户会话截图、路径或业务内容

## 02 · Job 状态位置与背景

- 截图/验证日期（含时区）：2026-09-27 UTC+08:00 CST
- 版本/提交与环境：同场景 01
- 来源与证据类型：用户反馈驱动的源码修复；synthetic source/bundle verification
- 操作过程：为 `.hse-job-top` 设置顶部对齐 → 为 `.hse-status` 设置自身顶部对齐、透明背景、无圆角与紧凑 padding → 构建 client bundle → 运行源码断言
- 预期结果：状态位于卡片右上角且没有外层背景圈；完成/运行/异常颜色和符号仍保留
- 实际结果：针对性测试通过，构建后的 client bundle 包含顶部对齐和透明背景规则
- 截图与补充证据：`packages/dsh-plugin/src/client/index.jsx`、`packages/dsh-plugin/lib/client.js`、`packages/dsh-plugin/test/client.test.js`
- 验证边界：源码与 bundle 结果已验证；最终正式包的人工视觉确认不由自动化测试代替
- 脱敏说明：无敏感资料进入归档

## 测试与发布核对

| 项目 | 版本/提交、命令或来源链接 | 实际结果与边界 |
| --- | --- | --- |
| 与本次改动相关的测试/验收 | `npm run build && node --test test/client.test.js`；[tag CI 36308417255](https://github.com/istarwyh/harbor-self-evolving/actions/runs/36308417255) | 本地 2 tests passed；tag CI 的完整 Node、Python、warning-strict website 与 Python build 全部通过 |
| npm 包与对应发布运行 | [`dsh-harbor-evolution@0.10.2`](https://www.npmjs.com/package/dsh-harbor-evolution/v/0.10.2)；[run 36308417286](https://github.com/istarwyh/harbor-self-evolving/actions/runs/36308417286) | OIDC 发布成功；公开 tgz 与 workflow artifact SHA-256 `d1d545473b6a03cb9cdfa94d25ae3848185ccda1715d399c869259c1b3946bcb` |
| PyPI wheel/sdist 与对应发布运行 | [`harbor-dsh-evolution==0.10.2`](https://pypi.org/project/harbor-dsh-evolution/0.10.2/)；[run 36308417292](https://github.com/istarwyh/harbor-self-evolving/actions/runs/36308417292) | OIDC 发布成功；公开 wheel SHA-256 `a83e5798d63c5c90c14924cf08bc838f2e2d236885fdd8eed4c703354486f7df`，sdist `feb4d62274fce9425669f085e2fbdd0af38199b0f385d7a5b49733467e3bed58`，与 workflow artifacts 一致 |
| GitHub Release 与附件 | [`v0.10.2`](https://github.com/istarwyh/harbor-self-evolving/releases/tag/v0.10.2) | 附 npm tgz、wheel、sdist、verification ZIP 与 SHA256SUMS |

## 未完成项与验证边界

- `v0.10.2` tag、main/tag CI、npm/PyPI OIDC workflow、公开 registry、package artifacts 与 GitHub Release 已完成核对。
- GitHub Actions 报告 runner 镜像迁移和旧版 artifact action 的 Node 20 deprecation 非阻塞警告；未影响构建、测试或发布结果。
- 未执行付费/真实 Provider Candidate Job；本次修复不涉及 Evaluator、评分、Gate 或业务质量逻辑。
- 未把用户会话截图纳入公开 evidence，避免公开会话标识和本机上下文；源码测试不能替代最终用户设备上的完整视觉验收。
- Host 执行仍不受限、不是沙箱；Historical 结果仍不能成为 Promotion Gate 证据；Job seal 仍是内容完整性收据而非外部签名。

## 发布入口与资料包

- 版本发布页：https://github.com/istarwyh/harbor-self-evolving/releases/tag/v0.10.2
- 完整验收记录 / 相关提交或 PR：[release commit `a2665ed`](https://github.com/istarwyh/harbor-self-evolving/commit/a2665ed5e5b9d963dfe245ed22aabe834b3acddf)；[main CI 36308361483](https://github.com/istarwyh/harbor-self-evolving/actions/runs/36308361483)
- 验证资料包：https://github.com/istarwyh/harbor-self-evolving/releases/download/v0.10.2/harbor-0.10.2-verification.zip

发布 tag 保持不动；本页通过后续文档提交记录实际 public-release 结果。
