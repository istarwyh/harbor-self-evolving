// Opt-in real-composition acceptance. No profile installation, provider key, or release action.
import { spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const plugin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const value = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined
const harness = value('--harness-root')
if (!harness || !path.isAbsolute(harness)) throw new Error('Pass --harness-root /absolute/path/to/xiaohui-harness (already built).')
const manifest = JSON.parse(await readFile(path.join(plugin, 'package.json'), 'utf8'))
await access(path.join(plugin, 'lib', 'client.js'))
await access(path.join(harness, 'apps/web/tests/harbor-page-context.e2e.ts'))
const screenshotDir = value('--screenshots')
if (screenshotDir && !path.isAbsolute(screenshotDir)) throw new Error('--screenshots must be an absolute output directory')
const evidencePath = value('--evidence')
if (evidencePath && !path.isAbsolute(evidencePath)) throw new Error('--evidence must be an absolute output file')
const snapshotMode = args.includes('--refresh') ? 'refresh' : 'replay'
const evidenceWorld = evidencePath ? await mkdtemp(path.join(tmpdir(), 'harbor-context-evidence-')) : undefined
console.log(`Harbor ${manifest.version}: isolated real Loader/Web acceptance; synthetic Trial fixtures, keyless model transport.`)
console.log(`Mode: ${snapshotMode}. Existing profiles and sessions are not used. This does not run a Candidate evaluation.`)
const child = spawn('pnpm', ['exec', 'vitest', 'run', '--config', 'vitest.web.config.ts',
  'apps/web/tests/conversation-page-context.e2e.ts', 'apps/web/tests/harbor-page-context.e2e.ts'], {
  cwd: harness,
  stdio: 'inherit',
  env: {
    ...process.env,
    DSH_SNAPSHOT: snapshotMode,
    HARBOR_PLUGIN_ROOT: plugin,
    DEEPSEEK_API_KEY: '',
    ...(screenshotDir ? { HARBOR_CONTEXT_SCREENSHOT_DIR: screenshotDir } : {}),
    ...(evidenceWorld ? {
      HARBOR_CONTEXT_EVIDENCE_PATH: path.join(evidenceWorld, 'harbor.json'),
      HARBOR_HOST_CONTEXT_EVIDENCE_PATH: path.join(evidenceWorld, 'draft-recovery.json'),
    } : {}),
  },
})
try {
  process.exitCode = await new Promise(resolve => {
    child.once('error', error => { console.error(error.message); resolve(1) })
    child.once('exit', (code, signal) => { resolve(code ?? (signal ? 1 : 0)) })
  })
  if (process.exitCode === 0 && evidenceWorld) {
    const harbor = JSON.parse(await readFile(path.join(evidenceWorld, 'harbor.json'), 'utf8'))
    const draftRecovery = JSON.parse(await readFile(path.join(evidenceWorld, 'draft-recovery.json'), 'utf8'))
    await mkdir(path.dirname(evidencePath), { recursive: true })
    await writeFile(evidencePath, JSON.stringify({
      ...harbor,
      uxOptimizations: { draftRecovery },
    }, null, 2) + '\n')
  }
} finally {
  if (evidenceWorld) await rm(evidenceWorld, { recursive: true, force: true })
}
