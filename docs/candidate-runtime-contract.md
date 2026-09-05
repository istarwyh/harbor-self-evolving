# Candidate 自有 ACP 运行时契约

## 边界：保留真实 Agent，移除示例应用耦合

Harbor 不需要 `dsh-acp-demo` 才能执行 Candidate。Candidate 自己拥有并冻结 ACP 启动程序、Cordis 配置、Agent 组合以及完整 npm 锁文件。Adapter 只负责校验、安装、注入受限模型网关和管理生命周期；协议通信与 ATIF 轨迹仍复用 Harbor 的 ACP Runner。

不能为了“跑通”把 Candidate 换成直接调用模型的脚本。提示词、工具、Agent Loop、会话与持久化行为仍属于被测程序。此契约也不要求每个 Candidate 使用 Quick diagnostic 模板；模板只是一个可执行的、明确不具备晋级资格的 DSH 组合。

## 描述文件与不可变身份

可执行 Candidate 在自身目录中提供 `candidate-runtime.json`：

```json
{
  "schema_version": 1,
  "transport": "acp",
  "entrypoint": "run-acp.mjs",
  "config_path": "cordis.yml",
  "agent_entry_id": "wiring-agent",
  "node_version": "22.22.2"
}
```

约束如下：

- `entrypoint` 是 Candidate 内已有的 `.js`、`.mjs` 或 `.cjs` 源码。它接受 Adapter 传入的绝对 `--config` 路径；不是任意 shell 命令或待解析的 npm 包名。
- 源码路径必须留在 Candidate 内，不允许符号链接、父目录跳转或 `node_modules`、`.git`、`.harbor-runtime` 等保留目录。
- `agent_entry_id` 指向 `config_path` 文件中唯一、启用的直接顶层插件入口，并显式声明插件名。不能透明地把模型补丁打进另一个 include 文件或嵌套 group。组合需要隐藏内部实现时，应像模板一样使用 Candidate 自有 composition 插件。
- `node_version` 是不低于 Node 22 的精确发行版本。运行环境必须匹配，不自动通过 nvm 安装或切换。
- `package-lock.json` 必须为 v3，根名称、版本和依赖声明与 `package.json` 一致；直接依赖使用精确版本。每个锁定包都有精确版本、无凭据的 HTTPS 制品地址和 SHA-512 integrity，不接受本地链接或未锁定分发。

描述文件、入口程序、配置和锁文件都纳入 Candidate 文件摘要。Manifest 中的 runtime 身份由这些源文件导出，并包含 descriptor、entrypoint、lockfile 三个摘要；不能只改 Manifest 元数据就换执行器。

Adapter 安装前按已核验文件清单生成独立暂存副本，再次验证摘要。Host 的 `node_modules`、缓存、`.git` 不会作为安装制品上传。不要把 `.env`、`.npmrc` 或任何供应商凭据加入 Candidate。

## 两阶段检查，不把“静态合法”当作“运行成功”

1. **确认前的静态检查。** Node 执行入口和 Python Doctor 校验 Candidate 自有 runtime。Doctor 还验证模型 overlay 可确切命中声明的入口；成功标记为 `CANDIDATE_RUNTIME_VERIFIED`。缺少这个能力标记的旧 Adapter 不能执行新契约。Bounded diagnostic 的计划也必须携带完整 runtime 身份，确认后重新验证输入。
2. **获准启动后的 Task 内检查。** Adapter 检查精确 Node 版本、所需基础命令以及 `/opt/harbor-acp-venv` 中的 `agent-client-protocol==0.12.1`。环境不足时明确失败，不临时安装另一套 Node、SDK 或 ACP 应用。
3. **同锁安装。** 执行 `npm ci --omit=dev --ignore-scripts --no-audit --no-fund`，隔离 Host npm 配置和缓存。不回退到 `npm install`，不使用 `--force` 或 `--legacy-peer-deps`。
4. **无评测提示词的 ACP readiness。** 用同一个已安装 launcher 完成 `initialize → session/new`，设置超时，并禁止通过本项目网关发起模型请求。这里只证明协议和会话可用，不证明任务完成。
5. **正式运行。** Harbor ACP Runner 启动同一份已安装入口，保留 Task 工作目录、发送真实任务提示词并采集事件和 ATIF。此时才可能消费 Host Broker 授予的模型额度。

阶段 2–4 会创建 Task 环境并可能下载公开依赖，不属于确认前的只读计划，也不是一次成功的业务评测。

供应商凭据始终留在 Host。Candidate 只获得该次执行的受限 Broker 通道及短期 lease token 文件；模型 provider/model 身份是非秘密元数据。运行时 overlay 只替换声明入口的模型绑定、插入网关插件，不替换 Candidate 的提示词、工具或执行循环。

## 旧 Candidate 与旧基线

