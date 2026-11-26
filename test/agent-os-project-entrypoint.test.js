'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

test('Agent OS rejects projects without a valid root application entrypoint', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bera-agent-entrypoint-'))
    const repoRoot = path.resolve(__dirname, '..')
    const script = `
        const assert = require('node:assert/strict')
        const fs = require('node:fs')
        const path = require('node:path')
        const agentOs = require(${JSON.stringify(path.join(repoRoot, 'Library/actions/agent-os.js'))})
        const root = ${JSON.stringify(tempRoot)}

        ;(async () => {
            const nested = path.join(root, 'nested-only')
            fs.mkdirSync(path.join(nested, 'project', 'src'), { recursive: true })
            fs.writeFileSync(path.join(nested, 'project', 'src', 'index.js'), 'placeholder application source')
            fs.mkdirSync(path.join(nested, 'project_root', 'src'), { recursive: true })
            fs.writeFileSync(path.join(nested, 'project_root', 'src', 'main.py'), 'placeholder python source')
            const nestedRecord = { id: 'nested-only', dir: nested }
            const nestedResult = await agentOs.validate(nestedRecord)
            assert.equal(nestedResult.success, false)
            assert.equal(nestedResult.checks[0].name, 'project-entrypoint')
            assert.equal(nestedResult.checks[0].success, false)
            assert.match(nestedResult.checks[0].output, /No runnable application entrypoint/)
            assert.equal(nestedRecord.status, 'validation_failed')

            const invalidJs = path.join(root, 'invalid-js')
            fs.mkdirSync(invalidJs, { recursive: true })
            fs.writeFileSync(path.join(invalidJs, 'index.js'), 'placeholder application source')
            const invalidJsResult = await agentOs.validate({ id: 'invalid-js', dir: invalidJs })
            assert.equal(invalidJsResult.success, false)
            assert.equal(invalidJsResult.checks[1].name, 'javascript-syntax')
            assert.equal(invalidJsResult.checks[1].success, false)

            const staticSite = path.join(root, 'static-site')
            fs.mkdirSync(staticSite, { recursive: true })
            fs.writeFileSync(path.join(staticSite, 'index.html'), '<!doctype html><html><head><title>Example</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>@media (max-width: 860px){ main{padding:8px} }</style></head><body><main><h1>Hello</h1></main></body></html>')
            const staticResult = await agentOs.validate({ id: 'static-site', dir: staticSite })
            assert.equal(staticResult.success, true)
            assert.equal(staticResult.checks[0].name, 'project-entrypoint')
            console.log('AGENT_OS_PROJECT_ENTRYPOINT_OK')
        })().catch(error => { console.error(error); process.exitCode = 1 })
    `

    try {
        const output = execFileSync(process.execPath, ['-e', script], {
            cwd: repoRoot,
            env: { ...process.env, BERA_AGENT_STATE_FILE: path.join(tempRoot, 'state.json') },
            encoding: 'utf8'
        })
        assert.match(output, /AGENT_OS_PROJECT_ENTRYPOINT_OK/)
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true })
    }
})
