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

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { fixDiagnosedProjectIssue } = require('../Library/actions/project-lifecycle')

const MODULE_LOG = `[BERAHOST] Node web process started.
Error: Cannot find module 'axios'
Require stack:
- /tmp/berahost_web_22/server.js
[BERAHOST] ERROR: Web process exited before opening its assigned port.`

test('diagnoses a missing npm package as self-healable', () => {
    const d = diagnoseDeploymentFailure(MODULE_LOG)
    assert.equal(d.fix, 'missing-module')
    assert.equal(d.module, 'axios')
})

test('a missing local file is diagnosed but not auto-fixed', () => {
    const d = diagnoseDeploymentFailure("Error: Cannot find module './db'")
    assert.equal(d.fix, null)
})

test('fixDiagnosedProjectIssue adds the missing dependency', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heal-'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', dependencies: { express: '^4.18.2' } }))
    assert.equal(fixDiagnosedProjectIssue(dir, { fix: 'missing-module', module: 'axios' }), true)
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    assert.equal(pkg.dependencies.axios, '*')
    assert.equal(pkg.dependencies.express, '^4.18.2')
    assert.equal(fixDiagnosedProjectIssue(dir, { fix: 'missing-module', module: 'axios' }), false)
})
