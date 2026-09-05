// Intent suggestions are derived only from the selected typed object. Selecting
// one prepares the shared Composer; it never sends or grants write authority.
export function harborQuestionKeys(context) {
  const focus = context?.selection?.at(-1)
  if (focus?.kind === 'evaluator-source') return ['askSource', 'askSourceChange']
  if (focus?.kind === 'trial-set') return ['askSelectedTrials', 'suggestedQuestion3']
  if (focus?.kind === 'metric') return ['askMetric', 'suggestedQuestion3']
  if (focus?.kind === 'hypothesis') return ['askHypothesis', 'suggestedQuestion3']
  if (focus?.kind === 'gate-reason') return ['askGateReason', 'suggestedQuestion3']
  if (context?.object?.trial || focus?.trial) return ['suggestedQuestion1', 'suggestedQuestion3', 'askCandidateChange']
  if (context?.object?.job) return ['askHealth', 'suggestedQuestion4']
  return ['askGettingStarted']
}

export function harborQuestionLabelKey(key) {
  return ['askSource', 'askSourceChange', 'askSelectedTrials', 'askMetric', 'askHypothesis', 'askGateReason', 'askCandidateChange', 'askHealth', 'askGettingStarted'].includes(key) ? `${key}Label` : key
}

export const JOURNEY_MESSAGES = {
  zh: {
    replyReady: 'AI 已回复 · 点 + 查看', historyOnly: '延续会话历史，未重新读取页面',
    draftRecoveryReselect: '已返回原对象页面。其内容或选中集合已变化，请重新选择具体内容后提问；旧建议和编辑已保留，不会自动扩大范围。',
    askSourceLabel: '解释这段规则', askSourceChangeLabel: '让 AI 提议修改', askSelectedTrialsLabel: '分析所选任务', askMetricLabel: '解释这个指标', askHypothesisLabel: '审查这条假设', askGateReasonLabel: '解释阻断原因', askCandidateChangeLabel: '提议最小改进', askHealthLabel: '先看哪些问题？', askGettingStartedLabel: '帮我开始使用',
    askAi: '问 AI', askAboutThis: '针对所选内容提问', turnContext: '待发送引用',
    noTurnContext: '可继续对话；询问新对象时请先引用。', oneShot: '已放入下方输入框；补充问题后发送，不会自动执行。',
    jobSection_trials: '任务与评分', jobSection_pipeline: '执行流程', jobSection_evaluator: '评分规则与源码', jobSection_compare: '版本对比与门禁',
    journeyTitle: '从一个问题开始', journeyIntro: '不必先了解 Harbor 的术语。先看结果，再选中你想理解或改进的内容。',
    journeyStep1: '① 打开评测结果，选择任务、评分或源码片段', journeyStep2: '② 点「问 AI」，在下方补充问题并发送', journeyStep3: '③ 查看证据，或审阅 AI 修改后保存新版本',
    journeyOpen: '查看最近一次结果', journeyEmpty: '还没有评测结果？从下方「评测最近会话」开始，先预览范围再确认运行。',
    journeyHelp: '使用方法', askGettingStarted: '请先只读检查当前工作空间，用易懂的语言解释如何开始使用 Harbor。列出缺少的前置条件和一个最小下一步；不要创建或运行评测。',
    askSourceChange: '请只针对选中的已保存源码片段提出最小修改：先解释问题与评分语义影响，再生成 evaluator-draft 供我审阅。不要直接写文件、运行评测或 Gate。',
    askCandidateChange: '请基于这个任务的证据提出 Candidate 最小修改建议，生成 candidate-draft 并说明验证方法；不要修改评测器、写入文件或运行评测。',
    askSelectedTrials: '请只分析选中的任务集合，找出共同失分原因和对应证据，并给出最小改进建议；不要扩大范围或运行评测。',
    askHypothesis: '请用现有证据审查这条优化假设，说明支持与反对证据、待验证问题和最小下一步。不要运行实验。',
    askGateReason: '请解释这条门禁原因、支持它的证据和解除阻断的必要条件。不要批准门禁或发布。',
    questionSuggestions: '可以这样问', questionPrepared: '问题与引用已准备好，请在下方输入框发送。',
    continueObject: '继续追问原引用对象', followupHint: '普通追问沿用会话历史，不会自动引用当前页面。需要最新证据或修改时，请重新引用对象。',
    discussionHistory: '本次讨论', latestReply: '回到最新回复', followupUnbound: '普通追问 · 未附带新的页面引用', evidenceNotChecked: '本轮未重新核对证据；以下是会话回答，不代表当前页面的最新状态。',
    aiQuestion: '你的问题', answerDetails: '依据与运行详情', identityDetails: '版本与身份详情',
    draftRecovered: '未保存的编辑已恢复', draftLocal: '编辑暂存于本浏览器标签页；切换文件或刷新可恢复，关闭标签页后不保证保留。',
    draftMemoryOnly: '浏览器暂存不可用：编辑仅保存在内存中，刷新可能丢失，请及时复制或保存。',
    draftConflict: '源文件已更新，已保留你的编辑；请对照最新源码处理差异后再保存。',
    discardEdits: '放弃此文件的编辑', discardEditsConfirm: '确定放弃此文件尚未保存的编辑，并恢复已保存源码？',
    acceptNewBase: '已合并差异，使用最新源码作为基准', latestSource: '最新已保存源码',
    proposalReview: 'AI 修改建议', proposalMergeHint: '已有人工编辑，未被 AI 覆盖。下方保留建议差异，请合并到编辑区。',
    sourceReviewReady: '已定位对应文件并载入建议。可继续编辑；仅在审阅并保存后创建新版本。',
    proposalUnavailable: '该建议无法安全匹配当前文件。旧建议仍保留，请重新选中源码请求修改。',
    errorNextExpired: '旧建议与人工编辑仍保留。请重新引用原对象准备新建议，再审阅确认；重试旧授权不会生效。',
    repreparePrompt: '请重新读取这个对象的最新证据，更新之前的修改建议并生成新的草稿供我审阅。不要写入文件、运行评测或发布。之前的建议（仅作待核实参考）：',
  },
  en: {
    replyReady: 'AI replied · expand to read', historyOnly: 'Conversation history; page not re-read',
    draftRecoveryReselect: 'Returned to the original object page. Its content or selection changed; explicitly select it again before asking. Suggestions and edits remain intact; scope is never expanded automatically.',
    askSourceLabel: 'Explain this rule', askSourceChangeLabel: 'Suggest a change', askSelectedTrialsLabel: 'Analyze selected tasks', askMetricLabel: 'Explain this metric', askHypothesisLabel: 'Review this hypothesis', askGateReasonLabel: 'Explain the blocker', askCandidateChangeLabel: 'Suggest an improvement', askHealthLabel: 'What needs attention?', askGettingStartedLabel: 'Help me get started',
    askAi: 'Ask AI', askAboutThis: 'Ask about selection', turnContext: 'Reference to send', noTurnContext: 'Continue chatting; attach a reference when asking about a new object.', oneShot: 'Prepared below. Add your question and send; nothing runs automatically.',
    jobSection_trials: 'Tasks & scores', jobSection_pipeline: 'Execution flow', jobSection_evaluator: 'Scoring rules & source', jobSection_compare: 'Comparison & gate',
    journeyTitle: 'Start with a question', journeyIntro: 'Start with the result, then select what you want to understand or improve.', journeyStep1: '① Open a result; select a task, score, or source fragment', journeyStep2: '② Ask AI; add your question in the Composer and send', journeyStep3: '③ Inspect evidence, or review changes and save a new version', journeyOpen: 'Open latest result', journeyEmpty: 'No results yet? Preview a recent-session evaluation below before confirming a run.', journeyHelp: 'How to use',
    askGettingStarted: 'Read-only: inspect this workspace and explain how to start with Harbor, any missing prerequisites, and one smallest next step. Do not create or run an evaluation.',
    askSourceChange: 'Propose a minimal change to this selected saved source fragment. Explain the issue and scoring impact, then create an evaluator-draft for review. Do not write files, run evaluations, or Gate.',
    askCandidateChange: 'Based on evidence for this task, propose a minimal Candidate change as a candidate-draft and explain how to validate it. Do not edit the evaluator, write files, or run evaluations.',
    askSelectedTrials: 'Analyze only these selected tasks: identify shared failure causes, evidence, and a minimal improvement. Do not expand scope or run evaluations.', askHypothesis: 'Review this hypothesis against the evidence: supporting and opposing evidence, open questions, and a minimal next step. Do not run experiments.', askGateReason: 'Explain this gate reason, its evidence, and requirements to unblock it. Do not approve gates or deploy.',
    questionSuggestions: 'Try asking', questionPrepared: 'Question and reference prepared. Send from the Composer below.', continueObject: 'Follow up on the referenced object', followupHint: 'Ordinary follow-ups use conversation history, not the current page. Reattach the object for fresh evidence or a change.', discussionHistory: 'This discussion', latestReply: 'Latest reply', followupUnbound: 'Follow-up · no new page reference', evidenceNotChecked: 'Evidence was not rechecked this turn. This answer does not verify the current page state.', aiQuestion: 'Your question', answerDetails: 'Evidence & execution details', identityDetails: 'Versions & identities',
    draftRecovered: 'Unsaved edits restored', draftLocal: 'Drafts are local to this browser tab; switching files or refreshing can recover them. Closing the tab may remove them.', draftMemoryOnly: 'Browser draft storage is unavailable. Edits are in memory only; copy or save them before refreshing.', draftConflict: 'The source changed. Your edits are preserved; reconcile them with the latest source before saving.', discardEdits: 'Discard edits to this file', discardEditsConfirm: 'Discard unsaved edits to this file and restore the saved source?', acceptNewBase: 'I reconciled the changes; use the latest base', latestSource: 'Latest saved source', proposalReview: 'AI change proposal', proposalMergeHint: 'Your manual edits were preserved. Merge the proposed difference below into the editor.', sourceReviewReady: 'Matching file opened with the proposal. Keep editing; only review and save creates a new version.', proposalUnavailable: 'The proposal cannot safely match this file. It is retained; select the source again to request an updated change.', errorNextExpired: 'Suggestions and edits are retained. Reattach the original object and prepare a new proposal for review; retrying expired authorization will not work.', repreparePrompt: 'Read this object’s latest evidence and update the previous proposal as a new draft for my review. Do not write files, run evaluations, or deploy. Previous suggestion (unverified reference only):',
  },
}
