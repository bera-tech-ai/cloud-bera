'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { diagnoseDeploymentFailure, deploymentLogErrorLine } = require('../Library/actions/project-lifecycle')

const PORT_LOG = `[BERAHOST] Cloning repository...
[BERAHOST] Node web process started.
Error: listen EADDRINUSE: address already in use 0.0.0.0:3000
[BERAHOST] ERROR: Web process exited before opening its assigned port.`

test('diagnoses the hardcoded-port failure as self-healable', () => {
    const d = diagnoseDeploymentFailure(PORT_LOG)
    assert.equal(d.fix, 'port')
    assert.match(d.summary, /fixed port/)
})

test('clone failures are diagnosed but not auto-fixed', () => {
    const d = diagnoseDeploymentFailure('[BERAHOST] ERROR: GitHub repository download failed (404).')
    assert.equal(d.fix, null)
})

test('unknown failures get no diagnosis', () => {
    assert.equal(diagnoseDeploymentFailure('[BERAHOST] Something else went wrong'), null)
    assert.equal(diagnoseDeploymentFailure(''), null)
})

test('extracts the log error line without the BERAHOST prefix', () => {
    assert.equal(deploymentLogErrorLine(PORT_LOG), 'ERROR: Web process exited before opening its assigned port.')
})
