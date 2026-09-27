# Harbor 0.10.3：项目目录权限恢复与源码安装可靠性

- 归档日期（含时区）：2026-09-27 UTC+08:00 CST
- 目标发布版本 / tag：`0.10.3` / `v0.10.3`
- 被验证的产品版本 / 提交：发布前工作树；正式 tag commit 待发布后补录
- 验收环境：macOS 15.6.1 arm64；Node.js 22.19.0；YourBuddy / DSH Web；GitHub clean Linux runner 待核对
- 数据与模型：无需评测数据或模型调用；本次为 Web 错误恢复、服务端错误协议与源码安装修复
- 包发布状态：待核对 npm、PyPI 与 GitHub Release
- 资料归档状态：源码、构建产物与本地针对性回归已准备；正式 workflow、公开 package artifacts、checksums 与 verification ZIP 待发布后补录

## 这次改了什么

| 改动 | 用户可见的变化或解决的问题 | 验证资料 |
| --- | --- | --- |
| 稳定目录权限错误 | 当前 Session 项目目录被操作系统拒绝读取时，服务端返回脱敏且稳定的 `HARBOR_PROJECT_ROOT_ACCESS_DENIED`，不再把本地路径或原始 `EPERM/scandir` 当作产品语义 | 场景 01；`packages/dsh-plugin/test/service.test.js` |
| 可执行恢复提示 | Workbench 明确说明这不是网络故障，给出 macOS 文件夹权限、完全磁盘访问与迁移项目目录的步骤；技术详情默认折叠，可复制恢复步骤后重试 | 场景 02；`packages/dsh-plugin/test/client-state.test.js` 与构建后 client bundle |
| 精确错误分类 | 只有 `scandir` / `readdir` / `opendir` 等目录读取拒绝进入项目目录恢复提示；普通文件 `open` 的 `EACCES` 不被误判 | 场景 01；针对性回归 |
| 源码开发安装可靠性 | `dsh-install-source` 在宿主 `NODE_ENV=production` 时仍显式安装锁定 dev dependencies，避免 React / esbuild 被 npm 省略 | 场景 03；`packages/dsh-plugin/test/setup.test.js` 与真实 source setup |
| 协调版本 | npm Plugin、Skill 与 Python Adapter 对齐为 0.10.3 | package metadata 与正式 workflow artifacts（待核对） |

## 01 · 项目目录权限错误协议

- 验证日期（含时区）：2026-09-27 UTC+08:00 CST
- 版本/提交与环境：0.10.3 发布前工作树；macOS arm64；Node.js 22.19.0
- 来源与证据类型：本次源码实测；synthetic filesystem error
- 操作过程：构造带 `EPERM + scandir` 的目录读取错误 → 交给服务端规范化 → 检查稳定错误码、cause 保留与本地路径脱敏 → 对普通 `EACCES + open` 检查不误分类
- 预期结果：目录访问拒绝得到稳定且无路径的产品错误；非目录错误保持原始类别
- 实际结果：本地针对性测试通过；完整 Node 检查共 635 tests passed，Python 共 378 tests passed
- 截图与补充证据：`packages/dsh-plugin/test/service.test.js`、`packages/dsh-plugin/test/client-state.test.js`
- 验证边界：合成错误验证协议和分类，不声称替代所有 macOS TCC、Windows ACL 或 Linux 权限场景
- 脱敏说明：错误 fixture 中的路径仅为合成值；规范化结果断言不包含该路径

## 02 · Workbench 恢复引导

- 验证日期（含时区）：2026-09-27 UTC+08:00 CST
- 版本/提交与环境：0.10.3 发布前工作树；DSH Web client bundle
- 来源与证据类型：用户反馈驱动的源码修复；synthetic source/bundle verification
- 操作过程：将稳定错误码和原始 `EPERM/scandir` 输入客户端规范化 → 构建 Web client → 检查中英文标题、恢复步骤、折叠技术详情、复制按钮与响应式布局进入 bundle
- 预期结果：用户看到原因和具体恢复动作，而不是“重试并检查网络”；技术细节仍可查看
- 实际结果：客户端构建与针对性状态测试通过；正式 GUI 重启后的人工截图未纳入公开归档
- 截图与补充证据：`packages/dsh-plugin/src/client/index.jsx`、`packages/dsh-plugin/lib/client.js`、`packages/dsh-plugin/test/client-state.test.js`
- 验证边界：源码与 bundle 证明交互已构建；未在发布前为公开资料复制包含用户 Session、本机路径或系统隐私设置的真实截图，也不替代跨平台视觉验收
- 脱敏说明：无用户会话截图或本地路径进入归档

## 03 · 源码开发安装保留 dev dependencies

- 验证日期（含时区）：2026-09-27 UTC+08:00 CST
- 版本/提交与环境：0.10.3 发布前工作树；宿主环境 `NODE_ENV=production`
- 来源与证据类型：真实本地 source-development setup + synthetic command-capture test
- 操作过程：运行 `./hse dsh-install-source web` → setup 执行 `npm ci --ignore-scripts --include=dev` → 构建 client → link Plugin 并安装本地 Python Adapter → 检查 `node_modules/react/index.js` 仍存在
- 预期结果：生产宿主环境不会让源码 checkout 丢失 React、esbuild 等开发依赖；安装和后续测试可继续执行
- 实际结果：真实 source setup 完成，Harbor 0.21.0 集成验证通过，React dev dependency 保留；正式 clean Linux workflow 待 tag 后核对
- 截图与补充证据：`packages/dsh-plugin/lib/setup.js`、`packages/dsh-plugin/test/setup.test.js`
- 验证边界：验证当前 macOS source-development 安装和命令参数；不代表所有 npm 配置组合
- 脱敏说明：公开记录不包含用户 DSH_HOME 或绝对本机路径

## 测试与发布核对

| 项目 | 版本/提交、命令或来源链接 | 实际结果与边界 |
| --- | --- | --- |
| 与本次改动相关的测试/验收 | `npm run check`；`npm pack --dry-run`；`uv run --frozen pytest`；`uv build` | 本地 Node 635 tests passed；Python 378 passed（20 条既有 artifact overlap warning）；npm dry-run 81 files；Python wheel/sdist 构建成功。当前机器未安装 Hugo，网站由 main/tag clean Linux CI 的 warning-strict job 验证 |
| npm 包与对应发布运行 | 待发布 | 待核对公开版本、可下载制品及对应关系 |
| PyPI wheel/sdist 与对应发布运行 | 待发布 | 待核对公开版本、可下载制品及对应关系 |
| GitHub Release 与附件 | 待发布 | 待核对图集入口、下载与制品一致性 |

## 未完成项与验证边界

- 正式 tag、clean Linux CI、npm/PyPI OIDC workflow、公开 registry、package artifact 摘要与 GitHub Release 待发布后核对。
- 未执行付费/真实 Provider Candidate Job；本次修复不涉及 Evaluator、评分、Gate 或业务质量逻辑。
- 未把用户会话截图、真实本机路径或系统隐私设置截图纳入公开 evidence；源码/bundle 测试不能替代最终用户设备上的完整视觉验收。
- YourBuddy 桌面应用的 Developer ID 签名、Team ID、macOS usage description 和原生“打开系统设置”能力不属于本仓库，本版本未修复这些宿主层问题。

## 发布入口与资料包

- 版本发布页：待发布
- 完整验收记录 / 相关提交或 PR：待发布
- 验证资料包：待上传 `harbor-0.10.3-verification.zip`

发布后将补录 tag commit、workflow、公开 registry、artifact 摘要与 Release 附件；不移动已公开 tag。