历史快照没有 `candidate-runtime.json` 时仍可读取、展示和比较。它不能执行：Doctor 返回 `CANDIDATE_RUNTIME_UNBOUND`，bounded plan 返回安全的 `HARBOR_DIAGNOSTIC_RUNTIME_UNAVAILABLE`。非法绑定对应 `CANDIDATE_RUNTIME_INVALID`，不自动回退到 demo 或 `latest`。

为旧 Agent 增加入口、调整依赖、Node 版本或 ACP 组合，都是 Candidate 内容变化。应在新的 Candidate 版本中完成，然后运行新的 baseline；不能改写历史失败记录或把旧评分归给新运行时。Node 插件与 Python Adapter 需要一起更新，不能把“Doctor 没报告新错误”误认为旧 Adapter 理解新契约。

## Quick diagnostic 模板与制品来源

可发布资源位于 `packages/harbor-plugin/src/harbor_dsh_evolution/runtime_template/`，共 7 个文件：包声明、完整锁文件、描述文件、Cordis 配置、自有入口、自有有序组合以及 Task Dockerfile。Python wheel 包含全部资源。

该组合按 core services → persistence → checkpoint policy → ACP transport 顺序激活，按反向顺序卸载。入口不加载 Host `.env`、Profile 或用户 Patch；收到 EOF/终止信号时等待卸载和持久化 I/O，不用 `process.exit(0)` 截断写入。

模板采用公开发布的 DSH 核心包 `0.1.1-rc.2`。为避免松散 peer 解析到另一套 Cordis，另外固定 `cordis@4.0.1`、`cordis-plugin-loader@1.0.2`、`cordis-plugin-group@1.0.1`、`cordis-plugin-include@1.0.6` 和 `cordis-plugin-timer@1.1.3`。这些是模板的实现选择，不是 Adapter 对业务 Candidate 的包名硬编码。依赖闭包不含 `dsh-acp-demo` 或 `agent-spine-demo`。版本与依赖来自[公开 npm 元数据](https://registry.npmjs.org/@deepseek-ai%2Fdsh-app-boot/0.1.1-rc.2)及[相容 Cordis 元数据](https://registry.npmjs.org/@deepseek-ai%2Fcordis/4.0.1)。

Dockerfile 基于[官方 Node 镜像](https://hub.docker.com/_/node) `node:22.22.2-bookworm-slim`，固定多架构 index：

```text
sha256:9f6d5975c7dca860947d3915877f85607946403fc55349f39b4bc3688448bb6e
```

镜像预装 Python、curl、coreutils、bash 和固定 [ACP Python SDK 0.12.1](https://pypi.org/project/agent-client-protocol/0.12.1/)。Candidate 的 npm 依赖仍由同一锁文件在 Task 内安装，不把 Host `node_modules` 烘焙进镜像。固定基础镜像和 SDK 不代表所有系统包字节永远不变；每次构建的实际 image ID 仍是运行证据的一部分。

## 2026-09-06 已完成的验证及边界

- 匿名公开 registry 生成完整 v3 锁文件，正常 `npm ci` 成功；未用强制或忽略 peer 冲突选项。锁含 root 加 53 个包记录，当前平台省略不适用的可选制品后安装 36 个包。
- Linux **arm64** 镜像真实构建成功，Node `22.22.2`、ACP SDK `0.12.1` 校验通过。专用验收镜像 ID 为 `sha256:90a4c8e2ec90da6384537676b148cac4dc1ae7540486fb715a14a98888ec09ad`；它是本机验收制品，不是已发布的镜像频道。
- 在该镜像内从模板锁文件干净安装，并实际导入全部 DSH composition 模块，`npm ls --omit=dev --depth=0` 通过。
- 通过真实 `DshCandidateAgent.setup/run`、Harbor `DockerEnvironment`、Python ACP Runner 和生产 Host Broker 的受控流，完成 readiness、一次 Agent Loop、`end_turn`、2 步 ATIF、15 条持久化事件及资源清理。setup 模型请求为 0，正式运行受控请求为 1，真实模型供应商调用为 0；Candidate 摘要未改变。
- 验收自有容器和网络均清理，镜像保留供后续复核。amd64 虽存在官方基础镜像条目，**本轮没有实际运行 amd64**。
- 最终代码回归：Node `npm run check` 469 项通过，Python `pytest` 301 项通过；客户端构建、npm 打包、Python sdist/wheel 构建和 `git diff --check` 均通过。从 wheel 隔离安装后再次生成 Quick diagnostic，全部资源可用且锁定运行时校验通过。最终代码再次执行上述 Linux 链路成功。此处记录实现验收，正式发布状态以 npm、PyPI 和 GitHub Release 的实际制品为准。

以上证明安装、协议、真实执行路径及证据链可用，不证明业务效果。受控模型流不是供应商模型质量验收，Quick diagnostic 的 wiring 分数不是业务质量评分；真实供应商任务、完整 12-Trial AC-04 和新的业务 baseline 仍需各自完成，不能借用上述结果宣称通过。
