# Harbor 0.9.4：普通提问自动理解当前页面

- 归档日期：2026-09-07，Asia/Shanghai（UTC+08:00）。按共享发布模板建立。
- 目标版本 / tag：`0.9.4` / `v0.9.4`。
- 产品源码：Harbor 功能提交 `8eef4d2`；配套 Host 功能提交 `6434fa78ca`，集成至最新 YourBuddy 主线后为 `d5e200d441`。最终公开制品与提交关系待发布后核对。
- 验收环境：macOS arm64、Node 22.22.2、pnpm 11.7.0；开发源码的真实 Loader、原生 Composer、Host 接纳、正式 Harbor resolver 和持久化 Session 日志。
- 数据与模型：synthetic / controlled-model，无密钥模型传输；没有真实提供方、Candidate 或 Docker 评测。
- 包发布状态：npm、PyPI、GitHub Release 均待发布及公开核对。
- 资料归档状态：7 张原始过程图与机器记录已归档；正式制品、CI 链接和可下载 ZIP 待补。

## 这次改了什么

看着 Harbor 结果直接在原生输入框提问，不必先点 Ask AI 或输入 `@harbor`。发送时自动冻结当前对象、勾选任务与列表筛选排序；已发送消息用一条可展开附件说明当时的对象。没有新增输入框、Context Capsule 或 Copilot 面板。

| 改动 | 用户可见的变化 | 证据 |
| --- | --- | --- |
| 自动页面引用 | 看 A 直接提问；切 B 不会改变上一条问题的对象 | 01、02 |
| 显式引用优先 | 已明确引用 A 时，不叠加当前 B | 03 |
| 失败恢复 | 准备失败不发送缺失上下文的问题；新草稿不会被旧失败覆盖 | 04、07 |
| 多选与筛选 | 勾选的具体成员、列表状态/有效性/排序都进入冻结上下文 | 06 |
| 持久化与可读性 | 正常重启后可恢复新引用；附件显示可读身份；浅色预览正文可读 | 01、02、06 与存储测试 |

## 如何体验与升级

普通消息自动上下文需要支持 `conversation.contexts.register` 的配套宿主。配套 YourBuddy 0.3.4 正在准备，正式安装包状态以其发布页为准；仅升级 npm Plugin 不会让旧 rc.8 宿主获得新能力。旧宿主仍支持 Ask AI / `@harbor` 显式引用。

在业务 Agent 工作区运行 `npx --yes dsh-harbor-evolution@0.9.4 setup --project-root "$PWD"`，按 setup 输出重启对应 Profile。已使用 YourBuddy 的用户应使用配套桌面更新，避免把开发 checkout 安装为机器本地链接。升级命令在该版本公开前不可用，本归档不会提前称其已安装验证。

最短体验：打开 Harbor → 打开任务或勾选多个任务 → 在原生输入框提问 → 展开消息内的 Harbor 附件核对对象。页面内可关闭自动附带；离开 Harbor、使用斜杠命令或已有显式引用时不添加隐式页面上下文。

## 过程图的共同来源与边界

以下 7 张图拍摄于 2026-09-07 11:23（UTC+08:00）前后的源码验收，拍摄时 Harbor 版本字段仍是 `0.9.3`，基线 `ee9bd3ef15667c27f1b156042e0bb01733f8bcb0` 加后来提交为 `8eef4d2` 的功能；Host 基线 `70cc6570c44e356100c3947ac1b7e303801c23dd` 加后来提交为 `6434fa78ca` 的功能。它们是本轮功能的历史原图，不是正式 0.9.4 安装包截图。浏览器 bundle SHA-256 为 `ef97477db1e0f842ae54f93bfb0f15a7d6aba56d8f8e10b39f69de6002e978ad`。

图 01–04、06 是真实 Harbor 页面；05、07 是经真实 Loader 加载的通用宿主测试插件，不冒充 Harbor。图中任务、业务文本及回答均为合成。图片未重绘或后期修改，公开前已检查可读性和敏感信息；没有真实凭据或业务数据。机器记录见 [acceptance.json](acceptance.json)。

## 01 · 看着任务 A，直接提问

- 操作：打开 `hfq-021`，不点 Ask AI、不输入 @，直接输入普通问题。
- 预期与实测：问题自动附带 A；受控模型实际调用 `harbor_resolve_page_context`，正式工具返回原 Session 的 A。浅色文档正文与标题对比度约 18.9:1。
- 边界：合成内容与受控模型不代表真实推理质量；截图不单独证明工具返回，需结合机器记录。

![Trial A 与普通问题](screenshots/01-synthetic-trial-a-ordinary-question.png)

## 02 · 原生消息内的可读附件

- 操作：发送 A 后打开 B 再提问，切到对话并刷新，展开 A 的附件。
- 预期与实测：旧附件仍是 A，下一条是 B；显示当时身份与时间，不显示协议 token。Harbor 场景 10 条已接纳用户消息与模型输入逐项一致。
- 边界：浏览器刷新与完整 Host 重启是不同验证；后者另由独立子进程存储测试覆盖。

![原生附件与冻结身份](screenshots/02-synthetic-native-conversation.png)

