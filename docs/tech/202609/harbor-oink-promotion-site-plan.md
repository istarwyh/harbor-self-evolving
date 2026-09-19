# Harbor Self-Evolving 宣传与介绍网站方案（OINK）

> 状态：方案设计，待确认后实施
>
> 日期：2026-09-19
>
> 最新正式发布基线：Harbor Self-Evolving `0.9.6`（Beta），包含 `dsh-harbor-evolution 0.9.6` 与 `harbor-dsh-evolution 0.9.6`；兼容 Harbor `>=0.21,<0.22`
>
> 调研时本地 HEAD：`8bb59e2`，本地 `main` 领先 `origin/main` 1 个提交；其中一键更新能力尚未推送、未打 tag、未进入 0.9.6 发布证据，不作为已发布能力宣传
>
> 建站基线：OINK Starter commit `137843b25bacd76ddd1f7ce71330bf2e3155b954` / OINK theme `v1.0.0` / Hugo Extended `0.165.0` / Go `1.27`
>
> 核心目标：把仓库中已经存在、但分散在 README、架构文档、发布证据和产品界面里的价值，组织成一个**能解释产品、能指导上手、能证明边界、也便于人和 Agent 阅读**的中英双语网站。

## 1. 决策摘要

本方案建议为 Harbor Self-Evolving 建设一个以 OINK 为基础的静态网站，首版放在当前仓库的 `website/` 子目录，随产品版本共同评审和发布；使用 GitHub Pages 作为第一条生产部署路径，后续有独立域名需求时再迁移到 Cloudflare Pages。

网站不是 README 的放大版，也不是把所有历史 Markdown 原样搬上网页，而是分成四个互相支撑的层次：

1. **宣传层**：30 秒说明 Harbor 解决什么问题，为什么“自进化”必须受控。
2. **理解层**：用四个业务概念、两条评测路径和一个确定性 Gate 讲清设计理念。
3. **行动层**：让用户按正式安装方式完成第一次 Historical Session 诊断，或接入自己的 Candidate/Dataset。
4. **证据层**：公开架构边界、发布证据、截图来源、未完成项和“不代表什么”，避免把演示、测试和真实业务质量混为一谈。

建议采用以下网站总叙事：

> **让 Agent 每一次都进步**
>
> Harbor Self-Evolving 把评测集、生成器、评测器和优化器编译成身份固定、证据可追溯、结果可比较的评测流程，一次只做一个受控改动，并由与优化器分离的 Promotion Gate 裁决。模型输出和分数仍可能有随机性；确定性只属于给定输入下的 Gate 逻辑。

首屏不使用“全自动变强”“自动部署”“自我改写生产 Agent”等夸张说法。Harbor 的真实价值不是让 Agent 无约束地修改自己，而是把“声称变好”变成“有固定尺子、有完整证据、可比较、可拒绝的进步”。

## 2. 调研依据与事实优先级

### 2.1 当前项目的一手资料

网站内容以以下文件为事实来源。**正式能力**只以最新正式 tag 中的 schema / 实现、公开 npm/PyPI 制品和对应发布证据为准；本地 HEAD 或远端未打 tag 的源码即使已实现，也只能进入“开发中 / 未发布”区域。其后再参考根 README 与 acceptance-status、其他当前文档和历史归档。不能仅因文件位于 `docs/` 或当前 checkout 中，就假设它属于已发布产品：

| 主题 | 主要来源 | 网站用途 |
| --- | --- | --- |
| 产品定位、安装、19 个工具、用户入口 | [项目 README](../../../README.md) | 首页、安装页、产品总览 |
| 当前文档边界与导航 | [文档导航](../../README.md) | 网站内容治理与文档入口 |
| 角色、Context、Trial、Gate | [架构与稳定进步](../../architecture.md) | 架构页、设计理念页 |
| Candidate / Dataset / Stack 接入 | [接入指南](../../integration.md) | 接入教程、工作流页 |
| 第一次使用 | [DSH Web 快速开始](../../dsh-web-quickstart.md) | Quick Start、FAQ |
| 当前已交付与未完成项 | [当前验收状态](../../acceptance-status.md) | 能力边界、可信声明 |
| 路径、凭据、历史会话和 Broker 边界 | [安全边界](../../security.md) | 安全与治理页 |
| 版本演进 | [CHANGELOG](../../../CHANGELOG.md)、Git tags | “前世今生”时间线 |
| 每版可见证据与验证边界 | [发布图集](../../releases/README.md) | Evidence / Releases |
| 最新版本验证 | [0.9.6 发布记录](../../releases/v0.9.6/README.md) | 当前版本、验证边界 |
| 包身份与能力 | [npm Plugin README](../../../packages/dsh-plugin/README.md)、[Python Adapter README](../../../packages/harbor-plugin/README.md) | 安装、开发、架构细节 |
| Plugin 实际能力与已知差距 | `packages/dsh-plugin/index.js`、`lib/`、`src/client/`、`test/` 与对应正式 tag | 19 tools、Web/Settings/Context/Operation、安全边界、Roadmap；当前 checkout 差异必须单列未发布 |

内容生产必须保留两个原则：

1. **历史设计稿说明当时想做什么，正式发布证据说明已发布版本实际验证了什么。** 历史文档不能被摘句包装成已交付能力。
2. **未进入正式 tag、CHANGELOG 和 release archive 的代码只能标记为“未发布候选”。** 例如调研时本地 HEAD `8bb59e2` 已加入设置页显式一键更新，但本地 `main` 仍领先 `origin/main` 1 个提交，包版本也仍为 0.9.6；在推送并完成新版本发布证据前，不得把它写成公开 0.9.6 能力。

#### 当前已发现的文档漂移

实施网站前先做一次事实校正，不能直接复制以下旧表述：

| 漂移点 | 当前事实 | 网站处理 |
| --- | --- | --- |
| `docs/architecture.md`、Python Adapter README 以及 bundled Skill 的部分段落仍写 Candidate Context v2 | 0.9.6 schema / source 已是 Candidate Context v3；Historical Context v2 | 同步 Skill / Docs / Website 为 v3 / v2，并让 contract test 检查协议而不是只检查关键词 |
| `docs/security.md` 写“Web API 仅 GET”“子进程不经 shell”“Candidate 在容器” | 当前存在受限同源 POST；HostEnvironment 默认通过 shell 执行；Host 是默认环境 | 不复制绝对表述，按具体路由和执行环境说明 |
| troubleshooting 仍把 Docker preflight 写成默认路径 | 0.9.6 默认 Host，Docker 显式 opt-in | 安装与排错页以 Host 默认为准 |
| Host execution 技术方案顶部仍写“待实现” | 0.9.6 release 已证明核心方案落地 | 该文件只用于解释设计理由，不用于判断状态 |
| README 对“Candidate 不会得到其他 Host 凭据”的表述过宽 | Model Broker 不下发上游模型凭据，但 Host 进程继承宿主环境；默认 Host 不是隔离边界 | 网站只声明 Broker 的精确保证，并要求运行方清理环境或显式选 Docker |
| Web Dashboard 的 Candidate Context capability/validation 仍只认 schema v2 | 0.9.6 Adapter 已产出 Candidate Context v3，但 `dashboard.js` 的 `capabilityMap` / `schemaIssue` 未同步；真实 Candidate v3 Job 会被标为 unsupported/read-only legacy 与 invalid，并关闭 Compare/Gate。Historical v2 会被现有 `schema_version === 2` 分支接受，但缺少显式 protocol-aware 契约测试 | 作为 P0 兼容缺陷公开处理；修复并补 Candidate v3 / Historical v2 contract tests 前，不把 Candidate Web Compare/Gate 截图当成 0.9.6 完整支持证据 |
| 本地 HEAD 已有一键更新，README 仍写“不会静默安装”且 0.9.6 无此按钮 | `8bb59e2` 的同源 POST 会在 Host 上执行精确 registry 版本的 setup，写 DSH profile 和 managed Python runtime，并要求重启；当前调用未传 profile、jobsDir、executionEnvironment，可能更新错误 profile 或把自定义配置重置为默认值 | 0.9.6 页面只介绍版本检查与复制命令；一键更新放“未发布”，在继承并复核现有配置、补并发/回滚/供应链边界和一致文档前不得发布 |

### 2.2 OINK 一手资料

建站设计基于 OINK 官方资料：

