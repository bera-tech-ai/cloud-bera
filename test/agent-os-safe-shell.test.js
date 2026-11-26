'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

test('Agent OS safely runs allowlisted package-manager plan steps without general shell access', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bera-agent-safe-shell-'))
    const repoRoot = path.resolve(__dirname, '..')
    const script = `
        const assert = require('node:assert/strict')
        const fs = require('node:fs')
        const path = require('node:path')
        const agentOs = require(${JSON.stringify(path.join(repoRoot, 'Library/actions/agent-os.js'))})
        const root = ${JSON.stringify(tempRoot)}
        const bin = path.join(root, 'bin')
        const projectDir = path.join(root, 'project')
        const argsFile = path.join(root, 'npm-args.txt')
        fs.mkdirSync(bin, { recursive: true })
        fs.mkdirSync(projectDir, { recursive: true })
        const npmPath = path.join(bin, 'npm')
        fs.writeFileSync(npmPath, '#!/usr/bin/env node\\nrequire("node:fs").writeFileSync(process.env.BERA_NPM_ARGS_FILE, JSON.stringify({ args: process.argv.slice(2), registry: process.env.npm_config_registry }))\\n')
        fs.chmodSync(npmPath, 0o755)
        process.env.PATH = bin + path.delimiter + process.env.PATH
        process.env.BERA_NPM_ARGS_FILE = argsFile
        process.env.npm_config_registry = 'http://package-firewall.replit.internal/npm/'
        ;(async () => {
            const record = { dir: projectDir }
            const result = await agentOs.executeStep(record, { action: 'shell', command: 'npm install --save-dev vite' })
            assert.equal(result.success, true, result.output)
            let invocation = JSON.parse(fs.readFileSync(argsFile, 'utf8'))
            assert.deepEqual(invocation.args, ['install', '--save-dev', 'vite', '--registry=https://registry.npmjs.org/'])
            assert.equal(invocation.registry, 'https://registry.npmjs.org/')

            fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'registry-test', scripts: { start: 'node index.js' } }))
            fs.writeFileSync(path.join(projectDir, 'index.js'), 'require("node:http").createServer((req, res) => { res.writeHead(200, { "content-type": "text/plain" }); res.end("ok") }).listen(Number(process.env.PORT) || 3000)\\n')
            const validation = await agentOs.validate(record)
            assert.equal(validation.success, true)
            invocation = JSON.parse(fs.readFileSync(argsFile, 'utf8'))
            assert.deepEqual(invocation.args, ['install', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org/'])
            assert.equal(invocation.registry, 'https://registry.npmjs.org/')

            const skippedTest = await agentOs.executeStep(record, { action: 'shell', command: 'npm test' })
            assert.equal(skippedTest.success, true)
            assert.match(skippedTest.output, /test script not defined; skipped/)
            assert.deepEqual(JSON.parse(fs.readFileSync(argsFile, 'utf8')).args, ['install', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org/'], 'missing test script must not invoke npm')

            const rejected = await agentOs.executeStep(record, { action: 'shell', command: 'npm install vite && git push' })
            assert.equal(rejected.success, false)
            assert.match(rejected.output, /requires allowShell=true/)
            assert.deepEqual(JSON.parse(fs.readFileSync(argsFile, 'utf8')).args, ['install', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org/'], 'rejected chained command must not run')

            const progress = []
            const skipped = await agentOs.executeStep(record, { action: 'shell', command: 'npm install vite && git push' }, {
                skipUnapprovedShell: true,
                onProgress: event => progress.push(event)
            })
            assert.equal(skipped.success, true)
            assert.match(skipped.output, /Skipped an unapproved planner shell command/)
            assert.equal(progress[0].phase, 'shell_skipped')
            assert.deepEqual(JSON.parse(fs.readFileSync(argsFile, 'utf8')).args, ['install', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org/'], 'skipped chained command must not run')

            assert.equal(agentOs.safePackageManagerCommand('git push'), null)
            assert.equal(agentOs.safePackageManagerCommand('node -e process.exit(1)'), null)
            console.log('AGENT_OS_SAFE_SHELL_OK')
        })().catch(error => { console.error(error); process.exitCode = 1 })
    `

    try {
        const output = execFileSync(process.execPath, ['-e', script], {
            cwd: repoRoot,
            env: { ...process.env, BERA_AGENT_STATE_FILE: path.join(tempRoot, 'state.json') },
            encoding: 'utf8'
        })
        assert.match(output, /AGENT_OS_SAFE_SHELL_OK/)
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true })
    }
})
