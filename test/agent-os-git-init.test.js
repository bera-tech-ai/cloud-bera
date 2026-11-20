'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

test('Agent OS defers a planner git init step to its local checkpoint', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bera-agent-git-init-'))
    const repoRoot = path.resolve(__dirname, '..')
    const script = `
        const assert = require('node:assert/strict')
        const fs = require('node:fs')
        const agentOs = require(${JSON.stringify(path.join(repoRoot, 'Library/actions/agent-os.js'))})
        const xcasper = require(${JSON.stringify(path.join(repoRoot, 'Library/actions/xcasper.js'))})
        const dir = ${JSON.stringify(path.join(tempRoot, 'project'))}
        fs.mkdirSync(dir, { recursive: true })
        xcasper.chat = async () => ({
            success: true,
            provider: 'deepseek',
            text: JSON.stringify({ steps: [{ action: 'git init', reason: 'initialize the local repository' }] })
        })
        ;(async () => {
            const record = { id: 'git-init-test', name: 'git-init-test', dir, task: 'create a project' }
            const planned = await agentOs.makePlan(record, record.task)
            assert.equal(planned.success, true, planned.error)
            assert.equal(planned.plan.steps[0].action, 'git_init')

            const executed = await agentOs.executeStep(record, planned.plan.steps[0], { allowShell: false })
            assert.equal(executed.success, true)
            assert.match(executed.output, /Deferred git init/)
            assert.equal(fs.existsSync(dir + '/.git'), false, 'the planner step must not initialize git before validation')
            console.log('AGENT_OS_GIT_INIT_OK')
        })().catch(error => { console.error(error); process.exitCode = 1 })
    `

    try {
        const output = execFileSync(process.execPath, ['-e', script], {
            cwd: repoRoot,
            env: { ...process.env, BERA_AGENT_STATE_FILE: path.join(tempRoot, 'state.json') },
            encoding: 'utf8'
        })
        assert.match(output, /AGENT_OS_GIT_INIT_OK/)
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true })
    }
})
