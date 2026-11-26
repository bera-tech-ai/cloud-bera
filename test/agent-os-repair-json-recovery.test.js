'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

test('Agent OS recovers repair plans with missing JSON and retries boundedly', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bera-repair-json-recovery-'))
    const repoRoot = path.resolve(__dirname, '..')
    const workspace = path.join(tempRoot, 'workspace')
    const script = `
        const assert = require('node:assert/strict')
        const fs = require('node:fs')
        const path = require('node:path')
        const root = ${JSON.stringify(tempRoot)}
        const agentOs = require(${JSON.stringify(path.join(repoRoot, 'Library/actions/agent-os.js'))})
        const xcasper = require(${JSON.stringify(path.join(repoRoot, 'Library/actions/xcasper.js'))})
        const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>@media (max-width: 860px){ main{padding:8px} }</style></head><body><main><h1>Kijani Coffee sample</h1></main></body></html>'
        const rootRepair = { steps: [{ action: 'write_file', path: 'index.html', contentBase64: Buffer.from(html).toString('base64') }], reason: 'Write a complete root app entrypoint' }
        const noEntrypointPlan = { steps: [{ action: 'mkdir', path: 'src' }], summary: 'Initial nested-only structure' }
        const responses = [
            { json: noEntrypointPlan },
            { text: 'I will repair the project now.' },
            { json: rootRepair },
            { json: noEntrypointPlan },
            { text: 'Repair instructions acknowledged, but no JSON object follows.' },
            { text: 'Still no valid JSON object.' },
            { json: rootRepair },
            { json: noEntrypointPlan },
            { text: 'No JSON in this response.' },
            { text: 'No JSON in this formatter response.' },
            { text: 'No JSON in this regenerated repair response.' },
            { json: rootRepair },
            { json: noEntrypointPlan },
            { json: { steps: [
                { action: 'npm install' },
                { action: 'mkdir', path: 'assets' },
                ...rootRepair.steps
            ], reason: 'Create root entrypoint and its asset directory' } },
            { json: noEntrypointPlan },
            { json: { steps: [
                ...Array.from({ length: 6 }, () => ({ action: 'test' })),
                { action: 'deploy' },
                ...rootRepair.steps
            ], reason: 'Ignore external deploy request and finish local root entrypoint repair' } },
            { json: noEntrypointPlan },
            { json: { steps: [{ action: 'mkdir', path: 'project/src' }], reason: 'Repair the nested structure' } }
        ]
        let calls = 0
        xcasper.chat = async () => {
            calls++
            const next = responses.shift()
            if (!next) throw new Error('Unexpected repair planner request')
            return { success: true, text: next.text || JSON.stringify(next.json) }
        }
        const runSample = async (projectId, phaseList, config = {}) => {
            const userId = 'repair-json-user'
            const projectDir = path.join(root, 'workspace', userId, 'projects', projectId)
            const result = await agentOs.run({
                action: 'run', userId, projectId, name: projectId, projectDir,
                task: config.task || 'Create a small Kijani Coffee static website', maxRepairs: 2,
                onProgress: progress => phaseList.push(progress.phase)
            })
            assert.equal(result.success, true, result.error || JSON.stringify(result.validation?.checks))
            assert.equal(result.validation.success, true)
            if (config.expectOriginalHtml !== false) assert.equal(fs.readFileSync(path.join(projectDir, 'index.html'), 'utf8'), html)
            return result
        }
        ;(async () => {
            const correctionPhases = []
            const corrected = await runSample('repair-format-correction', correctionPhases)
            assert.ok(correctionPhases.includes('repair_json_recovery'))
            assert.equal(corrected.record.repairs.length, 1)

            const regenerationPhases = []
            const regenerated = await runSample('repair-fresh-regeneration', regenerationPhases)
            assert.ok(regenerationPhases.includes('repair_json_regeneration'))
            assert.equal(regenerated.record.repairs.length, 1)

            const retryPhases = []
            const retried = await runSample('repair-bounded-retry', retryPhases)
            assert.ok(retryPhases.filter(phase => phase === 'repair').length >= 2)
            assert.equal(retried.record.repairs.length, 1)

            const actionPhases = []
            const actionNormalized = await runSample('repair-mkdir-supported', actionPhases)
            assert.equal(actionNormalized.record.repairs.length, 1)
            assert.ok(fs.statSync(path.join(root, 'workspace', 'repair-json-user', 'projects', 'repair-mkdir-supported', 'assets')).isDirectory())
            const deployPhases = []
            const deployIgnored = await runSample('repair-deploy-ignored', deployPhases)
            assert.ok(deployPhases.includes('repair_external_action_skipped'))
            assert.equal(deployIgnored.record.github, null)
            assert.equal(deployIgnored.record.deployment, undefined)
            const fallbackPhases = []
            const fallbackTask = 'Build a personal portfolio called Zakayo’s Portfolio. Include a welcome section, About Me, three sample projects, and Contact details.'
            const fallback = await runSample('zakayo-s-portfolio', fallbackPhases, { expectOriginalHtml: false, task: fallbackTask })
            assert.ok(fallbackPhases.includes('repair_root_entrypoint_fallback'))
            assert.equal(fallback.record.repairs.length, 1)
            const fallbackHtml = fs.readFileSync(path.join(root, 'workspace', 'repair-json-user', 'projects', 'zakayo-s-portfolio', 'index.html'), 'utf8')
            assert.match(fallbackHtml, /<!doctype html>/i)
            assert.match(fallbackHtml, /<main/i)
            assert.match(fallbackHtml, /Hi, I’m Zakayo/i)
            assert.match(fallbackHtml, /About Me/i)
            assert.match(fallbackHtml, /Project Three/i)
            assert.match(fallbackHtml, /Contact/i)
            assert.equal(calls, 18)
            console.log('REPAIR_JSON_RECOVERY_OK')
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
        assert.match(output, /REPAIR_JSON_RECOVERY_OK/)
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true })
    }
})
