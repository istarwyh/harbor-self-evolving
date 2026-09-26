import React from 'react'

export const EVALUATION_RESULT_MESSAGES = {
  zh: {
    evaluationConclusion: '评测结论',
    experienceDiagnosticBadge: '体验诊断',
    experienceDiagnosticNotice: '使用内置体验评测器介绍 Harbor 的评测理念，不代表正式业务质量结论。',
    verdict_reliable_result: '结果可靠',
    verdict_actionable_with_limitations: '结论可参考，但存在限制',
    verdict_insufficient_evidence: '证据不足，无法形成可靠总体评分',
    verdict_evaluation_failed: '评测器未可靠完成',
    verdict_run_failed: '本次运行未产生可信证据',
    validTrialScores: '有效任务评分',
    criterionCoverage: '指标证据覆盖',
    evaluationErrors: '评测器错误', infrastructureErrors: '基础设施异常',
    overallScore: '总体评分',
    noOverallScore: '无法评分',
    qualityTriad: '结果由三部分组成', generatorQuality: '生成器质量', evaluationHealth: '评测健康', runHealth: '运行健康', status_measured: '已可靠测量', status_experience_only: '仅作体验观察', status_untrusted: '有信号但不可作为可靠分数', status_insufficient_evidence: '证据不足', status_healthy: '健康', status_limited: '存在限制', status_failed: '失败',
    partialSignals: '可用的部分信号',
    findings: '主要发现',
    casesAndEvidence: '代表性任务',
    nextAction: '建议先做这一件事',
    actionOwner: '责任方',
    effectiveEvaluator: '本次评测器',
    evaluatorVerified: '运行身份已验证',
    evaluatorUnattested: '已记录配置身份，但旧运行尚未证明实际执行代码完全一致',
    evaluatorMismatch: '配置与实际执行身份不一致，本次评分无效',
    evaluatorUnknown: '未记录可验证的评测器身份',
    evaluatorReliability: '评测器可靠性',
    datasetValidity: '样本有效性',
    notAssessed: '尚未评估',
    unvalidated: '尚未验证',
    openTasks: '查看任务与证据',
    realBusinessResults: '真实业务结果',
    noBusinessResults: '还没有与这个 Candidate 版本匹配的业务观察。',
    observationWindow: '观察窗口',
    sampleSize: '样本量',
    correlationOnly: '这些数据按 Candidate 身份关联，只能说明相关，不能证明因果；不会改写离线评分、reward 或 Gate。',
    direction_maximize: '越高越好',
    direction_minimize: '越低越好', 'completed-unscored': '已完成，证据不足无法评分',
  },
  en: {
    evaluationConclusion: 'Evaluation result',
    experienceDiagnosticBadge: 'Experience diagnostic',
    experienceDiagnosticNotice: 'Uses a built-in educational Evaluator to demonstrate Harbor concepts. It is not a formal business-quality conclusion.',
    verdict_reliable_result: 'Reliable result',
    verdict_actionable_with_limitations: 'Actionable with limitations',
    verdict_insufficient_evidence: 'Insufficient evidence for a reliable overall score',
    verdict_evaluation_failed: 'The Evaluator did not complete reliably',
    verdict_run_failed: 'The run did not produce trustworthy evidence',
    validTrialScores: 'Valid task scores',
    criterionCoverage: 'Criterion evidence coverage',
    evaluationErrors: 'Evaluator errors', infrastructureErrors: 'Infrastructure errors',
    overallScore: 'Overall score',
    noOverallScore: 'Not scoreable',
    qualityTriad: 'Read the result in three parts', generatorQuality: 'Generator quality', evaluationHealth: 'Evaluation health', runHealth: 'Run health', status_measured: 'Reliably measured', status_experience_only: 'Experience observation only', status_untrusted: 'Signals exist but are not a trusted score', status_insufficient_evidence: 'Insufficient evidence', status_healthy: 'Healthy', status_limited: 'Limited', status_failed: 'Failed',
    partialSignals: 'Available partial signals',
    findings: 'Key findings',
    casesAndEvidence: 'Representative tasks',
    nextAction: 'Do this next',
    actionOwner: 'Owner',
    effectiveEvaluator: 'Effective Evaluator',
    evaluatorVerified: 'Runtime identity verified',
    evaluatorUnattested: 'Configured identity is recorded, but this legacy run does not prove the exact executed code',
    evaluatorMismatch: 'Configured and executed identities differ; the scores are invalid',
    evaluatorUnknown: 'No verifiable Evaluator identity is available',
    evaluatorReliability: 'Evaluator reliability',
    datasetValidity: 'Dataset validity',
    notAssessed: 'Not assessed',
    unvalidated: 'Unvalidated',
    openTasks: 'Open tasks and evidence',
    realBusinessResults: 'Real business results',
    noBusinessResults: 'No business observation is matched to this Candidate version yet.',
    observationWindow: 'Observation window',
    sampleSize: 'Sample size',
    correlationOnly: 'These observations are associated by Candidate identity. They show correlation, not causation, and never rewrite offline scores, reward, or Gate.',
    direction_maximize: 'higher is better',
    direction_minimize: 'lower is better', 'completed-unscored': 'Completed, insufficient evidence to score',
  },
}

