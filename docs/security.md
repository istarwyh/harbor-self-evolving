# 安全边界

## 默认保证

- DSH 工具只能访问 `projectRoot` 下的 Candidate、Dataset、Job 和 policy。
- Harbor 子进程使用 argv 数组启动，不启用 shell。
- Candidate manifest 不记录主机绝对路径或环境变量。
- Candidate 安装依赖时禁用 npm lifecycle scripts。
- Gate 只写报告，不修改 Champion、不部署、不切流量。

## 调用方仍需负责

- Candidate 代码本身会在 Harbor 容器中执行；请使用最小权限容器和非生产凭证。
- 示例 Task 开启公网是为了安装 npm 包；稳定生产评测应预构建依赖并按需关闭网络。
- npm/Python 包和容器基础镜像需要供应链扫描与版本固定。
- 工具调用、搜索和业务 API 必须指向 sandbox、mock 或测试租户，避免真实付款、消息发送和数据删除。
- Job 证据可能包含模型输出和工具结果；上传或长期保存前应做隐私与保留策略审查。

Promotion Gate 是质量控制，不是安全沙箱，也不是发布审批系统。
