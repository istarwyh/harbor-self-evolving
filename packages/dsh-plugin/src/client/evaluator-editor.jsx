import React, { useEffect, useRef, useState } from 'react'

import { createEditorDraftStore, makeEditorDraftKey } from './editor-drafts.js'

const MAX_EDITOR_LENGTH = 256 * 1024
const EMPTY_FILES = []
let buffers

function editorBuffers() {
  if (buffers) return buffers
  let storage
  try { storage = globalThis.sessionStorage } catch { /* The store reports memory-only mode. */ }
  const store = createEditorDraftStore({ storage })
  // Rejected buffers are retained through component remounts, but never evict
  // other human work. This small reserve also protects oversized legacy sources.
  const volatile = new Map()
  const unsafe = new Set()
  const handledProposals = new Set()
  if (typeof globalThis.addEventListener === 'function') globalThis.addEventListener('beforeunload', event => {
    if (!unsafe.size) return
    event.preventDefault()
    event.returnValue = ''
  })
  buffers = {
    store, volatile, handledProposals,
    get(key) { return volatile.get(key) ?? store.get(key) },
    list(scope) {
      const entries = new Map(store.list(scope).map(entry => [entry.key, entry]))
      for (const [key, value] of volatile) {
        const [sessionId, workspace, jobId, role, path] = JSON.parse(key)
        if (sessionId === scope.sessionId && workspace === scope.workspace && jobId === scope.jobId) entries.set(key, { key, role, path, ...value })
      }
      return [...entries.values()]
    },
    canKeep(key) { return Boolean(store.get(key) || volatile.has(key) || volatile.size < 32) },
    put(key, record) {
      const result = store.put(key, record)
      if (!result.accepted && (volatile.has(key) || volatile.size < 32)) {
        const original = volatile.get(key) ?? store.get(key)
        volatile.set(key, { ...record, baseDigest: original?.baseDigest ?? record.baseDigest, baseText: original?.baseText ?? record.baseText, updatedAt: Date.now() })
      } else if (result.accepted) volatile.delete(key)
      if (result.persisted) {
        for (const item of unsafe) if (!volatile.has(item)) unsafe.delete(item)
      } else unsafe.add(key)
      return result
    },
    remove(key) {
      volatile.delete(key)
      unsafe.delete(key)
      return store.remove(key)
    },
  }
  return buffers
}

export const EVALUATOR_EDITOR_MESSAGES = {
  zh: { unsavedFile: '未保存', editorStorageLimit: '暂存空间已满。请先保存或放弃其他文件的草稿；当前编辑已保留在本页，离开前请复制。', editorSourceTooLarge: '此文件超过安全编辑上限（256 Ki 字符），请在本地编辑。', draftRestoreFailed: '浏览器中的编辑草稿无法恢复；已保存源码未受影响。请检查是否需要从其他窗口找回旧编辑，再继续。', originalDraftBase: '开始编辑时的源码', proposalOpenFile: '查看建议对应文件', proposalLoad: '将建议载入未修改的编辑区', rebaseConfirm: '已保留你的编辑。确认你已经对照最新源码合并差异，并以最新源码作为保存基准？', saveFailedReload: '保存失败；编辑已保留。请先重新读取源码，再检查是否存在版本冲突。' },
  en: { unsavedFile: 'Unsaved', editorStorageLimit: 'Draft storage is full. Save or discard another file draft. Current edits remain in this page; copy them before leaving.', editorSourceTooLarge: 'This file exceeds the safe editor limit (256 Ki characters). Edit it locally.', draftRestoreFailed: 'Browser editor drafts could not be restored. Saved source files are unaffected. Check whether another open window has the previous edits before continuing.', originalDraftBase: 'Source when editing began', proposalOpenFile: 'Open the proposed file', proposalLoad: 'Load proposal into the unchanged editor', rebaseConfirm: 'Your edits are preserved. Confirm you reconciled them with the latest source and want to use that source as the save baseline?', saveFailedReload: 'Save failed; your edits are retained. Reload the source, then check for a version conflict.' },
}