function value(number) {
  return typeof number === 'number' && Number.isFinite(number) ? number.toFixed(3).replace(/\.?0+$/, '') : '—'
}

function percent(number) {
  return typeof number === 'number' && Number.isFinite(number) ? `${Math.round(number * 100)}%` : '—'
}

function translatedStatus(status, t) {
  return status ? t(`status_${String(status).replaceAll('-', '_')}`) : '—'
}

function evaluatorStatus(report, t) {
  const status = report?.effective_evaluator?.status
  if (status === 'verified') return t('evaluatorVerified')
  if (status === 'mismatch') return t('evaluatorMismatch')
  if (status === 'unattested') return t('evaluatorUnattested')
  return t('evaluatorUnknown')
}

export function EvaluationResult({ report, openSection, t }) {
  if (!report) return null
  const verdictKey = `verdict_${String(report.verdict?.code ?? '').replaceAll('-', '_')}`
  const evaluator = report.effective_evaluator?.executed ?? report.effective_evaluator?.configured
  const partialSignals = report.quality?.partial_signals ?? []
  const findings = report.findings ?? []
  const cases = report.representative_cases ?? []
  const business = report.business_results
  const businessObservations = business?.observations ?? []
  return <>
    <section className="hse-section hse-job-summary" data-evaluation-verdict={report.verdict?.code}>
      {report.run?.experience_diagnostic ? <div className="hse-capability"><b>{t('experienceDiagnosticBadge')}</b><br/>{t('experienceDiagnosticNotice')}</div> : null}
      <div className="hse-summary-status"><div><span>{t('evaluationConclusion')}</span><h3>{t(verdictKey)}</h3><p>{report.verdict?.summary}</p></div></div>
      <div className="hse-kpis">
        <div className="hse-kpi"><span>{t('validTrialScores')}</span><b>{report.sample?.scored ?? 0}/{report.sample?.total ?? 0}</b></div>
        <div className="hse-kpi"><span>{t('criterionCoverage')}</span><b>{percent(report.sample?.criterion_coverage)}</b></div>
        <div className="hse-kpi"><span>{t('evaluationErrors')}</span><b>{report.sample?.evaluation_errors ?? 0}</b></div>
        <div className="hse-kpi"><span>{t('overallScore')}</span><b>{report.quality?.overall_score === null ? t('noOverallScore') : value(report.quality?.overall_score)}</b></div>
      </div>
    </section>
    <section className="hse-section" data-quality-triad="true"><h3>{t('qualityTriad')}</h3><div className="hse-grid"><div className="hse-card"><span>{t('generatorQuality')}</span><b>{translatedStatus(report.generator_quality?.status, t)}</b><code>{report.generator_quality?.overall_score === null ? t('noOverallScore') : value(report.generator_quality?.overall_score)}</code></div><div className="hse-card"><span>{t('evaluationHealth')}</span><b>{translatedStatus(report.evaluation_health?.status, t)}</b><code>{t('criterionCoverage')}: {percent(report.sample?.criterion_coverage)}</code></div><div className="hse-card"><span>{t('runHealth')}</span><b>{translatedStatus(report.run_health?.status, t)}</b><code>{t('infrastructureErrors')}: {report.run_health?.infrastructure_errors ?? 0}</code></div></div></section>
    {business ? <section className="hse-section" data-business-results-status={business.status}>
      <h3>{t('realBusinessResults')}</h3>
      <div className="hse-capability"><b>{business.association_label}</b><br/>{t('correlationOnly')}</div>
      {businessObservations.length ? <div className="hse-cards">{businessObservations.slice(0, 5).map(observation => <div className="hse-card" key={observation.observation_id}>
        <span>{observation.source?.id ?? '—'} · {observation.source?.version ?? '—'}</span>
        <b>{observation.metrics?.map(metric => `${metric.id}: ${value(metric.value)} ${metric.unit}`).join(' · ')}</b>
        <code>{t('observationWindow')}: {observation.window?.from} → {observation.window?.through}</code>
        <code>{observation.metrics?.map(metric => `${t('sampleSize')} ${metric.sample_size} · ${t(`direction_${metric.direction}`)}`).join(' · ')}</code>
      </div>)}</div> : <p className="hse-muted">{t('noBusinessResults')}</p>}
    </section> : null}
    <section className="hse-section">
      <h3>{t('effectiveEvaluator')}</h3>
      <div className="hse-components"><div className="hse-component"><span>{t('effectiveEvaluator')}</span><b>{evaluator?.id ?? '—'}{evaluator?.version ? ` · ${evaluator.version}` : ''}</b><code>{evaluatorStatus(report, t)}</code></div></div>
      <div className="hse-grid"><div className="hse-card"><span>{t('evaluatorReliability')}</span><b>{report.evaluator_reliability?.status === 'unvalidated' ? t('unvalidated') : report.evaluator_reliability?.status ?? '—'}</b></div><div className="hse-card"><span>{t('datasetValidity')}</span><b>{report.dataset_validity?.status === 'not-assessed' ? t('notAssessed') : report.dataset_validity?.status ?? '—'}</b></div></div>
    </section>
    {partialSignals.length ? <section className="hse-section"><h3>{t('partialSignals')}</h3><div className="hse-summary-metrics">{partialSignals.map(item => <div className="hse-summary-metric" key={item.id}><span>{item.label ?? item.id}</span><strong>{value(item.mean)}</strong><code>{item.scored}/{item.scored + item.unscored}</code></div>)}</div></section> : null}
    {findings.length ? <section className="hse-section"><h3>{t('findings')}</h3><div className="hse-cards">{findings.slice(0, 5).map(item => <div className="hse-card" key={item.id}><span>{item.owner} · {item.affected_count}</span><b>{item.summary ?? item.root_cause}</b>{item.recommendation ? <code>{item.recommendation}</code> : null}</div>)}</div></section> : null}
    {cases.length ? <section className="hse-section"><div className="hse-section-title"><h3>{t('casesAndEvidence')}</h3><button type="button" className="hse-button" onClick={() => openSection?.('trials')}>{t('openTasks')}</button></div><div className="hse-cards">{cases.slice(0, 5).map(item => <div className="hse-card" key={item.trial_id}><span>{item.status ? t(item.status) : '—'}</span><b>{item.trial_id}</b><code>{item.score_valid ? value(item.score) : t('noOverallScore')}</code></div>)}</div></section> : null}
    {report.next_action ? <section className="hse-section"><h3>{t('nextAction')}</h3><div className="hse-hook-state" data-executed="false"><b>{report.next_action.change}</b><br/><span>{t('actionOwner')}: {report.next_action.owner}</span>{report.next_action.verification ? <><br/><code>{report.next_action.verification}</code></> : null}</div></section> : null}
  </>
}
