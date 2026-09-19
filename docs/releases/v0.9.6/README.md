# Harbor 0.9.6：默认 Host 执行与文档归档整理

- 归档日期（含时区）：2026-09-19，Asia/Shanghai（UTC+08:00）。
- 目标发布版本 / tag：`0.9.6` / `v0.9.6`。
- 被验证的产品版本 / 提交：`codex/release-0.9.6` 工作区候选；正式提交、tag 与发布后归档提交待发布流程完成后补录。
- 验收环境：macOS 15.6.1 arm64、Node 22.22.3、npm 10.9.8、pnpm 11.25.0、uv 0.12.5、Python 3.12.14；真实源码与本地 Host 运行时。
- 数据与模型：没有运行真实 Candidate、Historical Session 或外部模型评测；测试使用临时目录、合成任务和进程级 fixture。
- 包发布状态：待核对 npm、PyPI 与 GitHub Release。
- 资料归档状态：本地测试记录随发布候选归档；公开制品记录、资料 ZIP 与校验清单待发布后补录。

## 这次改了什么

| 改动 | 用户可见的变化或解决的问题 | 验证资料 |
| --- | --- | --- |
| 默认 Host 执行 | setup、普通评测、Historical Session 和有界诊断默认不再依赖 Docker；Agent、Verifier 与任务命令直接以当前用户运行 | Python `HostEnvironment` 测试、Node 执行环境与 launcher 测试、`./hse doctor` |
| Docker 显式可选 | 需要原行为时可设置 `executionEnvironment: "docker"` 或传入对应 CLI 选项 | Node 环境解析测试与现有 Docker 回归测试 |
| 执行环境身份 | Candidate Context v3、Historical Context v2 记录环境和运行时指纹，Promotion 拒绝跨环境比较 | Context、Schema、Plugin 与 Promotion 测试 |
| 宿主机路径与生命周期 | Harbor 逻辑路径映射到 Trial 本地目录，支持日志挂载、文件传输、超时与进程组清理 | `test_host_environment.py` 与生成脚本回归测试 |
| 文档归档整理 | 当前能力、历史验收、旧设计和逐版本证据分层，不再保留重复 verification 副本 | 文档一致性测试与 Git rename/diff 审查 |

## 01 · Host 执行器与默认选择

- 验证日期（含时区）：2026-09-19，UTC+08:00。
- 版本/提交与环境：同上；本地源码候选。
- 来源与证据类型：本次实测；synthetic/local-runtime；无模型调用。
- 操作过程：运行 Python 与 Node 完整测试 → 执行 Host runtime check 与 `./hse doctor` → 检查默认 Harbor 参数和显式 Docker 参数。
- 预期结果：默认选择 `host`，不检查或调用 Docker；显式 `docker` 保留既有参数；Host runtime 满足 Bash/Node/npm/ACP SDK 要求。
- 实际结果：本地验证通过；详细命令与计数见 [local-validation.txt](evidence/local-validation.txt)。
- 验证边界：证明执行器、路径、生命周期、上下文与 launcher 契约；没有执行真实模型支持的完整 Harbor Job，不证明业务评测质量或外部供应商可用性。
- 脱敏说明：记录仅包含公开版本号、测试计数与仓库内相对路径，无凭据、个人会话或业务内容。

## 02 · 包构建与文档归档

- 验证日期（含时区）：2026-09-19，UTC+08:00。
- 版本/提交与环境：同上；npm 与 Python 本地构建候选。
- 来源与证据类型：本次实测；local-build；无模型调用。
- 操作过程：构建提交版 Web client → npm dry-run 打包 → Python wheel/sdist 构建 → 检查 Git diff、文档版本一致性与 shell 语法。
- 预期结果：两个包均声明 0.9.6，生成 client 无漂移，包包含新增 Host 执行模块；文档链接与版本号一致。
- 实际结果：本地验证通过；公开 registry 与 Release 对应关系待 tag 发布后核对。
- 验证边界：本地包构建不等于 registry 已发布，发布状态只依据公开索引、工作流和下载制品核验。
- 脱敏说明：无敏感内容。

## 测试与发布核对

| 项目 | 版本/提交、命令或来源链接 | 实际结果与边界 |
| --- | --- | --- |
| 与本次改动相关的测试/验收 | `./hse test`、`./hse doctor`、`harbor-dsh host-check`、[本地验证摘要](evidence/local-validation.txt) | 本地结果见记录；无真实模型或付费评测 |
| npm 包与对应发布运行 | 待发布后补录 | 待核对公开版本、tgz、provenance 与安装入口 |
| PyPI wheel/sdist 与对应发布运行 | 待发布后补录 | 待核对公开版本、两个文件、入口与安装导入 |
| GitHub Release 与附件 | 待发布后补录 | 待核对正式 tag、三个包制品、验证 ZIP 和校验清单 |

## 未完成项与验证边界

- 未运行真实供应商模型、真实 Candidate/Historical Session 数据或付费 Harbor 评测；因此不将自动化测试结论外推为业务质量基线。
- 默认 Host 模式按产品要求不提供容器隔离、用户切换、网络策略或 CPU/内存限制，任务以当前用户权限直接运行。
- macOS arm64 是本轮本地实测平台；Linux x64/arm64 由 CI 运行包测试，但没有额外真实宿主机评测旅程。
- 发布工作流、公开制品与资料附件需要在正式 tag 后独立核对，不能由本地构建成功提前推断。

## 发布入口与资料包

- 版本发布页：待发布后补录。
- 完整验收记录 / 相关提交或 PR：待发布后补录。
- 验证资料包：待上传 `harbor-0.9.6-verification.zip` 后补录。

发布后归档提交会补全永久链接、公开摘要与验证边界，不移动已公开 tag，不覆盖或重发同版本包。
