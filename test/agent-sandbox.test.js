'use strict'

// Phase 1 sandbox tests — Library/lib/agent-sandbox.js only. This module has
// no npm dependencies, so these tests run with plain node (no install step).
// Run: node --test test/agent-sandbox.test.js

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bera-agent-sandbox-test-'))
process.env.BERA_WORKSPACE = path.join(tmpRoot, 'ws')

const sandbox = require('../Library/lib/agent-sandbox')
const { getUserWorkspace } = require('../Library/lib/workspace')

const USER = 'sandbox-test-user'
const userRoot = () => getUserWorkspace(USER)

test.after(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
})

test('validateShellCommand allows only the development allowlist', () => {
    const ok = cmd => {
        const result = sandbox.validateShellCommand(cmd, USER)
        assert.equal(result.error, undefined, `${cmd} should be allowed, got: ${result.error}`)
        return result
    }
    const bad = (cmd, pattern) => {
        const result = sandbox.validateShellCommand(cmd, USER)
        assert.ok(result.error, `${cmd} should be rejected`)
        if (pattern) assert.match(result.error, pattern)
    }

    assert.equal(ok('npm install vite').manager, 'npm')
    assert.deepEqual(ok('npm install vite').args, ['install', 'vite'])
    assert.equal(ok('npm run build').manager, 'npm')
    assert.equal(ok('npm test').manager, 'npm')
    assert.equal(ok('pnpm add react').manager, 'pnpm')
    assert.equal(ok('yarn build').manager, 'yarn')
    assert.equal(ok('git status').manager, 'git')
    assert.equal(ok('git log --oneline').manager, 'git')
    assert.equal(ok('git clone https://github.com/bera-tech-ai/cloud-bera.git').manager, 'git')
    assert.equal(ok('node --version').manager, 'node')
    assert.equal(ok('node app.js').manager, 'node')
    assert.equal(ok('python script.py').manager, 'python')
    assert.equal(ok('python3 -m pytest tests/ -q').manager, 'pytest')
    assert.equal(ok('pytest tests/ -q').manager, 'pytest')

    bad('rm -rf /', /not allowlisted/)
    bad('curl https://example.com', /not allowlisted/)
    bad('npm install vite && git push', /no chaining|Only one allowlisted/)
    bad('npm install vite; git push', /no chaining|Only one allowlisted/)
    bad('git status | head', /no chaining|Only one allowlisted/)
    bad('node -e process.exit(1)', /Inline code/)
    bad('python -c "print(1)"', /Inline code/)
    bad('npm run start', /not allowlisted/)
    bad('npm install vite; rm -rf /', /no chaining|Only one allowlisted/)
    bad('git push', /not allowlisted/)
    bad('git clone git@github.com:bera-tech-ai/cloud-bera.git', /https:\/\//)
    bad('git status /etc/passwd', /outside your workspace/)
    bad('node /etc/passwd.js', /outside your workspace/)
    bad('pytest ../../etc', /escapes the workspace/)
    bad('', /No shell command/)
    bad('/usr/bin/npm install vite', /bare allowlisted/)
})

test('safeChildEnv strips bot credentials and keeps only safe vars', () => {
    process.env.BERA_TEST_API_KEY = 'leak-me'
    process.env.DATABASE_URL = 'postgres://user:pass@host/db'
    process.env.GH_TOKEN = 'leak-me'
    process.env.SOME_SECRET_VALUE = 'leak-me'
    process.env.BERA_NPM_ARGS_FILE = '/tmp/should-not-leak'

    const env = sandbox.safeChildEnv()
    for (const key of Object.keys(env)) {
        assert.equal(sandbox.isSecretEnvKey(key), false, `secret key leaked into child env: ${key}`)
    }
    assert.equal(env.BERA_TEST_API_KEY, undefined)
    assert.equal(env.DATABASE_URL, undefined)
    assert.equal(env.GH_TOKEN, undefined)
    assert.equal(env.SOME_SECRET_VALUE, undefined)
    assert.equal(env.BERA_NPM_ARGS_FILE, undefined)
    assert.equal(env.npm_config_registry, 'https://registry.npmjs.org/')
    if (process.env.PATH) assert.equal(env.PATH, process.env.PATH)

    // Caller-supplied extras are allowlisted too, never secret.
    const withExtra = sandbox.safeChildEnv({ PATH: '/custom/bin', CUSTOM_API_KEY: 'x', NODE_ENV: 'test' })
    assert.equal(withExtra.PATH, '/custom/bin')
    assert.equal(withExtra.CUSTOM_API_KEY, undefined)
    assert.equal(withExtra.NODE_ENV, 'test')
})

test('resolveContainedPath rejects traversal, absolute escapes and symlink escapes', () => {
    const root = userRoot()
    assert.equal(sandbox.resolveContainedPath(USER, 'notes/a.txt'), path.join(root, 'notes', 'a.txt'))
    assert.equal(sandbox.resolveContainedPath(USER, ''), root)
    assert.throws(() => sandbox.resolveContainedPath(USER, '../escape.txt'), /outside your workspace/)
    assert.throws(() => sandbox.resolveContainedPath(USER, '/etc/passwd'), /outside your workspace/)
    assert.throws(() => sandbox.resolveContainedPath(USER, '/tmp/definitely-outside-workspace.txt'), /outside your workspace/)

    // Symlink inside the workspace pointing outside must not smuggle a path out.
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'bera-sandbox-outside-'))
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret')
    const link = path.join(root, 'escape-link')
    fs.symlinkSync(outside, link)
    assert.throws(() => sandbox.resolveContainedPath(USER, 'escape-link/secret.txt'), /outside your workspace/)
    // ...while a symlink pointing inside the workspace stays usable.
    const innerDir = path.join(root, 'inner')
    fs.mkdirSync(innerDir, { recursive: true })
    fs.symlinkSync(innerDir, path.join(root, 'inner-link'))
    assert.equal(sandbox.resolveContainedPath(USER, 'inner-link/file.txt'), path.join(innerDir, 'file.txt'))
})

test('runSandboxedShell runs allowlisted commands without a shell or credentials', async () => {
    process.env.BERA_TEST_API_KEY = 'leak-me'
    process.env.DATABASE_URL = 'postgres://user:pass@host/db'
    process.env.GH_TOKEN = 'leak-me'

    const version = await sandbox.runSandboxedShell('node --version', { userId: USER })
    assert.equal(version.success, true, version.output)
    assert.match(version.output, /v\d+\.\d+\.\d+/)

    const rejected = await sandbox.runSandboxedShell('rm -rf /', { userId: USER })
    assert.equal(rejected.success, false)
    assert.match(rejected.output, /rejected/i)

    const chained = await sandbox.runSandboxedShell('node --version && echo pwned', { userId: USER })
    assert.equal(chained.success, false)
    assert.match(chained.output, /rejected/i)

    // End-to-end env check: a workspace script dumps its own env keys, and
    // no bot credential key may appear in the child.
    const scriptPath = path.join(userRoot(), 'env-dump.js')
    fs.writeFileSync(scriptPath, 'console.log(Object.keys(process.env).join(","))\n')
    const dump = await sandbox.runSandboxedShell('node env-dump.js', { userId: USER })
    assert.equal(dump.success, true, dump.output)
    assert.doesNotMatch(dump.output, /BERA_TEST_API_KEY/)
    assert.doesNotMatch(dump.output, /DATABASE_URL/)
    assert.doesNotMatch(dump.output, /GH_TOKEN/)
})
