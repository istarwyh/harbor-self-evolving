import React, { useCallback, useEffect, useMemo, useState } from 'react'

import oceanBackground from './assets/harbor-ocean.jpg'

const NS = 'harbor-evolution'
const API = '/_dsh/harbor-evolution'
const STAGES = ['candidate', 'dataset', 'integration', 'renderer', 'judge', 'meta', 'reporter', 'optimizer', 'gate']
const REPORT_PAGE_SIZE = 10

const dictionaries = {
  zh: {
    tab: 'Harbor', settings: 'Harbor 自进化', eyebrow: 'EVALUATION WORKBENCH',
    heroTitle: '看见 Agent 的每一次进步，也看见分数是否值得相信',
    heroBody: 'Harbor 固定实验边界；Trial Lifecycle 展示真实运行过程；Score Validity 阻止基础设施故障伪装成业务 0 分。',
    refresh: '刷新', jobs: '评测批次', jobsHint: '点击 Job 后，最多再点一次即可进入对应 Trial 的证据。', workspace: '工作空间', workspaceSelect: '选择 Harbor 工作空间', empty: '还没有 Harbor Job。可以先评测这个工作空间最近完成的真实会话。',
    historicalLaunch: '评测最近会话', historicalLaunchShort: '开始评测', historicalLaunchHint: '最多 10 条 · 先预览再运行', historicalLaunchBody: '用当前 DSH Agent 已完成的真实任务做诊断，不重新运行 Candidate。', historicalPreparing: '正在查找可评测会话…', historicalPreparingShort: '读取中…', historicalPreviewTitle: '确认历史会话评测', historicalPreviewHint: '这里只展示安全元数据。确认前不会写入 Batch，也不会启动 Harbor Job。', historicalConfirm: '确认并开始评测', historicalStarting: '正在启动…', historicalRunning: '历史会话评测运行中', historicalRunningHint: '可以关闭此窗口继续工作。Harbor 会在后台运行，完成后自动打开 Job。', historicalActive: '查看运行状态', historicalActiveShort: '查看状态', historicalCompleted: '评测完成，正在打开 Job…', recentSessions: '本次会话样本', selectedSessions: '选中会话', requestEstimate: '预计 Judge 请求', tokenExpiry: '预览有效期', generatorRole: '生成器', generatorRoleValue: '产生这些会话的 DSH Agent', evaluatorIdentity: '评测器身份', judgeIdentity: 'Judge 身份', coupling: '模型耦合', evidenceRetention: '证据保留', historicalBoundaries: '本次运行边界', historicalBoundaryDetail: '不运行 Candidate · 不做评测器元评测 · 不进入 Gate / 晋级', feedbackCounts: '反馈', turnCounts: '轮次', toolCounts: '工具调用', previewAgain: '重新预览', recent30Days: '仅看最近 30 天', noEligibleHint: '当前工作空间没有符合条件的已完成顶层会话。先在这个目录完成一个有用户输入和 Agent 输出的真实任务，或改用显式 Dataset。', narrowScanHint: '这个工作空间的会话太多。可以把扫描范围缩到最近 30 天后重试。', changedSessionHint: '预览后会话、反馈或工作空间发生了变化。为了避免评错证据，请重新预览。', historicalGenericError: '没有启动 Job。请检查提示后重新预览。', cancel: '取消',
    completed: '已完成', partial: '完成但有异常', failed: '读取失败', pending: '等待运行', running: '运行中', attention: '需核查',
    candidate: '候选版本', dataset: '评测集', integration: '集成', renderer: '产物呈现', judge: '评测器', meta: '评测器元评测', reporter: '评测报告', optimizer: '优化器', gate: '晋级门禁',
    historicalTarget: '历史生成记录', generationRecords: '会话记录', generationSource: '生成来源', generatorPopulation: '生成器群体', executionMode: '执行方式', observationMode: '只观察已有结果', batch: '批次', scoredTrials: '已评分 Trials', unscoredTrials: '未评分 Trials', homogeneousPopulation: '同构生成器群体', mixedPopulation: '混合生成器群体',
    metaNotRun: '未运行（未验证）', metaNotRunHint: '本 Job 只评测已有生成记录；它没有评估评测器本身是否可靠。严格的评测器元评测需要独立 GT 和单独的元评测流程。', gateNotApplicable: '不适用（N/A）', gateNotApplicableHint: '历史生成评测是诊断证据，不是 Candidate 对比或晋级输入。请将确认的 badcase 固化为回归 Dataset，再运行 Candidate Job。',
    context: 'Context v2', trials: 'Trials', exceptions: '异常', mode: '模式', close: '关闭', retry: '重试', loading: '正在读取…', noData: '暂无数据', currentStatus: '当前状态',
    score: '业务分数', valid: '分数有效', validScores: '有效分数', invalid: '分数无效', unavailable: '不可用', validity: 'Score Validity', progress: '进度', health: '健康度', evidence: '证据',
    capabilityUnavailable: '此 Job 未产出该版本能力；仅按历史产物只读展示。',
    search: '搜索 Query / Trial', all: '全部', previous: '上一页', next: '下一页', datasetOrder: 'Dataset 顺序', latest: '最近完成', lowest: '最低分', errorsFirst: '错误优先',
    findings: '主要发现', recommendations: '建议', output: '用户可见输出', criteria: '评分维度', provenance: '证据来源', timing: '执行时间', audit: '审计原文',
    compare: '回归比较', baseline: 'Baseline Job', comparable: '可比较', notComparable: '不可比较', improved: '改善样本', regressed: '回归样本', explicitGate: '只读比较不会自动 Gate；需要显式授权后运行确定性 Gate。',
    governance: '评测器治理', governanceHint: '读取 Rubric / Evaluator / Judge 身份与源码。语义改动必须创建新身份，并建立新 Baseline。',
    artifacts: 'Artifact Registry', setupDoctor: '安装与架构检查', setupHint: '这里显示 Web 工作台实际使用的项目根目录。每次 Harbor Agent Tool 调用都会自动切到该 Session；工具执行仍保持 Session 隔离。',
    projectRoot: '当前 projectRoot', switchProjectRoot: '切换并重载', projectRootHint: '请输入已存在的绝对目录。本次 DSH 运行立即生效；下一次 Harbor Agent Tool 调用会自动跟随它的 Session。', switchingProjectRoot: '正在切换…', projectRootUpdated: '已切换并重新读取 Harbor Jobs。', projectRootConfigured: '来源：Plugin 启动配置', projectRootAgent: '来源：最近一次 Harbor Agent 调用（自动同步）', projectRootManual: '来源：本次运行手动切换',
    pluginVersion: '插件版本', checkingUpdate: '正在检查更新…', updateAvailable: '发现新版本', upToDate: '已是最新版', updateUnavailable: '暂时无法检查更新', currentVersion: '当前版本', latestVersion: '最新版本', updateHint: '在终端运行下面的命令即可升级 Plugin、Skill 和 Harbor Adapter。升级不会在浏览器中静默执行。', offlineUpdateHint: '这不会影响 Harbor 的任何功能。请检查网络后重试，或在终端运行带 @latest 的安装命令。', copyUpdateCommand: '复制更新命令', updateCommandCopied: '已复制更新命令', checkAgain: '重新检查', viewRelease: '查看发布说明', checkedAt: '检查时间', staleVersion: '当前展示的是最近一次成功检查的结果。',
    credentialPolicy: 'Secret 持久化策略', sessionCredential: '仅本次运行', credentialStore: 'DSH 凭据库', plaintextCredential: '明文 settings', supported: '已支持', hostServiceRequired: '等待 Host credential service', forbidden: '禁止', sessionCredentialHint: '默认。通过环境变量或 Job 临时 capability 注入，不进入评测身份与报告。', credentialStoreHint: '只有 DSH 暴露正式凭据服务后才可启用，当前不会用 settings.yaml 冒充。', plaintextCredentialHint: 'Harbor 不把 Authorization、API key 或 OAuth token 写入项目配置。',
    stageNav: '评测阶段', datasetTasks: '评测任务', datasetSource: '任务来源', taskInstruction: '具体任务要求', instructionFile: '指令文件', snapshot: 'Job 固化快照', historicalFallback: '历史 Job 源文件回读',
    generatedOutput: '生成产物', selectTrial: '选择 Trial', noRenderableOutput: '这个 Trial 没有可呈现的页面、文档或结构化产物。请让 Agent 将业务结果写入 Harbor artifacts。', previewSource: '产物来源', pagePreview: '页面预览', documentPreview: '文档预览', structuredOutput: '结构化产物', rawOutput: '原始产物',
    currentEvaluator: '当前评测器', evaluator: 'Evaluator', rubric: 'Rubric', judgeParameters: 'Judge 参数', scoringContract: '评分合同', primaryMetric: '主指标', metricSemantics: '指标语义', sourceCode: '查看源码', upgradeEvaluator: '如何升级评测器', upgradeHint: '评测器升级会改变分数语义。创建新身份，先做元评测，再建立新的 Agent Baseline。', copyPrompt: '复制给 Agent', copied: '已复制', freshBaseline: '需要新 Baseline', metaEvaluation: '元评测要求',
    evaluatorImplementation: '评测器实现', evaluatorKind: '实现类型', evaluatorProtocol: '接口协议', editableFiles: '允许修改的文件', openFile: '打开', editingFile: '正在修改', editSource: '直接修改当前文件', evaluatorVersion: '新 Evaluator 版本', stackVersion: '新 Stack 版本', saveEvaluator: '保存为新身份', saving: '正在保存…', saved: '已保存；下一步请做元评测并建立新 Baseline。', reloadBeforeSave: '源码已变化，请刷新后再保存。', noEvaluatorInterface: '当前 Stack 还没有 harbor-dsh-evaluator/v1 接口，不能从 UI 安全编辑。', editWarning: '保存只更新源码与身份，不会自动运行评测或 Gate。',
    upgradeStep1: '查看当前 Evaluator、Rubric、Judge、评分合同和代表性误判样本。', upgradeStep2: '创建新的评测器身份、版本和源文件；不覆盖历史评测器。', upgradeStep3: '使用独立、可追溯的 GT 运行元评测，检查 ESF、SCE、RCR、延迟和成本。', upgradeStep4: '更新 Evaluation Stack 身份，并预览 Context v2 变化。', upgradeStep5: '在新分数语义下建立全新 Agent Baseline，再比较后续 Candidate。', evaluatorPrompt: '请使用 evolve-agent-with-harbor 升级当前评测器。先读取 governance 证据，澄清 GT 的来源类型、provenance、维护者和目标元指标，再提出新的不可变评测器身份与 fresh-baseline 方案。在我批准受控改动前，不要修改文件或发起评测。',
    queryTrial: '任务 / Trial', statusLabel: '状态', attempt: '尝试', population: '任务数量',
    experimentIdentity: '本次实验使用了什么', experimentIdentityHint: 'Candidate、Dataset、Evaluation Stack 与模型身份共同定义可比较实验；DSH 运行时默认追随最新版，并在证据中明确记录该策略。', immutableCandidateFiles: '候选版本内容', file: '文件', size: '大小', digest: '内容指纹', runtime: '运行时', evaluationStack: 'Evaluation Stack',
    integrationBoundary: '执行与评分边界', hardRequirements: '分数生效前必须满足', populationEvidence: '总体评测证据', metric: '指标', aggregate: '总体值', coverage: '有效覆盖', trialGroups: 'Trial 状态分组',
    controlledHypotheses: '受控优化假设', rootCause: '证据指向', affectedTrials: '影响样本', expectedEffect: '预期指标变化', mutationSurface: '允许改动', forbiddenSurface: '禁止改动', guardrails: '保护条件', rollback: '回滚条件', nextExperiment: '下一次受控实验', noHypotheses: '本批次没有生成受控优化假设。',
    gateEvidence: '已执行的晋级门禁', decision: '门禁结果', policy: '门禁策略', eligible: '满足门禁前提', notEligible: '不满足门禁前提', metricDeltas: '指标变化', newExceptions: '新增异常', artifactRegressions: '产物回归', reasons: '门禁依据',
    trialAssessments: '逐 Trial 评测', trialAssessmentsHint: '每一行对应一个业务产物；选择任务后可并排查看产物、逐维分数、原因和评测器建议。', overallScore: '综合分', artifact: '评测产物', assessmentReason: '评分原因', assessmentRecommendation: '改进建议', assessmentDetails: '评测详情', noAssessmentReason: '评测器没有返回评分原因；该结果不应进入有效总体分。', noAssessmentRecommendation: '评测器没有返回改进建议；该结果不应进入有效总体分。', evaluatorAdvice: '评测器建议', reportPage: '报告分页',
    groundTruth: 'Ground Truth（金标）', groundTruthRequired: '需要先建立独立 Ground Truth', gtSource: 'GT 来源', gtProvenance: '来源证明', gtCases: '金标样本', gtBadcases: 'Badcase', gtKinds: '可选来源：人工、程序、多方共识、独立模型或外部标准。关键是版本化、可追溯，并独立于待测评测器。', metaWorkflow: '独立元评测流程', metaWorkflowHint: 'Evaluator 是 Candidate；固定产物与 GT 是 Dataset；重复观测后计算 ESF、SCE、RCR。', metaNext: '下一步', disagreements: '分歧样本', hookExecution: '组件执行状态', configuredHookNotRun: 'Evaluation Stack 已配置该业务组件，但本次并未执行；当前内容由插件内置确定性 fallback 生成。', configuredHookRun: '本次执行了 Evaluation Stack 配置的业务组件。', pluginFallback: '插件内置 fallback', badcase: 'Badcase',
  },
  en: {
    tab: 'Harbor', settings: 'Harbor Evolution', eyebrow: 'EVALUATION WORKBENCH',
    heroTitle: 'See every Agent improvement—and whether the score is trustworthy',
    heroBody: 'Harbor fixes the experiment boundary. Trial Lifecycle shows real execution, while Score Validity keeps infrastructure failures out of quality metrics.',
    refresh: 'Refresh', jobs: 'Evaluation jobs', jobsHint: 'Open a Job, then reach Trial evidence in at most one more interaction.', workspace: 'Workspace', workspaceSelect: 'Select Harbor workspace', empty: 'No Harbor Jobs yet. Start by evaluating recent completed Sessions in this workspace.',
    historicalLaunch: 'Evaluate recent Sessions', historicalLaunchShort: 'Start evaluation', historicalLaunchHint: 'Up to 10 · preview before running', historicalLaunchBody: 'Diagnose real tasks already completed by the current DSH Agent without rerunning a Candidate.', historicalPreparing: 'Finding eligible Sessions…', historicalPreparingShort: 'Loading…', historicalPreviewTitle: 'Confirm Historical Session evaluation', historicalPreviewHint: 'Only safe metadata is shown. No Batch is written and no Harbor Job starts until you confirm.', historicalConfirm: 'Confirm and start evaluation', historicalStarting: 'Starting…', historicalRunning: 'Historical Session evaluation is running', historicalRunningHint: 'You can close this window and keep working. Harbor runs in the background and opens the Job when it completes.', historicalActive: 'View run status', historicalActiveShort: 'View status', historicalCompleted: 'Evaluation complete. Opening the Job…', recentSessions: 'Session sample', selectedSessions: 'Selected Sessions', requestEstimate: 'Estimated Judge requests', tokenExpiry: 'Preview expires', generatorRole: 'Generator', generatorRoleValue: 'The DSH Agent that produced these Sessions', evaluatorIdentity: 'Evaluator identity', judgeIdentity: 'Judge identity', coupling: 'Model coupling', evidenceRetention: 'Evidence retention', historicalBoundaries: 'Run boundaries', historicalBoundaryDetail: 'No Candidate run · no Evaluator meta-evaluation · no Gate or promotion', feedbackCounts: 'Feedback', turnCounts: 'Turns', toolCounts: 'Tool calls', previewAgain: 'Preview again', recent30Days: 'Only last 30 days', noEligibleHint: 'No eligible completed top-level Sessions were found in this workspace. Complete a real task here with direct user input and Agent output, or use an explicit Dataset.', narrowScanHint: 'This workspace has too many Sessions to scan safely. Narrow the scan to the last 30 days and try again.', changedSessionHint: 'A Session, its feedback, or the workspace changed after Preview. Preview again so Harbor cannot evaluate stale evidence.', historicalGenericError: 'No Job was started. Review the message and preview again.', cancel: 'Cancel',
    completed: 'Completed', partial: 'Completed with errors', failed: 'Read failed', pending: 'Queued', running: 'Running', attention: 'Needs review',
    candidate: 'Candidate', dataset: 'Dataset', integration: 'Integration', renderer: 'Renderer', judge: 'Judge', meta: 'Evaluator meta-evaluation', reporter: 'Reporter', optimizer: 'Optimizer', gate: 'Gate',
    historicalTarget: 'Historical generation records', generationRecords: 'Session records', generationSource: 'Generation source', generatorPopulation: 'Generator population', executionMode: 'Execution mode', observationMode: 'Observe existing results only', batch: 'Batch', scoredTrials: 'Scored Trials', unscoredTrials: 'Unscored Trials', homogeneousPopulation: 'Homogeneous generator population', mixedPopulation: 'Mixed generator population',
    metaNotRun: 'Not run (unvalidated)', metaNotRunHint: 'This Job evaluates existing generation records; it does not establish whether the Evaluator itself is reliable. Strict Evaluator meta-evaluation requires independent GT and a separate meta-evaluation flow.', gateNotApplicable: 'Not applicable (N/A)', gateNotApplicableHint: 'Historical generation evaluation is diagnostic evidence, not Candidate comparison or promotion input. Convert confirmed badcases into a fixed regression Dataset before running a Candidate Job.',
    context: 'Context v2', trials: 'Trials', exceptions: 'Exceptions', mode: 'Mode', close: 'Close', retry: 'Retry', loading: 'Loading…', noData: 'No data', currentStatus: 'Current status',
    score: 'Quality score', valid: 'Score valid', validScores: 'Valid scores', invalid: 'Score invalid', unavailable: 'Unavailable', validity: 'Score Validity', progress: 'Progress', health: 'Health', evidence: 'Evidence',
    capabilityUnavailable: 'This historical Job did not produce this capability; available artifacts remain read-only.',
    search: 'Search Query / Trial', all: 'All', previous: 'Previous', next: 'Next', datasetOrder: 'Dataset order', latest: 'Latest completed', lowest: 'Lowest score', errorsFirst: 'Errors first',
    findings: 'Findings', recommendations: 'Recommendations', output: 'User-visible output', criteria: 'Criteria', provenance: 'Evidence provenance', timing: 'Timing', audit: 'Raw audit',
    compare: 'Regression comparison', baseline: 'Baseline Job', comparable: 'Comparable', notComparable: 'Not comparable', improved: 'Improved trials', regressed: 'Regressed trials', explicitGate: 'A read-only comparison never runs Gate. Run the deterministic Gate only with explicit authority.',
    governance: 'Evaluator governance', governanceHint: 'Read Rubric, Evaluator, Judge identity, and source. Semantic edits create a new identity and require a fresh baseline.',
    artifacts: 'Artifact Registry', setupDoctor: 'Installation and architecture checks', setupHint: 'This is the project root currently used by the Web Workbench. Every Harbor Agent Tool call follows its Session automatically while tool execution remains Session-isolated.',
    projectRoot: 'Current projectRoot', switchProjectRoot: 'Switch and reload', projectRootHint: 'Enter an existing absolute directory. It applies now; the next Harbor Agent Tool call will follow its Session automatically.', switchingProjectRoot: 'Switching…', projectRootUpdated: 'Switched and reloaded Harbor Jobs.', projectRootConfigured: 'Source: Plugin startup configuration', projectRootAgent: 'Source: most recent Harbor Agent call (automatic)', projectRootManual: 'Source: manually switched for this run',
    pluginVersion: 'Plugin version', checkingUpdate: 'Checking for updates…', updateAvailable: 'Update available', upToDate: 'Up to date', updateUnavailable: 'Update check unavailable', currentVersion: 'Current version', latestVersion: 'Latest version', updateHint: 'Run this command in a terminal to update the Plugin, Skill, and Harbor Adapter. The browser never installs updates silently.', offlineUpdateHint: 'Harbor remains fully functional. Check the network and retry, or run the installer with @latest in a terminal.', copyUpdateCommand: 'Copy update command', updateCommandCopied: 'Update command copied', checkAgain: 'Check again', viewRelease: 'View release notes', checkedAt: 'Checked', staleVersion: 'Showing the most recent successful check.',
    credentialPolicy: 'Secret persistence policy', sessionCredential: 'This run only', credentialStore: 'DSH credential store', plaintextCredential: 'Plaintext settings', supported: 'Supported', hostServiceRequired: 'Host credential service required', forbidden: 'Blocked', sessionCredentialHint: 'Default. Inject through environment variables or a short-lived Job capability; never include it in evaluation identity or reports.', credentialStoreHint: 'Enabled only after DSH exposes a formal credential service; settings.yaml is not treated as a credential store.', plaintextCredentialHint: 'Harbor never writes Authorization, API keys, or OAuth tokens into project settings.',
    stageNav: 'Evaluation stages', datasetTasks: 'Evaluation tasks', datasetSource: 'Task source', taskInstruction: 'Task instruction', instructionFile: 'Instruction file', snapshot: 'Job snapshot', historicalFallback: 'Historical source fallback',
    generatedOutput: 'Generated output', selectTrial: 'Select Trial', noRenderableOutput: 'This Trial has no renderable page, document, or structured artifact. Publish the business result through Harbor artifacts.', previewSource: 'Output provenance', pagePreview: 'Page preview', documentPreview: 'Document preview', structuredOutput: 'Structured output', rawOutput: 'Raw output',
    currentEvaluator: 'Current evaluator', evaluator: 'Evaluator', rubric: 'Rubric', judgeParameters: 'Judge parameters', scoringContract: 'Scoring contract', primaryMetric: 'Primary metric', metricSemantics: 'Metric semantics', sourceCode: 'View source', upgradeEvaluator: 'How to upgrade the evaluator', upgradeHint: 'Evaluator upgrades change score semantics. Create a new identity, meta-evaluate it, then establish a fresh Agent baseline.', copyPrompt: 'Copy for Agent', copied: 'Copied', freshBaseline: 'Fresh baseline required', metaEvaluation: 'Meta-evaluation requirements',
    evaluatorImplementation: 'Evaluator implementation', evaluatorKind: 'Implementation kind', evaluatorProtocol: 'Interface protocol', editableFiles: 'Files you can modify', openFile: 'Open', editingFile: 'Editing', editSource: 'Edit the current file directly', evaluatorVersion: 'New Evaluator version', stackVersion: 'New Stack version', saveEvaluator: 'Save as new identity', saving: 'Saving…', saved: 'Saved. Meta-evaluate it and establish a fresh Baseline next.', reloadBeforeSave: 'The source changed; reload before saving.', noEvaluatorInterface: 'This Stack has no harbor-dsh-evaluator/v1 interface, so safe UI editing is unavailable.', editWarning: 'Saving updates source and identities only. It never runs an evaluation or Gate.',
    upgradeStep1: 'Inspect the current Evaluator, Rubric, Judge, Contract, and representative false-positive or false-negative Trials.', upgradeStep2: 'Create a new evaluator identity, version, and source file; never overwrite the historical evaluator.', upgradeStep3: 'Meta-evaluate against independently maintained, provenance-bearing GT using ESF, SCE, RCR, latency, and cost as appropriate.', upgradeStep4: 'Update the Evaluation Stack identity and preview the Context v2 impact.', upgradeStep5: 'Establish a fresh Agent baseline under the new score semantics before comparing later Candidates.', evaluatorPrompt: 'Use evolve-agent-with-harbor to upgrade this evaluator. First inspect governance evidence, clarify GT source type, provenance, ownership, and target meta-metrics, then propose a new immutable evaluator identity and fresh-baseline plan. Do not edit files or run an evaluation until I approve the controlled change.',
    queryTrial: 'Task / Trial', statusLabel: 'Status', attempt: 'Attempt', population: 'Population',
    experimentIdentity: 'Experiment identity', experimentIdentityHint: 'Candidate, Dataset, Evaluation Stack, and model identity define comparability. The DSH runtime follows the latest release by default and records that policy explicitly.', immutableCandidateFiles: 'Candidate contents', file: 'File', size: 'Size', digest: 'Digest', runtime: 'Runtime', evaluationStack: 'Evaluation Stack',
    integrationBoundary: 'Execution and scoring boundary', hardRequirements: 'Required before a score is valid', populationEvidence: 'Population evidence', metric: 'Metric', aggregate: 'Aggregate', coverage: 'Valid coverage', trialGroups: 'Trial status groups',
    controlledHypotheses: 'Controlled optimization hypotheses', rootCause: 'Evidence points to', affectedTrials: 'Affected trials', expectedEffect: 'Expected metric effect', mutationSurface: 'Allowed mutation', forbiddenSurface: 'Forbidden mutation', guardrails: 'Guardrails', rollback: 'Rollback condition', nextExperiment: 'Next controlled experiment', noHypotheses: 'No controlled optimization hypothesis was generated for this Job.',
    gateEvidence: 'Executed promotion gate', decision: 'Gate result', policy: 'Gate policy', eligible: 'Gate prerequisites satisfied', notEligible: 'Gate prerequisites not satisfied', metricDeltas: 'Metric deltas', newExceptions: 'New exceptions', artifactRegressions: 'Artifact regressions', reasons: 'Gate evidence',
    trialAssessments: 'Per-Trial assessments', trialAssessmentsHint: 'Each row represents one business artifact. Select a task to compare the artifact with criterion scores, reasons, and evaluator recommendations side by side.', overallScore: 'Overall score', artifact: 'Assessed artifact', assessmentReason: 'Scoring reason', assessmentRecommendation: 'Recommendation', assessmentDetails: 'Assessment details', noAssessmentReason: 'The evaluator returned no scoring reason; this result should not enter valid aggregates.', noAssessmentRecommendation: 'The evaluator returned no recommendation; this result should not enter valid aggregates.', evaluatorAdvice: 'Evaluator recommendation', reportPage: 'Report page',
    groundTruth: 'Ground Truth', groundTruthRequired: 'Independent Ground Truth is required', gtSource: 'GT source', gtProvenance: 'Provenance', gtCases: 'GT cases', gtBadcases: 'Badcases', gtKinds: 'Allowed sources: human, programmatic, consensus, independently pinned model, or external standard. Versioning, provenance, and independence from the Candidate evaluator are mandatory.', metaWorkflow: 'Independent meta-evaluation flow', metaWorkflowHint: 'Evaluator is the Candidate; fixed artifacts plus GT form the Dataset; repeated observations produce ESF, SCE, and RCR.', metaNext: 'Next action', disagreements: 'Disagreements', hookExecution: 'Component execution', configuredHookNotRun: 'The Evaluation Stack configured this business component, but it did not run in this Job. The current content came from the plugin deterministic fallback.', configuredHookRun: 'The configured Evaluation Stack component executed in this Job.', pluginFallback: 'Plugin fallback', badcase: 'Badcase',
  },
}

