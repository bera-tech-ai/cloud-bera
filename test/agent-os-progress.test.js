'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

test('Agent OS emits planning and provider status callbacks before executing steps', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bera-agent-progress-'))
    const repoRoot = path.resolve(__dirname, '..')
    const script = `
        const assert = require('node:assert/strict')
        const fs = require('node:fs')
        const agentOs = require(${JSON.stringify(path.join(repoRoot, 'Library/actions/agent-os.js'))})
        const xcasper = require(${JSON.stringify(path.join(repoRoot, 'Library/actions/xcasper.js'))})
        xcasper.chat = async (messages, options) => {
            await options.onProviderProgress({ provider: 'deepseek', index: 0, total: 4, stage: 'trying' })
            await options.onProviderProgress({ provider: 'deepseek', index: 0, total: 4, stage: 'success' })
            return { success: true, provider: 'deepseek', text: JSON.stringify({ steps: [{ action: 'mkdir', path: 'src' }] }) }
        }
        const dir = ${JSON.stringify(path.join(tempRoot, 'project'))}
        fs.mkdirSync(dir)
        const record = { id: 'progress-test', name: 'progress-test', dir, task: 'create a test app' }
        const events = []
        agentOs.makePlan(record, record.task, { onProgress: event => events.push(event) }).then(result => {
            assert.equal(result.success, true)
            assert.deepEqual(events.map(event => event.phase), ['planning', 'ai_provider', 'ai_provider', 'planning_complete'])
            assert.equal(events[1].stage, 'trying')
            assert.equal(events[2].stage, 'success')
            console.log('AGENT_OS_PROGRESS_OK')
        }).catch(error => { console.error(error); process.exitCode = 1 })
    `

    try {
        const output = execFileSync(process.execPath, ['-e', script], {
            cwd: repoRoot,
            env: { ...process.env, BERA_AGENT_STATE_FILE: path.join(tempRoot, 'state.json') },
            encoding: 'utf8'
        })
        assert.match(output, /AGENT_OS_PROGRESS_OK/)
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true })
    }
})
