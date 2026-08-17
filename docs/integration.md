# 接入指南

## 1. 定义 Candidate

一个 DSH Candidate 至少包含：

```text
candidate/
├── cordis.yml
├── package.json
├── package-lock.json
└── business plugins...
```

不要把密钥写入 Candidate。运行时凭证应由受控环境注入，并在不同 Candidate 之间保持相同权限。

执行 snapshot 后，任何文件变化都会改变 digest；旧 manifest 与新内容不一致时，Harbor Agent 会拒绝运行。
`candidate_id` 表示同一个 Agent 产品线，通常在 v1/v2 间保持稳定；`version` 与 `digest` 标识具体 Candidate。

## 2. 定义 Harbor Dataset

Task 固定 instruction、容器环境和 verifier。若使用极简 Alpine 镜像，必须包含 `bash`；本插件的 ACP-ready 快速路径还会检测 `python3`、`curl`、`node`、`npm`、`stdbuf` 和 `/opt/harbor-acp-venv`。示例 Dockerfile 展示了如何在构建阶段固定这些依赖，避免每个 Job 重复联网安装。

业务副作用应使用测试账号、mock server 或隔离 sandbox。Verifier 应输出多个可诊断 reward，而不只是单一总分。

## 3. 从 DSH 发起评测

Cordis bundle 的 `projectRoot` 是安全边界。Candidate、Dataset、Job 和 policy 路径都必须位于该目录下；子进程使用参数数组启动，不经过 shell。

典型调用顺序：

```text
harbor_candidate_snapshot
→ harbor_eval_run
→ harbor_eval_result
→ 人或 Optimizer 生成新 Candidate
→ harbor_eval_run
→ harbor_candidate_compare
```

`harbor_eval_run` 会再次 snapshot，因此无法用旧 digest 冒充已修改的 Candidate。

## 4. 接入 CI/CD

推荐生产链路：

```text
Optimizer branch / PR
→ CI 单测与安全检查
→ 构建 candidate image@sha256
→ 部署到隔离 preview
→ Harbor smoke + regression Jobs
→ Promotion Gate
→ 人工审批（可选）
→ CD 更新 Champion
```

当前 `DshCandidateAgent` 直接上传本地 Candidate 并通过 ACP 运行，适合本地开发和 CI。面向已部署服务时，应新增一个 image/endpoint Agent adapter，但继续复用 Candidate manifest、Job Plugin、summary 和 Gate，不要让 Harbor 负责生产发布。

## 5. 稳定衡量进步

- 固定评测集和环境镜像 digest。
- 固定 Candidate 的直接与传递依赖，提交 lockfile。
- 同时保存总 reward、分项指标、异常和轨迹。
- 对随机 Agent 做多次 Trial，并比较置信区间，而非只看一次均值。
- Gate 规则版本化；改 Verifier 或 policy 时重新建立 baseline。
- 将生产观察指标作为外部验收，不把离线分数直接等同于业务收益。