const CSS = `
.hse-root{--ocean-950:#03152f;--ocean-800:#07366f;--ocean-600:#1464c8;--ocean-300:#75b7ff;--foam-50:#f4fbff;--whale-500:#2875ff;--coral-500:#ee6478;--amber-500:#e4a23b;--kelp-500:#1f9b72;height:100%;min-height:0;overflow:auto;color:var(--dsw-alias-label-primary,#142038);background:var(--dsw-alias-bg-layer-1,#f2f7fc);font-family:inherit}.hse-page{width:min(1320px,calc(100% - 36px));margin:auto;padding:24px 0 56px}
.hse-root-switch{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin:16px 0 8px;padding:14px;border:1px solid #2875ff42;border-radius:12px;background:#2875ff0b}.hse-root-switch label{grid-column:1/-1;font-size:11px;font-weight:700}.hse-root-switch input{min-width:0;padding:10px 12px;border:1px solid #c8d6e7;border-radius:8px;color:inherit;background:var(--dsw-alias-bg-layer-2,#fff);font:11px ui-monospace,SFMono-Regular,Menlo,monospace}.hse-root-switch button{padding:9px 13px;border:0;border-radius:8px;color:#fff;background:var(--ocean-600);cursor:pointer}.hse-root-switch small{grid-column:1/-1;color:var(--dsw-alias-label-secondary,#748096)}
.hse-hero{position:relative;isolation:isolate;overflow:hidden;min-height:225px;padding:32px;border-radius:24px;color:#fff;background:var(--ocean-950) var(--ocean-image) center/cover no-repeat;box-shadow:0 22px 65px #03152f38}.hse-hero:before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(90deg,#02132fea,#062b62d6 55%,#0e6dc42e)}.hse-hero:after{content:"";position:absolute;width:220px;height:220px;right:8%;bottom:-170px;border:1px solid #8be9ff66;border-radius:50%;box-shadow:0 0 0 28px #68dfff0b,0 0 0 60px #68dfff08;animation:hse-ripple 5s ease-out infinite}.hse-hero h1{max-width:780px;margin:15px 0 10px;font-size:clamp(28px,4vw,46px);line-height:1.08;letter-spacing:-.04em}.hse-hero p{max-width:760px;margin:0;color:#d9eeff;font-size:14px;line-height:1.75}.hse-eyebrow{color:#86e8ff;font-size:11px;font-weight:800;letter-spacing:.17em}.hse-whale{margin-right:8px;font-size:17px}.hse-refresh{position:absolute;right:22px;top:22px;padding:8px 13px;border:1px solid #ffffff52;border-radius:999px;color:#fff;background:#06245eb8;cursor:pointer}.hse-stats{display:flex;gap:9px;margin-top:24px;flex-wrap:wrap}.hse-stat{min-width:130px;padding:11px 13px;border:1px solid #ffffff29;border-radius:13px;background:#031a41a8;backdrop-filter:blur(8px)}.hse-stat span{display:block;color:#cde7fb;font-size:10px}.hse-stat b{display:block;margin-top:4px;font-size:20px}.hse-head{margin:28px 0 12px}.hse-head h2{margin:0;font-size:18px}.hse-head p{margin:4px 0 0;color:#728097;font-size:12px}
.hse-list{display:grid;gap:10px}.hse-job{display:block;width:100%;padding:0;border:1px solid var(--dsw-alias-border-l1,#d7e2ef);border-radius:16px;color:inherit;background:var(--dsw-alias-bg-layer-2,#fff);text-align:left;cursor:pointer;overflow:hidden;box-shadow:0 5px 18px #1736600d;transition:.18s ease}.hse-job:hover,.hse-job:focus-visible{border-color:var(--ocean-300);transform:translateY(-1px);outline:3px solid #2875ff20}.hse-job-body{padding:16px 18px}.hse-job-top{display:flex;justify-content:space-between;gap:14px}.hse-job-title{min-width:0}.hse-job-title strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.hse-job-title small{display:block;margin-top:4px;color:#7b879c;font-size:10px}.hse-status{flex:none;padding:5px 9px;border-radius:999px;color:#126d50;background:#23ba8318;font-size:10px;font-weight:700}.hse-status:before{content:"✓ ";}.hse-status[data-status=running],.hse-status[data-status=pending]{color:#245dcc;background:#2875ff18}.hse-status[data-status=running]:before{content:"● ";animation:hse-pulse 1.6s ease-in-out infinite}.hse-status[data-status=partial],.hse-status[data-status=attention]{color:#8e5b0c;background:#e4a23b1b}.hse-status[data-status=partial]:before,.hse-status[data-status=attention]:before{content:"△ "}.hse-status[data-status=failed]{color:#b52f45;background:#ee647818}.hse-status[data-status=failed]:before{content:"× "}.hse-meta-grid{display:grid;grid-template-columns:1.35fr 1fr .9fr .65fr .75fr .75fr;gap:7px;margin-top:13px}.hse-meta{min-width:0;padding:8px 9px;border-radius:9px;background:var(--dsw-alias-bg-layer-1,#f3f7fb)}.hse-meta span{display:block;color:#7b879c;font-size:9px}.hse-meta b,.hse-meta code{display:block;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}.hse-progress{height:5px;margin-top:11px;border-radius:99px;background:#dbe8f5;overflow:hidden}.hse-progress i{display:block;height:100%;background:linear-gradient(90deg,var(--ocean-600),#54d7f5);transition:width .3s}.hse-metrics{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.hse-pill{padding:5px 7px;border:1px solid var(--dsw-alias-border-l1,#dce4f0);border-radius:7px;font-size:10px}.hse-pill b{margin-left:5px;color:var(--ocean-600)}
.hse-empty,.hse-error{padding:34px;border:1px dashed #c4d3e5;border-radius:16px;text-align:center;background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-secondary,#728097);font-size:12px}.hse-spin{width:25px;height:25px;margin:0 auto 10px;border:3px solid #2875ff22;border-top-color:var(--whale-500);border-radius:50%;animation:hse-spin .8s linear infinite}.hse-button,.hse-close{border:0;border-radius:9px;padding:8px 11px;color:#fff;background:var(--whale-500);cursor:pointer}.hse-overlay{position:fixed;inset:0;z-index:1000;display:flex;justify-content:flex-end;background:#03152f8c;backdrop-filter:blur(3px)}.hse-drawer{width:min(1180px,96vw);height:100%;overflow:auto;background:var(--dsw-alias-bg-layer-1,#f2f7fc);box-shadow:-24px 0 70px #03152f52}.hse-drawer-head{position:sticky;top:0;z-index:5;display:flex;justify-content:space-between;gap:15px;padding:16px 20px;border-bottom:1px solid var(--dsw-alias-border-l1,#dce4f0);background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,#fff) 94%,transparent);backdrop-filter:blur(12px)}.hse-drawer-head h2{margin:0;font-size:18px}.hse-drawer-head p{margin:5px 0 0;color:var(--dsw-alias-label-secondary,#748096);font-size:10px}.hse-close{align-self:flex-start;background:var(--ocean-950)}.hse-workbench{padding:14px 20px 48px}.hse-stage-nav{position:sticky;top:67px;z-index:4;display:grid;grid-template-columns:repeat(8,minmax(88px,1fr));gap:5px;margin:-1px -1px 14px;padding:8px;border:1px solid var(--dsw-alias-border-l1,#d7e2ef);border-radius:13px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,#fff) 94%,transparent);backdrop-filter:blur(10px);overflow:auto}.hse-stage-nav button{padding:9px 7px;border:0;border-radius:8px;color:var(--dsw-alias-label-secondary,#52627b);background:transparent;font:inherit;font-size:10px;cursor:pointer;white-space:nowrap}.hse-stage-nav button[data-active=true]{color:#fff;background:var(--ocean-600)}.hse-stage-nav button:focus-visible{outline:3px solid #2875ff2f}.hse-capability{margin-bottom:12px;padding:10px 12px;border-left:3px solid var(--amber-500);border-radius:8px;background:#e4a23b14;color:var(--dsw-alias-label-primary,#75500f);font-size:11px}.hse-section{margin-bottom:13px;padding:16px;border:1px solid var(--dsw-alias-border-l1,#d7e2ef);border-radius:14px;background:var(--dsw-alias-bg-layer-2,#fff)}.hse-section h3{margin:0 0 11px;font-size:14px}.hse-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.hse-kpi{padding:11px;border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1,#edf7ff) 88%,var(--ocean-600) 12%)}.hse-kpi span{display:block;color:var(--dsw-alias-label-secondary,#748096);font-size:9px}.hse-kpi b{display:block;margin-top:4px;font-size:17px}.hse-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.hse-card{min-width:0;padding:11px;border-radius:10px;background:var(--dsw-alias-bg-layer-1,#f3f7fb)}.hse-card span,.hse-card b,.hse-card code{display:block}.hse-card span{color:var(--dsw-alias-label-secondary,#748096);font-size:9px}.hse-card b,.hse-card code{margin-top:4px;overflow-wrap:anywhere;font-size:10px}.hse-valid{color:var(--kelp-500)}.hse-invalid{color:#bd3148}.hse-muted{color:var(--dsw-alias-label-secondary,#75839a)}.hse-findings{display:grid;gap:6px}.hse-finding{padding:9px 10px;border-left:3px solid var(--ocean-300);border-radius:7px;background:#2875ff0c;font-size:10px}.hse-finding[data-level=error]{border-color:var(--coral-500);background:#ee64780d}.hse-finding[data-level=warning]{border-color:var(--amber-500);background:#e4a23b0d}.hse-components{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.hse-component{padding:10px;border-radius:9px;background:#0b4c9c12}.hse-component span{display:block;color:var(--dsw-alias-label-secondary,#748096);font-size:9px}.hse-component b,.hse-component code{display:block;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px}
.hse-trial-layout{display:grid;grid-template-columns:minmax(380px,1fr) minmax(360px,.9fr);gap:10px;align-items:start}.hse-trial-list,.hse-trial-detail{min-width:0}.hse-trial-tools{display:grid;grid-template-columns:minmax(150px,1fr) auto auto auto;gap:6px;margin-bottom:9px}.hse-input,.hse-select{min-width:0;padding:8px 9px;border:1px solid #c8d6e7;border-radius:8px;color:inherit;background:transparent;font:inherit;font-size:10px}.hse-table-wrap{overflow:auto}.hse-table{width:100%;border-collapse:collapse;font-size:10px}.hse-table th,.hse-table td{padding:8px;border-bottom:1px solid #e2eaf3;text-align:left;white-space:nowrap}.hse-table button{border:0;color:var(--ocean-600);background:none;cursor:pointer;font:inherit}.hse-table tr[data-selected=true]{background:#2875ff0c}.hse-pager{display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:9px;font-size:10px}.hse-pager button{padding:5px 8px;border:1px solid #c8d6e7;border-radius:7px;background:transparent;color:inherit;cursor:pointer}.hse-trial-detail{position:sticky;top:132px;max-height:calc(100vh - 160px);overflow:auto;padding:14px;border-radius:12px;color:#dcecff;background:var(--ocean-950)}.hse-trial-score{display:flex;justify-content:space-between;gap:12px;padding-bottom:12px;border-bottom:1px solid #ffffff1f}.hse-trial-score b{font-size:25px}.hse-trial-score span{font-size:10px}.hse-detail-group{padding:11px 0;border-bottom:1px solid #ffffff16}.hse-detail-group h4{margin:0 0 7px;color:#8fe8ff;font-size:10px;text-transform:uppercase;letter-spacing:.08em}.hse-detail-group pre{max-height:280px;overflow:auto;margin:0;white-space:pre-wrap;word-break:break-word;font-size:9px;line-height:1.55}.hse-detail-group ul{margin:0;padding-left:17px;font-size:10px;line-height:1.6}.hse-criteria{display:grid;gap:5px}.hse-criterion{display:flex;justify-content:space-between;gap:8px;padding:7px;border-radius:6px;background:#ffffff0b;font-size:10px}.hse-provenance{display:flex;gap:5px;flex-wrap:wrap}.hse-provenance span{padding:5px 7px;border:1px solid #70cfff4a;border-radius:999px;font-size:9px}.hse-audit summary{cursor:pointer;font-size:11px;font-weight:700}.hse-audit pre,.hse-source{max-height:360px;overflow:auto;white-space:pre-wrap;word-break:break-word;font-size:9px;line-height:1.55}.hse-compare-select{display:flex;gap:7px;margin-bottom:10px}.hse-compare-select select{flex:1}.hse-delta{font-variant-numeric:tabular-nums}.hse-delta[data-positive=true]{color:var(--kelp-500)}.hse-delta[data-positive=false]{color:var(--coral-500)}.hse-source{padding:10px;border-radius:8px;color:#d9edff;background:var(--ocean-950)}.hse-settings{width:min(850px,calc(100% - 32px));margin:auto;padding:28px 0}.hse-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:16px}.hse-check{padding:12px;border:1px solid #dce4f0;border-radius:10px;background:var(--dsw-alias-bg-layer-2,#fff)}.hse-check b,.hse-check small{display:block}.hse-check small{margin-top:4px;color:#748096}.hse-tool{border:1px solid #dce4f0;border-radius:11px;background:var(--dsw-alias-bg-layer-2,#fff);overflow:hidden}.hse-tool button{display:flex;gap:8px;width:100%;padding:10px;border:0;color:inherit;background:transparent;text-align:left;cursor:pointer}.hse-tool strong{font-size:11px}.hse-tool small{margin-left:auto}.hse-tool pre{max-height:260px;overflow:auto;margin:0;padding:11px;border-top:1px solid #e3e9f1;white-space:pre-wrap;font-size:9px}
.hse-version{margin:18px 0;padding:16px;border:1px solid var(--dsw-alias-border-l1,#d7e2ef);border-radius:14px;background:var(--dsw-alias-bg-layer-2,#fff)}.hse-version[data-status=update-available]{border-color:#2875ff75;background:linear-gradient(145deg,#2875ff12,#44d9ff08)}.hse-version-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.hse-version-head h3{margin:0;font-size:16px}.hse-version-badge{padding:6px 10px;border-radius:999px;color:#126d50;background:#23ba8318;font-size:10px;font-weight:800}.hse-version[data-status=update-available] .hse-version-badge{color:#fff;background:var(--whale-500)}.hse-version[data-status=unavailable] .hse-version-badge{color:#8e5b0c;background:#e4a23b1b}.hse-version[data-status=loading] .hse-version-badge{color:#245dcc;background:#2875ff18}.hse-version-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:13px}.hse-version-card{padding:11px;border-radius:10px;background:var(--dsw-alias-bg-layer-1,#f3f7fb)}.hse-version-card span,.hse-version-card b{display:block}.hse-version-card span{color:var(--dsw-alias-label-secondary,#748096);font-size:9px}.hse-version-card b{margin-top:4px;font-size:15px}.hse-version-copy{margin:12px 0 0;color:var(--dsw-alias-label-secondary,#748096);font-size:11px;line-height:1.6}.hse-update-command{display:block;box-sizing:border-box;width:100%;margin:10px 0 0;padding:12px;border:1px solid #70cfff3d;border-radius:9px;color:#dcecff;background:var(--ocean-950);white-space:pre-wrap;word-break:break-word;font:10px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}.hse-version-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px}.hse-version-actions a,.hse-version-actions button{padding:7px 10px;border:1px solid var(--dsw-alias-border-l1,#c8d6e7);border-radius:8px;color:inherit;background:transparent;cursor:pointer;font:inherit;font-size:10px;text-decoration:none}.hse-version-actions .hse-primary{border-color:var(--whale-500);color:#fff;background:var(--whale-500)}.hse-version-actions small{margin-left:auto;color:var(--dsw-alias-label-secondary,#748096);font-size:9px}
.hse-task-list{display:grid;gap:10px}.hse-task{border:1px solid var(--dsw-alias-border-l1,#d7e2ef);border-radius:12px;background:var(--dsw-alias-bg-layer-1,#f3f7fb);overflow:hidden}.hse-task summary{display:flex;align-items:center;gap:9px;padding:12px 14px;cursor:pointer;font-size:11px;font-weight:700}.hse-task summary span{margin-left:auto;color:var(--dsw-alias-label-secondary,#748096);font-size:9px;font-weight:400}.hse-task-body{padding:0 14px 14px}.hse-instruction{min-height:80px;margin:0;padding:15px;border-radius:10px;color:#e3f3ff;background:linear-gradient(145deg,#03152f,#07366f);white-space:pre-wrap;word-break:break-word;font:inherit;font-size:12px;line-height:1.75}.hse-inline-meta{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0 0;color:var(--dsw-alias-label-secondary,#748096);font-size:9px}.hse-output-layout{display:grid;grid-template-columns:260px minmax(0,1fr);gap:10px;align-items:start}.hse-output-list{display:grid;gap:6px}.hse-output-item{width:100%;padding:10px;border:1px solid var(--dsw-alias-border-l1,#d7e2ef);border-radius:9px;color:inherit;background:var(--dsw-alias-bg-layer-1,#f3f7fb);text-align:left;cursor:pointer}.hse-output-item[data-active=true]{border-color:var(--ocean-300);background:#2875ff16}.hse-output-item b,.hse-output-item span{display:block}.hse-output-item span{margin-top:3px;color:var(--dsw-alias-label-secondary,#748096);font-size:9px}.hse-preview{min-width:0;border:1px solid var(--dsw-alias-border-l1,#d7e2ef);border-radius:12px;overflow:hidden}.hse-preview-head{display:flex;justify-content:space-between;gap:12px;padding:12px 14px;background:var(--dsw-alias-bg-layer-1,#f3f7fb)}.hse-preview-head b,.hse-preview-head span{display:block}.hse-preview-head span{margin-top:3px;color:var(--dsw-alias-label-secondary,#748096);font-size:9px}.hse-document{min-height:210px;padding:22px;background:var(--dsw-alias-bg-layer-2,#fff);font-size:13px;line-height:1.8}.hse-document pre{margin:0;white-space:pre-wrap;word-break:break-word;font:inherit}.hse-document h4{margin:0 0 12px;font-size:17px}.hse-page-frame{display:block;width:100%;height:520px;border:0;background:#fff}.hse-output-structured{max-height:520px;overflow:auto;margin:0;padding:16px;color:#dcecff;background:var(--ocean-950);white-space:pre-wrap;word-break:break-word;font-size:10px}.hse-preview-empty{padding:60px 20px;text-align:center;color:var(--dsw-alias-label-secondary,#748096)}.hse-governance-id{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.hse-source-details{margin-top:9px;border-top:1px solid var(--dsw-alias-border-l1,#d7e2ef);padding-top:9px}.hse-source-details summary{cursor:pointer;font-size:10px;font-weight:700}.hse-upgrade{border-color:#2875ff55;background:linear-gradient(145deg,#2875ff0f,#44d9ff08)}.hse-upgrade ol{margin:10px 0;padding-left:20px;font-size:11px;line-height:1.75}.hse-prompt{margin-top:10px;padding:12px;border-radius:9px;color:#dcecff;background:var(--ocean-950);white-space:pre-wrap;font-size:10px;line-height:1.6}.hse-prompt-actions{display:flex;justify-content:flex-end;margin-top:8px}.hse-editor-head{display:flex;justify-content:space-between;gap:10px;align-items:start}.hse-editor-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0 8px}.hse-editor-tab{display:grid;gap:2px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1,#d7e2ef);border-radius:8px;color:inherit;background:transparent;text-align:left;cursor:pointer}.hse-editor-tab b{font-size:10px}.hse-editor-tab span{color:var(--dsw-alias-label-secondary,#748096);font-size:8px}.hse-editor-tab[data-active=true]{border-color:var(--ocean-600);color:#fff;background:var(--ocean-600)}.hse-editor-tab[data-active=true] span{color:#dcecff}.hse-editor-current{display:grid;gap:3px;margin:8px 0;padding:9px 11px;border-left:3px solid var(--ocean-600);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#f3f7fb)}.hse-editor-current span{color:var(--dsw-alias-label-secondary,#748096);font-size:9px}.hse-editor-current b{font-size:11px}.hse-editor-current code{overflow-wrap:anywhere;font-size:9px}.hse-editor{display:block;width:100%;min-height:360px;box-sizing:border-box;padding:14px;border:1px solid #1f73ca;border-radius:10px;color:#dcecff;background:var(--ocean-950);resize:vertical;font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace}.hse-editor-versions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px}.hse-editor-actions{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:9px}.hse-editor-actions p{margin:0;font-size:10px}.hse-editor-actions button:disabled{opacity:.45;cursor:not-allowed}.hse-editor-error{color:#bd3148}.hse-editor-success{color:var(--kelp-500)}
.hse-identity-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.hse-evidence-table{width:100%;border-collapse:collapse;font-size:10px}.hse-evidence-table th,.hse-evidence-table td{padding:9px;border-bottom:1px solid var(--dsw-alias-border-l1,#dce4f0);text-align:left;vertical-align:top}.hse-evidence-table th{color:var(--dsw-alias-label-secondary,#748096);font-weight:500}.hse-evidence-table code{overflow-wrap:anywhere}.hse-chip-list{display:flex;gap:6px;flex-wrap:wrap}.hse-chip-list span{padding:6px 8px;border-radius:999px;background:#2875ff12;font-size:9px}.hse-hypotheses{display:grid;gap:10px}.hse-hypothesis{padding:14px;border:1px solid #2875ff3d;border-radius:12px;background:linear-gradient(145deg,#2875ff0c,#44d9ff05)}.hse-hypothesis h4{margin:0 0 10px;font-size:13px}.hse-hypothesis dl{display:grid;grid-template-columns:150px minmax(0,1fr);gap:8px 12px;margin:0;font-size:10px}.hse-hypothesis dt{color:var(--dsw-alias-label-secondary,#748096)}.hse-hypothesis dd{margin:0;overflow-wrap:anywhere}.hse-gate-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.hse-decision{padding:8px 12px;border-radius:999px;color:#126d50;background:#23ba8318;font-weight:800}.hse-decision[data-pass=false]{color:#b52f45;background:#ee647818}
.hse-report-table button{border:0;color:var(--ocean-600);background:none;text-align:left;cursor:pointer;font:inherit}.hse-report-table tr[data-selected=true]{background:#2875ff10}.hse-report-score{font-size:15px;font-weight:800}.hse-report-score[data-valid=false]{color:var(--coral-500)}.hse-report-detail{margin-top:12px;border:1px solid #2875ff40;border-radius:13px;overflow:hidden}.hse-report-detail-head{display:flex;justify-content:space-between;gap:12px;padding:14px 16px;background:linear-gradient(145deg,#2875ff14,#44d9ff08)}.hse-report-detail-head h4{margin:0;font-size:14px}.hse-report-detail-head span,.hse-report-detail-head code{display:block;margin-top:4px;color:var(--dsw-alias-label-secondary,#748096);font-size:9px}.hse-report-detail-head b{font-size:25px}.hse-report-criteria{display:grid;gap:9px;padding:14px}.hse-report-criterion{padding:12px;border-radius:10px;background:var(--dsw-alias-bg-layer-1,#f3f7fb)}.hse-report-criterion header{display:flex;justify-content:space-between;gap:10px}.hse-report-criterion header b:last-child{font-size:17px}.hse-report-criterion dl{display:grid;grid-template-columns:92px minmax(0,1fr);gap:8px 10px;margin:10px 0 0;font-size:10px;line-height:1.55}.hse-report-criterion dt{color:var(--dsw-alias-label-secondary,#748096)}.hse-report-criterion dd{margin:0;overflow-wrap:anywhere}.hse-report-recommendation{color:var(--ocean-600)}
.hse-stage-nav{grid-template-columns:repeat(9,minmax(88px,1fr))}.hse-report-compare{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;padding:14px;align-items:start}.hse-report-compare .hse-report-criteria{padding:0}.hse-meta-flow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.hse-meta-flow div{position:relative;padding:13px;border-radius:10px;background:#2875ff0f;font-size:10px}.hse-meta-flow div:not(:last-child):after{content:'→';position:absolute;right:-8px;top:50%;z-index:1;color:var(--ocean-600);font-weight:800}.hse-badcase{color:#b52f45;background:#ee647817!important}.hse-hook-state{margin-bottom:12px;padding:11px 13px;border-left:3px solid var(--ocean-600);border-radius:8px;background:#2875ff0d;font-size:10px}.hse-hook-state[data-executed=false]{border-color:var(--amber-500);background:#e4a23b12}
.hse-launch-card{display:flex;align-items:center;gap:13px;margin:0 0 18px;padding:15px 17px;border:1px solid #2875ff40;border-radius:16px;background:linear-gradient(135deg,#2875ff16,#44d9ff0b);box-shadow:0 10px 30px #0a4b8f0d}.hse-launch-mark{display:grid;place-items:center;flex:0 0 38px;height:38px;border-radius:12px;color:#fff;background:linear-gradient(145deg,var(--ocean-600),var(--ocean-300));box-shadow:0 8px 18px #2875ff35;font-size:18px}.hse-launch-copy{display:grid;gap:3px;min-width:0}.hse-launch-copy b{font-size:13px}.hse-launch-copy span{color:var(--dsw-alias-label-secondary,#68778d);font-size:10px;line-height:1.5}.hse-launch-copy small{color:var(--ocean-600);font-size:9px;font-weight:800}.hse-launch-button{margin-left:auto;padding:10px 15px;border:0;border-radius:10px;color:#fff;background:var(--whale-500);box-shadow:0 8px 20px #2875ff30;cursor:pointer;font:inherit;font-size:11px;font-weight:800;white-space:nowrap}.hse-launch-button:disabled{opacity:.55;cursor:wait}.hse-launch-overlay{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:18px;background:#03152fa3;backdrop-filter:blur(5px)}.hse-launch-dialog{display:flex;flex-direction:column;width:min(780px,calc(100vw - 32px));max-height:min(860px,calc(100vh - 36px));overflow:hidden;border:1px solid var(--dsw-alias-border-l1,#d7e2ef);border-radius:20px;color:var(--dsw-alias-label-primary,#1d2a3d);background:var(--dsw-alias-bg-layer-2,#fff);box-shadow:0 28px 90px #03152f6b}.hse-launch-head{display:flex;justify-content:space-between;gap:20px;padding:20px 22px 16px;border-bottom:1px solid var(--dsw-alias-border-l1,#e1e8f1)}.hse-launch-head span{color:var(--ocean-600);font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.hse-launch-head h2{margin:5px 0 6px;font-size:20px}.hse-launch-head p{margin:0;color:var(--dsw-alias-label-secondary,#748096);font-size:10px;line-height:1.6}.hse-dialog-close{align-self:flex-start;width:30px;height:30px;border:1px solid var(--dsw-alias-border-l1,#d7e2ef);border-radius:9px;color:inherit;background:transparent;cursor:pointer;font-size:20px;line-height:1}.hse-launch-body{overflow:auto;padding:18px 22px}.hse-launch-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:13px}.hse-launch-summary div,.hse-launch-grid div{padding:11px;border-radius:10px;background:var(--dsw-alias-bg-layer-1,#f3f7fb)}.hse-launch-summary span,.hse-launch-grid span{display:block;color:var(--dsw-alias-label-secondary,#748096);font-size:9px}.hse-launch-summary b,.hse-launch-grid b{display:block;margin-top:4px;overflow-wrap:anywhere;font-size:11px}.hse-launch-section{margin-top:12px;padding:14px;border:1px solid var(--dsw-alias-border-l1,#d7e2ef);border-radius:13px}.hse-launch-section h3{margin:0 0 10px;font-size:12px}.hse-session-list{display:grid;gap:7px;max-height:300px;overflow:auto}.hse-session-list article{padding:10px 11px;border-radius:9px;background:var(--dsw-alias-bg-layer-1,#f3f7fb)}.hse-session-list article>div{display:flex;justify-content:space-between;gap:12px}.hse-session-list b{font-size:10px}.hse-session-list span,.hse-session-list p,.hse-session-list code{color:var(--dsw-alias-label-secondary,#748096);font-size:9px}.hse-session-list p{margin:6px 0 3px}.hse-session-list code{overflow-wrap:anywhere}.hse-launch-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.hse-boundary-note{margin:10px 0 0;padding:9px 11px;border-left:3px solid var(--amber-500);border-radius:7px;background:#e4a23b12;font-size:10px}.hse-run-state{display:grid;justify-items:center;gap:9px;padding:42px 18px;text-align:center}.hse-run-state b{font-size:16px}.hse-run-state span,.hse-run-state p{max-width:560px;margin:0;color:var(--dsw-alias-label-secondary,#748096);font-size:10px;line-height:1.6}.hse-launch-error{padding:15px;border-left:4px solid var(--coral-500);border-radius:10px;background:#ee647812}.hse-launch-error b{color:#bd3148;font-size:11px}.hse-launch-error p{margin:7px 0;font-size:11px;overflow-wrap:anywhere}.hse-launch-error span{color:var(--dsw-alias-label-secondary,#748096);font-size:10px;line-height:1.6}.hse-launch-actions{display:flex;justify-content:flex-end;gap:8px;padding:13px 22px;border-top:1px solid var(--dsw-alias-border-l1,#e1e8f1)}.hse-launch-actions button{padding:9px 13px;border:1px solid var(--dsw-alias-border-l1,#c8d6e7);border-radius:9px;color:inherit;background:transparent;cursor:pointer;font:inherit;font-size:10px}.hse-launch-actions .hse-confirm{border-color:var(--whale-500);color:#fff;background:var(--whale-500);font-weight:800}
.hse-launch-card{margin-top:14px}.hse-launch-button-short{display:none}
@keyframes hse-spin{to{transform:rotate(360deg)}}@keyframes hse-pulse{50%{opacity:.38}}@keyframes hse-ripple{0%{transform:scale(.75);opacity:.4}70%,100%{transform:scale(1.12);opacity:0}}
@media(max-width:900px){.hse-page{width:calc(100% - 20px)}.hse-meta-grid,.hse-kpis,.hse-identity-grid{grid-template-columns:repeat(2,1fr)}.hse-trial-layout,.hse-output-layout{grid-template-columns:1fr}.hse-trial-detail{position:static;max-height:none}.hse-components,.hse-governance-id{grid-template-columns:repeat(2,1fr)}.hse-drawer{width:100vw}.hse-workbench{padding:12px}.hse-stage-nav{top:62px}.hse-trial-tools{grid-template-columns:1fr 1fr}.hse-grid,.hse-checks,.hse-version-grid,.hse-launch-summary,.hse-launch-grid{grid-template-columns:1fr}.hse-hypothesis dl{grid-template-columns:1fr}.hse-launch-card{align-items:flex-start;flex-wrap:wrap}.hse-launch-button{width:100%;margin-left:51px}.hse-launch-dialog{width:calc(100vw - 20px)}.hse-launch-head,.hse-launch-body,.hse-launch-actions{padding-left:15px;padding-right:15px}}
@media(max-width:520px){.hse-hero{min-height:auto;padding:22px}.hse-hero h1{font-size:30px}.hse-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:100%}.hse-stat{min-width:0}.hse-launch-card{display:grid;grid-template-columns:38px minmax(0,1fr) 108px;align-items:center;flex-wrap:nowrap}.hse-launch-copy span{display:none}.hse-launch-button{width:100%;margin:0;padding:9px;white-space:normal}.hse-launch-button-full{display:none}.hse-launch-button-short{display:inline}}
@media(prefers-reduced-motion:reduce){.hse-spin,.hse-status:before,.hse-hero:after{animation:none}.hse-job{transition:none}.hse-job:hover{transform:none}}
@media(max-width:900px){.hse-report-compare,.hse-meta-flow{grid-template-columns:1fr}.hse-meta-flow div:after{display:none}}
`

