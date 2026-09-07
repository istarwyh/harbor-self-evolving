export const HISTORICAL_MESSAGES = {
  zh: {
    historicalLaunch: '评测最近会话', historicalLaunchShort: '开始评测', historicalLaunchHint: '最多 3 条 · 确认后开始',
    historicalLaunchBody: '自动查找当前 DSH 可访问的历史会话，看看已完成的任务有哪些可以改进。',
    historicalPreparing: '正在查找最近可评测的会话…', historicalPreparingShort: '读取中…',
    historicalPreviewTitle: '评测这些会话？', historicalPreviewHint: '已自动查找 DSH 历史记录。确认前只读取，不启动评测。',
    historicalPrivacyHint: '确认后，下方标明的会话数据将发送给评审模型，可能产生模型费用；不会重新执行原任务。',
    historicalDataPolicy: '数据策略', historicalDataPolicyValue: '原文（仅凭据与会话标识脱敏；绝对路径保留）',
    historicalJudgeBoundary: 'Judge 数据边界', historicalJudgeBoundaryDetail: '发送有界 Session Observation：初始目标、可见对话、来源/模型元数据、工具与轮次摘要、用量、反馈及完整性/脱敏元数据；不发送 reasoning、工具载荷或附件。',
    historicalPartialHint: '本次从最近一批记录中选取，未遍历全部历史。',
    historicalUnreadableHint: '部分历史记录未能读取，未纳入本次评测。',
    historicalConfirm: '确认并开始评测', historicalStarting: '正在启动评测…', historicalRunning: '正在评测历史会话',
    historicalStartingHint: '正在提交已确认的评测，请稍候。关闭窗口不会撤回确认。',
    historicalErrorTitle: '评测暂时无法继续', historicalErrorBody: '请查看下方原因。重试会先重新查找会话，不会直接重跑评测。',
    historicalErrorDetails: '技术详情',
    historicalRunningHint: '可以关闭窗口继续工作。评测在后台继续，完成后打开结果。',
    historicalActive: '查看评测状态', historicalActiveShort: '查看状态', historicalCompleted: '评测完成，正在打开结果…',
    recentSessions: '本次评测的会话', selectedSessions: '会话数量', historicalSessionUnit: '条会话',
    requestEstimate: '预计评审请求', tokenExpiry: '预览有效期', generatorRole: '生成器', generatorRoleValue: '产生这些会话的 DSH Agent',
    evaluatorIdentity: '评测器身份', judgeIdentity: '评审模型', coupling: '模型耦合', evidenceRetention: '证据保留',
    historicalBoundaries: '评测说明', historicalBoundaryDetail: '只诊断已有对话，不重跑原任务，不自动修改、部署或晋级 Agent；结果不代表评测器本身已经验证可靠。',
    feedbackCounts: '反馈', turnCounts: '轮次', toolCounts: '工具调用', previewAgain: '重新查找',
    noEligibleHint: '当前 DSH 可访问的历史记录中，暂未找到已完成且可评测的会话。可以稍后重试。',
    historyReadFailedHint: '部分历史会话未能读取，暂时无法准备评测。请重试；这不表示历史记录不存在。',
    historyWindowExhaustedHint: '本次已检查的最近记录中，暂未找到可评测会话。更早的记录尚未检查，可以稍后重试。',
    changedSessionHint: '会话或评测设置已变化，或预览已过期。请重新查找并确认。',
    historicalGenericError: '本次操作未完成。请重试；如仍失败，请保留错误信息以便排查。', cancel: '取消',
  },
  en: {
    historicalLaunch: 'Evaluate recent Sessions', historicalLaunchShort: 'Start evaluation', historicalLaunchHint: 'Up to 3 · confirm before starting',
    historicalLaunchBody: 'Automatically find history available to this DSH and see how completed tasks could improve.',
    historicalPreparing: 'Finding recent Sessions to evaluate…', historicalPreparingShort: 'Loading…',
    historicalPreviewTitle: 'Evaluate these Sessions?', historicalPreviewHint: 'DSH history was found automatically. Nothing is evaluated until you confirm.',
    historicalPrivacyHint: 'After confirmation, the Session data described below will be sent to the review model and may incur model charges. The original tasks will not rerun.',
    historicalDataPolicy: 'Data policy', historicalDataPolicyValue: 'Source text (credentials and Session identifiers redacted; absolute paths preserved)',
    historicalJudgeBoundary: 'Judge data boundary', historicalJudgeBoundaryDetail: 'Sends the bounded Session Observation: initial goal, visible transcript, source/model metadata, tool and turn summaries, usage, feedback, and completeness/redaction metadata. Reasoning, tool payloads, and attachments are omitted.',
    historicalPartialHint: 'This sample comes from a recent set of records, not a full scan of all history.',
    historicalUnreadableHint: 'Some historical records could not be read and are not included in this evaluation.',
    historicalConfirm: 'Confirm and start evaluation', historicalStarting: 'Starting evaluation…', historicalRunning: 'Evaluating historical Sessions',
    historicalStartingHint: 'Submitting the evaluation you confirmed. Closing this window will not withdraw that confirmation.',
    historicalErrorTitle: 'Evaluation could not continue', historicalErrorBody: 'Review the reason below. Retrying finds Sessions again; it does not rerun an evaluation without confirmation.',
    historicalErrorDetails: 'Technical details',
    historicalRunningHint: 'You can close this window and keep working. Evaluation continues in the background and opens the results when complete.',
    historicalActive: 'View evaluation status', historicalActiveShort: 'View status', historicalCompleted: 'Evaluation complete. Opening results…',
    recentSessions: 'Sessions to evaluate', selectedSessions: 'Session count', historicalSessionUnit: 'Sessions',
    requestEstimate: 'Estimated review requests', tokenExpiry: 'Preview expires', generatorRole: 'Generator', generatorRoleValue: 'The DSH Agent that produced these Sessions',
    evaluatorIdentity: 'Evaluator identity', judgeIdentity: 'Review model', coupling: 'Model coupling', evidenceRetention: 'Evidence retention',
    historicalBoundaries: 'About this evaluation', historicalBoundaryDetail: 'Diagnoses existing conversations only. No task rerun, automatic Agent changes, deployment, or promotion. These results do not establish evaluator reliability.',
    feedbackCounts: 'Feedback', turnCounts: 'Turns', toolCounts: 'Tool calls', previewAgain: 'Find Sessions again',
    noEligibleHint: 'No completed, eligible Sessions were found in the history currently available to this DSH. Try again later.',
    historyReadFailedHint: 'Some historical Sessions could not be read, so evaluation cannot be prepared yet. Retry; this does not mean the history is missing.',
    historyWindowExhaustedHint: 'No eligible Sessions were found among the recent records checked in this attempt. Older records have not been checked. Try again later.',
    changedSessionHint: 'The Sessions or evaluation settings changed, or the preview expired. Find Sessions again and confirm the new preview.',
    historicalGenericError: 'This operation did not complete. Retry; if it keeps failing, retain the error details for troubleshooting.', cancel: 'Cancel',
  },
}

export function historicalErrorHint(code, t) {
  if (code === 'NO_ELIGIBLE_SESSIONS') return t('noEligibleHint')
  if (code === 'SESSION_HISTORY_READ_FAILED') return t('historyReadFailedHint')
  if (code === 'SESSION_HISTORY_WINDOW_EXHAUSTED' || code === 'SESSION_SELECTION_TOO_EXPENSIVE') return t('historyWindowExhaustedHint')
  if (/SESSION_(?:SAMPLE|FEEDBACK)_CHANGED|WORKSPACE_MISMATCH|TOKEN_(?:INVALID|EXPIRED)|PREVIEW_(?:INVALID|WORKSPACE_MISMATCH)/.test(code)) return t('changedSessionHint')
  return t('historicalGenericError')
}
