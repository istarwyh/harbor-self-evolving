# npm 无长期 Token 发布

`publish-npm.yml` 使用 npm 官方 Trusted Publishing（GitHub Actions OIDC）。一次性信任配置完成后，推送正式版本 tag 即自动发布，无需每次本机 `npm login` 或输入 OTP。不保存 `NPM_TOKEN`，不关闭账户 2FA，不新增自定义发布校验、审批或验证脚本；项目原有 CI 测试保持不变。

## 一次性接入

将 `.github/workflows/publish-npm.yml` 合入 `main`，创建名为 `npm` 的 GitHub Environment，不添加额外发布审批。在 npm 包 `dsh-harbor-evolution` 的 Settings → Trusted Publisher 中配置：

| 字段 | 值 |
| --- | --- |
| Provider | GitHub Actions |
| Organization or user | `istarwyh` |
| Repository | `harbor-self-evolving` |
| Workflow filename | `publish-npm.yml`（不是完整路径） |
| Environment | `npm` |
| Publishing permission | 允许直接 `npm publish`，不只是 staging |

新增配置可能默认只允许 staged publishing；需明确允许直接发布，才不会要求逐次人工确认。由账户所有者在 npm 页面完成安全密钥/2FA 验证；不要向聊天发送密码、OTP 或 Token。账户重新验证、信任变更或平台风控仍可能要求人工处理。官方说明：[npm Trusted Publishers](https://docs.npmjs.com/trusted-publishers/)。

## 日常发布

版本改动经原有 CI 测试、审查并合入 `main` 后，创建并推送 `vX.Y.Z` tag。npm 和既有 PyPI 工作流分别自动发布。

每次发布把关键过程图及“改动、步骤、结果、边界”说明归档到 `docs/releases/vX.Y.Z/`，并把图集入口与资料包附到 Release。目录格式和示例见[发布变更与验证图集](releases/README.md)；这不新增自动校验或审批。

npm 构建 job 使用包目录的锁定依赖，通过已有 `prepack` 构建并打包；发布 job 下载同一次运行的 tarball，临时运行 npm 12.0.2 与 OIDC 发布，不原地覆盖 runner 自带的 npm。仅发布 job 有 `id-token: write`，发布 tarball 时不重复运行生命周期脚本。公开仓库/包的 OIDC 发布自动生成 provenance。

首次接入以真实发布成功为准，保存配置不代表授权已通过。发布完成后核对两处 registry 和 GitHub Release；两处 registry 不是原子事务，不能将一处成功称为整个版本发布完成。

失败时查看 npm/GitHub 的原生错误，修正后重跑失败 job。如果需要修复工作流，将修复合入 `main` 后用 `gh workflow run publish-npm.yml --ref main` 单独补发 npm，避免移动已公开的 tag 或重复触发 PyPI。手动入口打包所选 ref 的源码，操作前确认其 package 版本和待发布内容；不会自动替换为旧 tag。npm 不允许覆盖同版本，已经成功的发布不重复运行。OIDC 失败时检查精确的 owner/repo/workflow/environment 绑定及直接发布权限，不回退到长期 Token。
