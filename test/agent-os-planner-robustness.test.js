'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const runScript = (scriptBody) => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bera-agent-robust-'))
    const repoRoot = path.resolve(__dirname, '..')
    const script = `
        const fs = require('node:fs')
        const agentOs = require(${JSON.stringify(path.join(repoRoot, 'Library/actions/agent-os.js'))})
        const xcasper = require(${JSON.stringify(path.join(repoRoot, 'Library/actions/xcasper.js'))})
        const dir = ${JSON.stringify(path.join(tempRoot, 'project'))}
        fs.mkdirSync(dir, { recursive: true })
        ;(async () => {
            ${scriptBody}
        })().catch(error => { console.error(error); process.exitCode = 1 })
    `
    try {
        return execFileSync(process.execPath, ['-e', script], {
            cwd: repoRoot,
            env: { ...process.env, BERA_AGENT_STATE_FILE: path.join(tempRoot, 'state.json') },
            encoding: 'utf8'
        })
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true })
    }
}

test('an unknown planner action is skipped, not fatal', () => {
    const output = runScript(`
        const assert = require('node:assert/strict')
        const record = { id: 't1', name: 't1', dir, task: 'build a site and send a screenshot' }
        const executed = await agentOs.executeStep(record, { action: 'download_screenshot' }, { allowShell: false })
        assert.equal(executed.success, true)
        assert.match(executed.output, /Skipped unknown planner action: download_screenshot/)
        console.log('UNKNOWN_ACTION_SKIPPED_OK')
    `)
    assert.match(output, /UNKNOWN_ACTION_SKIPPED_OK/)
})

test('an empty plan is regenerated once instead of failing outright', () => {
    const output = runScript(`
        const assert = require('node:assert/strict')
        let calls = 0
        xcasper.chat = async () => {
            calls++
            if (calls === 1) return { success: true, provider: 'test', text: JSON.stringify({ summary: 'empty', steps: [] }) }
            return { success: true, provider: 'test', text: JSON.stringify({ steps: [{ action: 'write_file', path: 'index.html', brief: 'A complete one-page coffee shop site.' }] }) }
        }
        const record = { id: 't2', name: 't2', dir, task: 'build a coffee shop website' }
        const planned = await agentOs.makePlan(record, record.task)
        assert.equal(planned.success, true, planned.error)
        assert.equal(planned.plan.steps.length, 1)
        assert.equal(planned.plan.steps[0].action, 'write_file')
        console.log('EMPTY_PLAN_REGENERATED_OK calls=' + calls)
    `)
    assert.match(output, /EMPTY_PLAN_REGENERATED_OK/)
})

test('a corrupted repair write is regenerated clean instead of failing the step', () => {
    const output = runScript(`
        const assert = require('node:assert/strict')
        xcasper.chat = async () => ({ success: true, provider: 'test', text: 'const ok = 1\\nmodule.exports = ok\\n' })
        const record = { id: 't3', name: 't3', dir, task: 'build a small node server' }
        const bad = Buffer.from('broken \\uFFFD content', 'utf8').toString('base64')
        const executed = await agentOs.executeStep(record, { action: 'write_file', path: 'server.js', contentBase64: bad }, { allowShell: false })
        assert.equal(executed.success, true, executed.output)
        const written = fs.readFileSync(dir + '/server.js', 'utf8')
        assert.ok(!written.includes('\\uFFFD'), 'written file must be clean')
        assert.match(written, /module\\.exports/)
        console.log('CORRUPT_WRITE_REGENERATED_OK')
    `)
    assert.match(output, /CORRUPT_WRITE_REGENERATED_OK/)
})

