// Minimal, visibly labelled Host stubs around the real registered components.
export function mountFixture({ React, createRoot, plugin, metadata }) {
  const { useState, useSyncExternalStore } = React
  const scene = new URLSearchParams(location.search).get('scene') ?? 'empty'
  if (!['empty', 'tasks', 'proposal'].includes(scene)) throw new Error('Unknown fixture scene')
  const sessionId = `fixture-${scene}`
  const listeners = new Set()
  let inputState = { draft: '', occurrences: [], phase: 'plain', draftRev: 0 }
  const publish = value => { inputState = { ...inputState, ...value, draftRev: inputState.draftRev + 1 }; for (const listener of listeners) listener() }
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener) }
  const input = {
    state: { getSnapshot: () => inputState, subscribe },
    setDraft(draft, edit) {
      const delta = edit ? edit.insertedLength - (edit.end - edit.start) : 0
      const occurrences = edit ? inputState.occurrences.filter(item => item.offset + item.length <= edit.start || item.offset >= edit.end).map(item => item.offset >= edit.end ? { ...item, offset: item.offset + delta } : item) : []
      publish({ draft, occurrences })
    },
    insertReference(reference, range) {
      if (range.draftRev !== inputState.draftRev) return false
      const text = reference.clipboardText
      const draft = inputState.draft.slice(0, range.start) + text + ' ' + inputState.draft.slice(range.end)
      publish({ draft, occurrences: [{ ...reference, offset: range.start, length: text.length }] })
      return true
    },
  }
  const useInput = select => select(useSyncExternalStore(subscribe, () => inputState))
  const slots = []
  const cleanups = []
  let dictionaries
  const actx = { get: key => key === 'conversation' ? conversation : undefined }
  const conversation = { input: { for: () => input }, cancel: async () => {} }
  const ctx = {
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') cleanups.push(dispose) },
    locale: { register(namespace, value) { dictionaries = value; return () => {} }, bind: () => key => dictionaries?.zh?.[key] ?? key },
    inputTriggers: { registerSource() { return () => {} } },
    sessions: { scope: id => id === sessionId ? actx : undefined }, conversation,
    slots: {
      inject(name, register) { const value = register(); if (value?.[Symbol.iterator]) for (const unused of value) void unused },
      register(descriptor, component) { slots.push({ descriptor, component }); return () => {} },
    },
  }
  plugin.apply(ctx)
  const findSlot = (name, key) => {
    const match = slots.find(slot => slot.descriptor.name === name && (!key || slot.descriptor.key === key))
    if (!match) throw new Error(`Required real plugin slot is missing: ${name}`)
    return match
  }
  const page = findSlot('conversation.view')
  const sync = findSlot('conversation.input.dock')
  const tool = findSlot('tool.call.toolview', 'harbor_propose_action')
  const shared = { sessionId, useInput, useSession: select => select?.({ nodes: [], phase: 'idle' }), inputActions: input }
  const pageProps = { ...shared, ...page.descriptor.inject(sessionId) }
  const syncProps = { ...shared, ...sync.descriptor.inject(sessionId) }
  const toolProps = { ...shared, ...tool.descriptor.inject(sessionId), toolName: 'harbor_propose_action', block: { kind: 'tool-result', meta: metadata.draft, content: [{ type: 'text', text: JSON.stringify(metadata.draft) }] } }
  const Page = page.component, InputSync = sync.component, ToolView = tool.component
  const style = document.createElement('style')
  style.textContent = `html,body,#root{margin:0;height:100%;background:#17191e;color:#e8edf3;font:14px system-ui,sans-serif}*{box-sizing:border-box}.fixture-shell{display:flex;flex-direction:column;height:100%}.fixture-boundary{background:#332814;color:#ffdf94;padding:9px 20px;font-size:12px}.fixture-tabs{display:flex;gap:8px;padding:10px 20px;border-bottom:1px solid #38404b}.fixture-tabs button,.fixture-composer button{background:#272e39;border:1px solid #526176;border-radius:7px;color:inherit;padding:9px 16px}.fixture-tabs button[aria-selected=true]{border-color:#69a4ff;color:#8cbaff}.fixture-content{flex:1;min-height:0;overflow:auto}.fixture-chat{max-width:850px;margin:24px auto;padding:0 20px}.fixture-chat>p{line-height:1.7}.fixture-composer{flex-shrink:0;margin:12px auto;padding:13px;background:#242a33;border:1px solid #455166;border-radius:15px;width:min(880px,calc(100% - 32px))}.fixture-composer textarea{font:inherit;display:block;width:100%;min-height:65px;background:transparent;color:inherit;border:0;resize:vertical}.fixture-composer footer{display:flex;align-items:center;justify-content:space-between;gap:16px}.fixture-composer small{font-size:11px;color:#aab8c9}.fixture-submitted{white-space:pre-wrap;overflow-wrap:anywhere}.fixture-chat .hse-tool{background:#252d3a}.fixture-chat .hse-tool>button{color:inherit}@media(max-width:640px){.fixture-boundary{padding:7px 12px}.fixture-composer{margin:8px auto}.fixture-composer footer{align-items:flex-end}}`
  document.head.appendChild(style)
  function App() {
    const [tab, setTab] = useState(scene === 'proposal' ? 'chat' : 'harbor')
    const [submitted, setSubmitted] = useState('')
    const value = useInput(state => state)
    const submit = () => {
      setSubmitted(value.draft)
      publish({ phase: 'submitting' })
      setTimeout(() => publish({ draft: '', occurrences: [], phase: 'plain' }), 100)
    }
    return <div className="fixture-shell">
      <div className="fixture-boundary">isolated component fixture / not real Host or model · v{metadata.version} 源码组件 · 2 条合成 Trial · Composer/宿主是测试替身{scene === 'tasks' ? ' · 任务状态与取消仅为内存模拟' : ''}</div>
      <nav className="fixture-tabs" aria-label="测试宿主导航"><button aria-selected={tab === 'chat'} onClick={() => setTab('chat')}>对话</button><button aria-selected={tab === 'harbor'} onClick={() => setTab('harbor')}>Harbor</button></nav>
      <div className="fixture-content">{tab === 'harbor' ? <Page {...pageProps}/> : <div className="fixture-chat"><h2>原生对话位置的组件验收</h2><p>这里使用插件真实注册的工具卡片；以下建议为预置合成数据，不是模型生成。预检和确认通过真实服务，只在临时目录保存 Candidate 草案。</p>{scene === 'proposal' ? <ToolView {...toolProps}/> : <p>此场景没有模型回复；请切换 Harbor 查看合成评测结果。</p>}{submitted ? <p className="fixture-submitted">模拟提交内容（未发送给模型）：{submitted}</p> : null}</div>}</div>
      <InputSync {...syncProps}/>
      <section className="fixture-composer" aria-label="测试宿主 Composer"><textarea aria-label="测试宿主输入框" placeholder="发送消息或做任务…（此处不调用模型）" value={value.draft} onChange={event => input.setDraft(event.target.value)}/><footer><small>测试替身输入框 · 页面浏览不会自动注入消息</small><button disabled={!value.draft || value.phase !== 'plain'} onClick={submit}>模拟提交</button></footer></section>
    </div>
  }
  createRoot(document.getElementById('root')).render(<App/>)
  window.addEventListener('pagehide', () => { for (const dispose of cleanups) dispose() }, { once: true })
}
