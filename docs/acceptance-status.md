# 当前验收状态

本文只描述当前主线的验收边界。逐版本证据以[发布图集](releases/README.md)为准；开发过程和曾经被后续版本取代的结论保存在[历史验收账本](archive/ai-workbench-acceptance-ledger.md)。

## 已交付的主线能力

- DSH Plugin、官方 Skill 与 Harbor Adapter 可通过正式 `setup` 安装，并提供 19 个 Harbor 工具。
- Evaluation Workbench、Historical Session 诊断、Candidate Evaluation、Evaluator 治理与 Promotion Gate 已形成受控流程。
- 支持 `conversation.contexts.register` 的宿主会在 Harbor 页面发送普通消息时冻结页面或选区上下文；显式 Ask AI / `@harbor` 优先。
- Web 的 Historical 快速入口最多选择 3 条最近合格会话；Agent/Skill 工具可显式请求最多 10 条。
- Candidate 使用自有、锁定的 ACP 运行时；Host Model Broker 不向 Candidate 暴露上游凭据。

## 仍未完成或未被现有证据证明

- 有界诊断与基础设施重试尚未接入通用运行器；预检会明确阻断未注册动作。
- 长任务 Operation、可重放事件/outbox 和完整 Phase 1 审计身份仍未全部完成。
- 自动跨 Host View 切换不在当前承诺中；导航动作只准备对象并提示用户打开 Harbor。
- 生产级 RBAC、发布审批、部署与流量切换不由 Harbor Workbench 实现。
- 现有合成数据、受控模型和组件测试不等于真实供应商质量、业务 Candidate 基线或完整 PRD 验收。
- Historical Job 是诊断证据，不能进入 Promotion Gate；Evaluator 可靠性仍需要独立 Ground Truth 元评测。

## 证据入口

- [0.9.6 发布记录](releases/v0.9.6/README.md)：默认 Host 执行、Docker 显式可选与执行环境可比性。
- [0.9.5 发布记录](releases/v0.9.5/README.md)：紧凑首页、强制页面上下文与历史会话数据边界。
- [0.9.4 发布记录](releases/v0.9.4/README.md)：普通消息自动页面上下文与失败恢复。
- [0.9.3 发布记录](releases/v0.9.3/README.md)：原生对话精简与 Historical 快速入口。
- [Candidate 运行时契约](candidate-runtime-contract.md)：锁定运行时及受控模型链路。
- [历史验收账本](archive/ai-workbench-acceptance-ledger.md)：旧迭代的测试、截图边界和被后续版本取代的结论。

更新当前能力时修改本页；历史记录只归档，不回写成新的验收结论。