export function matchEvaluatorProposalFile(value, proposal) {
  const source = proposal?.proposal ?? proposal
  if (value?.job && source?.sourceRef?.job !== value.job) return undefined
  const role = source?.sourceRef?.sourceRole
  const fileRole = role === 'evaluator' ? 'implementation' : role === 'rubric' ? 'rubric' : undefined
  const component = value?.components?.[role]
  const savedText = component?.source?.text
  if (!fileRole || typeof savedText !== 'string') return undefined
  const candidates = (value?.evaluatorInterface?.evaluator?.editable_files ?? []).filter(file => file.role === fileRole && file.text === savedText)
  if (candidates.length === 1) return candidates[0]
  const entry = role === 'evaluator' ? value?.evaluatorInterface?.evaluator?.implementation?.path : component?.entry
  const exact = typeof entry === 'string' ? candidates.filter(file => file.path === entry || file.relative_path === entry) : []
  return exact.length === 1 ? exact[0] : undefined
}

export function evaluatorDraftConflict(record, file) {
  return Boolean(record && file && (record.baseDigest !== file.digest || record.baseText !== file.text))
}

export function prepareEvaluatorProposal({ value, proposal, file, text, record, currentBinding, applySourceProposal }) {
  const source = proposal?.proposal
  const proposedFile = matchEvaluatorProposalFile(value, proposal)
  const sourceRef = value?.interactionObjects?.find(ref => ref.id === source?.sourceRef?.id)
  if (!source || !file || file.path !== proposedFile?.path || !currentBinding) return { status: 'unavailable' }
  if (evaluatorDraftConflict(record, file) || text !== file.text) return { status: 'merge' }
  try {
    const replacement = applySourceProposal(file.text, sourceRef, source)
    return typeof replacement === 'string' && replacement.length <= MAX_EDITOR_LENGTH ? { status: 'ready', text: replacement } : { status: 'unavailable' }
  } catch { return { status: 'unavailable' } }
}

export function focusEvaluatorReview({ requestId, previousRequestId, selectedPath, proposedPath, element, selectFile }) {
  if (typeof requestId !== 'string' || !requestId || requestId === previousRequestId || !proposedPath) return previousRequestId
  if (selectedPath !== proposedPath) {
    selectFile(proposedPath)
    return previousRequestId
  }
  if (!element || element.disabled || element.readOnly) return previousRequestId
  element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
  element.focus({ preventScroll: true })
  return requestId
}