function installStyles() {
  const id = 'dsh-harbor-evolution/client'
  if (document.querySelector(`style[data-plugin-css="${id}"]`)) return () => {}
  const style = document.createElement('style')
  style.dataset.pluginCss = id
  style.textContent = CSS
  document.head.appendChild(style)
  return () => style.remove()
}

function isRecord(value) { return value && typeof value === 'object' && !Array.isArray(value) }
function format(value) { return typeof value === 'number' ? value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : String(value ?? '—') }
function short(value) { return typeof value === 'string' && value.length > 25 ? `${value.slice(0, 17)}…${value.slice(-6)}` : value ?? '—' }
function pretty(value) { return JSON.stringify(value, null, 2) }
function gateReasonText(value) {
  if (!isRecord(value)) return String(value ?? '—')
  return [value.code, value.message].filter(Boolean).join(' · ') || pretty(value)
}

const HISTORICAL_JOB_KIND = 'historical-generation-evaluation'

function isHistoricalJob(value) {
  return value?.jobKind === HISTORICAL_JOB_KIND
    || value?.job_kind === HISTORICAL_JOB_KIND
    || value?.artifacts?.context?.protocol === 'historical-generation-evaluation-context/v1'
    || value?.evaluationContext?.protocol === 'historical-generation-evaluation-context/v1'
}

