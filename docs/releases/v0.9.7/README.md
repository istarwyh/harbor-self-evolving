# Harbor 0.9.7：Context v3 Web 修复与双语产品站

- 归档日期（含时区）：2026-09-20，Asia/Shanghai（UTC+08:00）。
- 目标发布版本 / tag：`0.9.7` / `v0.9.7`。
- 被验证的产品版本 / 提交：发布候选基于 `30cb668b769035eafa75d7f7cb22aeef84a8f49c` 与本归档中的未提交 release-prep 变更；正式 tag 提交待填写。
- 验收环境：macOS 15.6.1 arm64、Node 22.19.0、npm 10.9.3、pnpm 11.7.0、项目 Python 3.12.14；本地源码与 GitHub Actions。
- 数据与模型：没有运行真实 Candidate、Historical Session 或外部模型评测；产品测试使用临时目录、合成任务和进程级 fixture，网站验证使用静态构建与公开页面。
- 包发布状态：待核对（npm、PyPI、GitHub Release 分别记录）。
- 资料归档状态：发布前记录与本地验证日志已建立；公开包核验和 `harbor-0.9.7-verification.zip` 待发布后补齐。

## 这次改了什么

| 改动 | 用户可见的变化或解决的问题 | 验证资料 |
| --- | --- | --- |
| Candidate Context v3 Web 合约修复 | 当前 Candidate v3 Artifact 不再被误判为 unsupported/invalid；promotion-eligible Job 可进入 Compare/Gate | Node Dashboard/Workbench 回归测试与本地验证日志 |
| Historical Context v2 显式识别 | Dashboard 按 v2 protocol 识别 Historical Job；pending/context-only Job 也不会误判为 Candidate | Node protocol fallback 回归测试 |
| 审阅式安全更新 | 浏览器只检查版本并复制精确 setup 命令，不在 Host 上直接执行 registry 包；身份不完整时不生成可能重置配置的命令 | Version/Service/Web/Client 测试 |
| 安装身份持久化 | setup 写入 profile、DSH_HOME、Jobs、managed runtime 与 Host/Docker 选择，供后续更新命令完整继承 | Setup 与版本命令测试 |
| 双语产品与文档站 | 发布英文根站与 `/zh/`，覆盖 Plugin、Skill、Adapter、四大概念、元评测、发布历史、边界与 Roadmap | Hugo strict build、公开内容检查与 Pages 工作流 |

## 01 · 当前 Context Artifact 的 Web 契约

- 验证日期（含时区）：2026-09-20，UTC+08:00。
- 版本/提交与环境：同上；本地源码候选。
- 来源与证据类型：本次实测；synthetic/local-runtime；无模型调用。
- 操作过程：以 Candidate Context v3 与 Historical Context v2 fixture 构造 completed 和 pending Job，读取 Dashboard snapshot 与 Job detail，检查 validation、capabilities、Compare/Gate 与 legacy fallback。
- 预期结果：Candidate v3 有效且按 mode 开启 Compare/Gate；Historical v2 由 protocol 识别且永不进入 Candidate promotion；旧 Context 继续按只读兼容策略处理。
- 实际结果：针对性测试通过；完整 Node 套件 596/596、Python 套件 321/321 通过。详见 [local-validation.txt](evidence/local-validation.txt)；CI 结果待补。
- 截图与补充证据：无截图；这是 Artifact 解析和能力映射修复，使用自动化测试/日志作为主要证据。
- 验证边界：证明本地 Web 数据契约与 UI capability gate，不证明真实模型结果、Promotion 决策质量或业务基线。
- 脱敏说明：临时目录和合成 digest；公开日志将移除本机绝对路径。

## 02 · 版本检查与安装身份

- 验证日期（含时区）：2026-09-20，UTC+08:00。
- 版本/提交与环境：同上；本地源码候选。
- 来源与证据类型：本次实测；synthetic/local-runtime；无 registry package 执行。
- 操作过程：检查完整与不完整安装身份、shell quoting、缓存/离线状态、Web routes、Settings 源码和 setup patch。
- 预期结果：浏览器不存在 `version-update` 执行入口；完整身份才生成精确命令；不完整身份 fail closed；setup 持久化所有更新所需字段。
- 实际结果：完整 Node 套件 596/596 通过；npm pack 为 0.9.7、53 个文件、约 464.2 kB，隔离安装/ESM import/CLI 均通过；浏览器无执行更新 route，setup 可保留非托管自定义配置。
- 截图与补充证据：无截图；测试覆盖命令文本、route surface 和配置写入。
- 验证边界：没有从浏览器或测试中执行 npm/Python 安装；setup 本身仍由用户在终端审阅后显式运行。
- 脱敏说明：仅使用合成路径。

