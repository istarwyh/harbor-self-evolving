# 文档导航

本页按使用场景整理 Harbor Self-Evolving 的文档，并区分**当前说明**与**历史证据**。首次使用从根目录 [README](../README.md) 和 [DSH Web 快速开始](dsh-web-quickstart.md) 开始；设计、验收与发布归档不应替代当前操作说明。

## 快速选择

| 你想做什么 | 从这里开始 | 继续阅读 |
| --- | --- | --- |
| 安装并确认产品可用 | [项目 README](../README.md) | [DSH Web 快速开始](dsh-web-quickstart.md)、[故障诊断](troubleshooting.md) |
| 接入自己的 Agent / Dataset | [接入指南](integration.md) | [架构](architecture.md)、[Candidate 运行时契约](candidate-runtime-contract.md) |
| 开发或升级 Evaluator | [Evaluator 接口](evaluator-interface.md) | [架构](architecture.md)、[安全边界](security.md) |
| 了解隐私、凭据与权限边界 | [安全边界](security.md) | [故障诊断](troubleshooting.md) |
| 开发或调试本仓库 | [项目 README：示例与源码开发](../README.md#示例与源码开发) | [npm Plugin README](../packages/dsh-plugin/README.md)、[Python Adapter README](../packages/harbor-plugin/README.md) |
| 准备发布 | [Trusted Publishing](npm-trusted-publishing.md) | [发布归档规范](releases/README.md) |
| 核对当前验收边界或某版证据 | [当前验收状态](acceptance-status.md) | [发布图集索引](releases/README.md)、[历史归档](archive/README.md) |

## 当前产品文档

以下文档描述当前主线行为，功能或接口变化时应同步更新：

| 文档 | 受众 | 内容边界 |
| --- | --- | --- |
| [项目 README](../README.md) | 所有用户 | 产品定位、正式安装、主要能力、示例和生产边界 |
| [DSH Web 快速开始](dsh-web-quickstart.md) | 首次使用者 | 安装、重启、UI 检查、第一次 Historical 诊断和常见问题 |
| [接入指南](integration.md) | Agent / 评测工程师 | Candidate、Dataset、Evaluation Stack、DSH 工具顺序和 CI/CD |
| [架构与稳定进步](architecture.md) | 架构师、维护者 | 角色、身份、Context、Trial 生命周期、数据流和 Gate 边界 |
| [Candidate 运行时契约](candidate-runtime-contract.md) | Candidate 开发者 | ACP 入口、锁文件、运行时身份、静态与动态检查、迁移要求 |
| [Evaluator 接口](evaluator-interface.md) | Evaluator 开发者 | Descriptor、输入输出协议、Criteria、受控编辑和元评测 |
| [安全边界](security.md) | 安全审查者、运维 | 路径、凭据、会话历史、Broker、证据保留和调用方责任 |
| [故障诊断](troubleshooting.md) | 使用者、运维 | projectRoot、Dataset、Historical Job、Apple Silicon 和错误码 |

当前版本说明中的几个易混点：

- 正式安装使用 npm `setup`，源码开发才使用 `./hse dsh-install-source web`。
- Plugin 注册 **19 个** Harbor 工具。
- Web 的“评测最近会话”自动选取最多 **3 条**会话；Agent/Skill 的 `harbor_session_diagnostic_preview` 可显式请求最多 **10 条**。
- 支持 `conversation.contexts.register` 的宿主会为 Harbor 页面中的普通消息冻结页面上下文；旧宿主仍需显式 Ask AI / `@harbor`。
- Historical Job 是诊断路径，不运行 Candidate，也不能进入 Promotion Gate。

## 示例与包级文档

- [DeepResearch 示例](../examples/deep-research/README.md)：完整 Candidate、Dataset、Evaluator、产物与 Gate 示例。
- [Shell Minimal 示例](../examples/shell-minimal/README.md)：不依赖 DSH 业务组合的最小 Harbor Candidate。
- [npm Plugin](../packages/dsh-plugin/README.md)：安装器、19 个工具、Web Workbench 和 Host 集成细节。
- [Python Adapter](../packages/harbor-plugin/README.md)：Harbor entry point、CLI、开发与构建命令。
- [Evaluator 初始化参考](../packages/dsh-plugin/skills/evolve-agent-with-harbor/references/initialization.md)：官方 Skill 使用的初始化流程。
- [Evaluator 升级参考](../packages/dsh-plugin/skills/evolve-agent-with-harbor/references/evaluator-upgrade.md)：官方 Skill 使用的受控升级流程。

## 历史、验收与发布资料

这些文档用于审计“当时验证了什么”，其中的版本号、未完成项和旧宿主限制是历史快照，不应直接作为当前操作说明：

- [当前验收状态](acceptance-status.md)：只保留当前能力边界和仍未完成项。
- [历史验收账本](archive/ai-workbench-acceptance-ledger.md)：跨版本累积记录；其中较新的条目会明确 supersede 较早结论。
- [`releases/`](releases/)：每个正式版本的变更、截图、日志、公开制品和验证边界。
- [`archive/design/`](archive/design/)：已被当前产品文档取代的长篇设计与实施过程记录。
- [CHANGELOG](../CHANGELOG.md)：按版本汇总的发布变更。

阅读历史资料时优先看文档顶部的日期、版本/提交、证据类型与验证边界。遇到冲突时，当前主线文档与最新正式发布记录优先，历史结论保留但不回写成“当时已经实现”。

## 文档维护约定

1. 根 README 只保留产品入口和关键概念；详细步骤放到 `docs/`，包实现细节放到各包 README。
2. 当前行为变化时，至少检查本页、根 README、Web 快速开始、接入指南和对应包 README。
3. 新增或移除工具时，同步工具总数与完整列表；Web 与 Agent 的不同默认值必须分别标注。
4. 发布证据只追加到对应版本目录，不改写旧版本当时的验证结论。
5. 设计文档应显式区分“目标架构”“当前实现”和“未来工作”，避免把计划描述成已交付能力。