function generatorPopulationText(population, t) {
  if (!isRecord(population)) return '—'
  const label = population.homogeneous === false ? t('mixedPopulation') : population.homogeneous === true ? t('homogeneousPopulation') : undefined
  const agents = population.agent_presets ?? population.agent_ids ?? population.agents ?? []
  const models = population.model_routes ?? population.models ?? []
  return [label, ...agents, ...models].filter(Boolean).join(' · ') || pretty(population)
}

function judgeIdentityDetails(judge) {
  return [
    judge?.coupling,
    judge?.reasoning_effort ? `reasoning=${judge.reasoning_effort}` : undefined,
    judge?.transport ? `transport=${judge.transport}` : undefined,
    judge?.version ? `version=${judge.version}` : undefined,
  ].filter(Boolean).join(' · ') || '—'
}

async function api(route, params = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== ''))
  const response = await fetch(`${API}/${route}${query.size ? `?${query}` : ''}`, { credentials: 'same-origin', cache: 'no-store' })
  const body = await response.json()
  if (!response.ok || !body?.ok) throw new Error(body?.error?.message ?? `HTTP ${response.status}`)
  return body.value
}

async function mutate(route, value) {
  const response = await fetch(`${API}/${route}`, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(value),
  })
  const body = await response.json()
  if (!response.ok || !body?.ok) throw new Error(body?.error?.message ?? `HTTP ${response.status}`)
  return body.value
}

function nextVersion(value) {
  const match = String(value ?? '').match(/^(\d+)\.(\d+)\.(\d+)$/)
  return match ? `${match[1]}.${match[2]}.${Number(match[3]) + 1}` : ''
}

function useDashboard(poll = true, workspace = '', offset = 0) {
  const [state, setState] = useState({ status: 'loading' })
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setState(current => ({ ...current, status: current.value ? 'refreshing' : 'loading' }))
    try { setState({ status: 'ready', value: await api('dashboard', { workspace, offset, limit: 20 }) }) }
    catch (error) { setState(current => ({ ...current, status: 'error', error: error.message })) }
  }, [workspace, offset])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!poll || !state.value) return undefined
    const timer = window.setTimeout(() => void load(true), state.value.overview?.activeJobs ? 2_500 : 15_000)
    return () => window.clearTimeout(timer)
  }, [load, poll, state.value])
  return { ...state, load }
}

function useVersionCheck() {
  const [state, setState] = useState({ status: 'loading' })
  const load = useCallback(async (refresh = false) => {
    setState(current => ({ ...current, status: 'loading' }))
    try { setState({ status: 'ready', value: await api('version', refresh ? { refresh: 'true' } : {}) }) }
    catch { setState(current => ({ ...current, status: 'error' })) }
  }, [])
  useEffect(() => { void load() }, [load])
  return { ...state, load }
}

function MetricPills({ metrics }) {
  return <div className="hse-metrics">{Object.entries(metrics ?? {}).map(([key, value]) => <span className="hse-pill" key={key}>{key}<b>{format(value)}</b></span>)}</div>
}

function JobCard({ job, t, open }) {
  const candidate = job.candidate ?? {}
  const progress = job.progress ?? {}
  const historical = isHistoricalJob(job)
  const target = job.evaluationTarget ?? {}
  const coverage = job.coverage ?? {}
  return <button type="button" className="hse-job" onClick={() => open(job.name)}>
    <div className="hse-job-body"><div className="hse-job-top"><div className="hse-job-title"><strong>{job.name}</strong><small>{new Date(job.updatedAt).toLocaleString()} · {progress.health ?? '—'}</small></div><span className="hse-status" data-status={job.status}>{t(job.status)}</span></div>
      {historical ? <div className="hse-meta-grid"><div className="hse-meta"><span>{t('historicalTarget')}</span><b>{target.source_kind ?? job.generationSource?.kind ?? '—'} · {target.record_count ?? job.nTrials ?? 0} {t('generationRecords')}</b></div><div className="hse-meta"><span>{t('generatorPopulation')}</span><b>{generatorPopulationText(job.generatorPopulation ?? target.generator_population, t)}</b></div><div className="hse-meta"><span>{t('executionMode')}</span><b>{job.executionMode ?? t('observationMode')} · {t('gateNotApplicable')}</b></div><div className="hse-meta"><span>{t('progress')}</span><b>{progress.completed ?? 0}/{progress.total ?? job.nTrials ?? 0}</b></div><div className="hse-meta"><span>{t('scoredTrials')}</span><b>{coverage.scored_trials ?? job.nValidScores ?? '—'} / {coverage.total_trials ?? job.nTrials ?? '—'}</b></div><div className="hse-meta"><span>{t('unscoredTrials')}</span><b>{coverage.unscored_trials ?? job.nUnscoredTrials ?? 0} · completed-unscored</b></div></div> : <div className="hse-meta-grid"><div className="hse-meta"><span>{t('candidate')}</span><b>{candidate.candidate_id ?? '—'} · {candidate.version ?? '—'}</b></div><div className="hse-meta"><span>{t('dataset')}</span><b>{job.dataset?.dataset_id ?? '—'} · {job.dataset?.version ?? '—'}</b></div><div className="hse-meta"><span>{t('mode')}</span><b>{job.mode ?? '—'}</b></div><div className="hse-meta"><span>{t('progress')}</span><b>{progress.completed ?? 0}/{progress.total ?? job.nTrials ?? 0}</b></div><div className="hse-meta"><span>{t('validity')}</span><b>{typeof job.nValidScores === 'number' ? `${t('validScores')} ${job.nValidScores}` : t('unavailable')}</b></div><div className="hse-meta"><span>{t('exceptions')}</span><b>{job.nExceptions}</b></div></div>}
      <div className="hse-progress" aria-label={`${progress.percent ?? 0}%`}><i style={{ width: `${progress.percent ?? 0}%` }}/></div><MetricPills metrics={job.metrics}/>
    </div>
  </button>
}

function JsonSection({ title, value }) {
  return <section className="hse-section"><h3>{title}</h3>{value ? <pre className="hse-source">{pretty(value)}</pre> : <span className="hse-muted">—</span>}</section>
}

function TrialDetail({ detail, t }) {
  if (!detail) return <div className="hse-trial-detail hse-muted">{t('evidence')} —</div>
  const assessment = detail.assessment
  if (!assessment) return <div className="hse-trial-detail"><div className="hse-trial-score"><div><span>{detail.lifecycle?.name ?? detail.trial}</span><b>—</b></div><span>{detail.status}</span></div><div className="hse-detail-group"><h4>{t('currentStatus')}</h4><pre>{pretty(detail.lifecycle)}</pre></div></div>
  const score = assessment.score ?? { value: assessment.rewards?.reward, valid: assessment.status === 'assessed' }
  const unscored = detail.status === 'completed-unscored' || detail.lifecycle?.status === 'completed-unscored'
  return <article className="hse-trial-detail" aria-live="polite">
    <div className="hse-trial-score"><div><span>{t('score')}</span><b>{score.valid ? format(score.value) : '—'}</b></div><span className={unscored ? 'hse-muted' : score.valid ? 'hse-valid' : 'hse-invalid'}>{unscored ? 'completed-unscored' : score.valid ? `✓ ${t('valid')}` : `× ${t('invalid')}`}</span></div>
    {!score.valid ? <div className="hse-detail-group"><h4>{t('validity')}</h4><ul>{(score.invalid_reasons ?? []).map(reason => <li key={reason}>{reason}</li>)}</ul></div> : null}
    <div className="hse-detail-group"><h4>{t('findings')}</h4><ul>{(assessment.findings ?? []).length ? assessment.findings.map((item, index) => <li key={index}>{item.code ? `${item.code}: ` : ''}{item.message ?? String(item)}</li>) : <li>—</li>}</ul></div>
    <div className="hse-detail-group"><h4>{t('recommendations')}</h4><ul>{(assessment.recommendations ?? []).length ? assessment.recommendations.map((item, index) => <li key={index}>{item.message ?? String(item)}</li>) : <li>—</li>}</ul></div>
    <div className="hse-detail-group"><h4>{t('output')}</h4><pre>{pretty(assessment.output)}</pre></div>
    <div className="hse-detail-group"><h4>{t('criteria')}</h4><div className="hse-criteria">{(assessment.criteria ?? Object.entries(assessment.rewards ?? {}).map(([id, value]) => ({ id, score: value }))).map(item => <div className="hse-criterion" key={item.id}><span>{item.label ?? item.id}</span><b>{format(item.score)}</b></div>)}</div></div>
    <div className="hse-detail-group"><h4>{t('provenance')}</h4><div className="hse-provenance">{(assessment.evidence_provenance ?? assessment.evidence ?? []).map((item, index) => <span key={item.id ?? index} title={item.artifact_ref}>{item.label ?? item.kind ?? 'Evidence'}</span>)}</div></div>
    <div className="hse-detail-group"><h4>{t('timing')}</h4><pre>{pretty(assessment.process)}</pre></div>
    <details className="hse-detail-group"><summary>{t('audit')}</summary><pre>{pretty(assessment)}</pre></details>
  </article>
}