## 03 · 双语产品站

- 验证日期（含时区）：2026-09-20，UTC+08:00。
- 版本/提交与环境：Hugo Extended 0.165.0、Go 1.27、OINK v1.0.0；GitHub Pages。
- 来源与证据类型：本次实测与公开 Pages；static-site/public-release；页面中的 Workbench 截图均标注 synthetic/版本边界。
- 操作过程：严格构建英文根站与中文 `/zh/` → 执行 public 目录泄漏/链接检查 → 检查关键概念、组件、图片和移动端溢出 → 核对 Pages workflow。
- 预期结果：双语页面可访问，核心 slogan 为“让 Agent 每一次都进步”，Plugin 19 个工具、Skill、Adapter、概念与 Roadmap 不遗漏且不夸大证据。
- 实际结果：0.9.7 文案使用 Hugo warning-strict 构建通过（99 EN / 97 ZH），public 检查通过（425 entries、10962564 bytes）；部署 run 与公开 URL 待补。
- 截图与补充证据：网站自带 26 个 visual groups；本次不复制已有站点素材到 release archive，使用 Pages artifact digest 与公开 URL 作为证据。
- 验证边界：静态站可访问不等于真实 Harbor Job 或外部供应商模型已经验证。
- 脱敏说明：`check_public.py` 检查构建产物中的本地路径和已知敏感模式。

## 测试与发布核对

| 项目 | 版本/提交、命令或来源链接 | 实际结果与边界 |
| --- | --- | --- |
| 与本次改动相关的测试/验收 | `npm run check`、Python `pytest`、Hugo strict build、`website/scripts/check_public.py`、[本地验证摘要](evidence/local-validation.txt) | Node 596/596、Python 321/321、网站 99 EN / 97 ZH 与 425-entry public 检查通过；19 个已记录 Harbor artifact-overlap warning；无真实模型调用 |
| npm 包与对应发布运行 | tag 触发 OIDC Trusted Publishing | 待发布并核对公开 tgz、provenance、隔离安装与入口 |
| PyPI wheel/sdist 与对应发布运行 | tag 触发 PyPI Trusted Publishing | 待发布并核对两个公开文件、隔离导入与 entrypoints |
| GitHub Release 与附件 | `v0.9.7` | 待创建 Release 并附包制品、验证 ZIP 与校验清单 |

## 未完成项与验证边界

- 本地完整 Node/Python/网站验证与 npm/Python 构建已完成；CI、tag、npm/PyPI、GitHub Release 和公开包烟测尚未执行，完成后逐项更新，不把候选状态写成已发布。
- Python 保留 19 个 Harbor artifact-overlap warning；首次本地 Node 并发运行还出现 1 次未复现的 durable-operation invalid-record 失败，focused/full rerun均通过，等待 CI Linux 独立核对。
- 未运行真实供应商模型、真实 Candidate/Historical Session 数据或付费 Harbor 评测，因此不外推业务质量结论。
- 默认 Host 模式不是 sandbox；same-origin 是浏览器 CSRF 防线而不是调用者身份认证；确定性 Gate 只针对固定输入且不等于 deployment。
- 浏览器端一键执行 registry 包的开发预览已撤回，不属于 0.9.7；0.9.7 只提供审阅后复制的精确终端命令。

## 发布入口与资料包

- 版本发布页：待创建 `https://github.com/istarwyh/harbor-self-evolving/releases/tag/v0.9.7`。
- 完整验收记录 / 相关提交或 PR：待填写正式 release-prep 提交和 CI run。
- 验证资料包：待上传 `harbor-0.9.7-verification.zip` 并填写公开下载链接。

归档提交完成后，将在 Release 中链接本文件的永久提交 URL。公开包、GitHub Release、验证 ZIP 与 Pages 是独立状态，分别核对后再宣称完成。
