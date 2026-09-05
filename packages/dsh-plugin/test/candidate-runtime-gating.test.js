import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { runEvaluation } from '../lib/evolution.js'

async function candidateFixture(projectRoot, { bound = true } = {}) {
  const candidate = path.join(projectRoot, 'candidate')
  await mkdir(candidate)
  await writeFile(path.join(candidate, 'cordis.yml'), '- id: wiring-agent\n  name: ./run-acp.mjs\n')
  const packageJson = { name: 'test-candidate', version: '1.0.0' }
  await writeFile(path.join(candidate, 'package.json'), JSON.stringify(packageJson))
  await writeFile(path.join(candidate, 'package-lock.json'), JSON.stringify({ ...packageJson, lockfileVersion: 3, packages: { '': packageJson } }))
  if (bound) {
    await writeFile(path.join(candidate, 'run-acp.mjs'), '// Static runtime gate fixture, never executed.\n')
    await writeFile(path.join(candidate, 'candidate-runtime.json'), JSON.stringify({ schema_version: 1, transport: 'acp', entrypoint: 'run-acp.mjs', config_path: 'cordis.yml', agent_entry_id: 'wiring-agent', node_version: '22.22.2' }))
  }
  return candidate
}

for (const code of ['CANDIDATE_RUNTIME_UNBOUND', 'CANDIDATE_RUNTIME_INVALID']) {
  test(`diagnostic Run blocks ${code} before context, model lease or Harbor launch`, async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-runtime-gating-'))
    await candidateFixture(projectRoot)
    const callsFile = path.join(projectRoot, 'adapter-calls.jsonl')
    const adapter = path.join(projectRoot, 'adapter-test-double.cjs')
    await writeFile(adapter, `#!${process.execPath}
const { appendFileSync } = require('node:fs');
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(callsFile)}, JSON.stringify(args) + '\\n');
if (args[0] === 'dataset' && args[1] === 'validate') {
  process.stdout.write(JSON.stringify({ valid: true, findings: [] }));
} else if (args[0] === 'doctor') {
  process.stdout.write(JSON.stringify({ promotion_ready: false, findings: [{ level: 'error', code: ${JSON.stringify(code)}, message: 'Create a locked local Candidate runtime and fresh baseline.' }] }));
  process.exitCode = 2;
} else {
  process.stderr.write('Unexpected executable action after runtime rejection');
  process.exitCode = 91;
}
`, { mode: 0o700 })
    let leases = 0
    const config = {
      projectRoot, jobsDir: 'jobs', harborDshBin: adapter,
      harborBin: path.join(projectRoot, 'harbor-must-not-launch'), timeoutMs: 5000,
    }
    const args = {
      candidatePath: 'candidate', datasetPath: 'dataset', stackPath: 'stack.yml', mode: 'diagnostic',
      candidateModelBinding: { provider: 'test', model: 'test', transport: 'dsh-host-broker', protocol: 'dsh-host-model-gateway/v1' },
    }

    await assert.rejects(runEvaluation(config, args, {
      async openLease() { leases += 1; assert.fail('A blocked runtime must not open a model lease') },
    }), error => error.message.includes('Runtime Doctor blocked Harbor Job') && error.message.includes(code))

    const calls = (await readFile(callsFile, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    assert.deepEqual(calls.map(call => call[0]), ['dataset', 'doctor'])
    assert.ok(calls[1].includes('--candidate'))
    assert.equal(leases, 0)
  })
}

test('an unbound Candidate is blocked locally even when an old Adapter cannot diagnose it', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-runtime-local-gate-'))
  await candidateFixture(projectRoot, { bound: false })
  await assert.rejects(runEvaluation({
    projectRoot, jobsDir: 'jobs', harborDshBin: '/must-not-start-old-adapter',
  }, { candidatePath: 'candidate', datasetPath: 'dataset', stackPath: 'stack.yml', mode: 'diagnostic' }, {
    async openLease() { assert.fail('An unbound runtime cannot open a lease') },
  }), /runtime is unbound/)
  await assert.rejects(readFile(path.join(projectRoot, 'candidate/candidate-manifest.json')), { code: 'ENOENT' })
})

test('a bound Candidate cannot execute through an old Doctor without the runtime capability marker', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-runtime-old-adapter-'))
  await candidateFixture(projectRoot)
  const adapter = path.join(projectRoot, 'old-adapter-test-double.cjs')
  const callsFile = path.join(projectRoot, 'calls.jsonl')
  await writeFile(adapter, `#!${process.execPath}
const { appendFileSync } = require('node:fs');
const command = process.argv[2];
appendFileSync(${JSON.stringify(callsFile)}, JSON.stringify(command) + '\\n');
if (command === 'dataset') process.stdout.write(JSON.stringify({ valid: true, findings: [] }));
else if (command === 'doctor') process.stdout.write(JSON.stringify({ promotion_ready: true, findings: [{ level: 'info', code: 'CANDIDATE_VERIFIED', message: 'Candidate is immutable' }] }));
else process.exitCode = 91;
`, { mode: 0o700 })

  await assert.rejects(runEvaluation({ projectRoot, jobsDir: 'jobs', harborDshBin: adapter, timeoutMs: 5000 }, {
    candidatePath: 'candidate', datasetPath: 'dataset', stackPath: 'stack.yml', mode: 'diagnostic',
  }, { async openLease() { assert.fail('An old Adapter must not receive a lease') } }), /CANDIDATE_RUNTIME_ADAPTER_UNSUPPORTED.*update the Python Adapter/)
  assert.deepEqual((await readFile(callsFile, 'utf8')).trim().split('\n').map(line => JSON.parse(line)), ['dataset', 'doctor'])
})
