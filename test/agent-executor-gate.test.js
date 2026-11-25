'use strict'

// Phase 1 executor-gate tests — Library/actions/agent.js executeStep().
// Follows the existing test style (test/agent-os-safe-shell.test.js): the
// assertions run in a child node process so the bot modules load isolated.
//
// Requires axios to be resolvable (agent.js -> xcasper/web-search -> axios).
// In CI that comes from `npm install`; locally, run with NODE_PATH pointing
// at an axios install, e.g.:
//   npm install axios --prefix /tmp/bera-test-deps --no-audit --no-fund
//   NODE_PATH=/tmp/bera-test-deps/node_modules node --test test/agent-executor-gate.test.js
//
// Run: node --test test/agent-executor-gate.test.js

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

test('generic agent executor is owner/sudo-only, contained and credential-free', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bera-agent-gate-'))
    const repoRoot = path.resolve(__dirname, '..')
    const script = `
        const assert = require('node:assert/strict')
        const fs = require('node:fs')
        const path = require('node:path')
        const os = require('node:os')
        process.env.BERA_WORKSPACE = ${JSON.stringify(path.join(tempRoot, 'ws'))}
        // Credentials that must never reach a child process.
        process.env.BERA_GATE_TEST_API_KEY = 'leak-me'
        process.env.DATABASE_URL = 'postgres://user:pass@host/db'
        process.env.GH_TOKEN = 'leak-me'
        // Public mode, no sudo users: only the owner (Config.owner) passes.
        global.db = { data: { settings: { mode: 'public', sudo: [] } } }
        const agent = require(${JSON.stringify(path.join(repoRoot, 'Library/actions/agent.js'))})
        const { getUserWorkspace } = require(${JSON.stringify(path.join(repoRoot, 'Library/lib/workspace.js'))})
        const owner = { sender: '254116763755@s.whatsapp.net' }
        const stranger = { sender: '254700000001@s.whatsapp.net' }
        const chat = '254116763755@s.whatsapp.net'
        const ownerOpts = { userId: '254116763755' }
        const strangerOpts = { userId: '254700000001' }
        ;(async () => {
            // 1. Non-owner shell attempt is rejected before any execution.
            let r = await agent.executeStep({ action: 'shell', args: { cmd: 'node --version' }, desc: 't' }, null, chat, stranger, strangerOpts)
            assert.equal(r.success, false, 'non-owner shell must be rejected')
            assert.match(r.output, /owner or an approved sudo/i)

            // 2. Owner allowlisted shell command passes.
            r = await agent.executeStep({ action: 'shell', args: { cmd: 'node --version' }, desc: 't' }, null, chat, owner, ownerOpts)
            assert.equal(r.success, true, r.output)
            assert.match(r.output, /v\\d+\\.\\d+\\.\\d+/)

            // 3. Owner non-allowlisted shell command is rejected, not run.
            r = await agent.executeStep({ action: 'shell', args: { cmd: 'curl https://example.com' }, desc: 't' }, null, chat, owner, ownerOpts)
            assert.equal(r.success, false)
            assert.match(r.output, /not allowlisted/)

            // 4. Non-owner js_eval / run_code are rejected at the executor.
            r = await agent.executeStep({ action: 'js_eval', args: { code: '1 + 1' }, desc: 't' }, null, chat, stranger, strangerOpts)
            assert.equal(r.success, false, 'non-owner js_eval must be rejected')
            assert.match(r.output, /owner or an approved sudo/i)
            r = await agent.executeStep({ action: 'run_code', args: { code: 'print(1)', lang: 'python' }, desc: 't' }, null, chat, stranger, strangerOpts)
            assert.equal(r.success, false, 'non-owner run_code must be rejected')
            assert.match(r.output, /owner or an approved sudo/i)

            // 5. Owner js_eval runs, but its child env holds no credentials.
            r = await agent.executeStep({ action: 'js_eval', args: { code: 'Object.keys(process.env).join(",")' }, desc: 't' }, null, chat, owner, ownerOpts)
            assert.equal(r.success, true, r.output)
            assert.doesNotMatch(r.output, /BERA_GATE_TEST_API_KEY/)
            assert.doesNotMatch(r.output, /DATABASE_URL/)
            assert.doesNotMatch(r.output, /GH_TOKEN/)
            r = await agent.executeStep({ action: 'js_eval', args: { code: '1 + 1' }, desc: 't' }, null, chat, owner, ownerOpts)
            assert.equal(r.success, true, r.output)
            assert.equal(r.output.trim(), '2')

            // 6. Absolute-path escape is rejected and nothing is written.
            const escapePath = path.join(os.tmpdir(), 'bera-gate-escape-outside.txt')
            try { fs.unlinkSync(escapePath) } catch {}
            r = await agent.executeStep({ action: 'file_write', args: { path: escapePath, content: 'pwned' }, desc: 't' }, null, chat, owner, ownerOpts)
            assert.equal(r.success, false, 'absolute path outside the workspace must be rejected')
            assert.match(r.output, /outside your workspace/)
            assert.equal(fs.existsSync(escapePath), false, 'escaped write must not create the file')
            r = await agent.executeStep({ action: 'file_write', args: { path: '../../escape.txt', content: 'pwned' }, desc: 't' }, null, chat, owner, ownerOpts)
            assert.equal(r.success, false)
            assert.match(r.output, /outside your workspace/)

            // 7. Relative write lands inside the owner's workspace.
            r = await agent.executeStep({ action: 'file_write', args: { path: 'gate-test.txt', content: 'hello' }, desc: 't' }, null, chat, owner, ownerOpts)
            assert.equal(r.success, true, r.output)
            assert.equal(fs.readFileSync(path.join(getUserWorkspace('254116763755'), 'gate-test.txt'), 'utf8'), 'hello')

            // 8. multi_shell with one rejected command runs nothing at all.
            const markerScript = path.join(getUserWorkspace('254116763755'), 'write-marker.js')
            const markerFile = path.join(getUserWorkspace('254116763755'), 'marker.txt')
            fs.writeFileSync(markerScript, 'require("node:fs").writeFileSync(' + JSON.stringify(markerFile) + ', "ran")\\n')
            r = await agent.executeStep({ action: 'multi_shell', args: { commands: [
                { cmd: 'node write-marker.js', desc: 'write marker', required: true },
                { cmd: 'rm -rf /', desc: 'bad command', required: true }
            ] }, desc: 't' }, null, chat, owner, ownerOpts)
            assert.equal(r.success, false, 'multi_shell with a rejected command must fail')
            assert.match(r.output, /rejected/i)
            assert.equal(fs.existsSync(markerFile), false, 'rejected multi_shell must not have run its first command')

            // 9. Non-owner multi_shell is rejected at the executor.
            r = await agent.executeStep({ action: 'multi_shell', args: { commands: [{ cmd: 'node --version', desc: 'v', required: true }] }, desc: 't' }, null, chat, stranger, strangerOpts)
            assert.equal(r.success, false)
            assert.match(r.output, /owner or an approved sudo/i)

            console.log('AGENT_EXECUTOR_GATE_OK')
        })().catch(error => { console.error(error); process.exitCode = 1 })
    `

    try {
        const output = execFileSync(process.execPath, ['-e', script], {
            cwd: repoRoot,
            env: { ...process.env, NODE_PATH: process.env.NODE_PATH || '' },
            encoding: 'utf8'
        })
        assert.match(output, /AGENT_EXECUTOR_GATE_OK/)
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true })
    }
})
