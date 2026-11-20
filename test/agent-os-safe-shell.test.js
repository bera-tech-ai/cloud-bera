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
        fs.writeFileSync(npmPath, '#!/usr/bin/env node\\nrequire("node:fs").writeFileSync(process.env.BERA_NPM_ARGS_FILE, process.argv.slice(2).join(String.fromCharCode(10)) + String.fromCharCode(10))\\n')
        fs.chmodSync(npmPath, 0o755)
        process.env.PATH = bin + path.delimiter + process.env.PATH
        process.env.BERA_NPM_ARGS_FILE = argsFile
        ;(async () => {
            const record = { dir: projectDir }
            const result = await agentOs.executeStep(record, { action: 'shell', command: 'npm install --save-dev vite' })
            assert.equal(result.success, true, result.output)
            assert.equal(fs.readFileSync(argsFile, 'utf8'), 'install\\n--save-dev\\nvite\\n')

            const rejected = await agentOs.executeStep(record, { action: 'shell', command: 'npm install vite && git push' })
            assert.equal(rejected.success, false)
            assert.match(rejected.output, /requires allowShell=true/)
            assert.equal(fs.readFileSync(argsFile, 'utf8'), 'install\\n--save-dev\\nvite\\n', 'rejected chained command must not run')

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
