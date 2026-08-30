# 接入指南

## 1. Candidate

Candidate 是完整、可运行、锁定依赖的 DSH/Cordis composition：

```text
candidates/<agent>/<version>/
├── cordis.yml
├── package.json
├── package-lock.json
└── business plugins, prompts, skills, tools...
```

同一 Agent 产品线的 `package.json.name` 保持一致，version 和 digest 区分具体 Candidate。不要写入密钥、生产 session 或可变部署状态。调用 `harbor_candidate_snapshot` 后，任意文件变化都会让旧 manifest 失效。

## 2. Dataset Manifest

Dataset Task 固定 instruction、容器、Verifier 和 GT。先生成/校验 `dataset-manifest.json`：

```bash
harbor-dsh dataset snapshot datasets/search --id vertical-search --version 1.0.0
harbor-dsh dataset validate datasets/search --project-root "$PWD"
```

修改 Dataset 文件后 source digest 会失配；显式升级 Dataset version、重新 snapshot，并建立 fresh baseline。业务副作用必须使用测试账号、mock 或 sandbox。

## 3. Evaluation Stack

运行初始化 Skill，或显式调用 `harbor_evolution_init` 创建标准结构。然后实现八个业务角色，避免在 Task 或 Runner 内复制 Evaluator。检查：

```bash
harbor-dsh stack validate .harbor/evaluation-stack.yml --project-root "$PWD"
harbor-dsh doctor --architecture \
  --project-root "$PWD" \
  --stack .harbor/evaluation-stack.yml \
  --dataset datasets/search \
  --candidate candidates/search/v1 \
  --policy policies/promotion.json
```

## 4. 从 DSH 发起

推荐工具顺序：

```text
harbor_candidate_snapshot
→ harbor_dataset_validate
→ harbor_evolution_doctor
→ harbor_context_preview
→ harbor_eval_run(mode=diagnostic | promotion-eligible)
→ evidence-linked Candidate change
→ harbor_context_preview
→ harbor_eval_run
→ harbor_candidate_compare
```

`harbor_eval_run` 必须传 `candidatePath`、`datasetPath`、`stackPath` 和 `mode`；`promotion-eligible` 还必须传 `policyPath`。它会在启动 Harbor 前再次运行严格检查。

## 5. 用最近 DSH 会话冷启动

没有显式 Dataset 时，官方 Skill 默认走已有生成结果的诊断分支：

```text
harbor_session_diagnostic_preview(limit=10)
→ 展示安全会话元数据、排除原因、Judge、coupling、成本与本地保留范围
→ 用户明确确认
→ harbor_session_diagnostic_run(selectionToken)
→ historical-generation-evaluation Job
```

Preview 只读取当前 Agent Session 的 exact-cwd，默认最近 10 条已完成顶层业务会话；一条会话对应一个 Trial。它不会返回原始 Session id、正文或工具 payload。`createdAfter` 可缩小候选范围，当前没有 cursor；超过读取预算时必须缩小时间范围或改用显式 Dataset。

确认令牌绑定用户 Session、工作区、样本、Feedback 状态与 Judge 身份，15 分钟内单次使用。Run 会再次校验所有源 digest，然后把脱敏 Batch 写入 `.harbor/private/session-batches`，并在 `jobs` 保留 Historical 证据。运行前检查两个目录的 VCS 与保留策略。

Historical Job 不接受外部自定义 Stack，不执行 Candidate，也不能比较或晋级。`completed-unscored` 表示 Evaluator 因证据不足正常弃权；应分别报告 Trial/Criterion coverage，而不是把它换算成 0 分。确认后的 badcase 可以再固化为回归 Dataset，进入普通 Candidate 路径。

## 6. Workbench 与大批量 Jobs

Harbor Tab 总览只读取轻量 Summary。打开 Job 后按需读取完整产物；Trials 由服务端分页、搜索和筛选，单页最多 100。Trial detail 返回脱敏、截断的 assessment，不返回完整原始 SSE。原始 Harbor `result.json`/trajectory 仍留在 Job 目录供受控离线审计。

## 7. CI/CD

```text
Optimizer branch / PR
→ CI 单测与安全检查
→ 构建 immutable image@sha256
→ 部署隔离 preview
→ Harbor smoke/regression Jobs
→ Promotion Gate
→ 审批
→ CD 晋级同一 image digest
```

当前本地 Adapter 通过 ACP 上传 Candidate。评测已部署服务时可新增 endpoint/image Integration，但继续复用 Manifest、Stack、Context、Artifacts 和 Gate。Harbor 不负责生产发布。

## 8. 稳定性规则

- 固定 Dataset、环境镜像 digest、Judge 和 reward-affecting Stack 组件。
- 所有指标声明方向；不要假设都是 `/10` 或越大越好。
- 区分 capability failure 和 infrastructure exception。
- 随机 Agent 使用对称 seed/repeat policy，不挑最好的一次。
- 任何优化建议必须引用 Job/Trial/finding，并限定 mutation surface。
- 离线 Gate 不是线上业务收益；保留部署后的外部观察指标。
