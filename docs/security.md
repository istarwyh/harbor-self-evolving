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
- Gate 只写报告，不部署、不切流量、不修改 Champion。

## 调用方仍需负责

- Candidate 在 Harbor 容器内执行；使用最小权限镜像和非生产凭证。
- 生产评测预构建依赖、锁定 npm/Python/镜像供应链，并按需关闭公网。
- 工具、搜索和业务 API 指向 sandbox/mock/测试租户。
- 原始 `result.json`、trajectory 和模型输出仍可能含隐私；为 Job 目录配置访问、保留和删除策略。
- Judge endpoint、模型版本和采样参数需要可复现；凭证只能运行时注入。
- Promotion Gate 是质量控制，不是安全沙箱或发布审批。
