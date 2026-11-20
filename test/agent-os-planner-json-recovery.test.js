'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

test('Agent OS regenerates a plan when both AI and local JSON formatting recovery fail', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bera-planner-json-recovery-'))
    const repoRoot = path.resolve(__dirname, '..')
    const workspace = path.join(tempRoot, 'workspace')
    const script = `
        const assert = require('node:assert/strict')
        const fs = require('node:fs')
        const path = require('node:path')
        const root = ${JSON.stringify(tempRoot)}
        const agentOs = require(${JSON.stringify(path.join(repoRoot, 'Library/actions/agent-os.js'))})
        const xcasper = require(${JSON.stringify(path.join(repoRoot, 'Library/actions/xcasper.js'))})
        const html = '<!doctype html><html><body><main><h1>Recovered planner sample</h1></main></body></html>'
        const malformed = '{"summary":"broken plan","steps":[{"action":"mkdir","path":"empty"}], bad}'
        let calls = 0
        xcasper.chat = async () => {
            calls++
            if (calls < 3) return { success: true, text: malformed }
            if (calls === 3) return { success: true, text: JSON.stringify({
                summary: 'Fresh valid plan after format failures',
                steps: [{ action: 'write_file', path: 'index.html', contentBase64: Buffer.from(html).toString('base64') }]
            }) }
            throw new Error('Unexpected planner call')
        }
        ;(async () => {
            const userId = 'json-recovery-user'
            const projectDir = path.join(root, 'workspace', userId, 'projects', 'json-recovery-sample')
            const result = await agentOs.run({
                action: 'run', userId, projectId: 'planner-json-recovery', name: 'json-recovery-sample',
                projectDir, task: 'Create a small sample website', maxRepairs: 0
            })
            assert.equal(calls, 3, 'expected initial plan, format recovery, then fresh-plan retry')
            assert.equal(result.success, true, result.error || JSON.stringify(result.validation?.checks))
            assert.equal(result.validation.success, true)
            assert.equal(fs.readFileSync(path.join(projectDir, 'index.html'), 'utf8'), html)
            console.log('PLANNER_JSON_REGENERATION_OK')
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
        assert.match(output, /PLANNER_JSON_REGENERATION_OK/)
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true })
    }
})
