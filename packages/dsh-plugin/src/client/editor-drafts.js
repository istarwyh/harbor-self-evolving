// This store owns only unsaved editor buffers. It is not an authorization cache:
// saving still requires the Host's current source identity and explicit review.
const STORAGE_KEY = 'harbor.editor-drafts.v1'
const SCHEMA = 'harbor-editor-drafts/v1'
const MAX_TEXT_LENGTH = 256 * 1024
const MAX_KEY_LENGTH = 8 * 1024
const MAX_SERIALIZED_LENGTH = 20 * 1024 * 1024
const KEY_FIELDS = ['sessionId', 'workspace', 'jobId', 'role', 'path']

function failure(code, message) { return { code, message } }

function scopeValue(value, name) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048 || /[\u0000-\u001f]/.test(value)) {
    throw new TypeError(`HARBOR_EDITOR_DRAFT_SCOPE_INVALID: ${name} must be a non-empty, bounded string.`)
  }
  return value
}

export function makeEditorDraftKey(scope) {
  const key = JSON.stringify(KEY_FIELDS.map(name => scopeValue(scope?.[name], name)))
  if (key.length > MAX_KEY_LENGTH) throw new TypeError('HARBOR_EDITOR_DRAFT_SCOPE_INVALID: Source scope is too long.')
  return key
}

function validKey(key) {
  if (typeof key !== 'string' || key.length > MAX_KEY_LENGTH) return false
  try {
    const parts = JSON.parse(key)
    if (!Array.isArray(parts) || parts.length !== KEY_FIELDS.length) return false
    return makeEditorDraftKey(Object.fromEntries(KEY_FIELDS.map((name, index) => [name, parts[index]]))) === key
  } catch { return false }
}

function assertKey(key) {
  if (!validKey(key)) throw new TypeError('HARBOR_EDITOR_DRAFT_SCOPE_INVALID: Use makeEditorDraftKey for this editor scope.')
}

function validContent(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && typeof value.baseDigest === 'string' && value.baseDigest.length > 0 && value.baseDigest.length <= 1024
    && typeof value.baseText === 'string' && value.baseText.length <= MAX_TEXT_LENGTH
    && typeof value.text === 'string' && value.text.length <= MAX_TEXT_LENGTH)
}

function copy(value) { return value ? { ...value } : undefined }

/**
 * Inject a sessionStorage-like adapter; no browser globals or Host state are read.
 * Callers must surface status().error (including after get), and keep the visible
 * buffer when put cannot accept it. Full stores reject new entries, never evict
 * another unsaved buffer. remove is the explicit save/discard/rebase boundary.
 */
export function createEditorDraftStore({ storage, now = Date.now, maxEntries = 32 } = {}) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 128) throw new TypeError('maxEntries must be between 1 and 128.')
  if (typeof now !== 'function') throw new TypeError('now must be a function.')
  const drafts = new Map()
  const adapter = storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function' && typeof storage.removeItem === 'function' ? storage : undefined
  let persistence = adapter
    ? { persisted: true, error: undefined }
    : { persisted: false, error: failure('HARBOR_EDITOR_DRAFT_MEMORY_ONLY', 'Drafts are kept in this page only. Browser storage is unavailable; copy your edits before refreshing.') }

  if (adapter) {
    try {
      const serialized = adapter.getItem(STORAGE_KEY)
      if (serialized !== null && serialized !== undefined) {
        if (typeof serialized !== 'string' || serialized.length > MAX_SERIALIZED_LENGTH) throw new Error('Oversized draft data')
        const saved = JSON.parse(serialized)
        if (!saved || saved.schema !== SCHEMA || !Array.isArray(saved.entries) || saved.entries.length > maxEntries) throw new Error('Invalid draft schema')
        for (const entry of saved.entries) {
          if (!validKey(entry?.key) || !validContent(entry) || !Number.isSafeInteger(entry.updatedAt) || entry.updatedAt < 0 || drafts.has(entry.key)) throw new Error('Invalid draft record')
          drafts.set(entry.key, { baseDigest: entry.baseDigest, baseText: entry.baseText, text: entry.text, updatedAt: entry.updatedAt })
        }
      }
    } catch {
      drafts.clear()
      persistence = { persisted: false, error: failure('HARBOR_EDITOR_DRAFT_RESTORE_FAILED', 'Saved editor drafts could not be restored. New edits will remain visible; check browser storage before refreshing.') }
    }
  }

  function status() { return { persisted: persistence.persisted, error: copy(persistence.error) } }

  function persist() {
    if (!adapter) return status()
    try {
      if (!drafts.size) adapter.removeItem(STORAGE_KEY)
      else {
        const serialized = JSON.stringify({ schema: SCHEMA, entries: [...drafts].map(([key, value]) => ({ key, ...value })) })
        if (serialized.length > MAX_SERIALIZED_LENGTH) throw new Error('Oversized draft data')
        adapter.setItem(STORAGE_KEY, serialized)
      }
      persistence = { persisted: true, error: undefined }
    } catch {
      persistence = { persisted: false, error: failure('HARBOR_EDITOR_DRAFT_PERSIST_FAILED', 'The latest draft change could not be saved in this browser. Keep this page open or copy your edits; refreshing may restore an older draft.') }
    }
    return status()
  }

  return {
    list(scope) {
      const prefix = ['sessionId', 'workspace', 'jobId'].map(name => scopeValue(scope?.[name], name))
      return [...drafts].flatMap(([key, value]) => {
        const parts = JSON.parse(key)
        return prefix.every((part, index) => part === parts[index]) ? [{ key, role: parts[3], path: parts[4], ...copy(value) }] : []
      })
    },
    get(key) {
      assertKey(key)
      return copy(drafts.get(key))
    },
    put(key, value) {
      assertKey(key)
      if (!validContent(value)) return { draft: copy(drafts.get(key)), accepted: false, persisted: false, error: failure('HARBOR_EDITOR_DRAFT_TOO_LARGE', 'This draft cannot be stored: source identity must be present and each source buffer must be at most 256 Ki characters. Keep the visible edits or copy them before leaving.') }
      if (!drafts.has(key) && drafts.size >= maxEntries) return { draft: undefined, accepted: false, persisted: false, error: failure('HARBOR_EDITOR_DRAFT_CAPACITY', `All ${maxEntries} draft slots are in use. Save or discard another draft before leaving this editor.`) }
      const updatedAt = now()
      if (!Number.isSafeInteger(updatedAt) || updatedAt < 0) throw new TypeError('now must return a non-negative integer timestamp.')
      const previous = drafts.get(key)
      const draft = {
        baseDigest: previous?.baseDigest ?? value.baseDigest,
        baseText: previous?.baseText ?? value.baseText,
        text: value.text,
        updatedAt,
      }
      drafts.set(key, draft)
      return { draft: copy(draft), accepted: true, baseChanged: Boolean(previous && (previous.baseDigest !== value.baseDigest || previous.baseText !== value.baseText)), ...persist() }
    },
    remove(key) {
      assertKey(key)
      drafts.delete(key)
      return persist()
    },
    status,
  }
}
