'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

test('Agent OS repair writes a root entrypoint when the planner returns an action alternatives list', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bera-agent-repair-'))
    const repoRoot = path.resolve(__dirname, '..')
    const workspace = path.join(tempRoot, 'workspace')
    const script = `
        const assert = require('node:assert/strict')
        const fs = require('node:fs')
        const path = require('node:path')
        const root = ${JSON.stringify(tempRoot)}
        const agentOs = require(${JSON.stringify(path.join(repoRoot, 'Library/actions/agent-os.js'))})
        const xcasper = require(${JSON.stringify(path.join(repoRoot, 'Library/actions/xcasper.js'))})
        let calls = 0
        const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>@media (max-width: 860px){ main{padding:8px} }</style></head><body><main><h1>Local demo</h1></main></body></html>'
        xcasper.chat = async () => {
            calls++
            if (calls === 1 || calls === 3) return { success: true, text: JSON.stringify({ steps: [{ action: 'mkdir', path: 'nested-only' }] }) }
            if (calls === 4) return { success: true, text: JSON.stringify({ steps: [] }) }
            return { success: true, text: JSON.stringify({
                steps: [{ action: 'write_file|build|test|install', path: 'index.html', contentBase64: Buffer.from(html).toString('base64') }],
                reason: 'Create the missing root website entrypoint'
            }) }
        }
        ;(async () => {
            const projectDir = path.join(root, 'workspace', 'repair-user', 'project')
            const result = await agentOs.run({
                action: 'run', userId: 'repair-user', projectId: 'repair-recovery', name: 'repair-recovery',
                projectDir, task: 'Build a small local website', maxRepairs: 1
            })
            assert.equal(calls, 2)
            assert.equal(result.success, true, result.error || JSON.stringify(result.validation?.checks))
            assert.equal(result.validation.success, true)
            assert.equal(result.record.repairs.length, 1)
            assert.equal(fs.readFileSync(path.join(projectDir, 'index.html'), 'utf8'), html)

            const emptyPlan = await agentOs.run({
                action: 'run', userId: 'repair-user', projectId: 'empty-repair', name: 'empty-repair',
                projectDir: path.join(root, 'workspace', 'repair-user', 'empty-repair'), task: 'Build another small website', maxRepairs: 1
            })
            assert.equal(emptyPlan.success, false)
            assert.match(emptyPlan.error, /Automatic repair failed: Repair planner returned no actionable steps/)
            assert.equal(emptyPlan.record.checkpoint, undefined)
            console.log('AGENT_OS_REPAIR_RECOVERY_OK')
        })().catch(error => { console.error(error); process.exitCode = 1 })
    `

    try {
        const output = execFileSync(process.execPath, ['-e', script], {
            cwd: repoRoot,
            env: {
                ...process.env,
                BERA_WORKSPACE: workspace,
                BERA_AGENT_STATE_FILE: path.join(tempRoot, 'state.json')
            },
            encoding: 'utf8'
        })
        assert.match(output, /AGENT_OS_REPAIR_RECOVERY_OK/)
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true })
    }
})
