import assert from 'node:assert/strict'
import test from 'node:test'

import {
  HOST_ENVIRONMENT_IMPORT,
  resolveExecutionEnvironment,
} from '../lib/execution-environment.js'

test('host execution is the unrestricted default and uses the loopback broker', () => {
  assert.deepEqual(resolveExecutionEnvironment({}), {
    kind: 'host',
    harborArgs: ['-e', HOST_ENVIRONMENT_IMPORT, '--cpus', 'ignore', '--memory', 'ignore', '-y'],
    gatewayAdvertisedHost: '127.0.0.1',
  })
})

test('docker remains an explicit opt-in with its configured advertised host', () => {
  assert.deepEqual(resolveExecutionEnvironment({ modelBrokerAdvertisedHost: 'docker.host' }, { executionEnvironment: 'docker' }), {
    kind: 'docker',
    harborArgs: ['-e', 'docker'],
    gatewayAdvertisedHost: 'docker.host',
  })
  assert.throws(
    () => resolveExecutionEnvironment({}, { executionEnvironment: 'sandbox' }),
    /host or docker/,
  )
})