function TrialExplorer({ job, workspace, active, t }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [validity, setValidity] = useState('')
  const [sort, setSort] = useState('dataset-order')
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState()
  const [selected, setSelected] = useState()
  const [detail, setDetail] = useState()
  useEffect(() => {
    let cancelled = false
    const load = () => api('trials', { workspace, job, offset, limit: 100, query, status, validity, sort }).then(value => { if (!cancelled) setPage(value) })
    const debounce = window.setTimeout(() => void load(), 120)
    const poll = active ? window.setInterval(() => void load(), 2_500) : undefined
    return () => { cancelled = true; window.clearTimeout(debounce); if (poll) window.clearInterval(poll) }
  }, [workspace, job, offset, query, status, validity, sort, active])
  const choose = async trial => { setSelected(trial); setDetail(await api('trial', { workspace, job, trial })) }
  return <div className="hse-trial-layout"><div className="hse-trial-list"><div className="hse-trial-tools"><input className="hse-input" value={query} placeholder={t('search')} onChange={event => { setQuery(event.target.value); setOffset(0) }}/><select className="hse-select" value={status} onChange={event => { setStatus(event.target.value); setOffset(0) }}><option value="">{t('all')}</option><option value="completed">completed</option><option value="completed-unscored">completed-unscored</option><option value="candidate-quality-failed">candidate-quality-failed</option><option value="infrastructure-error">infrastructure-error</option><option value="evaluation-error">evaluation-error</option><option value="running-agent">running-agent</option><option value="evaluating">evaluating</option></select><select className="hse-select" value={validity} onChange={event => { setValidity(event.target.value); setOffset(0) }}><option value="">{t('validity')}</option><option value="true">{t('valid')}</option><option value="false">{t('invalid')}</option></select><select className="hse-select" value={sort} onChange={event => setSort(event.target.value)}><option value="dataset-order">{t('datasetOrder')}</option><option value="latest-completed">{t('latest')}</option><option value="lowest-score">{t('lowest')}</option><option value="errors">{t('errorsFirst')}</option></select></div>
    <div className="hse-table-wrap"><table className="hse-table"><thead><tr><th>#</th><th>{t('queryTrial')}</th><th>{t('statusLabel')}</th><th>{t('score')}</th><th>{t('attempt')}</th></tr></thead><tbody>{page?.items?.map(trial => <tr key={`${trial.id}-${trial.attempt}`} data-selected={String(selected) === String(trial.id)}><td>{trial.datasetOrder + 1}</td><td><button onClick={() => void choose(trial.id ?? trial.datasetTrial)}>{trial.displayName ?? trial.datasetTrial ?? trial.name}</button></td><td>{trial.status}</td><td>{trial.score?.valid ? format(trial.score.value ?? trial.rewards?.reward) : '—'}</td><td>{trial.attempt}</td></tr>)}</tbody></table></div>
    <div className="hse-pager"><span>{page?.total ? `${offset + 1}–${Math.min(offset + (page.items?.length ?? 0), page.total)} / ${page.total}` : '0 / 0'}</span><button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 100))}>{t('previous')}</button><button disabled={!page?.hasMore} onClick={() => setOffset(offset + 100)}>{t('next')}</button></div></div><TrialDetail detail={detail} t={t}/></div>
}

function DatasetPanel({ job, workspace, artifacts, t }) {
  const [state, setState] = useState({ status: 'loading' })
  useEffect(() => { let alive = true; void api('dataset', { workspace, job }).then(value => alive && setState({ status: 'ready', value }), error => alive && setState({ status: 'error', error: error.message })); return () => { alive = false } }, [workspace, job])
  const dataset = state.value ?? artifacts.datasetPreview ?? artifacts.dataset
  const badcases = (dataset?.tasks ?? []).filter(task => task.metadata?.badcase).length
  return <><section className="hse-section"><div className="hse-grid"><div className="hse-card"><span>ID / version</span><b>{artifacts.dataset?.dataset_id ?? '—'} · {artifacts.dataset?.version ?? '—'}</b><code>{short(artifacts.dataset?.source_digest)}</code></div><div className="hse-card"><span>{t('population')}</span><b>{artifacts.dataset?.task_count ?? dataset?.task_count ?? 0}</b><code>{badcases} {t('badcase')} · {dataset?.source === 'job-snapshot' ? t('snapshot') : dataset?.source === 'historical-source-fallback' ? t('historicalFallback') : '—'}</code></div></div></section>
    <section className="hse-section"><h3>{t('datasetTasks')}</h3>{state.status === 'loading' ? <div className="hse-empty"><div className="hse-spin"/>{t('loading')}</div> : state.status === 'error' ? <div className="hse-capability">{state.error}</div> : <div className="hse-task-list">{(dataset?.tasks ?? []).map((task, index) => <details className="hse-task" key={task.id ?? index} open={index === 0}><summary>{index + 1}. {task.query || task.id || `task-${index + 1}`}<span className={task.metadata?.badcase ? 'hse-badcase' : undefined}>{task.metadata?.badcase ? `${t('badcase')} · ${task.metadata?.case_type}` : task.metadata?.topic ?? task.id ?? '—'}</span></summary><div className="hse-task-body"><h4>{t('taskInstruction')}</h4>{task.instruction ? <pre className="hse-instruction">{task.instruction}</pre> : <div className="hse-capability">{task.instruction_error ?? t('noData')}</div>}<div className="hse-inline-meta"><span>ID: {task.id ?? '—'}</span><span>{t('instructionFile')}: {task.instruction_file ?? '—'}</span><span>{t('datasetSource')}: {dataset.source === 'job-snapshot' ? t('snapshot') : t('historicalFallback')}</span>{task.instruction_truncated ? <span>{t('attention')}</span> : null}</div></div></details>)}</div>}</section></>
}

function metricLabelMap(artifacts) {
  return Object.fromEntries((artifacts.contract?.metrics ?? []).map(metric => [metric.id, metric.label ?? metric.id]))
}

function CandidatePanel({ artifacts, t }) {
  const candidate = artifacts.candidate ?? {}
  const context = artifacts.context ?? {}
  const dataset = context.dataset ?? artifacts.dataset ?? {}
  const stack = context.evaluation_stack ?? artifacts.stack ?? {}
  const runtime = context.runtime ?? candidate.runtime ?? {}
  return <>
    <section className="hse-section"><h3>{t('experimentIdentity')}</h3><p className="hse-muted">{t('experimentIdentityHint')}</p><div className="hse-identity-grid">
      <div className="hse-card"><span>{t('candidate')}</span><b>{candidate.candidate_id ?? '—'} · {candidate.version ?? '—'}</b><code>{short(candidate.digest)}</code></div>
      <div className="hse-card"><span>{t('dataset')}</span><b>{dataset.dataset_id ?? '—'} · {dataset.version ?? '—'}</b><code>{dataset.task_count ?? '—'} Tasks · {short(dataset.source_digest)}</code></div>
      <div className="hse-card"><span>{t('evaluationStack')}</span><b>{stack.stack_id ?? '—'} · {stack.version ?? '—'}</b><code>{short(stack.comparison_digest ?? stack.digest)}</code></div>
      <div className="hse-card"><span>{t('runtime')}</span><b>Harbor {runtime.harbor_version ?? '—'}</b><code>{candidate.runtime?.kind ?? '—'} · {candidate.runtime?.version ?? '—'} · {context.mode ?? '—'}</code></div>
    </div></section>
    <section className="hse-section"><h3>{t('immutableCandidateFiles')}</h3><div className="hse-table-wrap"><table className="hse-evidence-table"><thead><tr><th>{t('file')}</th><th>{t('size')}</th><th>{t('digest')}</th></tr></thead><tbody>{(candidate.files ?? []).map(file => <tr key={file.path}><td>{file.path}</td><td>{file.size}</td><td><code>{short(file.sha256)}</code></td></tr>)}</tbody></table></div></section>
  </>
}

function HistoricalTargetPanel({ detail, artifacts, t }) {
  const summary = artifacts.summary ?? {}
  const context = artifacts.context ?? {}
  const target = detail?.evaluationTarget ?? summary.evaluation_target ?? context.evaluation_target ?? {}
  const source = detail?.generationSource ?? summary.generation_source ?? context.generation_source ?? {}
  const population = detail?.generatorPopulation ?? target.generator_population
  const coverage = detail?.coverage ?? summary.coverage ?? {}
  const adapter = context.execution_adapter ?? {}
  return <>
    <section className="hse-section"><h3>{t('historicalTarget')}</h3><p className="hse-muted">{t('observationMode')}</p><div className="hse-identity-grid">
      <div className="hse-card"><span>{t('batch')}</span><b>{target.batch_id ?? '—'}</b><code>{short(target.digest)}</code></div>
      <div className="hse-card"><span>{t('generationRecords')}</span><b>{target.record_count ?? coverage.total_trials ?? '—'} Trials</b><code>{target.kind ?? '—'} · {target.source_kind ?? source.kind ?? '—'}</code></div>
      <div className="hse-card"><span>{t('generationSource')}</span><b>{source.kind ?? target.source_kind ?? '—'}</b><code>{source.adapter_id ?? adapter.adapter_id ?? adapter.id ?? '—'}</code></div>
      <div className="hse-card"><span>{t('executionMode')}</span><b>{detail?.executionMode ?? summary.execution_mode ?? context.execution_mode ?? '—'}</b><code>{context.protocol ?? '—'}</code></div>
    </div></section>
    <section className="hse-section"><h3>{t('generatorPopulation')}</h3><div className="hse-grid"><div className="hse-card"><span>{population?.homogeneous === false ? t('mixedPopulation') : population?.homogeneous === true ? t('homogeneousPopulation') : t('generatorPopulation')}</span><b>{generatorPopulationText(population, t)}</b><code>{population ? short(population.digest) : '—'}</code></div><div className="hse-card"><span>{t('coverage')}</span><b>{coverage.scored_trials ?? '—'} / {coverage.total_trials ?? target.record_count ?? '—'}</b><code>{t('unscoredTrials')}: {coverage.unscored_trials ?? 0} · completed-unscored</code></div><div className="hse-card"><span>Trial coverage</span><b>{typeof coverage.trial_rate === 'number' ? `${format(coverage.trial_rate * 100)}%` : '—'}</b><code>{t('scoredTrials')}</code></div><div className="hse-card"><span>Criterion coverage</span><b>{coverage.criterion_scored ?? '—'} / {coverage.criterion_total ?? '—'}</b><code>{typeof coverage.criterion_rate === 'number' ? `${format(coverage.criterion_rate * 100)}%` : '—'}</code></div></div></section>
  </>
}

function ContractPanel({ artifacts, component, t }) {
  const contract = artifacts.contract ?? {}
  return <>
    <section className="hse-section"><h3>{t('integrationBoundary')}</h3><div className="hse-grid"><div className="hse-card"><span>{t('integration')}</span><b>{component?.id ?? '—'} · {component?.version ?? '—'}</b><code>{short(component?.digest)}</code></div><div className="hse-card"><span>{t('scoringContract')}</span><b>{contract.contract_id ?? '—'} · {contract.version ?? '—'}</b><code>{t('primaryMetric')}: {contract.primary_metric ?? '—'}</code></div></div></section>
    <section className="hse-section"><h3>{t('hardRequirements')}</h3><div className="hse-chip-list">{(contract.hard_requirements ?? []).map(item => <span key={item.id ?? item}>{item.id ?? item}</span>)}</div></section>
  </>
}

function ArtifactPreview({ detail, t }) {
  const preview = detail?.preview
  if (!preview) return <div className="hse-preview"><div className="hse-preview-empty">{t('noRenderableOutput')}</div></div>
  const content = preview.content
  const provenance = preview.provenance ?? []
  let body
  if (preview.kind === 'page' && preview.format === 'url' && preview.url) body = <iframe className="hse-page-frame" title={preview.title ?? t('pagePreview')} src={preview.url} sandbox="" referrerPolicy="no-referrer"/>
  else if (preview.kind === 'page' && preview.format === 'html' && typeof content === 'string') body = <iframe className="hse-page-frame" title={preview.title ?? t('pagePreview')} srcDoc={content} sandbox="" referrerPolicy="no-referrer"/>
  else if (preview.kind === 'document') {
    const primary = typeof content === 'string' ? content : content?.answer ?? content?.report ?? content?.markdown ?? content?.content ?? content?.text
    const remainder = isRecord(content) ? Object.fromEntries(Object.entries(content).filter(([key]) => !['answer', 'report', 'markdown', 'content', 'text'].includes(key))) : undefined
    body = <div className="hse-document"><h4>{t('documentPreview')}</h4><pre>{primary ?? pretty(content)}</pre>{remainder && Object.keys(remainder).length ? <details className="hse-source-details"><summary>{t('rawOutput')}</summary><pre className="hse-output-structured">{pretty(remainder)}</pre></details> : null}</div>
  } else body = <pre className="hse-output-structured">{pretty(content)}</pre>
  return <article className="hse-preview"><header className="hse-preview-head"><div><b>{preview.title ?? t('generatedOutput')}</b><span>{preview.kind} · {preview.format}</span></div><div><b>{t('previewSource')}</b><span>{provenance.map(item => item.label ?? item.kind).join(' · ') || preview.source || '—'}</span></div></header>{body}</article>
}

function RendererPanel({ job, workspace, active, component, t }) {
  const [page, setPage] = useState()
  const [selected, setSelected] = useState()
  const [detail, setDetail] = useState()
  useEffect(() => { let alive = true; const load = () => api('trials', { workspace, job, offset: 0, limit: 100, sort: 'dataset-order' }).then(value => { if (!alive) return; setPage(value); if (value.items?.length) setSelected(current => current ?? value.items[0].id ?? value.items[0].datasetTrial) }); void load(); const poll = active ? window.setInterval(() => void load(), 2_500) : undefined; return () => { alive = false; if (poll) window.clearInterval(poll) } }, [workspace, job, active])
  useEffect(() => { if (!selected) return; let alive = true; void api('trial', { workspace, job, trial: selected }).then(value => alive && setDetail(value)); return () => { alive = false } }, [workspace, job, selected])
  return <><section className="hse-section"><div className="hse-grid"><div className="hse-card"><span>{t('renderer')}</span><b>{component?.id ?? '—'} · {component?.version ?? '—'}</b><code>{short(component?.digest)}</code></div><div className="hse-card"><span>{t('generatedOutput')}</span><b>{page?.items?.length ?? 0} Trials</b><code>{t('previewSource')}: {detail?.preview?.provenance?.map(item => item.label ?? item.kind).join(' · ') || '—'}</code></div></div></section><section className="hse-section"><h3>{t('generatedOutput')}</h3><div className="hse-output-layout"><div className="hse-output-list">{(page?.items ?? []).map((trial, index) => <button type="button" className="hse-output-item" data-active={String(selected) === String(trial.id ?? trial.datasetTrial)} key={`${trial.id}-${trial.attempt}`} onClick={() => setSelected(trial.id ?? trial.datasetTrial)}><b>{index + 1}. {trial.displayName ?? trial.datasetTrial ?? trial.name}</b><span>{trial.status} · attempt {trial.attempt}</span></button>)}</div><ArtifactPreview detail={detail} t={t}/></div></section></>
}

function TrialAssessmentReport({ job, workspace, active, artifacts, historical = false, t }) {
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState()
  const [selected, setSelected] = useState()
  const [detailState, setDetailState] = useState({ status: 'idle' })
  useEffect(() => {
    let alive = true
    const load = () => api('trials', { workspace, job, offset, limit: REPORT_PAGE_SIZE, sort: 'dataset-order' }).then(value => {
      if (!alive) return
      setPage(value)
      if (value.items?.length) setSelected(current => value.items.some(item => String(item.id ?? item.datasetTrial) === String(current)) ? current : value.items[0].id ?? value.items[0].datasetTrial)
      else setSelected(undefined)
    })
    void load()
    const poll = active ? window.setInterval(() => void load(), 2_500) : undefined
    return () => { alive = false; if (poll) window.clearInterval(poll) }
  }, [workspace, job, active, offset])
  useEffect(() => { setOffset(0) }, [job])
  useEffect(() => {
    if (!selected) return
    let alive = true
    setDetailState({ status: 'loading' })
    void api('trial', { workspace, job, trial: selected }).then(value => alive && setDetailState({ status: 'ready', value }), error => alive && setDetailState({ status: 'error', error: error.message }))
    return () => { alive = false }
  }, [workspace, job, selected])
  const labels = metricLabelMap(artifacts)
  const primary = artifacts.contract?.primary_metric ?? 'reward'
  const declared = (artifacts.contract?.metrics ?? []).map(item => item.id).filter(id => id !== primary)
  const metricIds = declared.length ? declared : Object.keys(page?.items?.[0]?.rewards ?? {}).filter(id => id !== primary)
  const selectedTrial = page?.items?.find(item => String(item.id ?? item.datasetTrial) === String(selected))
  const detail = detailState.value
  const assessment = detail?.assessment
  const score = assessment?.score
  const artifactTitle = assessment?.output?.title ?? detail?.preview?.title ?? '—'
  return <section className="hse-section"><h3>{t('trialAssessments')}</h3><p className="hse-muted">{t('trialAssessmentsHint')}</p>
    <div className="hse-table-wrap"><table className="hse-evidence-table hse-report-table"><thead><tr><th>#</th><th>{t('queryTrial')}</th><th>{t('overallScore')}</th>{metricIds.map(id => <th key={id}>{labels[id] ?? id}</th>)}</tr></thead><tbody>{(page?.items ?? []).map(trial => <tr key={`${trial.id}-${trial.attempt}`} data-selected={String(selected) === String(trial.id ?? trial.datasetTrial)}><td>{trial.datasetOrder + 1}</td><td><button type="button" onClick={() => setSelected(trial.id ?? trial.datasetTrial)}>{trial.displayName ?? trial.datasetTrial ?? trial.name}</button></td><td><span className="hse-report-score" data-valid={trial.scoringStatus === 'unscored' ? undefined : trial.score?.valid}>{trial.scoringStatus === 'unscored' ? 'completed-unscored' : trial.score?.valid ? format(trial.score.value ?? trial.rewards?.[primary]) : '—'}</span></td>{metricIds.map(id => <td key={id}>{format(trial.rewards?.[id])}</td>)}</tr>)}</tbody></table></div>
    <div className="hse-pager"><span>{page?.total ? `${offset + 1}–${Math.min(offset + (page.items?.length ?? 0), page.total)} / ${page.total}` : '0 / 0'}</span><button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - REPORT_PAGE_SIZE))}>{t('previous')}</button><button disabled={!page?.hasMore} onClick={() => setOffset(offset + REPORT_PAGE_SIZE)}>{t('next')}</button></div>
    {detailState.status === 'loading' ? <div className="hse-empty"><div className="hse-spin"/>{t('loading')}</div> : detailState.status === 'error' ? <div className="hse-error">{detailState.error}</div> : assessment ? <article className="hse-report-detail"><header className="hse-report-detail-head"><div><h4>{selectedTrial?.displayName ?? assessment.query ?? assessment.trial_name}</h4><span>{t('artifact')}: {artifactTitle}</span><code>{assessment.dataset_trial ?? selectedTrial?.datasetTrial}</code></div><div><span>{t('overallScore')}</span><b className={selectedTrial?.scoringStatus === 'unscored' ? 'hse-muted' : score?.valid ? 'hse-valid' : 'hse-invalid'}>{selectedTrial?.scoringStatus === 'unscored' ? 'completed-unscored' : score?.valid ? format(score.value) : '—'}</b></div></header>{!score?.valid ? <div className="hse-capability">{selectedTrial?.scoringStatus === 'unscored' && historical ? `${t('unscoredTrials')} · ` : ''}{(score?.invalid_reasons ?? []).join(' · ')}</div> : null}<div className="hse-report-compare"><div className="hse-report-criteria">{(assessment.criteria ?? []).map(criterion => <section className="hse-report-criterion" key={criterion.id}><header><b>{criterion.label ?? labels[criterion.id] ?? criterion.id}</b><b>{format(criterion.score)}</b></header><dl><dt>{t('assessmentReason')}</dt><dd>{criterion.reason || t('noAssessmentReason')}</dd><dt>{t('assessmentRecommendation')}</dt><dd className="hse-report-recommendation">{criterion.recommendation || t('noAssessmentRecommendation')}</dd></dl></section>)}</div><ArtifactPreview detail={detail} t={t}/></div></article> : null}
  </section>
}