- [Use OINK Starter](https://oink.pgsty.com/docs/start/starter/)
- [Starter repository tour](https://oink.pgsty.com/docs/start/anatomy/)
- [Organizing content](https://oink.pgsty.com/docs/write/organize/)
- [Home and landing pages](https://oink.pgsty.com/docs/customize/home/)
- [Search](https://oink.pgsty.com/docs/customize/search/)
- [AI-agent support](https://oink.pgsty.com/docs/customize/agents/)
- [Analytics and SEO](https://oink.pgsty.com/docs/admin/analytics/)
- [Deploy](https://oink.pgsty.com/docs/admin/deploy/)
- [License and acknowledgements](https://oink.pgsty.com/docs/about/license/)

OINK Starter 没有 `v1.0.0` tag；本方案审计并固定 Starter commit `137843b25bacd76ddd1f7ce71330bf2e3155b954`，该版本的 `go.mod` 固定 OINK theme `v1.0.0` 与 Go `1.27`，workflow 固定 Hugo Extended `0.165.0`。实施继续固定 Starter 参考 commit、theme tag / `go.sum` 与工具链，不跟随 `main` 或 `latest` 隐式漂移。

## 3. 对当前项目的统一理解

### 3.1 Harbor 解决的问题

Agent 很容易生成一个新版本，也很容易解释为什么“看起来更好”；困难的是回答以下问题：

- 到底评测了哪个不可变版本？
- 用的是不是同一批任务、同一把尺子和同一个 Judge？
- 数字是有效业务分数，还是基础设施失败留下的原始 reward？
- 改进来自 Candidate，还是 Dataset、Evaluator、Renderer 或运行环境变化？
- 一处提升是否以另一处回归为代价？
- 优化器是否在给自己判分？
- 评测完成是否被误当成了生产发布授权？

Harbor Self-Evolving 的设计答案是：把自进化限制在一个有身份、有证据、有比较合同的实验边界中。

### 3.2 用户实际获得的三件产品

| 交付物 | 用户价值 | 网站上的表达方式 |
| --- | --- | --- |
| `dsh-harbor-evolution` DSH Plugin | Evaluation Workbench、19 个严格工具、原生结果卡片和设置诊断 | “看见评测发生了什么” |
| `evolve-agent-with-harbor` Skill | 从四个概念开始，完成初始化、Baseline、诊断、回归和 Gate | “知道下一步应该做什么” |
| `harbor-dsh-evolution` Adapter | Candidate 与 Historical 两类评测、不可变证据、Summary 和 Gate 边界 | “让身份和证据可追溯，让结果可以在明确前提下比较” |

`examples/` 是参考实现，不是正常安装的前提；本项目官方 Skill 由本项目维护，不表示 DeepSeek 官方背书。网站页脚和 FAQ 都应明确这一点。

### 3.3 六条核心设计理念

#### 1. 先固定身份，再讨论分数

Candidate、Dataset、Evaluation Stack、模型、执行环境和 Policy 都有明确身份。没有可靠身份，所谓“v2 比 v1 好”没有可审计基础。

#### 2. 先验证分数，再聚合分数

`raw_rewards` 是审计数据；只有满足输入、Agent、Integration、Renderer、Judge 和 Schema 硬约束的 `score.valid=true` 才能进入 Population 和 Gate。基础设施错误不能显示成业务质量 `0`。

#### 3. 诊断与晋级分开

Historical Generation Evaluation 用真实历史记录发现问题，但固定为 diagnostic、Gate N/A；正式晋级必须回到固定 Dataset、不可变 Candidate 和可比较 Context。

#### 4. 优化器不能自我裁判

Optimizer 只能基于 evidence refs 提出一个受控改动；Promotion Gate 由独立、确定性的 Policy 判断。Job 完成不等于 Gate 通过，Gate 建议也不等于已经部署。

#### 5. 一次只改变一个受控面

每个优化假设都必须说明证据、根因、预期指标、允许和禁止的改动面、护栏及回滚条件。新版本使用新 Candidate identity，不能覆盖 Baseline。

#### 6. 权限和部署在 Harbor 之外

Harbor 负责 `Candidate → evaluation evidence → promotion decision`，不替代 CI/CD、镜像仓库、生产审批、RBAC 或流量切换。

### 3.4 两条互补的用户路径

#### 路径 A：用已有会话冷启动

```text
最近完成的 DSH Sessions
→ 安全预览与用户确认
→ 冻结、脱敏的 Generation Records
→ 1 Session = 1 Trial
→ 评分或证据不足时明确弃权
→ Population / Generator Diagnosis
→ 一个受控改进建议
```

价值：无需先手写 Dataset，就能从真实完成记录中发现重复问题。

限制：不重新执行 Candidate、不证明 Evaluator 可靠、不进入 Promotion Gate，也不自动修改 Agent。

两个入口的选择范围必须分别说明：

- Web 的“评测最近会话”通过当前 DSH Session Query 从可访问历史中抽取最多 3 条，来源可跨项目目录，评测结果仍写入选定 workspace；这是有界近期样本，不是全历史排名。
- Skill / Agent 工具保持 `exact-cwd`，可显式预览最多 10 条。网站不能把两者统称为“当前工作区最近历史”。

#### 路径 B：正式 Candidate 评测与回归

```text
Candidate Snapshot + Dataset Validate + Architecture Doctor
→ Context Preview
→ Baseline Job
→ 读取有效分数、Trial evidence 与根因
→ 一个受控改动
→ Comparable Regression Job
→ Promotion Gate
→ 外部 CI/CD 决定是否发布
```

价值：在固定评测语义下证明一个新 Candidate 是否真的值得晋级。

#### Evaluator 协议按场景区分

网站技术页不能笼统写成“系统只有 Evaluator v1”：Candidate / Workbench 的受控治理接口使用 `harbor-dsh-evaluator/v1` Descriptor，把 `script` 与 `llm-as-judge` 统一起来；Historical 路径使用支持 applicability、Criterion coverage 与 abstention 的 v2 evaluation input/result 语义。页面应先讲用户概念，再按 Candidate 与 Historical 两种场景链接相应协议。

### 3.5 Harbor 的“前世今生”

网站不应只罗列版本号，而应讲清项目从“能跑一次评测”走向“能证明稳定进步”的过程。

| 阶段 | 版本与日期 | 关键变化 | 叙事标题 |
| --- | --- | --- | --- |
| 原型：让 Candidate 进入 Harbor | `0.1.0`，2026-08-17 | 不可变 Candidate、ACP 评测、Job 证据、确定性 Gate | 从一次实验开始 |
| 方法：让 Agent 知道如何进化 | `0.2.0` | 官方 Skill，需求澄清、Baseline、诊断、回归、晋级报告 | 从工具变成方法 |
| 产品化：不再要求用户改模板 | `0.3.x` | Plugin + Skill + Adapter，一条命令安装，正式包与源码开发分离 | 从模板变成产品 |
| 可见：把证据带进 DSH Web | `0.4.0` | 原生 Harbor Tab、工具卡、设置诊断、海洋/鲸鱼视觉 | 从命令行进入工作台 |
| 严格：建立可比较的评测架构 | `0.5.0` | 八角色 Stack、Manifest、Context、Doctor、Contract、结构化 Gate | 固定“谁”和“尺子” |
| 治理：让分数本身也值得检查 | `0.6.x` | Evaluator 统一接口、Trial Lifecycle、Score Validity、Population、元评测 | 不盲信 reward |
| 降低门槛：从四个概念开始 | `0.7.x` | Dataset / Generator / Evaluator / Optimizer；Host Model Broker；调用 Session 隔离 | 严格，但不把复杂度推给用户 |
| 冷启动：评测已经发生过的真实工作 | `0.8.x` | Historical Generation Evaluation、脱敏 Session Batch、`completed-unscored`、快速入口 | 没有 Dataset，也能开始诊断 |
| AI 原生协作：从对象直接提问 | `0.9.0–0.9.5` | Workbench 对象引用、证据读取、建议草稿、普通消息页面上下文、后台任务 | 让证据进入同一个对话 |
| 当前正式版：默认 Host 执行 | `0.9.6`，2026-09-19 | 默认不依赖 Docker、Context 记录执行环境、Host/Docker 不可混比 | 更低门槛，边界更诚实 |
| 本地未发布候选 | `8bb59e2`，本地 `main` ahead `origin/main` 1，无新 tag | 设置页显式一键更新 Plugin / Skill / Adapter，完成后仍需重启 | 只进开发进度，不进正式能力卡 |

历史页必须额外说明：`0.9.1` 的公开发布未完成，其修复最终由 `0.9.2` 承接；时间线不把未发布版本包装成正式交付。调研时本地 HEAD 的一键更新也必须放在“未发布”区域，不能归入 0.9.6。

### 3.6 DSH Plugin：不能被缩减成“19 个工具”

`dsh-harbor-evolution` 是用户与 Harbor Self-Evolving 交互的主产品面，不只是把 Python CLI 包成 Agent Tools。网站必须同时介绍它的五层职责：

1. **安装与装配**：把精确版本的 npm Plugin、内置 Skill、受管 Python Adapter 和 DSH profile 装成一套可启动的产品。
2. **Agent 编排**：通过 19 个严格工具和 `evolve-agent-with-harbor` Skill 完成初始化、评测、诊断、治理和 Gate。
3. **原生 Web 体验**：在现有 DSH GUI 中注入 Harbor Tab、Workbench、Settings 和原生 Tool 卡片，不另造聊天产品。
4. **Host 边界服务**：管理 project/workspace、Session、模型 Broker、上下文快照、证据读取、操作记录和版本状态。
5. **权限与证据边界**：把路径、身份、批准、脱敏、限流、乐观并发和“不自动部署”落实到代码路径。

网站不得只放一个工具名单后跳过 Web、Skill、Broker、Settings、操作恢复或安全边界。也不得把 Plugin 写成“全自动优化器”：它固定实验边界、呈现证据并承接经审阅的动作，但 Candidate 变更、Gate 通过和生产部署仍需要各自的权限链。

#### 3.6.1 Plugin 组成与 DSH 注入面

| 组成 | 当前职责 | 网站必须说明的用户价值 |
| --- | --- | --- |
| `setup` CLI | 创建受管 Python venv、安装同版本 Adapter、写精确 npm 依赖与 id-targeted profile override、验证 Harbor plugins | 一条正式命令得到完整集成；普通用户不需要 clone 或 `link:` |
| Bundled Skill | 以 Dataset、Generator、Evaluator、Optimizer 四个业务概念引导确认；选择最窄模式；约束每轮报告 | 用户先讲业务问题，Skill 再编译严格 Stack，不把内部角色问卷化 |
| 19 个 Agent Tools | 初始化、校验、运行、读取、上下文、Evaluator 治理、Meta-Evaluation、Gate | Agent 可以调用同一套受约束能力，而不是拼接任意 shell 命令 |
| `EvolutionService` | Agent 与 Web 共用的 Host-side 服务、workspace/Session 隔离、bounded read、action orchestration | Web 与 Agent 读到同一份受控事实，不各自实现一套语义 |
| Candidate Model Runtime | 固定 provider/model/reasoning，发放短期 Broker capability，限制请求数、请求体和输出体 | Candidate 不拿上游模型密钥；模型身份进入 Candidate/Job 证据 |
| Historical Session bridge | 发现最近已完成 DSH Sessions，生成 owner-bound token，冻结脱敏 Batch，一 Session 一 Trial | 没有现成 Dataset 也能从真实历史建立诊断起点 |
| Web Client | Harbor Tab、Workbench、Composer 上下文、Settings、Tool cards、后台任务 | 证据不只存在 JSON；用户可以在对象上继续与同一 Agent 对话 |
| Evaluator governance | Descriptor inspection、受控文件编辑、版本升级、独立 GT 与 Meta-Evaluation | 评测器本身也能被版本化验证，而不是被当作永远正确的黑盒 |
| Action governance | AI action draft、Preflight、人工复核、幂等确认、本地 append-only journal、恢复检查 | 建议与执行分离；长任务失败时保留证据，不偷偷重试 |

服务端 Plugin 依赖并使用 DSH 的 `tools`、`skills`、`llm`、`agentDefaultModel` 和 `sessions`；Web Client 使用 locale、Session、现有 conversation/input，以及 `conversation.view`、`conversation.input.dock`、Settings 和 Tool View 插槽。网站应将这种“原生接入”作为产品差异点，而不是暗示 Harbor 自己维护第二个 Composer、第二份会话历史或独立登录体系。

#### 3.6.2 正式安装与运行生命周期

正式安装页按真实实现解释以下顺序：

1. 从业务 Agent 工作区运行 `npx --yes dsh-harbor-evolution@latest setup --project-root "$PWD"`。
2. Setup 检查 profile、projectRoot、jobsDir 和执行环境，在用户数据目录创建受管 Python venv。
3. 安装与 npm Plugin 同版本的 `harbor-dsh-evolution`，写入 exact-version DSH profile override，并验证 `dsh-evolution`、`dsh-historical-evaluation` 两个 Harbor plugins。
4. 用户按输出从同一个 Agent 工作区重启 DSH，打开 Harbor Tab 或调用 `/evolve-agent-with-harbor`。
5. Host 是默认执行环境；Docker 只是显式 opt-in。两者都要作为 Context 身份的一部分，不能把跨环境结果直接视为可比。

源开发必须单列：只有修改或调试本仓库时才使用 `./hse dsh-install-source web`；不能向普通用户推荐 `dsh plugin add ./packages/dsh-plugin`，因为它会生成机器本地 `link:`、绑定 checkout 路径并漏装 Python Adapter。

#### 3.6.3 19 个 Agent Tools 全量目录

工具页不能只按名称罗列；每个工具必须同时展示输入边界、是否写入、输出证据和下一步。当前 19 个工具完整分组如下：

| 分组 | Tool | 核心用途 | 写入 / 权限边界 |
| --- | --- | --- | --- |
| Candidate 身份 | `harbor_candidate_snapshot` | 将 Cordis composition 固定为不可变 Candidate Manifest | 写 Candidate manifest；一次性 approval |
| Candidate 身份 | `harbor_model_binding` | 读取当前 DSH 默认 provider/model/reasoning，返回非敏感 binding 草稿 | 只返回草稿，不写文件、不暴露凭据 |
| 初始化 | `harbor_evolution_init` | 把四概念确认卡编译成 non-overwriting Evaluation Stack 项目 | 创建项目文件；一次性 approval |
| 初始化 | `harbor_evolution_doctor` | 在昂贵 Job 前校验 Stack、Dataset、Candidate、Policy 和执行环境 | 只读诊断；不启动 Job |
| 初始化 | `harbor_quick_diagnostic_init` | 为一个 Query 创建最小、非晋级的 Harbor 1.4 wiring diagnostic | non-overwriting 写入；一次性 approval |
| Historical | `harbor_session_diagnostic_preview` | 在调用 Session 的精确 cwd 只读预览最多 10 个最近完成的顶层 Sessions | 只返回安全元数据和 15 分钟 owner-bound token |
| Historical | `harbor_session_diagnostic_run` | 重新校验 token/source，冻结私有脱敏 Batch，并以一 Session 一 Trial 运行 Historical Job | 写 Batch / Job；一次性 approval；Gate N/A |
| Dataset | `harbor_dataset_validate` | 校验 manifest、task 唯一性、指令、路径、敏感 metadata 和 source digest | 只读校验 |
| Context | `harbor_context_preview` | 刷新 Candidate Manifest，预览 Candidate Context v3 和可比较 Baseline | 因刷新 manifest 而需要一次性 approval |
| Evaluation | `harbor_eval_run` | 运行 diagnostic 或 promotion-eligible Candidate Job | 写 Job；一次性 approval；身份全固定 |
| Read | `harbor_eval_result` | 读取 summary、job、dataset、progress、trial 或 governance 视图 | bounded、递归脱敏、untrusted envelope |
| UI Context | `harbor_resolve_page_context` | 解析当前 Session 的 opaque `@harbor` 快照，返回窄 metadata、typed refs 和导航 action | 只读；校验 Session、project、Job/Trial 与 revision；durable retention 见安全页 |
| Evidence | `harbor_get_evidence` | 按 typed ref 读取一个 Evidence，严格验证 Workspace → Job → Trial → Criterion → Evidence 祖先链 | 只读、bounded、脱敏；不得猜路径 |
| Reviewed actions | `harbor_propose_action` | 对显式请求生成可过期 action draft | 只生成建议；不写资源、不跑 Job、不 Gate、不部署 |
| Evaluator | `harbor_evaluator_inspect` | 读取 Descriptor、implementation kind、Criteria 和有限 editable sources | 只读、bounded、敏感值省略 |
| Evaluator | `harbor_evaluator_update` | 在 optimistic concurrency 下复制并修改 allowlisted source，生成新 Evaluator / Stack 身份 | 写新版本；一次性 approval；不自动评测或 Gate |
| Meta-Evaluation | `harbor_ground_truth_init` | 创建带独立 provenance 的 non-overwriting Ground Truth 草稿 | 写 GT 草稿；一次性 approval |
| Meta-Evaluation | `harbor_evaluator_meta_evaluate` | 将重复 observations 与独立 GT 对比，生成 ESF、SCE、RCR 报告 | 写 meta-evaluation report；一次性 approval |
| Promotion | `harbor_candidate_compare` | 对 Baseline 和 Candidate Job 应用确定性 Promotion Gate | 写比较/Gate 产物；一次性 approval；不部署 |

以上 10 个 workspace / Job 写操作通过 DSH `tools/pre-execute` 进入一次性用户 approval；如果 Host 没有该 approval seam，Plugin 应 fail closed，而不是降级为无确认执行。网站在 Tool Reference 里为每个工具加 `Read-only`、`Writes local artifacts`、`Starts evaluation`、`Promotion eligible` 四个显式徽标。

#### 3.6.4 Bundled Skill 必须单独讲清

官方 Skill 不是营销 prompt，而是 19 个工具的使用协议。Skill 页面至少覆盖：

- 首次接入始终保留 **Dataset / Generator / Evaluator / Optimizer** 四个用户概念；Integration、Renderer、Rubric、Diagnoser、Runner、Reporter、Judge、Contract、Policy、Context 和 Gate 是编译后的高级架构。
- 没有显式 Dataset 时先走 Historical Preview，展示入选 / 排除、Judge identity、脱敏数据范围、成本与本地保留，再等待确认；有显式 Dataset 时不得擅自替换为 Session 历史。
- “使用当前 Agent 模型”会创建不可变 model binding，不是跟随聊天模型的实时指针；换模型必须形成新 Candidate 身份。
- Quick diagnostic 和单 Query 只能证明 wiring / 局部诊断，不能当晋级证据。
- 每轮优化先读完整 Dataset 级证据，再提出一个受控假设；不把 Trial recommendation 当作新 reward，也不自动应用 Candidate 修改。
- Evaluator 优化要求独立 GT、raw review provenance、tuning / holdout 边界和新 Evaluator / Stack 身份；Meta-Evaluation 当前是独立 artifact workflow，不伪装成 Historical Job 或专用 Job kind。
- 每轮报告必须同时给出 identities、coverage、score validity、代表性证据、不可比较原因、一个优先优化建议、Gate 结果或 N/A，以及“外部 CI/CD 仍需执行”。

网站可把这部分做成“Agent 会怎样协助你”的交互式步骤，而不是向用户展示 376 行 Skill 原文；完整原文和 eval cases 则进入 Source / Reference 链接。

#### 3.6.5 DSH Web 能力全景

| Web 面 | 0.9.6 发布实现面 | 展示重点 |
| --- | --- | --- |
| Harbor Dashboard | 多 workspace 发现、Job health/attention、状态与 stale-safe 刷新、Historical 快捷入口 | 首屏不是一堆 JSON，而是“哪些 Job 需要处理” |
| Object-first Workbench | Summary、Trials、Pipeline、Optimization、Compare/Gate、Evaluator/Rubric、Artifacts、Audit 八个 section | 同一 Job 从身份到证据、结论和原始审计贯通 |
| Pipeline | Candidate、Dataset、Integration、Renderer、Judge、Meta、Reporter、Optimizer、Gate 九个阶段 | 明确哪个阶段生成了什么，不把失败都归成低分 |
| Trial Explorer | 服务端分页、状态 / score validity 筛选、排序、Trial detail、Evidence focus、最多 1000 个成员的冻结 Trial-set | 支持从 Population 到 badcase，再回到固定选择集 |
| Business Artifact preview | 页面、文档、结构化和 raw output 的安全预览 | 让网站 / 报告类 Candidate 的真实产物可见；无产物时明确提示 |
| Page Context → Conversation | 支持 Host 时普通发送自动冻结当前页面；`Ask AI` / `@harbor` 显式引用优先且 one-shot；typed evidence refs 与 stale flags | 不靠“模型猜你在看哪页”，对象身份与提问一起进入同一会话 |
| Native Tool Cards | 所有 Harbor Tools 有 compact result card；证据和 proposal 支持 typed navigation，并可恢复 workspace、分页、stage、filters、sort、focus、Baseline 与 scroll | Tool 结果能回到具体对象，但不会偷偷切换 Host Tab |
| Historical Launcher | Web 自动取最近最多 3 个已完成 Sessions，先预览 Judge、数据 / 成本披露，再确认后台运行并打开结果 | 与 Agent Tool 的“精确 cwd、最多 10 个”明确区分 |
| Evaluator Editor | `script` / `llm-as-judge` Descriptor allowlist、source fragment、浏览器草稿恢复、冲突检测、强制新 Evaluator / Stack 版本 | 修改评测规则必须可审阅、可追踪，不原地改历史身份 |
| Ground Truth / Meta | Governance 和 Meta-Evaluation 视图，显示独立 GT 状态与 ESF / SCE / RCR | 评测器的质量与 Candidate 质量分开治理 |
| Reviewed Actions | 7 类 action：Candidate draft、Evaluator draft、Compare、Diagnostic Evaluation、Infrastructure Retry、Gate Request、Deployment Handoff | Candidate/Gate/handoff 只保存草案；Compare 只读；执行能力必须经 Preflight 与确认 |
| Background Operations | 诊断任务列表、进度、部分证据、取消、进程 / 资源只读检查、显式解除锁、结果导航 | 页面收起不等于停止；未知状态不伪装成已结束，也不自动重试 |
| Settings / Doctor | 当前 projectRoot、来源与 process-local 切换，Stack / jobs / CLI 检查，credential policy，npm 新版本检查 | Agent Tools 始终以调用 Session cwd 为权威，Settings root 主要服务 Web / fallback |
| Localization | 中英文词典、响应式页面、dark/light 视觉命名空间 | 首版双语站应复用同一术语表，不另造产品词汇 |

**已知发布缺陷必须与能力表同页出现**：当前 0.9.6 Web Dashboard 尚未接受 Candidate Context v3，导致新 Candidate Job 的 `contextSupported`、artifact validation、Compare 和 Gate 能力判断错误；Historical v2 虽可读取，但当前是被通用 `schema_version === 2` 分支偶然覆盖，缺少 protocol-aware 测试。站点实施前应优先修复并补跨 Plugin/Adapter contract test；修复发布前，Workbench 表只能描述“发布实现面”，不能声称 Candidate v3 的 Web Compare/Gate 已完整可用。

Web 当前不是独立站点：它作为 DSH Web client injection 运行。宣传站截图必须来自实际注入后的 `http://127.0.0.1:17890` 产品面，而不是单独启动 Vite 后伪造一个没有 `window.__DSH_BOOT__` 的页面。

#### 3.6.6 Plugin 的信任、安全与“不做什么”

| 边界 | 当前机制 | 网站必须避免的误导 |
| --- | --- | --- |
| Session / project 隔离 | Agent Tool 每次以调用 Session 的绝对 cwd 为 projectRoot；Web token 绑定 Session 与 projectRoot；Candidate、private context/journal 等敏感路径另有 symlink / `O_NOFOLLOW` 检查 | 不说“切换 Settings root 会重定向其他 Agent Session”；通用 `resolveWithin` 目前只是 lexical prefix，realpath/openat 级物理 containment 仍是 Roadmap |
| Evidence 读取 | 证据、Agent-facing JSON 和 source 均有条数 / 字节 / 文本上限、递归 credential redaction，并显式标为 untrusted | 不说“Agent 可以读取任意 Job 文件” |
| Web API | GET / POST 做浏览器 same-origin 检查；mutation 是 bounded JSON POST（256 KiB），响应 `no-store` / `nosniff` | same-origin 只是浏览器 CSRF 防线，不是 caller 鉴权；当前必须限可信 loopback。Evaluator / Historical / action 已带 Session owner，但 project-root 与未发布 updater 仍有 Sessionless 高影响路径 |
| Context token | Host 重新验证稳定 id、revision、对象祖先链并绑定 Session / project；内存 registry 有 TTL，但 durable snapshot 当前可在 TTL 后或 Host restart 后恢复，drift 只读 | 不把 `@harbor` 当作可分享的永久链接；应公开 retention / replay 现状，并把最终失效、撤销和 GC 列入 Roadmap |
| Selection token | Historical Preview token 绑定 owner、时间和 source identity；Run 前全部重新验证 | 不把 Preview 结果当作已经冻结的 Job |
| Model Broker | Candidate 仅得到随机、短期 Job capability；provider/model/reasoning 固定；请求次数、请求体和响应体有上限 | 只承诺“不下发上游模型凭据”，不承诺 Host 环境没有其他秘密；request/byte limits 也不是 Token、费用或 provider billing hard cap |
| Host runtime | Host 默认继承当前用户权限和环境，使用 shell 执行，无 network / CPU / memory 隔离 | 不能把默认 Host 称为 sandbox；高风险任务应清理环境或显式用 Docker |
| Mutation | 10 个 Agent 写工具需要一次性 approval；Evaluator save 用 expected digest 和新版本；action confirmation 幂等并记 journal | 不把“同源”写成完整授权模型，不把草案卡当作资源已修改 |
| Historical data | 原始 Session 先脱敏并冻结到 private Batch / Job；选择的 Judge 会收到必要的 bounded redacted 内容；部分源文本可能保留本机绝对路径 | 不写“数据绝不会离开本机”；应写实际 Judge / provider、路径外发与本地 VCS 风险 |
| Background durability | Diagnostic action 有 durable journal / claim；Historical Web preview/operation 和独占锁仍是进程内 Map，Host restart 后不能 reattach，跨 Host 也无共享锁 | 不把所有“后台任务”概括成同等级可恢复；按 operation 类型说明 |
| Artifact preview | 文档/JSON/HTML 受控展示；URL artifact 当前会在空 sandbox iframe 中直接加载任意 HTTP(S) 地址 | 截图和安全页必须提示外部网络/IP 泄露；Roadmap 改成显式点击、proxy 或 allowlist |
| Promotion / deployment | Historical Gate 为 N/A；Candidate Gate 是建议 / 报告；Plugin 永不替换 Champion、部署或发布 | 不把 PROMOTE 翻译成“已上线” |

#### 3.6.7 发布状态三分法

Plugin 页面所有功能块都使用一致状态标签：

| 状态 | 定义 | 当前示例 |
| --- | --- | --- |
| **Shipped in 0.9.6** | 同时出现在正式 tag、公开包和 release evidence；已知缺陷仍须在能力旁显示 | 19 tools、Host 默认、Workbench、Historical、Context/Evidence、Evaluator editor、version check；Candidate v3 Web capability bug 单列 known issue |
| **Development preview** | 当前 checkout 已有实现，但未进入正式 tag / package / evidence；已知发布阻断缺陷必须同列 | 本地 HEAD `8bb59e2` 的 Settings 一键更新；会调用精确 registry version setup 并要求重启，但当前可能重置非默认 profile/jobs/runtime/execution 配置，暂不可发布 |
| **Roadmap** | 只有差距、设计意图或候选方向，尚未形成一致实现与发布证据 | 通用 runner、统一可恢复操作中心、正式 credential service、多用户授权等 |

源码已经存在而文档 / acceptance / release evidence 不一致时，一律落到 Development preview 或 Roadmap，不因“代码看起来能跑”就进入首页能力卡。

#### 3.6.8 宣传站的 Plugin 覆盖矩阵

| 站点页面 | 必须回答的问题 | 首版证据 / 截图 |
| --- | --- | --- |
| `/product/dsh-plugin/` | Plugin 为什么是 DSH 原生产品面，而非命令包装？ | Harbor Dashboard + 原生 Composer 的全景图 |
| `/docs/start/install/` | setup 写了什么、为什么必须重启、Source install 有何不同？ | 安装命令、profile exact version、plugins list、Skill presence |
| `/docs/reference/tools/` | 19 个工具分别何时用、写什么、需要什么 approval？ | 全量工具表 + 典型 Tool card |
| `/docs/plugin/workbench/` | 八个 section、九个 stage、Trial / Artifact / Compare 如何连起来？ | Summary、Trial detail、Pipeline、Compare 四图组 |
| `/docs/plugin/context-and-evidence/` | 普通发送、Ask AI、`@harbor`、typed evidence、Back restore 如何工作？ | 页面对象 → 原生会话 → Evidence focus 连续图 |
| `/docs/workflows/historical/` | Web 3 与 Agent 10 的边界、隐私 / Judge / cost、Gate N/A 是什么？ | Preview confirmation、后台 operation、Historical Job |
| `/docs/workflows/evaluator/` | 怎样检查、编辑、版本化和 meta-evaluate Evaluator？ | editor diff / conflict、GT provenance、Meta report |
| `/docs/plugin/actions-and-operations/` | AI 建议何时只是草案，Preflight / confirm / journal / recovery 如何防重复？ | proposal card、operation tray、recovery inspection |
| `/docs/architecture/model-broker/` | 模型身份、短期 capability、预算和凭据边界是什么？ | binding identity 与 Broker sequence diagram |
| `/docs/plugin/settings-and-security/` | projectRoot、检查项、credential tiers、版本状态、Host 风险是什么？ | 0.9.6 Settings 截图；一键更新只能放开发预览 |
| `/product/roadmap/` | 当前缺口是什么，哪些是安全边界而不是缺陷？ | Shipped / Development / Planned 状态板 |

首版 Plugin 截图扩充为至少 16 组：① Dashboard 全景与 attention filters，② workspace / Job cards 与 stale 状态，③ Historical Preview 确认，④ Historical 后台运行与完成导航，⑤ Candidate Job Summary / immutable identities，⑥ Trial filters 与冻结多选，⑦ Criterion / Evidence / provenance，⑧ Renderer / business artifact preview，⑨ Pipeline 九阶段，⑩ Candidate Compare / Gate（仅兼容缺陷修复发布后），⑪ Historical `completed-unscored` / Gate N/A，⑫ 原生 Composer 的 `@harbor` / Ask AI attachment，⑬ Tool result card 与 typed navigation，⑭ ActionDraft Preflight / confirmation / recovery，⑮ Evaluator governance / editor diff / conflict，⑯ Settings / Doctor / version / credential policy。每组都带版本、commit、日期、证据类型、验证边界和脱敏记录。

## 4. 网站目标、受众与成功标准

### 4.1 目标

1. 用户在首屏理解：这是面向 DeepSeek Harness 的持续评测与受控自进化产品，不是 Docker Harbor，也不是自动部署平台。
2. 新用户在一个页面内完成正式安装、重启和第一次入口确认。
3. 技术用户能够理解 Candidate / Dataset / Stack / Context / Trial / Gate 的关系。
4. 评测工程师能找到 Evaluator、Ground Truth、Score Validity 和 Meta-Evaluation 的治理方法。
5. 平台和安全人员能看到凭据、路径、Host 模式、Historical 数据保留和外部部署边界。
6. 每项重要能力都能追溯到当前文档、代码身份或发布证据；每项限制也同样可见。
7. 网站同时为人类和 Agent 提供 HTML、Markdown、`llms.txt`、`llms-full.txt` 和 `navigation.json`。

### 4.2 受众与对应 CTA

| 受众 | 最关心的问题 | 首要入口 | CTA |
| --- | --- | --- | --- |
| 第一次接触的 DSH 用户 | 这是什么，能不能快速看到价值？ | 首页、第一次 Historical 诊断 | 开始安装 |
| Agent 开发者 | 如何接入已有 Agent、Dataset 或 curl？ | Get Started、Integration | 接入 Candidate |
| 评测工程师 | 分数如何有效，Evaluator 如何治理？ | Evaluator、Meta-Evaluation | 查看评测架构 |
| 平台/发布工程师 | Gate 如何接入现有 CI/CD？ | Promotion、CI/CD | 查看晋级边界 |
| 安全与合规人员 | 会话、密钥、Host 权限如何处理？ | Security & Governance | 查看安全边界 |
| 开源贡献者 | 怎样开发、测试、发版？ | Contributing、Releases | 打开 GitHub |

### 4.3 内容层面的验收指标

这些是网站设计目标，不是当前已经测得的业务数据：

- 首页 30 秒内能回答“是什么 / 为什么 / 下一步做什么”。
- Quick Start 只给一条正常安装路径，不把 registry 安装与 source link 混在一起。
- 任何带数字的能力声明都有稳定来源，不使用动态 star 数或无来源性能数据。
- 每个关键页面同时写“能力”和“边界”。
- 搜索可用中文、英文、缩写和协议名命中同一概念。
- 所有核心页面有中英文 peer，语言切换不退回首页。
- 生产构建零 warning，真实部署 URL 的 canonical、搜索、Markdown 和 404 都通过。

## 5. 品牌定位与传播文案

### 5.1 品牌角色

Harbor 是“港湾、检查点和出航门禁”的组合隐喻：

- **海洋**：Agent 面对的开放任务空间；
- **鲸鱼**：不断行动、探索和生成的 Agent；
- **灯塔**：固定评测标准和可解释信号；
- **港湾**：变更进入生产前的受控实验边界；
- **航海日志**：Manifest、Trial、Evidence 和 Release Archive；
- **出航许可**：Promotion Gate 的建议，而不是自动部署命令。

需要在首页 FAQ 明确：本项目与常见的 CNCF Harbor 容器镜像仓库不是同一个产品。

### 5.2 推荐口号

主口号：

> **让 Agent 每一次都进步**

辅助口号：

> 看见 Agent 的每一次进步，也看见分数是否值得相信。

英文对应：

> **Make your Agent improve every time.**

首屏说明：

> 面向 DeepSeek Harness 的持续评测与受控自进化插件。固定 Candidate、Dataset、评测尺子和运行环境；从真实会话或正式回归中发现问题；一次只改一个变量；最后由确定性 Gate 给出 PROMOTE / REJECT 建议。

### 5.3 首页事实数字

首页只使用稳定、可核验的结构数字：

- **3** 个协作交付物：Plugin / Skill / Adapter
- **19** 个严格 Harbor Tools
- **2** 条评测路径：Candidate Execution / Historical Generation
- **1** 个与优化器分离的确定性 Promotion Gate

不要把测试数量、GitHub stars、下载量或“准确率提升”做成永久首页指标；这些数据会漂移，且容易被误读为产品质量。

### 5.4 传播纪律

所有内容按四种声明类型标记或措辞：

| 类型 | 允许的表述 | 不允许的外推 |
| --- | --- | --- |
| 已交付能力 | “0.9.6 提供 19 个工具” | 不写成“完整 PRD 已实现” |
| 诊断能力 | “Historical Job 可发现真实会话中的重复问题” | 不写成“可作为晋级 Baseline” |
| 验证证据 | “321 个 Python、593 个 Node 测试在 0.9.6 发布中通过” | 不写成“真实模型质量已验证” |
| 未来工作 | “通用有界诊断 / 基础设施重试 runner 尚非承诺能力” | 即使源码已有内部专用 runner，也不在缺少一致文档与 release evidence 时用于营销 |

页面、截图和图表都应显式标注证据类型：`synthetic`、`controlled-model`、`real-provider`、`public-release` 或 `historical image`。

## 6. 信息架构

### 6.1 顶部导航

首版只保留五个一级入口，避免宣传站和文档站各自维护一套导航：

1. **Product**：价值、理念、能力、边界、前世今生
2. **Docs**：安装、概念、工作流、架构、参考、安全、排错
3. **Book**：从真实会话到受控晋级的连续教程
4. **Releases**：版本、发布证据、变更说明
5. **GitHub**：外部链接

Navbar 下拉只承担一层入口；复杂层级交给 Docs / Book 侧栏，符合 OINK 的导航模型。一级入口固定到 canonical route：Product → `/product/`，Releases → `/releases/`；不再让 Product 指向 `/docs/about/` 或让 Releases 同时存在 `/blog/release/` 两套路径。

### 6.2 路由与页面地图

OINK 默认使用英文根路径和中文 `/zh/`，本项目采用官方英中双语 profile，不启用法语。中文是主要写作与产品校对语言，英文是对等公开版本；上线前所有核心页面必须成对存在。

| 路由 | 页面 | 目的 |
| --- | --- | --- |
| `/`、`/zh/` | Home | 产品定位、价值、入口、证据、CTA |
| `/product/` | Product overview | 三件产品、两条评测路径、边界与版本状态 |
| `/product/dsh-plugin/` | DSH Plugin | 原生集成、19 tools、Workbench、上下文与治理能力 |
| `/product/skill/` | Official Skill | 四概念引导、确认、诊断与受控优化协议 |
| `/product/adapter/` | Python Adapter | Candidate / Historical 执行与严格 artifacts |
| `/product/roadmap/` | Product roadmap | Shipped / Development preview / Planned 与已知问题 |
| `/docs/about/` | Technical overview | 回答是什么、为谁、与什么不同 |
| `/docs/about/philosophy/` | Design principles | 六条设计理念 |
| `/docs/about/history/` | Past and present | 版本演进、关键转折、未完成发布说明 |
| `/docs/start/` | Get started | 安装与路径选择 |
| `/docs/start/install/` | Install | 正式 npm setup、重启与健康检查 |
| `/docs/start/recent-sessions/` | First diagnosis | 第一次 Historical Session 诊断 |
| `/docs/start/candidate/` | First Candidate evaluation | 显式 Dataset/Candidate 路径 |
| `/docs/plugin/` | DSH Plugin guide | 原生注入面、能力索引、版本状态与已知问题 |
| `/docs/plugin/workbench/` | Workbench | Dashboard、八个 section、九个 pipeline stage、对象读取 |
| `/docs/plugin/context-and-evidence/` | Context and evidence | 普通发送、Ask AI、`@harbor`、typed evidence、Back restore |
| `/docs/plugin/actions-and-operations/` | Actions and operations | 7 类 proposal、Preflight、confirmation、journal、recovery |
| `/docs/plugin/settings-and-security/` | Settings and Plugin security | projectRoot、checks、credential tiers、版本、同源与 Session 边界 |
| `/docs/concepts/` | Four concepts | Dataset / Generator / Evaluator / Optimizer |
| `/docs/concepts/identity/` | Identity and immutability | Candidate、Manifest、Digest、Context |
| `/docs/concepts/score-validity/` | Can the score be trusted? | raw reward、valid score、coverage、abstention |
| `/docs/concepts/promotion/` | Promotion Gate | comparability、Policy、PROMOTE / REJECT |
| `/docs/workflows/historical/` | Historical evaluation | observe-existing、隐私、coverage、Gate N/A |
| `/docs/workflows/candidate/` | Candidate evaluation | Snapshot → Baseline → Regression → Gate |
| `/docs/workflows/evaluator/` | Evaluator governance | Descriptor、Rubric、受控源码修改 |
| `/docs/workflows/meta-evaluation/` | Meta-evaluation | 独立 GT、ESF / SCE / RCR |
| `/docs/workflows/cicd/` | CI/CD handoff | Harbor 与现有发布平台的边界 |
| `/docs/architecture/` | Architecture | 三角色 + Gate、八角色 Stack、严格数据流 |
| `/docs/architecture/model-broker/` | Model Broker | 固定模型身份与短期 capability |
| `/docs/architecture/execution/` | Host and Docker | Host 默认、Docker 可选、可比性与风险 |
| `/docs/architecture/artifacts/` | Evidence and artifacts | Job 产物、Trial 生命周期、Evidence provenance |
| `/docs/reference/tools/` | 19 tools | 按 Initialize / Run / Read / Govern / Gate 分组 |
| `/docs/reference/config/` | Configuration | profile、projectRoot、jobsDir、环境选择 |
| `/docs/reference/schemas/` | Protocols and schemas | 链接仓库 schemas，说明稳定边界 |
| `/docs/security/` | Security & governance | 凭据、路径、Host 权限、保留、审批 |
| `/docs/troubleshooting/` | Troubleshooting | 安装、Dataset、Context、运行时错误 |
| `/book/` | Controlled evolution tutorial | 连续、可操作的端到端教程 |
| `/blog/` | Engineering stories | 设计决策、版本故事、案例文章 |
| `/releases/` | Releases and evidence | 正式版本、证据类型、下载入口；顶部 Releases 只链接这一 canonical route |

### 6.3 Product、Docs 与 Releases 目录结构

```text
website/content/
├── product/
│   ├── _index.*.md
│   ├── dsh-plugin.*.md
│   ├── skill.*.md
│   ├── adapter.*.md
│   └── roadmap.*.md
├── docs/
│   ├── _index.*.md
│   ├── about/
│   │   ├── _index.*.md
│   │   ├── philosophy.*.md
│   │   ├── history.*.md
│   │   └── boundaries.*.md
│   ├── start/
│   │   ├── _index.*.md
│   │   ├── install.*.md
│   │   ├── recent-sessions.*.md
│   │   ├── candidate.*.md
│   │   └── source-development.*.md
│   ├── plugin/
│   │   ├── _index.*.md
│   │   ├── workbench.*.md
│   │   ├── context-and-evidence.*.md
│   │   ├── actions-and-operations.*.md
│   │   └── settings-and-security.*.md
│   ├── concepts/
│   │   ├── _index.*.md
│   │   ├── four-concepts.*.md
│   │   ├── identity.*.md
│   │   ├── score-validity.*.md
│   │   └── promotion.*.md
│   ├── workflows/
│   │   ├── _index.*.md
│   │   ├── historical.*.md
│   │   ├── candidate.*.md
│   │   ├── evaluator.*.md
│   │   ├── meta-evaluation.*.md
│   │   └── cicd.*.md
│   ├── architecture/
│   │   ├── _index.*.md
│   │   ├── overview.*.md
│   │   ├── model-broker.*.md
│   │   ├── execution.*.md
│   │   └── artifacts.*.md
│   ├── reference/
│   │   ├── _index.*.md
│   │   ├── tools.*.md
│   │   ├── config.*.md
│   │   └── schemas.*.md
│   ├── security/
│   └── troubleshooting/
├── book/
├── blog/
└── releases/
```

`/product/` 只讲价值、能力状态与边界；`/docs/` 承载操作和技术契约；`/releases/` 是唯一版本证据 canonical route。三者通过链接复用事实，不复制三份长文。每个目录都有双语 `_index`，`weight` 使用 10、20、30；对应翻译页使用相同显式 heading ID，确保跨语言 deep link 不丢失。

### 6.4 Book 设计

Book 不重复 Reference，而是带用户完成一条故事线：

1. **为什么“会改自己”不等于“会稳定进步”**
2. **从四个业务概念定义一次评测**
3. **用最近会话建立第一批真实诊断证据**
4. **把高价值 Badcase 固化成回归 Dataset**
5. **做一次受控 Candidate 改动并跑可比回归**
6. **读取 Gate、保留 Champion、交给外部 CI/CD**

每章必须包含“你做什么 / Harbor 生成什么证据 / 这一章不能证明什么”。

### 6.5 Blog 与 Releases

Blog 只承载有时间属性的内容：

- 为什么引入 Historical Generation Evaluation；
- 为什么 Score Validity 比单一 reward 更重要；
- 从 Docker 默认走向 Host 默认的设计取舍；
- Workbench 如何把证据带回对话；
- 发布复盘与迁移说明。

Releases 页面从 [发布图集](../../releases/README.md) 链接到版本证据，不复制或改写旧版验收结论。每个版本卡片都显示：版本、主要变化、证据类型、验证边界、GitHub Release、可下载资料包。

## 7. 首页详细编排

OINK 首页由 `data/home/<language>.yaml` 驱动。建议按以下 section 顺序构建：

| 顺序 | OINK section | 内容 | 目的 |
| ---: | --- | --- | --- |
| 1 | `hero` | 主口号、说明、鲸鱼/灯塔视觉、安装/架构/证据 CTA | 30 秒建立认知 |
| 2 | `command-box` | 正式安装命令 | 立即行动 |
| 3 | `metrics` | 3 个交付物、19 tools、2 paths、1 Gate | 用稳定事实建立规模感 |
| 4 | `principles` | 身份固定、Score Validity、单一改动、Gate 分离 | 说明为何可信 |
| 5 | `capabilities` | DSH Plugin 全景（Harbor Tab、Workbench、Context/Evidence、Tool cards、Operations、Settings）+ Skill + Adapter | 说明产品组合，不把 Plugin 缩成工具列表 |
| 6 | `cards` | “没有 Dataset / 已有 Dataset / 要治理 Evaluator / 要接 CI/CD”四类入口 | 按用户任务分流 |
| 7 | `steps` | Snapshot → Baseline → Diagnose → Change → Regression → Gate | 展示正式闭环 |
| 8 | `markdown` | Historical 与 Candidate 两条路径的对照 | 避免误解诊断与晋级 |
| 9 | `gallery` | 经过筛选和标注的 Workbench 截图 | 展示真实产品形态 |
| 10 | `timeline` | 0.1 → 0.9.6 的七个叙事阶段 | 讲前世今生 |
| 11 | `faq` | Harbor 名称、Docker、自动部署、隐私、DSH 背书 | 提前消除误读 |
| 12 | `cta` | 安装、阅读 Book、GitHub | 收口 |

### 7.1 Hero 文案草案

```text
Eyebrow
HARBOR SELF-EVOLVING · LATEST v0.9.6 · BETA

Title
让 Agent 每一次都进步

Lead
面向 DeepSeek Harness 的持续评测与受控自进化插件。
固定谁被评测、用什么尺子、为什么晋级；从真实会话或正式回归中发现问题；一次只改变一个受控面。

Primary CTA
开始安装

Secondary CTA
理解评测架构

Detail link
查看发布证据与当前边界
```

### 7.2 安装命令

首页只展示正式用户路径：

```bash
npx --yes dsh-harbor-evolution@latest setup --project-root "$PWD"
```

安装页再提供 `@0.9.6` 的精确固定方式，并明确：

- 要求 Node.js 22+、pnpm、uv；
- 0.9.6 默认 Host 执行，不需要 Docker；
- Host 模式以当前用户身份直接访问宿主机文件、进程和网络，不提供隔离或资源限制；
- 正常用户不要 clone 后直接 `dsh plugin add ./packages/dsh-plugin`；
- 只有源码开发才运行 `./hse dsh-install-source web`。

### 7.3 截图策略

可复用现有发布截图，但必须带原始证据说明：

- 首页 Hero 可参考 `packages/dsh-plugin/src/client/assets/harbor-ocean.jpg`；当前 CHANGELOG 将其描述为原创内嵌海洋/鲸鱼视觉，实施时仍需保留素材来源记录。
- Workbench 首页优先使用 `docs/releases/v0.9.5/screenshots/01-synthetic-home-desktop.png`，标题明确标注 `synthetic component fixture`。
- Trial 选择、AI 建议和 Historical Launcher 可从 0.9.2–0.9.5 图集中选择，但不能裁掉顶部的证据类型说明后再声称是真实生产运行。
- 0.9.6 没有真实 Candidate、Historical Session 或外部模型评测截图；网站不能用旧合成图替代这一事实。
- 0.9.6 的 Candidate Context v3 Web capability 判断有已知缺陷；修复发布前不能拍一张手工 fixture 的 Compare/Gate 图来暗示真实 v3 Job 已完整兼容。
- 0.9.6 Settings 只能展示检查更新、复制命令和 Release 链接；本地 HEAD 的一键按钮与 Hero version badge 只能出现在 `Development preview` 图组，并带 commit。
- Context / Ask AI 截图要同时显示原生 Composer attachment 或显式 `@harbor`，并注明“准备上下文，不自动发送”；不能伪造已移除的第二 Copilot 面板。
- 截图进入 `website/assets/images/` 前记录来源文件、版本、日期、证据类型、是否裁切和脱敏方式；不显示真实 Session 标题、绝对路径、`hctx` token、operation id 或账号信息。

### 7.4 首版图片资产预算与页面分配

首版不采用“首页一张 Hero、正文全是文字”的做法，目标是准备 **至少 26 个可复用视觉资产**：1 张品牌主视觉、9 张解释性架构 / 流程图、16 组产品截图。首页只选择其中最有代表性的 5–6 张，其余分布到 Product、Docs、Book 和 Releases；相同资产通过 OINK Gallery / responsive variants 复用，不复制多份文件。

| 页面区域 | 计划图片 | 数量 | 说明 |
| --- | --- | ---: | --- |
| Home Hero | 海洋 / 鲸鱼 / 灯塔品牌主视觉 | 1 | 唯一大面积品牌图；叠字区域保留安全留白 |
| Home 价值说明 | 产品三件套、两条评测路径、WorkBench 全景、Trial lifecycle / score validity、版本时间线 | 5 | 首屏以下全部 lazy-load；每图配一句“不代表什么” |
| Product / DSH Plugin | DSH 注入面图、Dashboard、原生 Composer Context、Tool card、Operation recovery、Settings | 6 | 形成“原生接入—证据—动作—治理”的连续浏览路径 |
| Historical workflow | Preview / disclosure、运行中 operation、完成后的 coverage / Gate N/A | 3 | 必须同时展示 Judge、数据边界、费用和非晋级属性 |
| Candidate / Workbench | Summary identities、Trial selection、Evidence provenance、Artifact preview、Compare/Gate | 5 | Compare/Gate 图片等待 Candidate v3 Web 修复发布后再拍 |
| Evaluator / Security | Governance、Editor diff/conflict、Model Broker、approval / trust boundary | 4 | 编辑器保存不等于验证；Broker 图不夸大隔离能力 |
| Releases / Roadmap | 版本证据卡、Shipped / Development / Planned 状态板 | 2 | 明确正式包、开发 HEAD 与未来项 |

排版规则：

- 每个核心长页面至少有 1 张“理解图”和 1 张“产品证据图”；连续三屏纯文字时应优先用流程图、标注截图或对照表打断，而不是添加无信息装饰图。
- 大截图采用“全景 + 局部放大”组合：全景解释位置，局部 crop 保证 Trial Evidence、version、invalid score 等文字在移动端可读。
- OINK Gallery 支持点击放大；图片 figure caption 同时显示版本、证据类型和边界。Alt text 描述图中结论，不重复 caption，也不使用“image of”。
- 架构图优先 SVG；产品截图保留脱敏 PNG 原件并由 Hugo 生成 WebP / responsive variants。除 Hero 外使用 `loading=lazy`，写入宽高或 aspect ratio，避免 CLS。
- Hero/LCP 派生图目标不超过 300 KiB；普通截图单个 WebP 目标不超过 250 KiB；Gallery thumbnail 目标不超过 80 KiB。若文字因压缩不可读，优先裁切和分图，不盲目降低质量。
- 首页只预加载 Logo 和 Hero，不预加载整套 Gallery；首页图片初始传输预算控制在约 1 MiB，详情页按滚动加载。
- 深色 / 浅色不机械生成两套全部截图：只对颜色语义、对比度或界面差异明显的关键页面各保留一张，其余通过 caption 说明主题。
- 每个截图组至少包含一个非 happy-path 状态，例如 stale、invalid、completed-unscored、conflict、expired 或 recovery，避免把产品呈现成永远全绿。

## 8. 视觉与交互方向

### 8.1 视觉关键词

- 深海蓝：实验深度、不可见过程；
- 冰青色：证据、链路、可检查状态；
- 灯塔暖白/琥珀色：Gate、注意事项、决策点；
- 岩石灰：不可变身份和基础设施；
- 鲸鱼与灯塔：保留项目已有视觉资产，不再引入一套无关插画语言。

### 8.2 使用原则

1. 首页允许一张强品牌图，其余区域以内容、图表和产品截图为主，不堆叠装饰性渐变。
2. 深色模式延续 Workbench 气质；浅色模式保证文档长读可读性。
3. 中文使用可靠的 system typography / CJK fallback，避免为品牌感牺牲字形覆盖和加载速度。
4. 状态颜色不单独承载语义，PROMOTE / REJECT / invalid / unscored 同时显示文字与图标。
5. 动画只用于轻量 reveal；尊重 `prefers-reduced-motion`，核心内容在关闭 JavaScript 时仍完整。
6. 架构关系优先用 Mermaid；需要像素级控制、首屏展示或社交卡时导出审查过的 SVG。

### 8.3 需要制作的核心图

1. **产品三件套图**：DSH Plugin + Skill + Harbor Adapter。
2. **两条评测路径图**：Historical diagnosis 与 Candidate promotion。
3. **严格数据流图**：Clarify → Init → Validate/Doctor → Job → Evidence → Change → Gate。
4. **身份与可比性图**：Candidate identity 与 Evaluation Context comparison identity。
5. **Trial 生命周期图**：queued 到 completed / candidate-quality-failed / infrastructure-error / evaluation-error / completed-unscored / cancelled。
6. **Model Broker 信任边界图**：Host 模型 → 短期 Broker capability → Candidate；图注精确写成“Broker 不下发上游模型凭据”，同时注明默认 Host 进程继承宿主环境，Broker 不是完整宿主凭据隔离保证。
7. **DSH Plugin 原生注入面图**：DSH Session / Composer / Tool / Settings → `EvolutionService` → Adapter / Harbor artifacts，标出 Session cwd 与 Web workspace 的不同权威边界。
8. **建议到操作的信任链图**：Evidence → Action Draft → deterministic Preflight → Human Confirm → Operation Journal → Result / Recovery，明确 draft、Gate、deployment handoff 都不是自动生产变更。
9. **前世今生时间线**：0.1 至 0.9.6 的叙事阶段。

OINK 的 Mermaid 在浏览器中渲染，Hugo 不校验 Mermaid 语法，因此每张图都要在实际浏览器中检查；正文必须重复写出关键结论，不能把信息只放在图中。

## 9. OINK 技术落地方案

### 9.1 仓库拓扑选择

评估三种方式：

| 方式 | 优点 | 风险 | 结论 |
| --- | --- | --- | --- |
| 独立网站仓库 | 完全符合 Starter 的新仓库推荐，部署简单 | 产品与网站版本分离，发布证据和文档容易漂移 | 暂不采用 |
| 把 OINK 文件放仓库根目录 | 最接近 Starter 默认结构 | `go.mod`、`content/`、Hugo 配置混入产品根，干扰现有 Node/Python 项目 | 不采用 |
| 当前仓库 `website/` 子目录 | 与产品同 PR、同 tag、同证据源；边界清晰 | GitHub Actions 需要适配工作目录 | **推荐** |

因为当前仓库已经存在，不应克隆 Starter 后删除 `.git`。实施时采用 OINK 官方“existing site / from scratch”思路：以 Starter 的固定版本、配置结构和内容模型为蓝本，在 `website/` 中建立独立 Hugo Module；先验证未定制基线，再按身份、语言、首页、内容、品牌、集成、部署逐层修改。

许可不能只写一句“保留 attribution”：实施时从固定的 OINK `v1.0.0` tag 核对主题代码、Starter 文件、文档文字和第三方资产各自的 license；在 `website/LICENSES/` 保存上游原文，在 `website/THIRD_PARTY_NOTICES.md` 记录组件、版本、来源 URL、采用方式、是否修改及具体归属要求。Hugo Module 依赖与复制到仓库的文件分开登记；若改写官方文档片段或采用 CC BY 内容，页面 footer / source note 提供实际 attribution。自有鲸鱼图、截图与 icon 也建立来源台账，不用项目根 LICENSE 替代第三方义务。

### 9.2 目录蓝图

```text
website/
├── hugo.yaml
├── go.mod
├── go.sum
├── README.md
├── THIRD_PARTY_NOTICES.md       # 组件/版本/来源/修改/归属矩阵
├── LICENSES/                    # OINK/第三方许可原文（按实际采用内容确定）
├── data/
│   ├── home/
│   │   ├── en.yaml
│   │   └── zh.yaml
│   └── footer/
│       ├── en.yaml
│       └── zh.yaml
├── content/
│   ├── _index.md
│   ├── _index.zh.md
│   ├── product/
│   ├── docs/
│   ├── book/
│   ├── blog/
│   └── releases/
├── assets/
│   ├── icons/logo.svg
│   ├── images/
│   └── scss/
│       ├── _variables_project.scss
│       ├── _variables_project_after_bs.scss
│       └── _styles_project.scss
└── static/
    └── favicon.svg

.github/workflows/
└── website-pages.yml
```

Hugo 生成的 `public/`、`resources/`、`.hugo_build.lock` 和 module caches 不进入 Git。

### 9.3 核心配置决策

- OINK 精确固定 `v1.0.0`，同时提交 `go.mod` / `go.sum`。
- Hugo Extended 固定 `0.165.0`，Go 固定 `1.27`；本地与 CI 一致。
- 使用官方 English + Chinese 完整 profile；移除 French，而不是先保留再逐页删除。
- 默认语言为 English 根路径，中文位于 `/zh/`；README 中面向中文用户的入口可直接指向 `/zh/`。
- `offline_search: true`；首版内容规模较小时使用 `content` 索引，接近每语言 raw 2 MiB / gzip 512 KiB 预算时降为 `summary`。
- 明确配置 `search_keywords`：`Harbor`、`DSH`、`DeepSeek Harness`、`Agent evaluation`、`自进化`、`评测集`、`生成器`、`评测器`、`优化器`、`Promotion Gate`、`Context`、`Trial`、`Historical Session`、`Score Validity`。
- 开启浅色/深色切换、Repository edit/history、Markdown output、LLMS、NAVJSON；Docs 顶层开启 LLMSFULL。
- 由于站点位于 monorepo 子目录，显式设置 `params.github_subdir: website`，并实际点击验证 edit/history URL 落到正确源文件。
- 首版不开 GA、Giscus、外部搜索、PlantUML 服务和 Open in ChatGPT/Claude，保持 local-first、无第三方请求的清晰边界。
- `enableRobotsTXT: true`；每页写独立中英文 `description` 和必要的 social image。
- 保留 Starter 所需 Goldmark 配置；`renderer.unsafe: true` 只适用于受信任仓库作者，不能接收未净化用户内容。
- 先生成真实 production HTML 再制定 CSP；盘点 OINK 自带脚本、Mermaid、搜索 worker、字体、图片和 Pages origin，不以一条未经验证的严格 CSP 破坏功能。首版禁止新增任意第三方 origin；CSP 与外部链接域名写入审计清单。GitHub Pages artifact 不能被当作可配置任意 HTTP response headers 的托管层；首版最多使用经过浏览器验证的 HTML `meta http-equiv` CSP，并记录它不支持 `frame-ancestors`、report-only 等 header-only 能力。若这些 header 是硬性要求，迁移到支持 `_headers` 的 Cloudflare Pages 后再启用。

建议 outputs：

```yaml
outputs:
  home: [HTML, markdown, LLMS, NAVJSON]
  page: [HTML, markdown]
  section: [HTML, RSS, print, markdown]
```

Docs 顶层双语 `_index` 额外声明：

```yaml
outputs: [HTML, print, RSS, markdown, LLMSFULL]
```

注意：Hugo `outputs` 是整体替换，不是 merge，增加格式时必须把原有格式一并写回。

### 9.4 OINK 组件映射

| Harbor 内容 | OINK 组件 | 用法 |
| --- | --- | --- |
| 安装命令 | `command-box` / code block | 一键复制，首页与安装页一致 |
| 四概念与四种受众 | `cards` | 快速分流 |
| 正式流程 | `steps` | 展示顺序和检查点 |
| 架构、状态机 | Mermaid fence | diff-friendly、明暗主题适配 |
| 项目结构 | FileTree | 展示 Candidate / Dataset / website 结构 |
| Host vs Docker | Tabs + Table | 对照运行语义和风险 |
| 工具参数、配置 | Fields table | 名称、类型、默认值、说明 |
| 证据截图 | Gallery | 带版本与证据类型 caption |
| 当前能力/限制 | Callout + Badge | 不只依赖颜色表达状态 |
| 版本历史 | Timeline / release pages | 前世今生与正式版本 |
| 终端演示 | Asciinema（后续） | 只有获得可公开录制时启用 |

### 9.5 与现有文档的关系

首版不移动现有 `docs/`，也不让两套文档互相冒充唯一事实源：

1. `README.md`、`docs/architecture.md`、`docs/integration.md`、`docs/security.md`、`docs/acceptance-status.md` 继续是产品事实源。
2. `website/content/` 是面向传播和学习的策展层：重写叙事、减少内部协议噪声，但链接回事实源。
3. 每个站点页面在 front matter 或维护清单中记录 `source_refs` 与 `verified_against_version`。
4. 发布时增加内容一致性检查：当前包版本、工具总数、正式安装命令、默认执行环境、Web/Agent Historical 数量边界不得漂移。
5. 若后续决定把 OINK Docs 变成唯一公开文档，再单独设计迁移和重定向；首版不在建站同时大规模搬迁既有路径。

## 10. SEO、搜索和面向 Agent 的内容

### 10.1 关键词主题

中文：

- Agent 评测、AI Agent 评估、Agent 自进化、受控自进化
- DeepSeek Harness、DSH 插件、Harbor 评测
- Dataset / 评测集、LLM-as-Judge、评测器治理
- Candidate、Trial、Baseline、Promotion Gate
- 历史会话评测、Score Validity、Ground Truth、元评测

英文：

- Agent evaluation, controlled agent evolution, evidence-bearing improvement
- DeepSeek Harness plugin, Harbor evaluation
- Candidate evaluation, historical generation evaluation
- evaluator governance, score validity, promotion gate

每页 `description` 同时服务搜索摘要、站内搜索和 section card，不用空泛文案。

### 10.2 页面 SEO

- `baseURL` 必须指向真实生产地址；GitHub Pages project subpath 由 workflow 的 `configure-pages` 输出计算。
- 每个中英文页面各自写 description，不复制另一语言。
- 配置 canonical、hreflang、Open Graph、Twitter Card 和一张站点级 social image。
- 生产构建输出 `Allow: /`；PR Preview 使用非 production 环境，输出 `noindex, nofollow` 与 `Disallow: /`。
- Sitemap 中不包含 draft、内部规划或私有证据页。
- “Harbor”标题必须与 “Agent evaluation / DeepSeek Harness”共同出现，降低与 CNCF Harbor 的搜索歧义。

### 10.3 Agent 友好输出

这是本项目区别于普通宣传站的重点：

- 每个页面有 `index.md`；
- 每语言有 `llms.txt`；
- Docs 有 `llms-full.txt`；
- 每语言有 `navigation.json`；
- HTML `<head>` 带 Markdown alternate link；
- 页面对读者提供 Copy / View Markdown。

上线检查必须扫描这些公开文件，确保没有凭据、原始 Session id、本机绝对路径、私有业务证据或未脱敏截图说明。`search_exclude` 不是访问控制，真正私有的内容不得进入网站源。

## 11. 部署方案

### 11.1 第一阶段：GitHub Pages

选择 GitHub Pages 的原因：

- 当前项目已经在 GitHub；
- 不需要新增云账号或部署 token；
- 与 PR、Release、编辑历史和源码链接天然一致；
- Starter 已提供可复用的 warning-strict workflow。

#### 当前仓库发布状态（2026-09-19 实查）

- `https://istarwyh.github.io/harbor-self-evolving/` 已返回生产站点，英文、中文、Docs、404、静态图片与 Agent 输出代表性路径均通过真实 HTTP / 浏览器检查；
- Repository Settings → Pages 的 Source 为 **GitHub Actions**；`github-pages` environment 使用 selected branches/tags policy，仅允许 `main`；
- commit `68ad7aca8aff317e88c1bf4f187db111c57e3751` 的 [Pages run #1](https://github.com/istarwyh/harbor-self-evolving/actions/runs/35451540058) 成功，产物为 6.15 MB，digest `sha256:2449192d635bbcb67447f16041eeeb8c5ef1098ba26355205dce5662b2aae999`；
- 同一 commit 的 [CI run #137](https://github.com/istarwyh/harbor-self-evolving/actions/runs/35451540072) 中 Python、Node、website 三个 Job 全部成功；
- 该 deployment 证明网站产物已发布，不代表 Plugin/npm/PyPI 新版本发布或 Candidate v3 known issue 已修复。

一次性仓库设置已完成：Settings → Pages → Build and deployment 的 Source 为 **GitHub Actions**。后续不能改回 `main / (root)` 或 `main /docs`，因为源文件位于 `website/`，生产物由 workflow 通过 Pages artifact API 发布。官方要求与流程见 [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) 和 [publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。

#### Workflow 基线

工作流以 [OINK Starter](https://github.com/pgsty/oink-starter) 当前 GitHub Pages 模板为基线；调研时模板使用 `checkout@v7`、`setup-go@v7`、`configure-pages@v6`、`upload-pages-artifact@v5`、`deploy-pages@v5`。实施时将每个 Action 固定到审计过的完整 commit SHA，并在注释中保留对应 major，避免直接追随可移动 tag。

针对 monorepo 调整为：

- `actions/checkout` 使用 `fetch-depth: 0`，保留 GitInfo；
- `actions/setup-go` 的 `go-version-file` 指向 `website/go.mod`，cache dependency 指向 `website/go.sum`；
- 固定 Hugo Extended `0.165.0`，不使用 `latest`；
- 设置 `GOWORK=off`、`HUGO_MODULE_WORKSPACE=off` 和独立 `HUGO_CACHEDIR`；
- `go mod download github.com/pgsty/oink` 与 Hugo warning-strict build 都以 `website/` 为 working directory；
- `configure-pages` 必须有 `id: pages`；构建时显式传 `--baseURL "${{ steps.pages.outputs.base_url }}/"`，正确生成 `/harbor-self-evolving/` project subpath；
- 上传路径必须是 `website/public/`，deploy job 明确 `needs: build`，不能独立等待不存在的 artifact；
- 上传前拒绝 symlink / hard link 并检查 artifact 大小；GitHub Pages 官方要求 tar 小于 10 GB 且不含 symbolic / hard links，本项目再采用远低于该上限的内部预算；
- 权限按 Job 收窄：build 仅保留 `contents: read` 与 `configure-pages` 所需的 `pages: write`，不取得 OIDC；deploy 才使用 `pages: write`、`id-token: write`，不使用 `write-all`。生产 deploy job 绑定 `github-pages` environment，并设置只允许默认分支部署的 protection rule；
- `concurrency.group: github-pages`、`cancel-in-progress: false`，避免取消正在发布的生产 deployment；
- production workflow 只响应默认分支 push 或显式 `workflow_dispatch`。PR 构建放入现有 `ci.yml` 的独立 website job，只给 `contents: read`，使用预期 project URL 构建并扫描，但不运行 `configure-pages` / `upload-pages-artifact` / `deploy-pages`；
- workflow 输出并记录真实 `page_url`，部署成功只表示“网站产物已发布”，不等于新 Plugin 版本、npm/PyPI 发布或 release evidence 已完成；
- warning 即失败，不维护 `gh-pages` 分支，也不需要为 artifact deployment 手写 `.nojekyll`。

严格构建命令：

```bash
hugo --cleanDestinationDir --gc --minify --environment production \
  --printPathWarnings --panicOnWarning \
  --baseURL "https://istarwyh.github.io/harbor-self-evolving/"
```

本地 publication gate 使用上面的预期 URL；生产 workflow 使用 `configure-pages.outputs.base_url` 覆盖它。`hugo.yaml` 的默认 `baseURL` 也先写成 `https://istarwyh.github.io/harbor-self-evolving/`。内容和模板不得手写 `/images/...`、`/docs/...` 等 domain-root URL，也不启用 `relativeURLs` 来掩盖错误；统一使用 Hugo `relURL` / `absURL`、Page resources 或 OINK helper，并在构建后扫描 `href="/` / `src="/` 中不属于预期 subpath 的引用。

GitHub Pages artifact 上线后执行两层校验：先等待 `deploy-pages` 返回的 `page_url`，再从外网对 `/harbor-self-evolving/`、`/harbor-self-evolving/zh/`、代表性 Docs/Book/Releases、404、搜索 index、Markdown、`llms.txt`、sitemap 和静态图片进行 HTTP + 浏览器检查。仅 workflow 变绿而公开 URL 仍 404、资源跨 subpath 失败或 canonical 错误，均不算发布成功。

### 11.2 第二阶段：独立域名或 Cloudflare Pages

只有在确定正式域名、缓存策略或全球访问需求后切换。若采用 Cloudflare Pages，使用 Starter 的 Direct Upload 或 Cloudflare Git Integration 二选一，不并行维护两条生产发布路径。

迁移时重新验证 `baseURL`、canonical、搜索 index、Markdown、`llms.txt`、sitemap 和 robots；预览地址不作为生产证明。若继续使用 GitHub Pages 但绑定自定义域名，必须在 Repository Settings / Pages API 配置并完成 DNS / HTTPS 验证，不能只向仓库提交 `CNAME` 就视为生效。

## 12. 内容治理与证据治理

### 12.1 事实来源矩阵

| 网站字段 | 自动或人工来源 | 漂移防护 |
| --- | --- | --- |
| 最新正式版本 | Git tag、npm/PyPI manifest、release archive | 三者一致才进入首页；本地 HEAD / 未打 tag 远端提交单列未发布 |
| 工具数量与列表 | Plugin 注册表 / README | 站点构建检查 19 个唯一工具 |
| 安装命令 | AGENTS.md / README | 只允许 registry setup 为默认 |
| 默认执行环境 | 最新 README / release + execution source | 检查为 `host`，并展示无隔离警告 |
| Historical Web / Agent 边界 | Plugin README / Session selection source | Web 从当前 DSH 可见历史自动取最多 3 条、不等同于 Job 输出目录；Agent Tool 仅 exact-cwd 且最多 10 条 |
| 已交付 / 未完成 | release evidence + acceptance-status + source cross-check | 发生冲突时采用较保守的公开口径 |
| 版本时间线 | CHANGELOG + tags | 不为无 tag 的版本创建正式发布卡 |
| 截图证据类型 | release archive caption | caption 必填，不允许无来源图片 |

### 12.2 发布内容检查

每次产品发版时同步检查：

1. Hero 当前版本与安装页；
2. 工具数量和工具 Reference；
3. 默认执行环境；
4. acceptance / limitations；
5. Release card 和证据链接；
6. 中英文 peer；
7. `llms.txt` / `llms-full.txt` 是否含新页面；
8. 旧版本历史说明是否仍保持原结论，没有被当前措辞覆盖。

### 12.3 隐私原则

网站不能宣传“Historical 数据永不离开本机”。用户确认后，经过投影、限量与脱敏的证据会交给所选 Judge / model；`.harbor/private` 与 `jobs` 也会在本地保留业务证据。准确表述应是：原始 Session id、完整工具 payload、reasoning 和附件不直接作为 Judge 输入，credential-shaped 内容按策略脱敏，用户在确认卡中看到 Judge 与数据边界。

- 不发布真实用户 Session、Feedback、业务 Query 或原始 Job 产物；
- 只使用仓库内已经归档、经过公开审查的截图和合成数据；
- 不把 `.harbor/private`、`jobs` 或本地构建缓存纳入 Hugo mount；
- 构建后扫描 `public/` 中的 secret-like、原始 Session id、本机路径和临时目录；
- 评论、分析、assistant links 均默认关闭，后续逐项写清隐私边界再启用。

## 13. 分阶段实施计划

### Phase 0：基线与内容契约

产出：

- 冻结 OINK、Hugo、Go 版本；
- 确认 `website/` 拓扑和 GitHub Pages；
- 建立事实来源矩阵、截图台账、双语术语表；
- 明确首版不启用的外部集成。

完成标准：所有重要宣传声明都能链接到当前文档或发布证据。

### Phase 1：OINK 空站与品牌骨架

产出：

- `website/` Hugo Module；
- English + Chinese 配置；
- Logo、favicon、颜色、字体、页脚；
- Docs / Book / Blog section roots；
- GitHub Pages workflow；
- 本地 warning-strict build。

完成标准：未填正式内容前，语言、导航、搜索、明暗模式、404、Markdown 输出已工作。

### Phase 2：首页与核心叙事

产出：

- 双语 Home YAML；
- 产品三件套、六条原则、两条路径、正式闭环；
- 前世今生时间线；
- 安装 command-box；
- FAQ 和 CTA；
- 首页 5–6 个视觉位：Hero、产品三件套、两条路径、Workbench 全景、生命周期 / 分数有效性、时间线；
- 26 个首版视觉资产的台账、caption、alt text、responsive variants 和页面分配。

完成标准：一个不了解项目的人只看首页就能复述“是什么、为什么可信、下一步做什么、不能做什么”；首页视觉丰富但初始图片传输仍控制在约 1 MiB。

### Phase 3：核心 Docs 与 Book

产出：

- Install、First Historical、First Candidate；
- Four Concepts、Score Validity、Gate；
- Architecture、Model Broker、Host vs Docker；
- Security、Troubleshooting、19 Tools；
- 六章 Book；
- 9 张核心解释图与至少 16 组 Plugin 产品截图，按 Home / Product / Workflows / Security / Releases 分布。

完成标准：网站覆盖 README → Quickstart → Integration → Architecture → Security 的主要用户旅程，但不抄录过期历史设计。

### Phase 4：Releases、证据与 Agent 输出

产出：

- Release / Evidence 页面；
- 0.1–0.9.6 历史叙事；
- 每页 Markdown、双语 `llms.txt`、Docs `llms-full.txt`、`navigation.json`；
- 站内搜索关键词和双语 description；
- Social image、sitemap、robots。

完成标准：人类、搜索引擎和 Agent 都能从稳定入口发现同一份受控内容。

### Phase 5：真实 URL 验收与发布

产出：

- warning-strict CI build与 project-subpath link scan；
- 保持已启用的 GitHub Actions Pages Source，并把 `github-pages` environment 限默认分支；
- GitHub Pages production deployment 与 artifact / action identity 记录；
- 桌面/移动、浅色/深色、英文/中文验收；
- 从外网对 `https://istarwyh.github.io/harbor-self-evolving/` 执行 HTTP、浏览器、搜索 / llms / sitemap 验收并保存记录；
- 回滚演练与 README 网站入口。

完成标准：本方案第 14 节全部通过，且公开产物不含敏感内容。

### Phase 6：上线后迭代

候选项：

- 独立域名与 Cloudflare Pages；
- 隐私友好的访问分析；
- 经审查的 Asciinema 安装/诊断演示；
- 真实、可公开的案例页；
- 版本切换器；
- 将部分站点文档逐步升级为公共文档唯一事实源。

这些都不是首版阻断项。

## 14. 验收清单

### 14.1 构建与依赖

- [x] `hugo mod graph` 解析到精确的 `github.com/pgsty/oink@v1.0.0`。
- [x] Hugo Extended / Go 版本与 CI 固定值一致。
- [x] production build 使用 `--printPathWarnings --panicOnWarning`，零 warning。
- [x] `public/`、`resources/` 和 caches 未提交。
- [x] `params.github_subdir: website` 已设置，edit/history 链接落到 monorepo 正确文件。
- [x] `LICENSES/` 与 `THIRD_PARTY_NOTICES.md` 逐项记录 OINK / Starter / 文档 / 资产的版本、来源、采用和修改方式；需要页面级 attribution 的内容已实际显示。
- [ ] production HTML 的 CSP / origin 清单已实测，不新增未声明的第三方请求，也不破坏搜索、Mermaid 或主题脚本。

### 14.2 内容真实性

- [x] 正式安装路径是 npm setup，不是本地 `link:`。
- [x] 当前版本、19 tools、Web 3 / Agent 10 会话边界准确；19 tools 全名齐全，并标出 10 个 approval 写操作与 9 个只读/内存操作。
- [x] DSH Plugin 的安装、Skill、Workbench、Context/Evidence、Historical、Evaluator、Action/Operation、Settings、Broker 均有入口，没有只介绍工具列表。
- [x] Candidate Context v3 / Historical Context v2 写法准确；Candidate v3 Web known issue 在修复发布前与能力卡同页可见。
- [x] Host 默认与“无隔离、无资源限制”的风险同时出现；Model Broker request/byte limit 不被写成 token/cost hard cap。
- [x] Historical Job 明确 Gate N/A、Meta-Evaluation not-run，并披露 bounded redacted 内容会发给所选 Judge。
- [x] Job 完成、Gate 建议、生产部署三者没有混写。
- [ ] 所有截图带版本、日期、证据类型和验证边界。
- [x] `0.9.1` 未完成发布的历史被如实说明。
- [x] 0.9.6 版本检查与本地 HEAD 一键更新分栏；一键更新不出现在 0.9.6 能力卡或发布截图。
- [x] Shipped / Development preview / Roadmap 状态来自 tag、registry 和 release archive，不以 checkout 文件是否存在为准。

### 14.3 页面与交互

- [x] `/`、`/zh/`、`/product/`、`/product/dsh-plugin/`、Plugin Docs、Book、Blog、`/releases/`、404 可打开。
- [x] 每个核心页面有翻译 peer；语言切换不回首页。
- [ ] 1440 / 768 / 390 宽度可读，移动端不隐藏 Historical 数据 / 成本等关键说明。
- [ ] light / dark 下 logo、截图、Mermaid 和状态色可读。
- [ ] 键盘焦点、modal focus trap / return、form label、progressbar、tab semantics 和 reduced motion 通过人工与 axe 检查。
- [x] 首版至少有 26 个可复用视觉资产：1 张品牌主视觉、9 张解释图、16 组产品截图；核心长页面至少一张理解图和一张产品证据图。
- [ ] Plugin 截图覆盖 loading、empty、stale/error+retry、running、partial/unscored、conflict/expired，而不只展示 happy path。
- [ ] 每张图有非重复的 alt text、版本化 caption、明确宽高；Gallery 可放大，移动端局部文字仍可读。
- [ ] Hero ≤ 300 KiB、普通 WebP 截图目标 ≤ 250 KiB、thumbnail ≤ 80 KiB；首页图片初始传输约 1 MiB，非首屏 lazy-load 且无明显 CLS。
- [ ] `/` 快捷键、本地搜索、代码复制、Tabs、Gallery、Print 正常。
- [ ] Mermaid 无浏览器 parse error；关闭 JavaScript 后关键正文仍存在。
- [ ] 内外链、编辑、历史和 GitHub Release 链接有效。

### 14.4 SEO 与 Agent 输出

- [x] canonical 指向真实生产 URL，包含 project subpath 或自定义域名。
- [x] hreflang 指向真实翻译 peer。
- [x] sitemap、production robots、preview noindex 正确。
- [ ] 每页有独立 description，核心页有 social card。
- [x] 每语言搜索 index 存在，中文/英文/缩写均可命中。
- [x] 每页 `index.md`、每语言 `llms.txt` / `navigation.json`、Docs `llms-full.txt` 可访问。
- [x] HTML head 有 Markdown alternate link。

### 14.5 安全与隐私

- [x] `public/` 不含凭据、token、Cookie、私钥、原始 Session id。
- [x] 不含 `.harbor/private`、`jobs`、临时目录和本机绝对路径。
- [x] 搜索 index、Markdown 和 llms 输出单独扫描，而不只检查 HTML。
- [x] GA、Giscus、外部搜索、assistant links 未被默认启用。
- [x] 图片没有个人信息、真实业务内容或无法说明来源的敏感信息。
- [x] Web 安全页把 same-origin 写成浏览器 CSRF 防线，并明确当前可信 loopback 前提，不将其描述为 caller authentication。
- [x] `@harbor` durable snapshot、Historical in-process operation、Evaluator browser draft 与本地 private artifacts 的保留 / 恢复限制均有说明。
- [x] 外部 URL artifact 不在公共站点演示时自动发起未知网络请求；产品文档披露当前 iframe 边界。

### 14.6 真实部署

- [x] Repository Settings → Pages 的 Source 保持已实查的 `GitHub Actions`；首次 deployment 生成 `github-pages` environment 后，仅允许默认分支部署。
- [x] `.github/workflows/website-pages.yml` 仅由 `main` push / `workflow_dispatch` 发布；PR 只走无 Pages 写权限的 website CI job。
- [x] Actions 固定到审计过的 commit SHA；build 不取得 OIDC，deploy 才取得 `pages: write` / `id-token: write`；workflow 使用 `github-pages` environment 和 `github-pages` concurrency。
- [x] Go / Hugo / module 命令的 working directory 和路径均指向 `website/`；`configure-pages` 有 `id: pages`；Hugo 接收 `${{ steps.pages.outputs.base_url }}/`；上传的是 `website/public/`。
- [x] `deploy` 明确 `needs: build`；Pages artifact 小于内部预算且不含 symbolic / hard links；没有维护 `gh-pages` 分支或依赖 `.nojekyll`。
- [x] GitHub Pages workflow 成功并记录真实 `page_url`；`https://istarwyh.github.io/harbor-self-evolving/` 不再返回当前的 `Site not found`；站点部署状态没有被写成 Plugin/package release 状态。
- [x] `/harbor-self-evolving/`、`/harbor-self-evolving/zh/`、Docs、Book、Releases、404、搜索 index、图片、Markdown、`llms.txt`、sitemap 均从正确 project subpath 加载，无 404、root-path 泄漏或 redirect loop。
- [x] canonical、hreflang、Open Graph、sitemap、robots 都指向最终公开 URL；页面刷新、语言切换、深链和 anchor 已在真实 URL 验证。
- [ ] 回滚方式已记录并实测：重新部署最后一个成功 artifact 对应的 commit，或 revert 后由 main workflow 重建；不手工修改生产文件。

## 15. DSH Plugin 产品 Roadmap

Roadmap 不是把所有安全限制都改成自动化，而是把已知协议错位、权限缝隙、恢复能力和真实体验逐步补齐。每项都必须明确属于 `Shipped`、`Development preview` 或 `Planned`；没有 tag、公开包和发布证据的功能不得提前移动状态。

### 15.1 P0：下一次正式发布前的阻断项

| 项目 | 当前问题 | 完成标准 |
| --- | --- | --- |
| Candidate Context v3 合约 | 0.9.6 Adapter 写 v3，但 Web Dashboard 只接受 Candidate v2，导致真实 v3 Job 被标 legacy/invalid 并关闭 Compare/Gate | capability/validation 显式接受 current v3，保留旧 v2 read-only compatibility；重命名陈旧变量；Node 直接读取真实 Python v3 artifact 的跨包 contract test；Historical v2 也有 protocol-aware 测试；UI Compare/Gate/Context 回归通过 |
| 一键更新安装身份 | 本地 HEAD 只把 `projectRoot` 传给 setup，可能把非默认 profile、jobsDir、runtimeDir、Docker mode 重置为 web/jobs/默认 runtime/Host；服务还会在上下文失败时回落全局 config | 从实际 DSH 安装身份读取并复核 profile、DSH_HOME、jobsDir、runtimeDir、executionEnvironment 与 Harbor paths；Preflight 显示 exact version / target / diff；Session/admin capability、串行锁、幂等 receipt、失败恢复；验证 npm/Python 版本后才提示重启；禁止 silent fallback root |
| 更新事实与版本卫生 | HEAD 仍自报 0.9.6，`Unreleased` 为空，README 还说浏览器不会安装或改写 profile，Skill / Docs 又残留 Context v2 | npm/Python/package lock 同步 bump；CHANGELOG、README、Skill、网站和 release archive 同步；开发构建显示 `0.9.6+dev.<commit>` 等可区分身份；未完成前一键更新只在 Next / Development preview |
| Web 高影响 mutation 授权 | same-origin 主要是浏览器 CSRF 防线；project-root 和未发布 updater 是 Sessionless 全局写，不能推广成完整授权模型 | 明确 loopback-only 前提；所有高影响写绑定 Host-issued Session/admin capability、workspace 与 exact target；CSRF、owner、rate/size limit 和 audit 分层说明；非 loopback 部署默认拒绝 |
| 错误状态真实性 | project-root POST 成功而 reload 失败仍显示“已切换并重新读取”；updater 非 update-available 都可能折成 up-to-date；Historical 初始恢复 / polling 错误静默吞掉 | 保存、安装、reload、poll 分阶段状态；last-success/stale/error 可见；失败绝不显示 installed/saved；所有可恢复面有 retry、超时和取消语义 |
| External artifact URL | Renderer 当前会自动用空 sandbox iframe 加载任意 HTTP(S) artifact，仍会发出网络请求并暴露 IP | 默认不自动外连；改为显式“加载外部预览”、Host proxy 或 allowlist；显示目标 origin；加入 CSP / referrer / network 测试 |
| 产品典型路径测试 | 当前完整 Node 结果 592/595，3 个失败来自 YourBuddy Node 路径含空格时测试 double shebang 不可移植；新增 updater 只做 mock / regex 测试 | fixture 改为显式 Node argv 或可靠 wrapper；典型带空格安装路径全绿；clean tarball + managed Python + non-default profile/jobs/Docker + real setup/update failure/rollback 测试通过 |

Candidate Context v3 是当前最严重的已发布兼容缺陷，应该先修产品再制作“真实 v3 Compare/Gate 已可用”的宣传素材。一键更新虽然只是本地未发布候选，也必须在进入下一 tag 前完成安装身份与失败恢复重做，不能只补一句免责声明。

### 15.2 P1：可靠性、安全与运维

1. **统一 Durable Operation Manager**：把 Historical、bounded diagnostic/retry、Evaluator save、update 等长动作统一为 journal + outbox + progress events + cancel + inspect + reattach；支持 Host restart 和跨进程锁，未知状态不自动重试。
2. **Context / private evidence 生命周期**：为 durable page-context、Trial selection、Historical private Batch、operation journal 定义 retention、revoke、GC、导出和迁移 UI；“内存 TTL”不能继续与可长期恢复的磁盘 snapshot 混为一谈。
3. **Setup 事务与回滚**：Python install、Node install、profile write、verification 分阶段落 receipt；失败恢复原 profile 和已验证 runtime，不留下半升级状态。
4. **CLI / Doctor 完整化**：CLI help 列出实际支持的 `--plugin-spec` / `--python-spec` 等全部 flags；Doctor 不只查 PATH 上的 Harbor version/plugins，还读取 active profile 的 managed paths，验证 npm/Python 同版本、两 Harbor entrypoints、bundled Skill、Broker prerequisite、Host/Docker runtime，并输出可执行修复建议。
5. **物理路径 containment**：通用 lexical `resolveWithin` 升级为 realpath / no-follow / openat 风格的物理约束；补 Evaluator、Dataset、Policy、Job 的 symlink escape 测试。
6. **Credential service**：DSH 正式 Host credential service 可用后再接入持久 secret；此前保持“Session capability 支持、明文 settings 禁止”，并给 Host mode 提供 least-privilege 环境清理建议。
7. **成本与预算**：在 request/byte budget 之外，读取 provider 可验证 usage 时展示 token / cost；无法获得时明确 `unknown`，不把请求数当费用 hard cap。
8. **HTTP 语义与错误预算**：对 400/403/404/409/413/500 分级；所有 error body 有长度上限、redaction 和 stable code；读取支持 Abort/timeout/backoff，Workbench polling 不产生重叠请求。
9. **Historical control**：提供显式取消、跨重启 reattach、date/project/cursor 筛选和“扫描不完整”说明；保持 Web 最多 3、Agent exact-cwd 最多 10 的产品差异可见。
10. **浏览器草稿边界**：Evaluator source 存 sessionStorage 的行为进入威胁模型；结合 CSP / plugin isolation，提供一键清除和 storage policy，避免同源脚本长期读取完整 source/base text。

### 15.3 P1：Web UX、可访问性与工程质量

| 方向 | 近期优化 |
| --- | --- |
| Accessibility | Historical modal 增加初始焦点、focus trap 和返回；修复嵌套 `role=button`；所有 search/select 有 label；progressbar 带 value；Editor 使用 tablist/tab；Tool toggle 有 `aria-expanded`；提高 8–10px 字体；支持 reduced motion；以 WCAG 2.2 AA 为验收目标 |
| Send context 可见性 | 普通发送自动附带页面时，Host Composer 必须显示可检查 attachment 和清除入口；Context bind 失败 fail closed；不能依赖已移除的第二 Copilot panel |
| Navigation | 对象优先，Pipeline 收入技术详情并记住 last stage；增加 URL/deep link 和浏览器 Back；保留当前 typed allowlist 与 exact restore 语义 |
| Tool cards | 从“19 个折叠 raw JSON”升级为每类任务卡：身份 / 结果 / 风险 / 下一步；raw JSON 只在 Audit；继续只接受 trusted schema 的 navigation action |
| Evaluator Editor | 真正行级 diff/merge、semver 校验、descriptor validation、save→409 conflict E2E；仍要求人工 review、新身份，不自动运行评测/Gate |
| Responsive / i18n | 在 390 / 768 / 1440、light/dark、中文/英文下验收；移动端不得隐藏 Historical 数据 / 成本等关键说明；清除中英文硬编码混用 |
| Error recovery | Renderer、Reporter 等面板统一 retry/stale/last-success；Ask AI 在 Composer busy / replace fail 时给明确反馈；Escape 不应在 textarea/select 编辑时退出 Workbench |
| Architecture | 将 2855 行 `src/client/index.jsx` 拆成 Dashboard、Workbench、Context、Navigation、API、Settings modules；迁移内联 CSS 到 tokenized styles；从共享 schema 生成 typed request/response 与 Tool reference |
| Browser evidence | 增加 React DOM + Playwright + axe 的真实 Host smoke，覆盖 desktop/mobile、键盘、loading/empty/stale/error、Context attachment、Historical、Compare、Editor conflict；`npm test` 先校验 client bundle 与 source 同步 |

现有自动化优势主要在所有权、状态机、恢复和 bounded-read 单元测试；它不能被写成“完整 Web UX / a11y / 响应式已经浏览器验收”。后续发布证据要分别报告逻辑测试、真实 DOM、实际 DSH Host、真实 provider 和真实业务质量，不能相互替代。

### 15.4 P2：平台化与生态

- 非纯本机 / 多用户场景引入 per-Session capabilities、RBAC、审批角色、rate limit、CSP / 插件隔离、审计导出；生产动作继续默认未注册。
- 为 Gate Request 与 Deployment Handoff 提供可插拔 CI/CD adapter，但只交付经过审阅的 exact identity handoff，不让 Plugin 直接替换 Champion。
- 建立注册表 / schema 驱动的工具、协议、配置和网站 reference，减少 Plugin、Skill、Adapter、Docs 之间再次发生版本漂移。
- 为大 Job 数与大 Population 引入索引、虚拟化和可恢复游标，不突破 bounded read 与显式选择语义。
- 建立 opt-in、无业务内容的本地运行指标与诊断导出；默认无 analytics、无远端 telemetry。
- 在公开预算和数据许可下补 real-provider、多平台 installed-host 和垂直业务 case study；仍把产品机制有效与 Candidate 业务质量分开证明。
- 扩展语言与社区模板前先稳定英中术语和 translation parity，避免多语言放大协议漂移。

### 15.5 不应被“优化掉”的安全边界

以下是产品原则，不是 backlog bug：

- Historical Generation Evaluation 继续 `diagnostic-only`，Gate 必须是 N/A。
- Candidate / Gate / Deployment action card 继续以 draft / handoff 为主，不自动应用或上线。
- Evaluator 保存继续生成新身份，不原地覆盖历史版本，也不自动跑 Meta-Evaluation、Agent baseline 或 Gate。
- `Ask AI` 继续只准备上下文和问题，不自动发送；Evidence 继续作为 untrusted data，而不是指令。
- Host 继续可以作为低门槛默认选项，但必须明确它不是 sandbox；不能用模糊文案掩盖当前用户权限与环境继承。
- Promotion Gate 继续只输出基于固定 Policy 的决定 / 建议；部署和 Champion ownership 留在外部 CI/CD。

### 15.6 Roadmap 状态迁移规则

一个 Roadmap 项只有同时满足以下条件才能变成 `Shipped`：

1. 实现、跨包 contract 和失败路径测试已合并；
2. npm Plugin、Python Adapter、Skill / Docs 的版本与说法一致；
3. 正式 tag、公开 registry 制品和 release archive 身份一致；
4. 对应截图 / 日志注明 synthetic、controlled-model、real-provider 或 public-release；
5. 验证限制和未覆盖风险与能力卡同页展示。

## 16. 主要风险与缓解

| 风险 | 表现 | 缓解 |
| --- | --- | --- |
| 宣传超过证据 | 把 synthetic 测试写成真实业务验收 | Claims ledger + 截图证据标签 + acceptance-status 复核 |
| 双语漂移 | 中文更新、英文仍是旧能力 | 核心页 peer 检查、发布清单、同 ID heading |
| 两套文档冲突 | website 与 `docs/` 说法不同 | source_refs、version baseline、一致性检查 |
| Harbor 名称歧义 | 被认为是镜像仓库 | SEO 标题始终带 Agent evaluation / DSH，FAQ 解释 |
| Pages Source 被误改 | 当前已正确使用 GitHub Actions；若改回 branch source，workflow artifact 不再是生产事实 | 保持 Source=GitHub Actions，并验证 `github-pages` environment 与 workflow identity |
| baseURL / project subpath 静默错误 | 首页可开但搜索、图片、Markdown 或深链落到域名根并 404 | 使用 `configure-pages.outputs.base_url`、禁止手写 root URL、构建扫描 + 真实 URL checklist |
| Pages Action 供应链漂移 | 直接引用可移动 major tag，构建行为变化 | 以 OINK Starter 当前 major 为基线，实施时固定完整 commit SHA 并单独升级 |
| Pages 安全 header 被高估 | 以为 `_headers` 或 workflow 能给静态响应增加完整 CSP | GitHub Pages 首版仅审计 meta CSP；需要 header-only 能力时迁移支持 headers 的托管层 |
| Mermaid 构建不报错 | 浏览器才显示 parse error | 浏览器验收 + 关键结论写入正文 |
| 搜索/llms 泄露 | 非 HTML 产物包含敏感文本 | 构建后扫描所有公开格式 |
| Host 模式被误解为沙箱 | 用户以为任务受容器隔离 | 安装、执行环境和安全页重复展示实际权限 |
| Plugin / Adapter 协议漂移 | Candidate v3 已产出，Web 仍按 v2 判断 | 跨包 contract test + schema 生成 reference + 已知问题同页展示 |
| 未发布功能冒充 0.9.6 | source build 仍显示 0.9.6，却含一键更新 | dev build identity + Shipped/Development/Planned 三分法 + 只用 tag 包截图 |
| Same-origin 被误写成授权 | 非浏览器本机 client 可伪造请求头，高影响写缺 capability | 明确 loopback 前提；Roadmap 加 Host-issued Session/admin capability |
| 后台恢复能力被概括过度 | Diagnostic 有 journal，Historical 仅进程内 | 按操作类型说明；统一 durable operation manager 前不承诺跨重启恢复 |
| 测试数量掩盖 UX 缺口 | state-machine 单测通过被写成浏览器/a11y 验收 | 分别报告 unit、DOM、Host E2E、provider 和业务 evidence |
| OINK 升级漂移 | 主题 main 变化导致站点不稳定 | 精确 tag + go.sum + 单独升级 PR + 回滚版本 |
| Starter 许可遗漏 | 复制主题/文档片段未保留归属 | 保留 LICENSE/NOTICE，文档改写不复制，必要时 CC BY attribution |

## 17. 实施前需要最终确认的三项非阻塞信息

若用户没有另行指定，实施阶段使用以下默认值，不阻塞首版：

1. **生产地址**：先用 GitHub Pages project URL；后续再绑定独立域名。
2. **语言**：English 为根路径，Simplified Chinese 为 `/zh/`；两者同批发布。
3. **外部集成**：首版不启用 analytics、comments、hosted search 和 assistant links。

## 18. 最终交付物

实施完成后应交付：

- `website/` 完整 OINK 站点源码；
- 英中双语首页、Docs、Book、Blog / Releases；
- 品牌 Logo、favicon、social image，以及至少 26 个带台账的视觉资产；
- 9 张核心架构/流程图与至少 16 组 Plugin 产品截图；
- GitHub Pages workflow；
- 内容事实来源矩阵、截图台账、术语表；
- warning-strict build 和真实 URL 验收记录；
- README 网站入口；
- 面向下一版本的内容更新清单。

本方案的判断标准不是“页面够不够炫”，而是：**新用户是否能快速理解并开始，专业用户是否能深入验证，维护者是否能持续更新，且网站是否始终诚实地区分能力、证据、限制与未来工作。**
