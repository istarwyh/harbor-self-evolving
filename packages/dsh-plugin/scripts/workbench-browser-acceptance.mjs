// Opt-in, read-only UI check on a caller-owned CDP tab already showing the
// 100-Trial synthetic fixture's Trials view. Never clicks Ask, sends, or saves.
const target = process.argv[2]
const job = process.argv[3]
if (!/^[A-F0-9]{32}$/.test(target ?? '') || !/^harbor-ui-acceptance-\d+$/.test(job ?? '')) throw new Error('Pass your owned tab ID and the synthetic Job ID')
const expression = String.raw`(async () => {
  const job = JOB;
  if (!document.querySelector('.hse-main-panel')?.innerText.startsWith(job)) throw Error('Open the requested synthetic Job first');
  const ids = ['hfq-021', 'hfq-034', ...Array.from({length:98},(_,i)=>'synthetic-'+String(i+3).padStart(3,'0'))];
  const composer = document.querySelector('textarea[data-phase]');
  if (!composer) throw Error('Native Composer is not visible');
  const draft = composer.value;
  if (document.querySelector('.hse-copilot,.hse-context-dock,.hse-mobile-copilot')) throw Error('Removed panels are still mounted');
  const waitFor = predicate => new Promise((resolve,reject) => {
    if (predicate()) return resolve();
    const observer = new MutationObserver(() => { if (predicate()) { clearTimeout(timer); observer.disconnect(); resolve(); } });
    const timer = setTimeout(()=>{observer.disconnect();reject(Error('UI target timeout'))},2000);
    observer.observe(document.querySelector('.hse-main-panel').parentElement,{subtree:true,childList:true,characterData:true,attributes:true});
  });
  const selectionMs = [], detailMs = [];
  for (const id of ids) {
    const button = [...document.querySelectorAll('.hse-main-panel tbody button')].find(b=>b.innerText===id);
    if (!button) throw Error('Missing row '+id);
    const started = performance.now(); button.click();
    await waitFor(()=>button.closest('tr')?.dataset.selected==='true');
    selectionMs.push(performance.now()-started);
    await waitFor(()=>document.querySelector('.hse-trial-detail')?.innerText.includes(id+':'));
    detailMs.push(performance.now()-started);
  }
  const stats = values => { const s=values.slice().sort((a,b)=>a-b);return {p50:s[49],p95:s[94],max:s[99]}; };
  return {job,count:ids.length,selection:stats(selectionMs),detail:stats(detailMs),composerUnchanged:document.querySelector('textarea[data-phase]')?.value===draft,synthetic:true,boundary:'Visible selection/detail only; does not measure automatic message context or model execution.'};
})()`.replace('JOB', JSON.stringify(job))
const response = await fetch(`http://localhost:3456/eval?target=${target}`, { method: 'POST', body: expression })
const result = await response.json()
if (result.error) throw new Error(result.error)
if (result.value?.count !== 100 || !result.value.composerUnchanged) throw new Error('Selection changed the Composer or did not cover 100 distinct Trials')
console.log(JSON.stringify(result.value, null, 2))