function ReporterPanel({ job, workspace, active, artifacts, jobKind, t }) {
  const summary = artifacts.summary ?? {}
  const population = artifacts.population ?? {}
  const metrics = population.metrics ?? summary.metrics ?? {}
  const labels = metricLabelMap(artifacts)
  const historical = jobKind === HISTORICAL_JOB_KIND
  const coverage = summary.coverage ?? {}
  const total = historical ? coverage.total_trials ?? summary.n_trials ?? 0 : summary.n_trials ?? population.population_size ?? 0
  const valid = historical ? coverage.scored_trials ?? summary.n_valid_scores : summary.n_valid_scores ?? population.valid_population_size
  const unscored = historical ? coverage.unscored_trials ?? summary.status_counts?.['completed-unscored'] ?? 0 : undefined
  const rawGroups = population.groups ?? (historical ? summary.status_counts : {})
  const groups = Array.isArray(rawGroups) ? rawGroups : Object.entries(rawGroups ?? {}).map(([id, count]) => ({ id, count }))
  const configured = population.hook?.configured_component
  return <><section className="hse-section"><h3>{t('populationEvidence')}</h3>{configured ? <div className="hse-hook-state" data-executed={Boolean(configured.executed)}><b>{t('hookExecution')}: {configured.id ?? '—'} · {configured.version ?? '—'}</b><br/>{configured.executed ? t('configuredHookRun') : t('configuredHookNotRun')}</div> : null}<div className="hse-kpis"><div className="hse-kpi"><span>{t('trials')}</span><b>{total}</b></div><div className="hse-kpi"><span>{historical ? t('scoredTrials') : t('valid')}</span><b className="hse-valid">{valid ?? '—'}</b></div>{historical ? <div className="hse-kpi"><span>{t('unscoredTrials')}</span><b>{unscored}</b></div> : <div className="hse-kpi"><span>{t('invalid')}</span><b className="hse-invalid">{summary.n_invalid_scores ?? population.invalid_population_size ?? '—'}</b></div>}<div className="hse-kpi"><span>{t('exceptions')}</span><b>{summary.n_exceptions ?? 0}</b></div><div className="hse-kpi"><span>{t('coverage')}</span><b>{historical && typeof coverage.trial_rate === 'number' ? `${format(coverage.trial_rate * 100)}%` : summary.artifact_validation?.valid ? 'VALID' : 'CHECK'}</b></div></div></section>
    <section className="hse-section"><div className="hse-table-wrap"><table className="hse-evidence-table"><thead><tr><th>{t('metric')}</th><th>{t('aggregate')}</th><th>{t('coverage')}</th></tr></thead><tbody>{Object.entries(metrics).map(([id, value]) => <tr key={id}><td><b>{labels[id] ?? id}</b><br/><code>{id}</code></td><td>{format(value)}</td><td>{valid ?? '—'} / {total}</td></tr>)}</tbody></table></div></section>
    <section className="hse-section"><h3>{t('trialGroups')}</h3><div className="hse-chip-list">{groups.map(group => <span key={group.id}>{group.id}: {group.count}</span>)}</div></section>
    <TrialAssessmentReport job={job} workspace={workspace} active={active} artifacts={artifacts} historical={historical} t={t}/></>
}

function TrialDeltaTable({ title, items }) {
  return <section className="hse-section"><h3>{title} · {items?.length ?? 0}</h3>{items?.length ? <div className="hse-table-wrap"><table className="hse-evidence-table"><thead><tr><th>Trial</th><th>Baseline</th><th>Candidate</th><th>Delta</th></tr></thead><tbody>{items.map(item => <tr key={item.trial}><td>{item.trial}</td><td>{format(item.baseline)}</td><td>{format(item.candidate)}</td><td className="hse-delta" data-positive={(item.delta ?? 0) >= 0}>{item.delta >= 0 ? '+' : ''}{format(item.delta)}</td></tr>)}</tbody></table></div> : <span className="hse-muted">0</span>}</section>
}

function ComparePanel({ job, workspace, jobs, artifacts, t }) {
  const current = jobs.find(item => item.name === job)
  const all = jobs.filter(item => item.name !== job)
  const matched = all.filter(item => item.candidate?.candidate_id === current?.candidate?.candidate_id && item.dataset?.dataset_id === current?.dataset?.dataset_id && item.dataset?.version === current?.dataset?.version && item.mode === current?.mode)
  const candidates = matched.length ? matched : all
  const [baseline, setBaseline] = useState(candidates[0]?.name ?? '')
  const [state, setState] = useState()
  useEffect(() => { if (!baseline) return; let alive = true; void api('compare', { workspace, baseline, candidate: job }).then(value => alive && setState({ value }), error => alive && setState({ error: error.message })); return () => { alive = false } }, [workspace, baseline, job])
  const labels = metricLabelMap(artifacts)
  return <><section className="hse-section"><h3>{t('compare')}</h3><div className="hse-compare-select"><select className="hse-select" value={baseline} onChange={event => setBaseline(event.target.value)}><option value="">{t('baseline')}</option>{candidates.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select></div>{state?.error ? <div className="hse-error">{state.error}</div> : state?.value ? <><div className={state.value.comparable ? 'hse-valid' : 'hse-invalid'}>{state.value.comparable ? `✓ ${t('comparable')}` : `× ${t('notComparable')}`}</div><p className="hse-muted">{state.value.note}</p><div className="hse-grid">{Object.entries(state.value.metrics ?? {}).map(([metric, values]) => <div className="hse-card" key={metric}><span>{labels[metric] ?? metric} · {values.direction}</span><b>{format(values.baseline)} → {format(values.candidate)}</b><code className="hse-delta" data-positive={(values.improvement ?? values.delta ?? 0) >= 0}>{typeof values.delta === 'number' ? `${values.delta >= 0 ? '+' : ''}${format(values.delta)}` : '—'}</code></div>)}</div></> : <span className="hse-muted">{t('noData')}</span>}</section>{state?.value ? <><TrialDeltaTable title={t('improved')} items={state.value.improvedTrials}/><TrialDeltaTable title={t('regressed')} items={state.value.regressedTrials}/></> : null}<div className="hse-capability">{t('explicitGate')}</div></>
}

function OptimizerPanel({ artifacts, t }) {
  const diagnosis = artifacts.diagnosis ?? {}
  const optimization = artifacts.optimization ?? {}
  const hypotheses = optimization.hypotheses ?? []
  const diagnoses = diagnosis.diagnoses ?? []
  const configured = optimization.hook?.configured_component
  return <>
    <section className="hse-section"><h3>{t('controlledHypotheses')}</h3>{configured ? <div className="hse-hook-state" data-executed={Boolean(configured.executed)}><b>{t('hookExecution')}: {configured.id ?? '—'} · {configured.version ?? '—'}</b><br/>{configured.executed ? t('configuredHookRun') : t('configuredHookNotRun')}</div> : null}<div className="hse-grid"><div className="hse-card"><span>Diagnoser</span><b>{diagnosis.hook?.id ?? '—'} · {diagnosis.hook?.version ?? '—'}</b><code>{diagnoses.length} diagnoses · non-reward-affecting</code></div><div className="hse-card"><span>{t('pluginFallback')}</span><b>{optimization.hook?.id ?? '—'} · {optimization.hook?.version ?? '—'}</b><code>{hypotheses.length} hypotheses · non-reward-affecting</code></div></div></section>
    {diagnoses.length ? <section className="hse-section"><h3>Diagnoses</h3><div className="hse-findings">{diagnoses.map((item, index) => <div className="hse-finding" key={item.id ?? index}>{item.message ?? item.root_cause ?? pretty(item)}</div>)}</div></section> : null}
    <section className="hse-section"><div className="hse-hypotheses">{hypotheses.length ? hypotheses.map(item => <article className="hse-hypothesis" key={item.id}><h4>{item.id}</h4><dl>
      <dt>{t('rootCause')}</dt><dd>{item.root_cause ?? '—'}</dd>
      <dt>{t('affectedTrials')}</dt><dd>{item.affected_trials?.length ?? 0}</dd>
      <dt>{t('expectedEffect')}</dt><dd>{item.expected_metric_effect ?? '—'}</dd>
      <dt>{t('mutationSurface')}</dt><dd>{item.mutation_surface?.join(' · ') || '—'}</dd>
      <dt>{t('forbiddenSurface')}</dt><dd>{item.forbidden_surface?.join(' · ') || '—'}</dd>
      <dt>{t('guardrails')}</dt><dd>{item.guardrails?.join(' · ') || '—'}</dd>
      <dt>{t('rollback')}</dt><dd>{item.rollback_condition ?? '—'}</dd>
      <dt>{t('nextExperiment')}</dt><dd>{item.next_experiment ?? '—'}</dd>
    </dl><details className="hse-source-details"><summary>{t('provenance')} · {item.evidence_refs?.length ?? 0}</summary><pre className="hse-source">{pretty(item.evidence_refs)}</pre></details></article>) : <div className="hse-empty">{t('noHypotheses')}</div>}</div></section>
  </>
}

function GateEvidencePanel({ artifacts, t }) {
  const report = artifacts.promotion
  if (!report) return <section className="hse-section"><h3>{t('gateEvidence')}</h3><span className="hse-muted">{t('noData')}</span></section>
  const labels = metricLabelMap(artifacts)
  const pass = report.decision === 'PROMOTE'
  const population = report.population ?? {}
  return <>
    <section className="hse-section"><div className="hse-gate-head"><div><h3>{t('gateEvidence')}</h3><p className="hse-muted">{report.baseline_job ?? '—'} → {report.candidate_job ?? '—'}</p></div><span className="hse-decision" data-pass={pass}>{report.decision ?? '—'}</span></div><div className="hse-grid"><div className="hse-card"><span>{t('comparable')}</span><b className={report.comparable ? 'hse-valid' : 'hse-invalid'}>{report.comparable ? '✓ TRUE' : '× FALSE'}</b><code>{short(report.baseline_evaluation_context?.digest)} = {short(report.candidate_evaluation_context?.digest)}</code></div><div className="hse-card"><span>{report.gate_eligible ? t('eligible') : t('notEligible')}</span><b className={report.gate_eligible ? 'hse-valid' : 'hse-invalid'}>{population.baseline_valid ?? '—'} / {population.baseline ?? '—'} → {population.candidate_valid ?? '—'} / {population.candidate ?? '—'}</b><code>{t('policy')}: {report.policy?.policy_id ?? '—'} · {report.policy?.version ?? '—'}</code></div></div></section>
    <section className="hse-section"><h3>{t('metricDeltas')}</h3><div className="hse-table-wrap"><table className="hse-evidence-table"><thead><tr><th>{t('metric')}</th><th>Baseline</th><th>Candidate</th><th>Delta</th></tr></thead><tbody>{Object.entries(report.metric_deltas ?? {}).map(([id, delta]) => <tr key={id}><td>{labels[id] ?? id}</td><td>{format(report.baseline_metrics?.[id])}</td><td>{format(report.candidate_metrics?.[id])}</td><td className="hse-delta" data-positive={delta >= 0}>{delta >= 0 ? '+' : ''}{format(delta)}</td></tr>)}</tbody></table></div></section>
    <section className="hse-section"><div className="hse-kpis"><div className="hse-kpi"><span>{t('improved')}</span><b>{report.improved_trials?.length ?? 0}</b></div><div className="hse-kpi"><span>{t('regressed')}</span><b>{report.regressed_trials?.length ?? 0}</b></div><div className="hse-kpi"><span>{t('newExceptions')}</span><b>{report.new_exceptions?.length ?? 0}</b></div><div className="hse-kpi"><span>{t('artifactRegressions')}</span><b>{report.artifact_regressions?.length ?? 0}</b></div><div className="hse-kpi"><span>{t('reasons')}</span><b>{report.reasons?.length ?? 0}</b></div></div>{report.reasons?.length ? <ul>{report.reasons.map((reason, index) => <li key={`${gateReasonText(reason)}-${index}`}>{gateReasonText(reason)}</li>)}</ul> : null}</section>
  </>
}

function HistoricalGatePanel({ t }) {
  return <section className="hse-section"><div className="hse-gate-head"><div><h3>{t('gateEvidence')}</h3><p className="hse-muted">{t('gateNotApplicableHint')}</p></div><span className="hse-decision">{t('gateNotApplicable')}</span></div><div className="hse-capability"><b>UNSUPPORTED_JOB_KIND_FOR_PROMOTION</b><br/>historical-generation-evaluation · diagnostic · observe-existing</div></section>
}

function EvaluatorEditor({ value, workspace, reload, t }) {
  const active = value.evaluatorInterface
  const evaluator = active?.evaluator
  const files = evaluator?.editable_files ?? []
  const [selectedPath, setSelectedPath] = useState(files[0]?.path ?? '')
  const selected = files.find(item => item.path === selectedPath) ?? files[0]
  const [draft, setDraft] = useState(selected?.text ?? '')
  const [evaluatorVersion, setEvaluatorVersion] = useState(nextVersion(evaluator?.version))
  const [stackVersion, setStackVersion] = useState(nextVersion(active?.stack?.version))
  const [saveState, setSaveState] = useState({ status: 'idle' })
  useEffect(() => {
    const first = files[0]
    setSelectedPath(current => files.some(item => item.path === current) ? current : first?.path ?? '')
    setEvaluatorVersion(nextVersion(evaluator?.version))
    setStackVersion(nextVersion(active?.stack?.version))
  }, [evaluator?.digest])
  useEffect(() => { setDraft(selected?.text ?? ''); setSaveState({ status: 'idle' }) }, [selected?.path, selected?.digest])
  if (active?.error || !evaluator) return <section className="hse-section"><h3>{t('evaluatorImplementation')}</h3><div className="hse-capability">{active?.error ?? t('noEvaluatorInterface')}</div></section>
  const changed = selected && draft !== selected.text
  const save = async () => {
    setSaveState({ status: 'saving' })
    try {
      await mutate('evaluator', {
        workspace,
        stackPath: active.stack.path,
        filePath: selected.path,
        content: draft,
        expectedDigest: selected.digest,
        newEvaluatorVersion: evaluatorVersion,
        newStackVersion: stackVersion,
      })
      setSaveState({ status: 'saved' })
      await reload()
    } catch (error) {
      setSaveState({ status: 'error', message: error.message })
    }
  }
  return <section className="hse-section"><div className="hse-editor-head"><div><h3>{t('evaluatorImplementation')}</h3><p className="hse-muted">{evaluator.evaluator_id} · {evaluator.version}</p></div><div className="hse-card"><span>{t('evaluatorKind')}</span><b>{evaluator.kind}</b><code>{evaluator.interface}</code></div></div>
    <div className="hse-grid"><div className="hse-card"><span>{t('evaluatorProtocol')}</span><b>{evaluator.protocol?.input} → {evaluator.protocol?.output}</b><code>{evaluator.implementation?.language} · {evaluator.implementation?.callable}</code></div><div className="hse-card"><span>{t('criteria')}</span><b>{(evaluator.criteria ?? []).map(item => item.label).join(' · ')}</b><code>0 · 0.5 · 1</code></div></div>
    <div className="hse-editor-tabs" aria-label={t('editableFiles')}>{files.map(file => <button type="button" className="hse-editor-tab" data-active={file.path === selected?.path} key={file.path} onClick={() => setSelectedPath(file.path)}><b>{t('openFile')} {file.path.split('/').at(-1)}</b><span>{file.role} · {file.path}</span></button>)}</div>
    <div className="hse-editor-current"><span>{t('editingFile')}</span><b>{selected?.path.split('/').at(-1)}</b><code>{selected?.path}</code></div>
    <textarea className="hse-editor" aria-label={t('editSource')} spellCheck="false" value={draft} onChange={event => setDraft(event.target.value)}/>
    <div className="hse-editor-versions"><label className="hse-card"><span>{t('evaluatorVersion')}</span><input className="hse-input" value={evaluatorVersion} onChange={event => setEvaluatorVersion(event.target.value)}/></label><label className="hse-card"><span>{t('stackVersion')}</span><input className="hse-input" value={stackVersion} onChange={event => setStackVersion(event.target.value)}/></label></div>
    <div className="hse-editor-actions"><p className={saveState.status === 'error' ? 'hse-editor-error' : saveState.status === 'saved' ? 'hse-editor-success' : 'hse-muted'}>{saveState.status === 'error' ? saveState.message : saveState.status === 'saved' ? t('saved') : t('editWarning')}</p><button type="button" className="hse-button" disabled={!changed || !evaluatorVersion || !stackVersion || saveState.status === 'saving'} onClick={() => void save()}>{saveState.status === 'saving' ? t('saving') : t('saveEvaluator')}</button></div>
  </section>
}

function GovernancePanel({ job, workspace, t }) {
  const [state, setState] = useState({ status: 'loading' })
  const [copied, setCopied] = useState(false)
  const load = useCallback(async () => { try { setState({ status: 'ready', value: await api('governance', { workspace, job }) }) } catch (error) { setState({ status: 'error', error: error.message }) } }, [workspace, job])
  useEffect(() => { void load() }, [load])
  if (state.status === 'loading') return <div className="hse-empty"><div className="hse-spin"/>{t('loading')}</div>
  if (state.status === 'error') return <div className="hse-capability">{state.error}</div>
  const value = state.value
  const evaluator = value.components?.evaluator
  const rubric = value.components?.rubric
  const workflow = value.upgradeWorkflow ?? {}
  const prompt = t('evaluatorPrompt')
  const copy = async () => { try { await navigator.clipboard.writeText(prompt); setCopied(true); window.setTimeout(() => setCopied(false), 1_500) } catch { setCopied(false) } }
  return <><section className="hse-section"><h3>{t('currentEvaluator')}</h3><p className="hse-muted">{t('governanceHint')}</p><div className="hse-governance-id"><div className="hse-card"><span>{t('evaluator')}</span><b>{evaluator?.id ?? '—'} · {evaluator?.version ?? '—'}</b><code>{evaluator?.entry ?? '—'}</code></div><div className="hse-card"><span>{t('rubric')}</span><b>{rubric?.id ?? '—'} · {rubric?.version ?? '—'}</b><code>{rubric?.entry ?? '—'}</code></div><div className="hse-card"><span>Judge</span><b>{value.judge?.provider ?? '—'} / {value.judge?.model ?? '—'}</b><code>{judgeIdentityDetails(value.judge)}</code></div></div></section>
    <EvaluatorEditor value={value} workspace={workspace} reload={load} t={t}/>
    {[['evaluator', evaluator], ['rubric', rubric]].map(([role, component]) => <section className="hse-section" key={role}><h3>{role === 'evaluator' ? t('evaluator') : t('rubric')} · {component?.id ?? '—'} · {component?.version ?? '—'}</h3><div className="hse-grid"><div className="hse-card"><span>{t('sourceCode')}</span><b>{component?.entry ?? '—'}</b><code>{short(component?.digest)}</code></div><div className="hse-card"><span>Reward semantics</span><b>{component?.reward_affecting ? 'reward-affecting' : 'non-reward'}</b><code>{component?.source?.error ?? 'read-only'}</code></div></div>{component?.source?.text ? <details className="hse-source-details"><summary>{t('sourceCode')}</summary><pre className="hse-source">{component.source.text}</pre></details> : <div className="hse-capability">{component?.source?.error}</div>}</section>)}
    <section className="hse-section hse-upgrade"><h3>{t('upgradeEvaluator')}</h3><p className="hse-muted">{t('upgradeHint')}</p><ol>{[1, 2, 3, 4, 5].map(index => <li key={index}>{t(`upgradeStep${index}`)}</li>)}</ol><div className="hse-grid"><div className="hse-card"><span>{t('freshBaseline')}</span><b>Evaluator / Rubric / Judge identity</b><code>{(workflow.freshBaselineRequiredWhen ?? []).join(' · ')}</code></div><div className="hse-card"><span>{t('metaEvaluation')}</span><b>Independent GT · ESF · SCE · RCR</b><code>No automatic evaluation or Gate</code></div></div><pre className="hse-prompt">{prompt}</pre><div className="hse-prompt-actions"><button className="hse-button" type="button" onClick={() => void copy()}>{copied ? t('copied') : t('copyPrompt')}</button></div></section></>
}

function MetaEvaluationPanel({ job, workspace, t }) {
  const [state, setState] = useState({ status: 'loading' })
  const [offset, setOffset] = useState(0)
  const pageSize = 20
  useEffect(() => {
    let alive = true
    void api('meta', { workspace, job, offset, limit: pageSize }).then(value => alive && setState({ status: 'ready', value }), error => alive && setState({ status: 'error', error: error.message }))
    return () => { alive = false }
  }, [workspace, job, offset])
  useEffect(() => { setOffset(0) }, [workspace, job])
  if (state.status === 'loading') return <div className="hse-empty"><div className="hse-spin"/>{t('loading')}</div>
  if (state.status === 'error') return <div className="hse-error">{state.error}</div>
  const value = state.value ?? {}
  const groundTruth = value.groundTruth
  const report = value.report
  const metrics = report?.metrics ?? {}
  const pagination = value.disagreementPagination ?? {}
  return <>
    <section className="hse-section"><h3>{t('metaWorkflow')}</h3><p className="hse-muted">{t('metaWorkflowHint')}</p><div className="hse-meta-flow"><div><b>1. Evaluator Candidate</b><br/>{value.workflow?.candidate}</div><div><b>2. Fixed artifacts + GT</b><br/>{value.workflow?.dataset}</div><div><b>3. Repeated observations</b><br/>{value.workflow?.output}</div><div><b>4. ESF / SCE / RCR</b><br/>{value.workflow?.verifier}</div></div></section>
    <section className="hse-section"><h3>{t('groundTruth')}</h3>{groundTruth ? <><div className="hse-grid"><div className="hse-card"><span>ID / version</span><b>{groundTruth.id} · {groundTruth.version}</b><code>{groundTruth.path}</code></div><div className="hse-card"><span>{t('gtSource')}</span><b>{groundTruth.source?.kind}</b><code>{groundTruth.source?.description}</code></div><div className="hse-card"><span>{t('gtCases')}</span><b>{groundTruth.caseCount}</b><code>{groundTruth.criteria?.map(item => item.label ?? item.id).join(' · ')}</code></div><div className="hse-card"><span>{t('gtBadcases')}</span><b>{groundTruth.badcaseCount}</b><code>{t('gtProvenance')}: {groundTruth.source?.provenance}</code></div></div></> : <div className="hse-capability"><b>{t('groundTruthRequired')}</b><br/>{t('gtKinds')}</div>}<div className="hse-hook-state" data-executed={Boolean(report)}><b>{t('metaNext')}</b><br/>{value.workflow?.nextAction}</div></section>
    {report ? <><section className="hse-section"><h3>Evaluator · {report.evaluator?.id} · {report.evaluator?.version}</h3><div className="hse-kpis"><div className="hse-kpi"><span>ESF ↑</span><b>{format(metrics.esf)}</b></div><div className="hse-kpi"><span>SCE ↓</span><b>{format(metrics.sce)}</b></div><div className="hse-kpi"><span>RCR ↑</span><b>{format(metrics.rcr)}</b></div><div className="hse-kpi"><span>{t('coverage')}</span><b>{format(report.coverage?.rate)}</b></div><div className="hse-kpi"><span>{t('disagreements')}</span><b>{pagination.total ?? report.disagreements?.length ?? 0}</b></div></div></section>{pagination.total ? <section className="hse-section"><h3>{t('disagreements')}</h3><div className="hse-table-wrap"><table className="hse-evidence-table"><thead><tr><th>Case</th><th>Criterion</th><th>GT</th><th>Observed</th></tr></thead><tbody>{(report.disagreements ?? []).map((item, index) => <tr key={`${item.case_id}-${item.repeat}-${item.criterion_id}-${index}`}><td>{item.case_id}</td><td>{item.criterion_id}</td><td>{format(item.ground_truth)}</td><td>{format(item.observed)}</td></tr>)}</tbody></table></div><div className="hse-pager"><span>{pagination.total ? `${offset + 1}–${Math.min(offset + (report.disagreements?.length ?? 0), pagination.total)} / ${pagination.total}` : '0 / 0'}</span><button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - pageSize))}>{t('previous')}</button><button disabled={!pagination.hasMore} onClick={() => setOffset(offset + pageSize)}>{t('next')}</button></div></section> : null}</> : null}
  </>
}

