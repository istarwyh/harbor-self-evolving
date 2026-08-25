import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  DSH_VERSION,
  parseSetupArgs,
  resolveLocalPluginDirectory,
  resolveSetupOptions,
  setupIntegration,
  upsertHarborProfileEntry,
} from '../lib/setup.js'

test('setup follows the latest DSH runtime release', () => {
  assert.equal(DSH_VERSION, 'latest')
})

test('setup arguments default to the Web profile and reject unknown options', () => {
  assert.deepEqual(parseSetupArgs(['--project-root', '/tmp/agent', '--profile', 'web']), {
    projectRoot: '/tmp/agent',
    profile: 'web',
  })
  assert.throws(() => parseSetupArgs(['--surprise']), /Unknown setup option/)
})

test('setup paths use isolated runtime and DSH homes', () => {
  const options = resolveSetupOptions({}, {
    cwd: '/workspace/agent',
    home: '/users/tester',
    env: {},
    platform: 'linux',
  })
  assert.equal(options.profile, 'web')
  assert.equal(options.projectRoot, '/workspace/agent')
  assert.equal(options.dshHome, '/users/tester/.dsh')
  assert.equal(options.harborBin, '/users/tester/.local/share/harbor-dsh-evolution/.venv/bin/harbor')
})

test('profile patch replaces only harbor-evolution and preserves other entries', () => {
  const source = [
    '# user-owned patch',
    '- id: llm',
    '  config:',
    '    model: example',
    '- id: harbor-evolution',
    '  config:',
    '    projectRoot: /old',
    '- insert:',
    '    - id: custom',
    '',
  ].join('\n')
  const updated = upsertHarborProfileEntry(source, {
    projectRoot: '/new agent',
    jobsDir: 'jobs',
    harborBin: '/runtime/bin/harbor',
    harborDshBin: '/runtime/bin/harbor-dsh',
  })
  assert.match(updated, /model: example/)
  assert.match(updated, /projectRoot: "\/new agent"/)
  assert.match(updated, /- insert:\n    - id: custom/)
  assert.equal((updated.match(/- id: harbor-evolution/g) ?? []).length, 1)
})

test('local plugin specs are distinguished from registry and GitHub specs', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'dsh-harbor-plugin-spec-'))
  const pluginDir = path.join(temporary, 'plugin')
  await mkdir(pluginDir)
  await writeFile(path.join(pluginDir, 'package.json'), JSON.stringify({
    name: 'dsh-harbor-evolution',
  }), 'utf8')

  assert.equal(await resolveLocalPluginDirectory(pluginDir), pluginDir)
  assert.equal(await resolveLocalPluginDirectory(`file://${pluginDir}`), pluginDir)
  assert.equal(await resolveLocalPluginDirectory('dsh-harbor-evolution@0.5.0'), undefined)
  assert.equal(await resolveLocalPluginDirectory('github:istarwyh/harbor-self-evolving'), undefined)
})

test('setup installs both runtimes, writes an idempotent profile patch, and verifies Harbor', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'dsh-harbor-setup-'))
  const projectRoot = path.join(temporary, 'agent')
  const dshHome = path.join(temporary, 'dsh')
  const runtimeDir = path.join(temporary, 'runtime')
  const pluginSource = path.join(temporary, 'dsh-plugin')
  const patchFile = path.join(dshHome, 'profiles', 'web', 'cordis.patch.yml')
  await mkdir(projectRoot)
  await mkdir(pluginSource)
  await writeFile(path.join(pluginSource, 'package.json'), JSON.stringify({
    name: 'dsh-harbor-evolution',
  }), 'utf8')
  await mkdir(path.dirname(patchFile), { recursive: true })
  await writeFile(patchFile, '# keep me\n[]\n', 'utf8')

  const calls = []
  const run = async (command, args, options = {}) => {
    calls.push({ command, args, options })
    if (args[0] === 'plugins') return { code: 0, stdout: 'dsh-evolution  plugin', stderr: '' }
    if (args[0] === '--version') return { code: 0, stdout: `${command} 1.0`, stderr: '' }
    return { code: 0, stdout: 'ok', stderr: '' }
  }

  const first = await setupIntegration({
    projectRoot,
    dshHome,
    runtimeDir,
    pluginSpec: pluginSource,
    pythonSpec: '/source/harbor-plugin',
  }, { run, env: {}, platform: 'linux' })
  const second = await setupIntegration({
    projectRoot,
    dshHome,
    runtimeDir,
    pluginSpec: pluginSource,
    pythonSpec: '/source/harbor-plugin',
  }, { run, env: {}, platform: 'linux' })

  assert.equal(first.patchChanged, true)
  assert.equal(second.patchChanged, false)
  const patch = await readFile(patchFile, 'utf8')
  assert.match(patch, /^# keep me/m)
  assert.match(patch, /- id: harbor-evolution/)
  assert.equal((patch.match(/- id: harbor-evolution/g) ?? []).length, 1)
  const pluginCall = calls.find(call => call.command === 'pnpm' && call.args.includes('plugin'))
  assert.equal(pluginCall.options.env.DSH_HOME, dshHome)
  assert.ok(pluginCall.args.includes('--save-exact'))
  assert.ok(pluginCall.args.includes('--ignore-scripts'))
  assert.ok(calls.some(call => call.command === 'uv' && call.args.includes('/source/harbor-plugin')))
  const sourceInstallCalls = calls.filter(call => call.command === 'npm' && call.args[0] === 'ci')
  assert.equal(sourceInstallCalls.length, 2)
  assert.equal(sourceInstallCalls[0].options.cwd, pluginSource)
  const sourceBuildCalls = calls.filter(call => call.command === 'npm' && call.args[0] === 'run' && call.args[1] === 'build')
  assert.equal(sourceBuildCalls.length, 2)
  assert.equal(sourceBuildCalls[0].options.cwd, pluginSource)
})