test('reconcileEntrypoint repoints package.json at the entrypoint that exists', () => {
    const output = runScript(`
        const assert = require('node:assert/strict')
        fs.mkdirSync(dir + '/src', { recursive: true })
        fs.writeFileSync(dir + '/src/app.js', 'const x = 1\\n')
        fs.writeFileSync(dir + '/package.json', JSON.stringify({ name: 'x', scripts: { start: 'node app.js' } }))
        const record = { id: 't4', name: 't4', dir, task: 'site' }
        const fixed = agentOs.reconcileEntrypoint(record)
        assert.equal(fixed, 'src/app.js')
        const pkg = JSON.parse(fs.readFileSync(dir + '/package.json', 'utf8'))
        assert.equal(pkg.scripts.start, 'node src/app.js')
        assert.equal(pkg.main, 'src/app.js')
        // and it is a no-op once the target exists
        assert.equal(agentOs.reconcileEntrypoint(record), null)
        console.log('ENTRYPOINT_RECONCILED_OK')
    `)
    assert.match(output, /ENTRYPOINT_RECONCILED_OK/)
})

test('reconcileEntrypoint ignores a same-named static asset under public/', () => {
    const output = runScript(`
        const assert = require('node:assert/strict')
        fs.mkdirSync(dir + '/src', { recursive: true })
        fs.mkdirSync(dir + '/public/js', { recursive: true })
        fs.writeFileSync(dir + '/public/js/app.js', 'console.log("frontend")\\n')
        fs.writeFileSync(dir + '/src/app.js', 'const http = require("http")\\nhttp.createServer(() => {}).listen(3000)\\n')
        fs.writeFileSync(dir + '/package.json', JSON.stringify({ name: 'x', scripts: { start: 'node app.js' } }))
        const record = { id: 't5', name: 't5', dir, task: 'site' }
        assert.equal(agentOs.reconcileEntrypoint(record), 'src/app.js')
        console.log('PUBLIC_NAMESAKE_IGNORED_OK')
    `)
    assert.match(output, /PUBLIC_NAMESAKE_IGNORED_OK/)
})

test('a plan returned under an alternate key is normalised to steps', () => {
    const output = runScript(`
        const assert = require('node:assert/strict')
        xcasper.chat = async () => ({ success: true, provider: 'test', text: JSON.stringify({ plan: [{ action: 'write_file', path: 'index.html', brief: 'A coffee shop page.' }] }) })
        const record = { id: 't6', name: 't6', dir, task: 'build a coffee shop website' }
        const planned = await agentOs.makePlan(record, record.task)
        assert.equal(planned.success, true, planned.error)
        assert.equal(planned.plan.steps.length, 1)
        console.log('ALT_KEY_PLAN_OK')
    `)
    assert.match(output, /ALT_KEY_PLAN_OK/)
})

test('two empty plans in a row fall back to a deterministic website plan', () => {
    const output = runScript(`
        const assert = require('node:assert/strict')
        xcasper.chat = async () => ({ success: true, provider: 'test', text: JSON.stringify({ summary: 'none', steps: [] }) })
        const record = { id: 't7', name: 't7', dir, task: 'build a one-page website for a coffee shop with a menu' }
        const planned = await agentOs.makePlan(record, record.task)
        assert.equal(planned.success, true, planned.error)
        assert.equal(planned.plan.planFallback, true)
        assert.equal(planned.plan.steps.length, 1)
        assert.equal(planned.plan.steps[0].path, 'index.html')
        console.log('FALLBACK_PLAN_OK')
    `)
    assert.match(output, /FALLBACK_PLAN_OK/)
})

test('mkdir for a file-like path is skipped and an empty dir does not block a write', () => {
    const output = runScript(`
        const assert = require('node:assert/strict')
        const record = { id: 't8', name: 't8', dir, task: 'site' }
        const mk = await agentOs.executeStep(record, { action: 'mkdir', path: 'src/public/style.css' }, {})
        assert.equal(mk.success, true)
        assert.equal(fs.existsSync(dir + '/src/public/style.css'), false)
        fs.mkdirSync(dir + '/src/public/style.css', { recursive: true })
        const wr = await agentOs.executeStep(record, { action: 'write_file', path: 'src/public/style.css', content: 'body{color:red}' }, {})
        assert.equal(wr.success, true, wr.output)
        assert.equal(fs.readFileSync(dir + '/src/public/style.css', 'utf8'), 'body{color:red}')
        console.log('FILELIKE_MKDIR_OK')
    `)
    assert.match(output, /FILELIKE_MKDIR_OK/)
})