function HistoricalMetaEvaluationPanel({ detail, artifacts, t }) {
  const context = artifacts.context ?? {}
  const metaEvaluation = context.downstream_analysis?.evaluator_meta_evaluation
    ?? detail?.evaluatorMetaEvaluation
    ?? artifacts.summary?.evaluator_meta_evaluation
    ?? { status: 'not-run', validation_report_ref: null }
  const notRun = metaEvaluation.status === 'not-run'
  return <section className="hse-section"><h3>{t('meta')}</h3><p className="hse-muted">{t('metaNotRunHint')}</p><div className="hse-grid"><div className="hse-card"><span>{t('currentStatus')}</span><b>{notRun ? t('metaNotRun') : metaEvaluation.status ?? '—'}</b><code>{context.protocol ?? 'historical-generation-evaluation-context/v1'}</code></div><div className="hse-card"><span>Validation report</span><b>{metaEvaluation.validation_report_ref ?? '—'}</b><code>{notRun ? 'Evaluator reliability remains unvalidated' : short(metaEvaluation.digest)}</code></div></div></section>
}

function Workbench({ job, workspace, jobs, close, t }) {
  const [state, setState] = useState({ status: 'loading' })
  const [stage, setStage] = useState('candidate')
  const activeJob = jobs.find(item => item.name === job)
  const load = useCallback(async () => {
    try { setState({ status: 'ready', value: await api('job', { workspace, job }) }) }
    catch (error) { setState({ status: 'error', error: error.message }) }
  }, [workspace, job])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (!activeJob?.progress?.active) return undefined; const timer = window.setInterval(() => void load(), 2_500); return () => window.clearInterval(timer) }, [activeJob?.progress?.active, load])
  useEffect(() => { const escape = event => event.key === 'Escape' && close(); window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape) }, [close])
  const detail = state.value
  const artifacts = detail?.artifacts ?? {}
  const historical = isHistoricalJob(detail) || isHistoricalJob(activeJob)
  const target = detail?.evaluationTarget ?? activeJob?.evaluationTarget ?? artifacts.summary?.evaluation_target ?? artifacts.context?.evaluation_target ?? {}
  const contextSupported = detail?.capabilities?.contextSupported ?? detail?.capabilities?.contextV2
  const component = artifacts.stack?.components?.[stage]
  let content
  if (stage === 'candidate') content = historical ? <HistoricalTargetPanel detail={detail} artifacts={artifacts} t={t}/> : <CandidatePanel artifacts={artifacts} t={t}/>
  else if (stage === 'dataset') content = <DatasetPanel job={job} workspace={workspace} artifacts={artifacts} t={t}/>
  else if (stage === 'renderer') content = <RendererPanel job={job} workspace={workspace} active={Boolean(activeJob?.progress?.active)} component={component} t={t}/>
  else if (stage === 'judge') content = <><GovernancePanel job={job} workspace={workspace} t={t}/><section className="hse-section"><h3>{t('trials')} / {t('evidence')}</h3><TrialExplorer job={job} workspace={workspace} active={Boolean(activeJob?.progress?.active)} t={t}/></section></>
  else if (stage === 'meta') content = historical ? <HistoricalMetaEvaluationPanel detail={detail} artifacts={artifacts} t={t}/> : <MetaEvaluationPanel job={job} workspace={workspace} t={t}/>
  else if (stage === 'reporter') content = <ReporterPanel job={job} workspace={workspace} active={Boolean(activeJob?.progress?.active)} artifacts={artifacts} jobKind={detail?.jobKind ?? activeJob?.jobKind} t={t}/>
  else if (stage === 'optimizer') content = <OptimizerPanel artifacts={artifacts} t={t}/>
  else if (stage === 'gate') content = historical ? <HistoricalGatePanel t={t}/> : <><ComparePanel job={job} workspace={workspace} jobs={jobs} artifacts={artifacts} t={t}/><GateEvidencePanel artifacts={artifacts} t={t}/></>
  else content = stage === 'integration' ? <ContractPanel artifacts={artifacts} component={component} t={t}/> : <section className="hse-section"><div className="hse-components"><div className="hse-component"><span>{stage}{component?.reward_affecting ? ' · reward-affecting' : ''}</span><b>{component?.id ?? '—'} · {component?.version ?? '—'}</b><code>{short(component?.digest)}</code></div></div></section>
  return <div className="hse-overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && close()}><aside className="hse-drawer" role="dialog" aria-modal="true" aria-label={job}>
    <header className="hse-drawer-head"><div><h2>{job}</h2><p>{historical ? `${t('historicalTarget')} · ${target.source_kind ?? activeJob?.generationSource?.kind ?? '—'} · ${target.record_count ?? activeJob?.nTrials ?? 0} ${t('generationRecords')}` : `${activeJob?.candidate?.candidate_id ?? '—'} · ${activeJob?.candidate?.version ?? '—'}`} · {activeJob?.mode ?? '—'} · {activeJob?.progress?.completed ?? 0}/{activeJob?.progress?.total ?? 0}</p></div><button type="button" className="hse-close" onClick={close}>{t('close')}</button></header>
    <div className="hse-workbench"><nav className="hse-stage-nav" aria-label={t('stageNav')}>{STAGES.map(item => <button type="button" key={item} data-active={stage === item} aria-current={stage === item ? 'step' : undefined} onClick={() => setStage(item)}>{STAGES.indexOf(item) + 1}. {historical && item === 'candidate' ? t('historicalTarget') : historical && item === 'dataset' ? t('generationRecords') : t(item)}</button>)}</nav>{state.status === 'loading' ? <div className="hse-empty"><div className="hse-spin"/>{t('loading')}</div> : state.status === 'error' ? <div className="hse-error">{state.error}<br/><button className="hse-button" onClick={() => void load()}>{t('retry')}</button></div> : <>{!contextSupported ? <div className="hse-capability">{t('capabilityUnavailable')}</div> : null}{content}<details className="hse-section hse-audit"><summary>{t('audit')} / {t('artifacts')}</summary><pre>{pretty({ validation: detail.validation, registry: artifacts.registry, context: artifacts.context, doctor: artifacts.doctor })}</pre></details></>}</div>
  </aside></div>
}

function historicalError(value) {
  const message = value?.message ?? String(value ?? '')
  const code = value?.code ?? message.match(/\b([A-Z][A-Z0-9_]{3,})\b/)?.[1] ?? 'HISTORICAL_JOB_FAILED'
  return { code, message: message.replace(new RegExp(`^${code}:\\s*`), '') }
}

function historicalErrorHint(code, t) {
  if (code === 'NO_ELIGIBLE_SESSIONS') return t('noEligibleHint')
  if (code === 'SESSION_SELECTION_TOO_EXPENSIVE') return t('narrowScanHint')
  if (/SESSION_(?:SAMPLE|FEEDBACK)_CHANGED|WORKSPACE_MISMATCH|TOKEN_(?:INVALID|EXPIRED)|PREVIEW_(?:INVALID|WORKSPACE_MISMATCH)/.test(code)) return t('changedSessionHint')
  return t('historicalGenericError')
}

