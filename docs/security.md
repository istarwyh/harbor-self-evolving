# 安全边界

## 默认保证

- Candidate、Dataset、Stack、Policy 和 Job 路径必须位于 `projectRoot`。
- 身份文件、Stack 组件和 Web artifacts 拒绝符号链接逃逸。
- 子进程使用 argv 数组，不经过 shell。
- Manifest/Context 不记录环境变量或凭证。
- Web API 仅允许同源 GET，并设置 `no-store` 与 `nosniff`。
- Job/Trial API 有文件大小和分页限制；证据超长时带标记截断。
- `Authorization`、`Cookie`、token、API key、secret、password 和 request headers 等字段在 Web 返回前脱敏。
- Workbench 不渲染危险 HTML，也不返回完整原始 SSE。
- Historical Preview 不返回原始 Session id、正文或工具 payload；最终 Observation/Batch 对原始 id 做精确 canary 检查，命中即拒绝写入。
- Historical selection token 随机、短期、单次使用，并绑定调用 Session、exact-cwd、源 digest、Feedback 状态和已确认 Judge；任一变化都要求重新 Preview。
- `.harbor/private/session-batches` 按私有目录创建，逐级拒绝符号链接逃逸；已有 `.gitignore` 不会被静默覆盖。
- Historical Judge 使用短期 Host Broker capability；运行前互证 provider/model/reasoning、protocol、Job 和 Batch digest，令牌不进入 argv、Stack、Context 或 Job artifacts。
- Gate 只写报告，不部署、不切流量、不修改 Champion。

## 调用方仍需负责

- Candidate 在 Harbor 容器内执行；使用最小权限镜像和非生产凭证。
- 生产评测预构建依赖、锁定 npm/Python/镜像供应链，并按需关闭公网。
- 工具、搜索和业务 API 指向 sandbox/mock/测试租户。
- 原始 `result.json`、trajectory 和模型输出仍可能含隐私；为 Job 目录配置访问、保留和删除策略。
- 脱敏会话仍是业务证据；运行 Historical Job 前确认 `.harbor/private` 与 `jobs` 不会被意外提交，并配置明确的清理周期。
- Judge endpoint、模型版本和采样参数需要可复现；凭证只能运行时注入。
- Promotion Gate 是质量控制，不是安全沙箱或发布审批。
