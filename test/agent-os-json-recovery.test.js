'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

test('Agent OS extracts fenced plans and recovers once from malformed planner JSON', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bera-agent-json-'))
    const repoRoot = path.resolve(__dirname, '..')
    const script = `
        const assert = require('node:assert/strict')
        const fs = require('node:fs')
        const agentOs = require(${JSON.stringify(path.join(repoRoot, 'Library/actions/agent-os.js'))})
        const xcasper = require(${JSON.stringify(path.join(repoRoot, 'Library/actions/xcasper.js'))})
        const root = ${JSON.stringify(tempRoot)}
        const replies = [
            { success: true, provider: 'deepseek', text: 'Plan:\\n\\x60\\x60\\x60json\\n{"summary":"fenced plan","steps":[{"action":"mkdir","path":"public"}]}\\n\\x60\\x60\\x60' },
            { success: true, provider: 'deepseek', text: '{"summary":"broken plan","steps":[{"action":"mkdir","path":"src",}]}' },
            { success: true, provider: 'publicai', text: "{ summary: 'repaired plan', steps: [{ action: 'mkdir', path: 'src', },], }" }
        ]
        const calls = []
        xcasper.chat = async (messages, options) => {
            calls.push(messages)
            await options.onProviderProgress({ provider: 'deepseek', index: 0, total: 4, stage: 'success' })
            return replies.shift()
        }
        const makeRecord = (id, dir) => {
            fs.mkdirSync(dir, { recursive: true })
            return { id, name: id, dir, task: 'create a project' }
        }
        ;(async () => {
            const firstEvents = []
            const first = await agentOs.makePlan(makeRecord('fenced', root + '/fenced'), 'create a project', { onProgress: e => firstEvents.push(e) })
            assert.equal(first.success, true)
            assert.equal(first.plan.summary, 'fenced plan')
            assert.equal(calls.length, 1, 'valid fenced JSON should not trigger recovery')
            assert.equal(firstEvents.at(-1).phase, 'planning_complete')

            const secondEvents = []
            const second = await agentOs.makePlan(makeRecord('recovered', root + '/recovered'), 'create a project', { onProgress: e => secondEvents.push(e) })
            assert.equal(second.success, true, second.error)
            assert.equal(second.plan.summary, 'repaired plan')
            assert.equal(second.plan.steps[0].action, 'mkdir')
            assert.equal(calls.length, 3, 'invalid JSON should trigger exactly one recovery request')
            assert.match(calls[2][0].content, /Repair the malformed planner response/)
            assert.match(calls[2][1].content, /broken plan/)
            assert.ok(secondEvents.some(e => e.phase === 'planner_json_recovery'))
            assert.ok(secondEvents.some(e => e.phase === 'planner_json_local_repair'))
            assert.equal(secondEvents.at(-1).phase, 'planning_complete')
            console.log('AGENT_OS_JSON_RECOVERY_OK')
        })().catch(error => { console.error(error); process.exitCode = 1 })
    `

    try {
        const output = execFileSync(process.execPath, ['-e', script], {
            cwd: repoRoot,
            env: { ...process.env, BERA_AGENT_STATE_FILE: path.join(tempRoot, 'state.json') },
            encoding: 'utf8'
        })
        assert.match(output, /AGENT_OS_JSON_RECOVERY_OK/)
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true })
    }
})