function HistoricalLauncher({ snapshot, reload, onCompleted, t }) {
  const [state, setState] = useState({ status: 'idle' })
  const [open, setOpen] = useState(false)
  const workspace = snapshot?.workspace?.id
  const operationId = state.operation?.operationId

  useEffect(() => {
    let alive = true
    setState({ status: 'idle' })
    setOpen(false)
    if (!workspace) return () => { alive = false }
    void api('historical-operation', { workspace }).then(operation => {
      if (alive && ['queued', 'running'].includes(operation?.status)) {
        setState({ status: 'running', operation })
      }
    }).catch(() => {})
    return () => { alive = false }
  }, [workspace])

  useEffect(() => {
    if (!workspace || !operationId || !['queued', 'running'].includes(state.operation?.status)) return undefined
    let alive = true
    let timer
    const poll = async () => {
      try {
        const operation = await api('historical-operation', { workspace, operationId })
        if (!alive) return
        if (operation.status === 'completed') {
          setState({ status: 'completed', operation })
          setOpen(false)
          await reload(true)
          if (alive) onCompleted(operation)
          return
        }
        if (operation.status === 'failed') {
          setState({ status: 'error', error: historicalError(operation.error), operation })
          setOpen(true)
          return
        }
        setState({ status: 'running', operation })
      } catch {}
      if (alive) timer = window.setTimeout(() => void poll(), 2_000)
    }
    timer = window.setTimeout(() => void poll(), 1_000)
    return () => { alive = false; window.clearTimeout(timer) }
  }, [workspace, operationId, state.operation?.status, reload, onCompleted])

  useEffect(() => {
    if (!open) return undefined
    const escape = event => {
      if (event.key !== 'Escape') return
      setOpen(false)
      if (!['running', 'starting'].includes(state.status)) setState({ status: 'idle' })
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [open, state.status])

  const preview = async days => {
    setOpen(true)
    setState({ status: 'previewing' })
    try {
      const value = await mutate('historical-preview', {
        workspace,
        limit: 10,
        includeFeedback: true,
        ...(days ? { createdAfter: new Date(Date.now() - days * 86_400_000).toISOString() } : {}),
      })
      setState({ status: 'ready', preview: value })
    } catch (error) {
      setState({ status: 'error', error: historicalError(error) })
    }
  }

  const confirm = async () => {
    if (!state.preview) return
    setState(current => ({ ...current, status: 'starting' }))
    try {
      const operation = await mutate('historical-run', { workspace, previewId: state.preview.previewId })
      setState({ status: 'running', operation })
    } catch (error) {
      const normalized = historicalError(error)
      if (normalized.code === 'HISTORICAL_JOB_ALREADY_RUNNING') {
        try {
          const operation = await api('historical-operation', { workspace })
          if (['queued', 'running'].includes(operation?.status)) {
            setState({ status: 'running', operation })
            return
          }
        } catch {}
      }
      setState({ status: 'error', error: normalized })
    }
  }

  const close = () => {
    setOpen(false)
    if (!['running', 'starting'].includes(state.status)) setState({ status: 'idle' })
  }
  const previewValue = state.preview
  const evaluator = previewValue?.evaluation?.evaluator
  const judge = previewValue?.evaluation?.judge
  const active = ['running', 'starting'].includes(state.status)
  const buttonLabel = active ? t('historicalActive') : state.status === 'previewing' ? t('historicalPreparing') : t('historicalLaunch')
  const buttonShort = active ? t('historicalActiveShort') : state.status === 'previewing' ? t('historicalPreparingShort') : t('historicalLaunchShort')

  return <>
    <section className="hse-launch-card" aria-live="polite">
      <div className="hse-launch-mark" aria-hidden="true">✦</div>
      <div className="hse-launch-copy"><b>{active ? t('historicalRunning') : t('historicalLaunch')}</b><span>{active ? t('historicalRunningHint') : t('historicalLaunchBody')}</span><small>{active ? `${state.operation?.selectedCount ?? '—'} Trials` : t('historicalLaunchHint')}</small></div>
      <button type="button" className="hse-launch-button" disabled={!workspace || state.status === 'previewing'} onClick={() => active ? setOpen(true) : void preview()}><span className="hse-launch-button-full">{buttonLabel}</span><span className="hse-launch-button-short">{buttonShort}</span></button>
    </section>
    {open ? <div className="hse-launch-overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && close()}><section className="hse-launch-dialog" role="dialog" aria-modal="true" aria-labelledby="hse-historical-title">
      <header className="hse-launch-head"><div><span>{t('historicalLaunchHint')}</span><h2 id="hse-historical-title">{state.status === 'running' ? t('historicalRunning') : t('historicalPreviewTitle')}</h2><p>{state.status === 'running' ? t('historicalRunningHint') : t('historicalPreviewHint')}</p></div><button type="button" className="hse-dialog-close" aria-label={t('close')} onClick={close}>×</button></header>
      <div className="hse-launch-body">
        {state.status === 'previewing' ? <div className="hse-empty"><div className="hse-spin"/>{t('historicalPreparing')}</div> : null}
        {state.status === 'starting' ? <div className="hse-empty"><div className="hse-spin"/>{t('historicalStarting')}</div> : null}
        {state.status === 'running' ? <div className="hse-run-state"><div className="hse-spin"/><b>{t('historicalRunning')}</b><span>{state.operation?.selectedCount ?? '—'} Trials · {snapshot.workspace.label}</span><p>{t('historicalRunningHint')}</p></div> : null}
        {state.status === 'completed' ? <div className="hse-run-state"><b>✓ {t('historicalCompleted')}</b></div> : null}
        {state.status === 'error' ? <div className="hse-launch-error"><b>{state.error.code}</b><p>{state.error.message}</p><span>{historicalErrorHint(state.error.code, t)}</span></div> : null}
        {state.status === 'ready' && previewValue ? <>
          <div className="hse-launch-summary"><div><span>{t('selectedSessions')}</span><b>{previewValue.selected.length}</b></div><div><span>{t('requestEstimate')}</span><b>{previewValue.estimatedJudgeRequests}</b></div><div><span>{t('tokenExpiry')}</span><b>{new Date(previewValue.expiresAt).toLocaleTimeString()}</b></div><div><span>{t('workspace')}</span><b>{snapshot.workspace.label}</b></div></div>
          <section className="hse-launch-section"><h3>{t('recentSessions')}</h3><div className="hse-session-list">{previewValue.selected.map(session => <article key={session.trialId}><div><b>{session.title}</b><span>{session.lastActivityAt ? new Date(session.lastActivityAt).toLocaleString() : '—'}</span></div><p>{t('turnCounts')} {session.turnCount ?? 0} · {t('toolCounts')} {session.toolCallCount ?? 0} · {t('feedbackCounts')} +{session.feedback?.positive ?? 0} / -{session.feedback?.negative ?? 0}</p><code>{(session.modelRoutes ?? []).map(route => `${route.provider}/${route.model}`).join(' · ') || session.agentPreset || '—'}</code></article>)}</div></section>
          <section className="hse-launch-section"><h3>{t('historicalBoundaries')}</h3><div className="hse-launch-grid"><div><span>{t('generatorRole')}</span><b>{t('generatorRoleValue')}</b></div><div><span>{t('evaluatorIdentity')}</span><b>{evaluator?.id ?? '—'} · {evaluator?.version ?? '—'}</b></div><div><span>{t('judgeIdentity')}</span><b>{judge?.provider ?? '—'} / {judge?.model ?? '—'}</b></div><div><span>{t('coupling')}</span><b>{previewValue.evaluation?.coupling ?? '—'}</b></div><div><span>{t('evidenceRetention')}</span><b>{previewValue.retention?.privateEvidence} · {previewValue.retention?.jobEvidence}</b></div></div><p className="hse-boundary-note">{t('historicalBoundaryDetail')}</p></section>
        </> : null}
      </div>
      <footer className="hse-launch-actions">
        {state.status === 'ready' ? <><button type="button" onClick={close}>{t('cancel')}</button><button type="button" className="hse-confirm" onClick={() => void confirm()}>{t('historicalConfirm')}</button></> : null}
        {state.status === 'error' ? <><button type="button" onClick={close}>{t('close')}</button>{state.error.code === 'SESSION_SELECTION_TOO_EXPENSIVE' ? <button type="button" onClick={() => void preview(30)}>{t('recent30Days')}</button> : <button type="button" onClick={() => void preview()}>{t('previewAgain')}</button>}</> : null}
        {state.status === 'running' ? <button type="button" onClick={close}>{t('close')}</button> : null}
      </footer>
    </section></div> : null}
  </>
}

function DashboardView({ t }) {
  const [workspace, setWorkspace] = useState('')
  const [offset, setOffset] = useState(0)
  const state = useDashboard(true, workspace, offset)
  const [selected, setSelected] = useState()
  const snapshot = state.value
  const stats = [[t('jobs'), snapshot?.overview?.totalJobs ?? '—'], [t('completed'), snapshot?.overview?.completedJobs ?? '—'], [t('running'), snapshot?.overview?.activeJobs ?? '—'], [snapshot?.overview?.latestMetric?.name ?? t('score'), format(snapshot?.overview?.latestMetric?.value)]]
  const pagination = snapshot?.jobPagination ?? {}
  const switchWorkspace = event => {
    setWorkspace(event.target.value)
    setOffset(0)
    setSelected(undefined)
  }
  const openJob = job => {
    setWorkspace(snapshot.workspace.id)
    setSelected({ job, workspace: snapshot.workspace.id })
  }
  const completedHistorical = useCallback(operation => {
    setWorkspace(operation.workspace)
    setSelected({ job: operation.jobName, workspace: operation.workspace })
  }, [])
  return <main className="hse-root"><div className="hse-page"><section className="hse-hero" style={{ '--ocean-image': `url(${oceanBackground})` }}><button className="hse-refresh" onClick={() => void state.load()}>{t('refresh')}</button><div className="hse-eyebrow"><span className="hse-whale" aria-hidden="true">🐳</span>{t('eyebrow')}</div><h1>{t('heroTitle')}</h1><p>{t('heroBody')}</p><div className="hse-stats">{stats.map(([label, value]) => <div className="hse-stat" key={label}><span>{label}</span><b>{value}</b></div>)}</div></section>{snapshot?.workspace ? <HistoricalLauncher snapshot={snapshot} reload={state.load} onCompleted={completedHistorical} t={t}/> : null}<div className="hse-head"><div><h2>{t('jobs')}</h2><p>{t('jobsHint')}</p></div>{snapshot?.workspaces?.length ? <select className="hse-select" aria-label={t('workspaceSelect')} value={snapshot.workspace?.id ?? ''} onChange={switchWorkspace}>{snapshot.workspaces.map(item => <option value={item.id} key={item.id}>{item.label} · {item.root}</option>)}</select> : null}</div>{snapshot?.workspace ? <div className="hse-hook-state"><b>{t('workspace')}: {snapshot.workspace.label}</b><br/>{snapshot.config.projectRoot} · {snapshot.config.jobsDir}</div> : null}{state.status === 'loading' ? <div className="hse-empty"><div className="hse-spin"/>{t('loading')}</div> : state.status === 'error' && !snapshot ? <div className="hse-error">{state.error}<br/><button className="hse-button" onClick={() => void state.load()}>{t('retry')}</button></div> : !snapshot?.jobs?.length ? <div className="hse-empty">{t('empty')}</div> : <><div className="hse-list">{snapshot.jobs.map(job => <JobCard job={job} t={t} open={openJob} key={job.name}/>)}</div><div className="hse-pager"><span>{pagination.total ? `${offset + 1}–${Math.min(offset + (snapshot.jobs?.length ?? 0), pagination.total)} / ${pagination.total}` : '0 / 0'}</span><button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - (pagination.limit ?? 20)))}>{t('previous')}</button><button disabled={!pagination.hasMore} onClick={() => setOffset(offset + (pagination.limit ?? 20))}>{t('next')}</button></div></>}</div>{selected ? <Workbench job={selected.job} workspace={selected.workspace} jobs={snapshot.jobs ?? []} close={() => setSelected(undefined)} t={t}/> : null}</main>
}

function VersionPanel({ t }) {
  const state = useVersionCheck()
  const [copied, setCopied] = useState(false)
  const value = state.value
  const status = state.status === 'loading' ? 'loading' : state.status === 'error' ? 'unavailable' : value?.status ?? 'unavailable'
  const statusLabel = status === 'loading' ? t('checkingUpdate') : status === 'update-available' ? t('updateAvailable') : status === 'up-to-date' ? t('upToDate') : t('updateUnavailable')
  const copy = async () => {
    if (!value?.command) return
    try {
      await navigator.clipboard.writeText(value.command)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch { setCopied(false) }
  }
  return <section className="hse-version" data-status={status} aria-live="polite">
    <header className="hse-version-head"><h3>🐳 {t('pluginVersion')}</h3><span className="hse-version-badge">{statusLabel}</span></header>
    {value ? <div className="hse-version-grid"><div className="hse-version-card"><span>{t('currentVersion')}</span><b>{value.currentVersion}</b></div><div className="hse-version-card"><span>{t('latestVersion')}</span><b>{value.latestVersion ?? '—'}</b></div></div> : null}
    {status === 'update-available' ? <><p className="hse-version-copy">{t('updateHint')}</p><code className="hse-update-command">{value.command}</code></> : null}
    {status === 'unavailable' ? <p className="hse-version-copy">{t('offlineUpdateHint')}</p> : null}
    {value?.stale ? <p className="hse-version-copy">{t('staleVersion')}</p> : null}
    <div className="hse-version-actions">
      {value?.command ? <button className="hse-primary" type="button" onClick={() => void copy()}>{copied ? t('updateCommandCopied') : t('copyUpdateCommand')}</button> : null}
      {value?.releaseUrl ? <a href={value.releaseUrl} target="_blank" rel="noreferrer">{t('viewRelease')}</a> : null}
      {status !== 'loading' ? <button type="button" onClick={() => void state.load(true)}>{t('checkAgain')}</button> : null}
      {value?.checkedAt ? <small>{t('checkedAt')}: {new Date(value.checkedAt).toLocaleString()}</small> : null}
    </div>
  </section>
}

function DoctorView({ t }) {
  const state = useDashboard(false)
  const [projectRoot, setProjectRoot] = useState('')
  const [mutation, setMutation] = useState({ status: 'idle' })
  useEffect(() => { if (state.value?.config?.projectRoot) setProjectRoot(state.value.config.projectRoot) }, [state.value?.config?.projectRoot])
  const switchRoot = async () => {
    setMutation({ status: 'saving' })
    try {
      await mutate('project-root', { projectRoot })
      await state.load()
      setMutation({ status: 'saved' })
    } catch (error) {
      setMutation({ status: 'error', error: error.message })
    }
  }
  const credentialTiers = [[t('sessionCredential'), t('supported'), t('sessionCredentialHint'), true], [t('credentialStore'), t('hostServiceRequired'), t('credentialStoreHint'), false], [t('plaintextCredential'), t('forbidden'), t('plaintextCredentialHint'), false]]
  const rootSource = state.value?.config?.projectRootSource === 'agent-session' ? t('projectRootAgent') : state.value?.config?.projectRootSource === 'manual' ? t('projectRootManual') : t('projectRootConfigured')
  return <main className="hse-root"><div className="hse-settings"><h2>{t('setupDoctor')}</h2><p>{t('setupHint')}</p><VersionPanel t={t}/><div className="hse-root-switch"><label htmlFor="hse-project-root">{t('projectRoot')}</label><input id="hse-project-root" value={projectRoot} onChange={event => setProjectRoot(event.target.value)} spellCheck={false}/><button type="button" disabled={mutation.status === 'saving' || !projectRoot} onClick={() => void switchRoot()}>{mutation.status === 'saving' ? t('switchingProjectRoot') : t('switchProjectRoot')}</button><small>{mutation.status === 'error' ? mutation.error : mutation.status === 'saved' ? t('projectRootUpdated') : t('projectRootHint')}</small><small>{rootSource}</small></div><div className="hse-checks">{Object.entries(state.value?.checks ?? {}).map(([key, check]) => <div className="hse-check" key={key}><b className={check.status === 'ok' ? 'hse-valid' : 'hse-invalid'}>{key} · {check.status}</b><small>{check.detail}</small></div>)}</div><h3>{t('credentialPolicy')}</h3><div className="hse-checks">{credentialTiers.map(([label, status, hint, active]) => <div className="hse-check" key={label}><b className={active ? 'hse-valid' : 'hse-invalid'}>{label} · {status}</b><small>{hint}</small></div>)}</div></div></main>
}

function blockText(block) { return isRecord(block) && Array.isArray(block.content) ? block.content.filter(item => item?.type === 'text').map(item => item.text).join('\n') : '' }
export function decodeToolResult(block) { if (!isRecord(block) || block.isError) return undefined; if (isRecord(block.meta)) return block.meta; try { const value = JSON.parse(blockText(block)); return isRecord(value) ? value : undefined } catch { return undefined } }
function HarborToolView({ block, toolName }) {
  const [open, setOpen] = useState(true)
  const value = decodeToolResult(block)
  const running = !isRecord(block) || !('kind' in block)
  return <section className="hse-tool"><button type="button" onClick={() => setOpen(!open)}><strong>🐳 {toolName}</strong><small>{running ? 'running' : block.isError ? 'error' : '✓'}</small></button>{open ? <pre>{value ? pretty(value) : blockText(block) || 'Running…'}</pre> : null}</section>
}

export const name = 'dsh-harbor-evolution'
export const inject = ['slots', 'locale']
export function apply(ctx) {
  ctx.effect(installStyles, 'harbor-evolution: styles')
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'harbor-evolution: locale')
  const t = ctx.locale.bind(NS)
  const injected = () => ({ t })
  ctx.slots.inject('conversation.view', () => ctx.slots.register({ name: 'conversation.view', id: 'harbor-evolution', order: 30, locale: NS, label: () => t('tab'), inject: injected }, DashboardView))
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'harbor-evolution', order: 35, label: () => t('settings'), inject: injected }, DoctorView))
  ctx.slots.inject('tool.call.toolview', function* registerTools() {
    for (const key of ['harbor_candidate_snapshot', 'harbor_model_binding', 'harbor_evolution_init', 'harbor_evolution_doctor', 'harbor_quick_diagnostic_init', 'harbor_session_diagnostic_preview', 'harbor_session_diagnostic_run', 'harbor_dataset_validate', 'harbor_context_preview', 'harbor_eval_run', 'harbor_eval_result', 'harbor_evaluator_inspect', 'harbor_evaluator_update', 'harbor_ground_truth_init', 'harbor_evaluator_meta_evaluate', 'harbor_candidate_compare']) yield ctx.slots.register({ name: 'tool.call.toolview', key, inject: injected }, HarborToolView)
  })
}

module.exports = { name, inject, apply }
