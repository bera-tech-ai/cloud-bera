'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const workspace = require('../Library/lib/workspace')
const sessionManager = require('../Library/lib/sessionManager')
const replit = require('../Library/actions/replit')

test('workspace root is writable and shared by project, shell, and Replit paths', () => {
    const userId = `workspace-test-${process.pid}`
    const userDir = workspace.getUserWorkspace(userId)
    const session = sessionManager.getSession(userId)

    assert.equal(session.cwd, userDir)
    assert.equal(replit.WORKSPACE_ROOT, workspace.WORKSPACE_ROOT)
    assert.equal(fs.statSync(userDir).isDirectory(), true)
    fs.accessSync(userDir, fs.constants.W_OK)

    fs.rmSync(userDir, { recursive: true, force: true })
})

test('an unusable configured workspace falls back to a writable app-local directory', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bera-workspace-test-'))
    const appDir = path.join(tempRoot, 'app')
    const invalidRoot = path.join(tempRoot, 'not-a-directory')
    fs.mkdirSync(appDir)
    fs.writeFileSync(invalidRoot, 'blocks directory creation')

    try {
        const workspaceModule = path.resolve(__dirname, '../Library/lib/workspace.js')
        const script = `
            const assert = require('node:assert/strict')
            const fs = require('node:fs')
            const path = require('node:path')
            const workspace = require(${JSON.stringify(workspaceModule)})
            assert.equal(workspace.WORKSPACE_ROOT, path.resolve(process.cwd(), 'workspace'))
            const userDir = workspace.getUserWorkspace('254743982206')
            const probe = path.join(userDir, 'fallback-check.txt')
            fs.writeFileSync(probe, 'ok')
            assert.equal(fs.readFileSync(probe, 'utf8'), 'ok')
            console.log('WORKSPACE_FALLBACK_OK')
        `
        const output = execFileSync(process.execPath, ['-e', script], {
            cwd: appDir,
            env: { ...process.env, BERA_WORKSPACE: invalidRoot },
            encoding: 'utf8'
        })
        assert.match(output, /WORKSPACE_FALLBACK_OK/)
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true })
    }
})