## 03 · 显式 A 优先于当前 B

- 操作：在 A 插入原生 Harbor 引用，再切 B 后发送。
- 预期与实测：只发送显式 A，不叠加 B；正式 resolver 返回 A。
- 边界：此图是发送前状态，发送后的唯一引用由断言与日志证明。

![当前 B 与明确引用的 A](screenshots/03-synthetic-explicit-a-overrides-page-b.png)

## 04 · 准备失败时保留问题

- 操作：让当前 Job 在测试目录中暂时不可读，再发送普通问题。
- 预期与实测：显示失败提示、保留草稿，不接纳消息也不调用模型；恢复 Job 后可重试。
- 边界：故障由测试控制，未改动用户项目；未接纳由机器断言证明。

![明确失败与保留的草稿](screenshots/04-synthetic-failure-preserves-draft.png)

## 05 · 图片与上下文共存

- 操作：在通用测试插件页面只发送图片。
- 预期与实测：图片、空用户文本块与独立上下文块同时保留，页面协议不作为用户正文显示。
- 边界：通用宿主能力测试，不是 Harbor 页面或真实视觉模型测试。

![图片消息与上下文附件](screenshots/05-synthetic-image-with-page-context.png)

## 06 · 多选和列表筛选直接提问

- 操作：勾选 A/B 提问；清空选择，仅设置 completed、有效与最低分优先后再提问。
- 预期与实测：第一条固定两个具体成员，第二条携带列表筛选排序；不传自由搜索原文。后续改筛选与插件卸载重载都不改变原引用成员。
- 边界：列表筛选不会自动扩大成全 Job 选区；插件重载不等于完整桌面进程重启。

![多选成员及列表筛选的冻结附件](screenshots/06-synthetic-selection-and-filter-attachments.png)

## 07 · 失败 A 不覆盖正在写的 B

- 操作：发送 A 的准备尚未完成时输入 B，再令 A 准备失败。
- 预期与实测：B 不变，A 在原生“未发送消息”条目中可找回；B 占用输入框时恢复按钮禁用。发送 B 后可恢复 A，恢复本身不发送，再发送时捕获当前页面。
- 边界：通用宿主测试；失败消息只保留在当前浏览器会话，不是跨刷新发件箱。

![失败消息与未被覆盖的新草稿](screenshots/07-synthetic-failed-a-preserves-draft-b.png)

## 测试与发布核对

| 项目 | 来源 | 实际结果与边界 |
| --- | --- | --- |
| 功能开发回归 | 功能提交 `8eef4d2` / `6434fa78ca` | Harbor 589/589；Host GUI 3947 通过、1 跳过；5 个浏览器用例连续两次 replay 通过 |
| 私有引用存储 | `context-snapshots`、`trial-selection`、`service-ui-context` | 独立复核 40/40：真实子进程、缓存到期、同 Session/project、漂移、权限/FIFO/symlink、并发与 Git 忽略 |
| 0.9.4 冻结依赖、测试与包构建 | [本地验证摘要](evidence/local-validation.txt) | npm ci、Node 589/589、CPython 3.12.14 / Python 318/318、52 文件 npm 包及 wheel/sdist 构建通过；包内容与源码一致，离线隔离安装及 Node/Python 入口、三个 Python entrypoints、两个 Harbor 插件加载通过 |
| npm 发布与公开安装包 | 官方 OIDC 工作流 | 待核对 |
| PyPI wheel / sdist | 官方发布工作流 | 待核对 |
| GitHub Release / ZIP | 下方正式入口 | 待核对 |

## 未完成项与验证边界

- 失败消息暂不跨浏览器刷新恢复；新页面引用持久化只覆盖正常重启与缓存到期，不保证断电、磁盘损坏或项目迁移后的恢复。旧版内存 token 不迁移。引用元数据在准备/绑定时即可落盘，即使消息最终失败；当前没有自动清理。
- 历史 Host 全量 Web 验收曾有两项未关闭失败：remote-welcome 的代理 socket 断连、hmr-live 的 Node 22 加载钩子启动错误。本轮最新主线集成复核结果待补，不能将历史失败称为通过。
- 未运行真实提供方、Candidate/Docker、业务质量基线或完整 PRD 验收；有界诊断/操作运行器等既有缺口仍按产品验收记录说明。
- 发布、来源一致性、测试通过与截图可见是不同证据，不能相互代替。

## 发布入口与资料包

- 版本发布页：[Harbor v0.9.4](https://github.com/istarwyh/harbor-self-evolving/releases/tag/v0.9.4)（待发布）。
- 功能源码：[Harbor 功能提交](https://github.com/istarwyh/harbor-self-evolving/commit/8eef4d2dc91ca168646bb81cf923d7d892e55f73)、[配套 Host 集成功能提交](https://github.com/istarwyh/yourbuddy/commit/d5e200d4415f5d951374dd7794762b542057d0f9)（待远端提交）。
- 验证资料包：待上传 `harbor-0.9.4-verification.zip`；包含本说明、机器记录和 7 张相对路径图片。
- 发布交付清单：按共享索引逐项核对，公开核对与离线 ZIP 校验完成前不声明交付完成。