export function EvaluatorEditorView({ value, workspace, job, sessionId, bindingKey, bindingIsCurrent, reload, onSaved, proposal, update, ErrorState, t, applySourceProposal, nextVersion }) {
  const active = value.evaluatorInterface
  const evaluator = active?.evaluator
  const files = evaluator?.editable_files ?? EMPTY_FILES
  const sourceProposal = proposal?.proposal
  const proposedFile = matchEvaluatorProposalFile(value, proposal)
  const cache = editorBuffers()
  const fileKey = file => file ? makeEditorDraftKey({ sessionId, workspace, jobId: job, role: file.role, path: file.path }) : undefined
  const [selectedPath, setSelectedPath] = useState(proposedFile?.path ?? files[0]?.path ?? '')
  const selected = files.find(item => item.path === selectedPath) ?? files[0]
  const key = fileKey(selected)
  const initialRecord = key ? cache.get(key) : undefined
  const [buffer, setBuffer] = useState(() => ({ key, record: initialRecord, text: initialRecord?.text ?? selected?.text ?? '', restored: Boolean(initialRecord) }))
  // Render the correct file immediately; an effect must never paint another
  // file's text under a new path while selection or governance is changing.
  const current = buffer.key === key ? buffer : { key, record: initialRecord, text: initialRecord?.text ?? selected?.text ?? '', restored: Boolean(initialRecord) }
  const draft = current.text
  const record = current.record
  const conflict = evaluatorDraftConflict(record, selected)
  const [storageState, setStorageState] = useState(() => cache.store.status())
  const [evaluatorVersion, setEvaluatorVersion] = useState(nextVersion(evaluator?.version))
  const [stackVersion, setStackVersion] = useState(nextVersion(active?.stack?.version))
  const [saveState, setSaveState] = useState({ status: 'idle' })
  const [reviewed, setReviewed] = useState('')
  const [proposalStatus, setProposalStatus] = useState('')
  const [, setRecoveryRevision] = useState(0)
  const mounted = useRef(true)
  const editorInput = useRef(null)
  const focusedReviewRequest = useRef('')
  const currentIdentity = useRef({ key, bindingKey })
  currentIdentity.current = { key, bindingKey }
  const changed = Boolean(selected && draft !== selected.text)
  const reviewIdentity = JSON.stringify([bindingKey, key, record?.baseDigest ?? selected?.digest, selected?.digest, draft, evaluatorVersion, stackVersion])
  const proposalIdentity = sourceProposal ? JSON.stringify([sessionId, workspace, job, proposal.draftId ?? proposal.id ?? sourceProposal]) : ''
  const currentBinding = bindingIsCurrent(bindingKey)
  const editable = Boolean(selected && typeof selected.text === 'string' && selected.text.length <= MAX_EDITOR_LENGTH && key && cache.canKeep(key))
  const storageNotice = storageState.persisted ? t('draftLocal') : storageState.error?.code === 'HARBOR_EDITOR_DRAFT_RESTORE_FAILED' ? t('draftRestoreFailed') : t('draftMemoryOnly')

  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const restored = key ? cache.get(key) : undefined
    setBuffer({ key, record: restored, text: restored?.text ?? selected?.text ?? '', restored: Boolean(restored) })
    setReviewed('')
    setSaveState({ status: 'idle' })
    setStorageState(cache.store.status())
  }, [key, selected?.digest, selected?.text])
  useEffect(() => {
    setEvaluatorVersion(nextVersion(evaluator?.version))
    setStackVersion(nextVersion(active?.stack?.version))
  }, [evaluator?.version, active?.stack?.version])

  function keepText(text) {
    if (!selected || !key) return
    const next = { baseDigest: record?.baseDigest ?? selected.digest, baseText: record?.baseText ?? selected.text, text }
    // Returning to the original source clears a pristine buffer, but never
    // discards the old baseline when the server has changed underneath it.
    const clean = !conflict && text === selected.text
    const result = clean ? cache.remove(key) : cache.put(key, next)
    setBuffer({ key, record: clean ? undefined : cache.get(key) ?? next, text, restored: false })
    setStorageState(result)
    setReviewed('')
    setSaveState({ status: 'idle' })
  }

  function loadProposal() {
    if (!editable) { setProposalStatus('unavailable'); return }
    const prepared = prepareEvaluatorProposal({ value, proposal, file: selected, text: draft, record, currentBinding, applySourceProposal })
    if (prepared.status === 'ready') keepText(prepared.text)
    setProposalStatus(prepared.status)
  }

  useEffect(() => {
    if (!sourceProposal) return
    if (!proposedFile) { setProposalStatus('unavailable'); return }
    const handledKey = `${proposalIdentity}:${fileKey(proposedFile)}`
    if (cache.handledProposals.has(handledKey)) return
    if (selected?.path !== proposedFile.path) { setSelectedPath(proposedFile.path); return }
    cache.handledProposals.add(handledKey)
    if (cache.handledProposals.size > 256) cache.handledProposals.delete(cache.handledProposals.values().next().value)
    loadProposal()
  }, [proposalIdentity, proposedFile?.path, key, selected?.digest])

  useEffect(() => {
    // Review is an explicit user navigation request, separate from applying a
    // proposal. Reopening a previously handled proposal must reveal its editor
    // without loading it again or replacing the user's current draft.
    if (active?.error || !evaluator || !currentBinding) return
    focusedReviewRequest.current = focusEvaluatorReview({ requestId: proposal?.reviewRequestId, previousRequestId: focusedReviewRequest.current, selectedPath: selected?.path, proposedPath: proposedFile?.path, element: editorInput.current, selectFile: setSelectedPath })
  }, [proposal?.reviewRequestId, proposedFile?.path, selected?.path, currentBinding, editable, active?.error, saveState.status])

  if (active?.error || !evaluator) {
    const recovered = cache.list({ sessionId, workspace, jobId: job })
    return <section className="hse-section">
      <h3>{t('evaluatorImplementation')}</h3><div className="hse-capability">{active?.error ?? t('noEvaluatorInterface')}</div><button type="button" className="hse-button" onClick={() => void reload()}>{t('refresh')}</button>
      {recovered.map(entry => <section className="hse-diff-review" key={entry.key}><h4>{t('draftRecovered')} · {entry.path}</h4><p>{t('draftConflict')}</p><textarea className="hse-editor" readOnly aria-label={`${t('draftRecovered')} · ${entry.path}`} value={entry.text}/><button type="button" className="hse-button" onClick={() => { if (globalThis.confirm?.(`${t('discardEditsConfirm')}\n${entry.path}`)) { setStorageState(cache.remove(entry.key)); setRecoveryRevision(value => value + 1) } }}>{t('discardEdits')}</button></section>)}
      {storageState.error ? <p role="alert">{storageNotice}</p> : null}
      {sourceProposal ? <section className="hse-action-preview"><b>{t('proposalReview')}</b><p>{t('proposalUnavailable')}</p><div className="hse-report-compare"><pre>{sourceProposal.before}</pre><pre>{sourceProposal.replacement}</pre></div></section> : null}
    </section>
  }

  const discard = () => {
    if (!key || !globalThis.confirm?.(`${t('discardEditsConfirm')}\n${selected.path}`)) return
    setStorageState(cache.remove(key))
    setBuffer({ key, record: undefined, text: selected.text, restored: false })
    setReviewed('')
    setSaveState({ status: 'idle' })
    setProposalStatus(sourceProposal ? 'discarded' : '')
  }
  const rebase = () => {
    if (!key || !currentBinding || !globalThis.confirm?.(`${t('rebaseConfirm')}\n${selected.path}`)) return
    cache.remove(key)
    const next = { baseDigest: selected.digest, baseText: selected.text, text: draft }
    const result = draft === selected.text ? cache.store.status() : cache.put(key, next)
    setBuffer({ key, record: draft === selected.text ? undefined : cache.get(key) ?? next, text: draft, restored: false })
    setStorageState(result)
    setReviewed('')
    setSaveState({ status: 'idle' })
  }
  const save = async () => {
    if (!key || !selected || !changed || conflict || reviewed !== reviewIdentity || saveState.status === 'saving') return
    if (!bindingIsCurrent(bindingKey)) { setSaveState({ status: 'error', error: { code: 'HARBOR_EVALUATOR_BINDING_STALE', message: t('reloadBeforeSave') } }); return }
    const submitted = { key, bindingKey, text: draft }
    setSaveState({ status: 'saving' })
    try {
      const receipt = await update('evaluator', { workspace, job, stackPath: active.stack.path, filePath: selected.path, content: draft, expectedDigest: record?.baseDigest ?? selected.digest, newEvaluatorVersion: evaluatorVersion, newStackVersion: stackVersion })
      // A successful request must not erase edits made while it was in flight.
      if (cache.get(submitted.key)?.text === submitted.text) cache.remove(submitted.key)
      if (bindingIsCurrent(submitted.bindingKey)) {
        onSaved?.(receipt)
        if (mounted.current && currentIdentity.current.key === submitted.key) setSaveState({ status: 'saved' })
        await reload()
      }
    } catch (error) {
      if (mounted.current && currentIdentity.current.key === submitted.key && bindingIsCurrent(submitted.bindingKey)) setSaveState({ status: 'error', error: { code: error.code ?? 'HARBOR_EVALUATOR_SAVE_FAILED', message: error.message ?? String(error), nextStep: t('saveFailedReload') } })
    }
  }

  return <section className="hse-section" data-editor-scope={job}>
    <div className="hse-editor-head"><div><h3>{t('evaluatorImplementation')}</h3><p className="hse-muted">{evaluator.evaluator_id} · {evaluator.version}</p></div><details><summary>{t('identityDetails')}</summary><div className="hse-card"><span>{t('evaluatorKind')}</span><b>{evaluator.kind}</b><code>{evaluator.interface}</code><span>{t('evaluatorProtocol')}</span><b>{evaluator.protocol?.input} → {evaluator.protocol?.output}</b><code>{evaluator.implementation?.language} · {evaluator.implementation?.callable}</code></div></details></div>
    <div className="hse-editor-tabs" aria-label={t('editableFiles')}>{files.map(file => { const saved = cache.get(fileKey(file)); const dirty = Boolean(saved && (saved.text !== file.text || evaluatorDraftConflict(saved, file))); return <button type="button" className="hse-editor-tab" data-active={file.path === selected?.path} data-dirty={dirty} key={file.path} onClick={() => setSelectedPath(file.path)}><b>{file.path.split('/').at(-1)}{dirty ? ` ● ${t('unsavedFile')}` : ''}</b><span>{file.role}</span></button> })}</div>
    <div className="hse-editor-current"><span>{t('editingFile')}</span><b>{selected?.path.split('/').at(-1)}</b><code>{selected?.path}</code></div>
    {current.restored && record ? <p className="hse-capability" role="status">{t('draftRecovered')}</p> : null}
    {record || changed || storageState.error ? <p className="hse-muted" role={storageState.persisted ? 'status' : 'alert'}>{storageNotice}{storageState.error?.code === 'HARBOR_EDITOR_DRAFT_CAPACITY' ? ` ${t('editorStorageLimit')}` : ''}</p> : null}
    {!editable ? <p className="hse-capability" role="alert">{selected?.text?.length > MAX_EDITOR_LENGTH ? t('editorSourceTooLarge') : t('editorStorageLimit')}</p> : null}
    {conflict ? <section className="hse-action-preview" role="alert"><b>{t('draftConflict')}</b><div className="hse-report-compare"><div><h4>{t('originalDraftBase')}</h4><pre>{record.baseText}</pre></div><div><h4>{t('latestSource')}</h4><pre>{selected.text}</pre></div></div><button type="button" className="hse-button" disabled={!currentBinding} onClick={rebase}>{t('acceptNewBase')}</button></section> : null}
    <textarea ref={editorInput} className="hse-editor" aria-label={t('editSource')} spellCheck="false" maxLength={MAX_EDITOR_LENGTH} disabled={!editable || saveState.status === 'saving'} value={draft} onChange={event => keepText(event.target.value)}/>
    {sourceProposal ? <section className="hse-action-preview"><b>{t('proposalReview')}</b><p>{proposalStatus === 'ready' ? t('sourceReviewReady') : proposalStatus === 'unavailable' || !proposedFile ? t('proposalUnavailable') : t('proposalMergeHint')}</p><div className="hse-report-compare"><pre aria-label={`${t('proposalReview')} · ${t('beforeChange')}`}>{sourceProposal.before}</pre><pre aria-label={`${t('proposalReview')} · ${t('afterChange')}`}>{sourceProposal.replacement}</pre></div>{proposedFile && selected?.path !== proposedFile.path ? <button type="button" className="hse-button" onClick={() => setSelectedPath(proposedFile.path)}>{t('proposalOpenFile')}</button> : proposedFile && draft === selected?.text && !conflict ? <button type="button" className="hse-button" disabled={!editable || !currentBinding} onClick={loadProposal}>{t('proposalLoad')}</button> : null}</section> : null}
    {changed ? <section className="hse-diff-review"><h4>{t('reviewDiff')}</h4><div className="hse-report-compare"><pre aria-label={t('beforeChange')}>{record?.baseText ?? selected.text}</pre><pre aria-label={t('afterChange')}>{draft}</pre></div><label><input type="checkbox" disabled={conflict || !currentBinding} checked={!conflict && reviewed === reviewIdentity} onChange={event => setReviewed(event.target.checked ? reviewIdentity : '')}/>{t('confirmDiff')}</label></section> : null}
    <div className="hse-editor-versions"><label className="hse-card"><span>{t('evaluatorVersion')}</span><input className="hse-input" value={evaluatorVersion} disabled={saveState.status === 'saving'} onChange={event => setEvaluatorVersion(event.target.value)}/></label><label className="hse-card"><span>{t('stackVersion')}</span><input className="hse-input" value={stackVersion} disabled={saveState.status === 'saving'} onChange={event => setStackVersion(event.target.value)}/></label></div>
    {saveState.status === 'error' ? <ErrorState error={saveState.error} retry={() => void reload()} retryLabel={t('refresh')} t={t}/> : null}
    <div className="hse-editor-actions"><p className={saveState.status === 'saved' ? 'hse-editor-success' : 'hse-muted'}>{saveState.status === 'saved' ? t('saved') : t('editWarning')}</p>{record || changed ? <button type="button" className="hse-button" disabled={saveState.status === 'saving'} onClick={discard}>{t('discardEdits')}</button> : null}<button type="button" className="hse-button" disabled={!currentBinding || !editable || !changed || conflict || reviewed !== reviewIdentity || !evaluatorVersion || !stackVersion || saveState.status === 'saving'} onClick={() => void save()}>{saveState.status === 'saving' ? t('saving') : t('saveEvaluator')}</button></div>
  </section>
}
