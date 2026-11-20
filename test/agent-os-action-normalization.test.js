'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

test('Agent OS separates comma-combined mkdir action and relative path', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bera-agent-action-normalize-'))
    const repoRoot = path.resolve(__dirname, '..')
    const script = `
        const assert = require('node:assert/strict')
        const fs = require('node:fs')
        const path = require('node:path')
        const agentOs = require(${JSON.stringify(path.join(repoRoot, 'Library/actions/agent-os.js'))})
        const xcasper = require(${JSON.stringify(path.join(repoRoot, 'Library/actions/xcasper.js'))})
        const root = ${JSON.stringify(tempRoot)}
        const dir = path.join(root, 'project')
        fs.mkdirSync(dir, { recursive: true })
        xcasper.chat = async () => ({
            success: true,
            provider: 'deepseek',
            text: JSON.stringify({ steps: [
                { action: 'mkdir,kijani-coffee-site' },
                { action: 'write_file|mkdir', path: 'index.html', contentBase64: Buffer.from('<h1>Kijani</h1>').toString('base64') },
                { action: 'write_file|mkdir', path: 'assets' }
            ] })
        })
        ;(async () => {
            const record = { id: 'mkdir-normalize-test', name: 'mkdir-normalize-test', dir, task: 'create a project' }
            const planned = await agentOs.makePlan(record, record.task)
            assert.equal(planned.success, true, planned.error)
            assert.equal(planned.plan.steps[0].action, 'mkdir')
            assert.equal(planned.plan.steps[0].path, 'kijani-coffee-site')
            assert.equal(planned.plan.steps[1].action, 'write_file')
            assert.equal(planned.plan.steps[2].action, 'mkdir')

            const executed = await agentOs.executeStep(record, planned.plan.steps[0])
            assert.equal(executed.success, true)
            assert.equal(fs.existsSync(path.join(dir, 'kijani-coffee-site')), true)
            assert.equal(fs.existsSync(path.join(root, 'kijani-coffee-site')), false)
            const written = await agentOs.executeStep(record, planned.plan.steps[1])
            assert.equal(written.success, true)
            assert.equal(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), '<h1>Kijani</h1>')
            const folder = await agentOs.executeStep(record, planned.plan.steps[2])
            assert.equal(folder.success, true)
            assert.equal(fs.existsSync(path.join(dir, 'assets')), true)
            const blocked = await agentOs.executeStep(record, { action: 'mkdir', path: '../outside-project' })
            assert.equal(blocked.success, false)
            assert.match(blocked.output, /Blocked path outside project workspace/)
            assert.equal(fs.existsSync(path.join(root, 'outside-project')), false)
            console.log('AGENT_OS_ACTION_NORMALIZE_OK')
        })().catch(error => { console.error(error); process.exitCode = 1 })
    `

    try {
        const output = execFileSync(process.execPath, ['-e', script], {
            cwd: repoRoot,
            env: { ...process.env, BERA_AGENT_STATE_FILE: path.join(tempRoot, 'state.json') },
            encoding: 'utf8'
        })
        assert.match(output, /AGENT_OS_ACTION_NORMALIZE_OK/)
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true })
    }
})
