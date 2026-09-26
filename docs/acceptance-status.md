# 当前验收状态

本文描述当前主线的实现与证据边界。逐版本发布证据仍以[发布图集](releases/README.md)为准；本页不是发布授权。

## 已交付的主线能力

- DSH Plugin、官方 Skill 与 Harbor Adapter 可通过正式 `setup` 安装；正式 Candidate Experiment 只执行用户提供的 `harbor-dsh-evaluator/v2` exact bundle。Dataset 自带任意 verifier、v1 执行兼容和 legacy fallback 均不进入当前评分路径。
- `evaluation-report/v1` 是默认用户结果：先显示 Verdict、是否可评分、生成器质量 / 评测健康 / 运行健康、覆盖率、主要发现、代表任务、实际执行的 Evaluator 和一个下一步。缺失或不可信的 score 一律为 `null`。
- Experience Diagnostic 使用 Session Observation v2、Historical Batch v2 与 Historical Context v3；它保留有界、脱敏的工具结果摘要，不暴露原始工具 payload，并且永远不是业务质量证明或 Gate 输入。
- 外部聚合结果使用不可覆盖的 `business-observation/v1`，按 Candidate/Deployment 与观察窗口绑定，只做相关性展示，不回写离线分数、reward、comparison 或 Gate。
- 正式 Experiment 固化 `evaluation-spec/v1`，包含 Dataset → Generator → Evaluator → Metrics → Optimizer、repeat/seed policy 与 measurement identity。Baseline/Candidate 比较要求相同 measurement identity，并输出 paired Trials、ties 和成对任务不确定性。
- Historical badcase 只有在人工检查 plan、确认 exact digest 后才能生成回归 Dataset 草稿；只复制有界原因、建议和 evidence refs，草稿在补充确定性期望或独立 GT 前明确不是 promotion-eligible。
- Meta-evaluation 是独立 GT + 重复 observations → ESF/SCE/RCR report 的独立流程；报告绑定 exact Evaluator、Rubric、Judge 与 Template identity，身份或 GT 漂移时标记为 stale，不伪装成 Harbor Meta Job/Gate。
- 产品模式分为 `diagnostic`、`experiment`、`governed`。Experience Diagnostic 不展示 Compare/Gate/Audit；普通 Experiment 展示复现产物但不运行 Gate；只有 Governed 模式展示 Compare、Gate、完整 Artifact Registry 与 Audit。
- Host 被准确标记为不受限、非沙箱执行；Docker 才是隔离边界。Governed Policy 必须要求 Docker，或明确接受 unrestricted Host 风险。Policy 要求 immutable image identity 时，缺失身份会阻断 Gate。
- 完成 Job 写入内容寻址 `job-bundle/v1`。报告和 Gate 验证 seal；Gate 还从 sealed Trial Assessment/Result 重算 Summary invariants，不能只信任存储的聚合值。
- 根、npm 与 Python package source 中 34 个公共 Schema 字节一致；npm 包导出全部 Schema。跨语言 golden vectors 覆盖 `1.0`、`-0.0`、固定/指数形式等数字 canonicalization。

## 自动验证证据

- Node：`npm run check`，632 tests passed，并重建 `packages/dsh-plugin/lib/client.js`。
- Python：`.venv/bin/python -m pytest tests -q`，378 tests passed。
- npm dry run：81 个文件、34 个公共 Schema，包含 `evaluation-spec.schema.json`。
- 公共 Schema：root、npm package source、Python package source 共 34 份逐字节一致。
- 关键回归覆盖 strict materialization、Evaluator tamper/secret/import closure、score suppression、Job seal、Gate invariant recomputation、Historical Evidence v2、business observation、badcase confirmation、Meta identity、repeat/uncertainty、product-mode navigation 与 Docker image-ID capture。

## 尚未由本轮环境完成的人工或外部验证

- 当前 `http://127.0.0.1:17890` 临时后台标签返回“authentication required”，浏览器中也没有可复用的已授权 Harbor URL；因此未声称完成真实页面的人工点击验收。Web bundle 已构建，组件/状态机测试通过。
- Docker daemon 可用，immutable image-ID 捕获与 Governed Policy 已由 mock/runtime 单元测试覆盖；本轮没有启动需要真实业务 Candidate、镜像和模型调用的付费/外部 Provider Job，因此不把这些测试描述为真实供应商质量验证。
- 本轮环境没有 `uv`、`build` 或 `hatchling` 构建命令，未生成 wheel 文件；Python package source 的 34 个 Schema 已由回归测试验证，npm dry-run 已实际验证。发布前仍应在标准 release 环境执行 wheel/sdist build。
- Harbor 不实现生产级 RBAC、部署审批、流量切换或生产发布。内容寻址 Job seal 不是外部签名，不能抵御拥有本地写权限的恶意所有者同时重写产物与 seal。
- Historical Job 仍是诊断证据，不能进入 Promotion Gate；Evaluator 可靠性仍依赖独立 Ground Truth 和重复元评测。

## 证据入口

- [科学评测与优化闭环重构方案](tech/202609/harbor-scientific-evaluation-refactor.md)
- [安全边界](security.md)
- [Evaluator Interface v2](evaluator-interface.md)
- [Candidate 运行时契约](candidate-runtime-contract.md)
- [发布图集](releases/README.md)

更新当前能力时修改本页；历史记录只归档，不回写成新的验收结论。
