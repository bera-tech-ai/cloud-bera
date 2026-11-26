'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { ensureRootPackageJson } = require('../Library/actions/agent-os')

const tmpProject = files => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bera-entry-'))
    for (const [rel, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
        fs.writeFileSync(path.join(dir, rel), content)
    }
    return dir
}

test('synthesises a root package.json when the server lives under src/', () => {
    const dir = tmpProject({ 'src/server.js': "const express = require('express'); const app = express(); app.listen(3000)" })
    const pkg = ensureRootPackageJson({ dir, name: 'edutrack' })
    assert.equal(pkg.main, 'src/server.js')
    assert.equal(pkg.scripts.start, 'node src/server.js')
    assert.equal(pkg.dependencies.express, '*')
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name, 'edutrack')
})

test('leaves projects with a root index.html or package.json untouched', () => {
    const dirA = tmpProject({ 'index.html': '<html></html>', 'src/server.js': 'require("http").createServer().listen(1)' })
    assert.equal(ensureRootPackageJson({ dir: dirA, name: 'x' }), null)
    const dirB = tmpProject({ 'package.json': '{}', 'server.js': 'require("http").createServer().listen(1)' })
    assert.equal(ensureRootPackageJson({ dir: dirB, name: 'x' }), null)
})

test('returns null when there is no runnable entrypoint at all', () => {
    const dir = tmpProject({ 'src/model/student.js': 'module.exports = {}' })
    assert.equal(ensureRootPackageJson({ dir, name: 'x' }), null)
})

const { sanitizeDependencyVersions, fixUnresolvableDependencies, normalizePackageJsonStart } = require('../Library/actions/agent-os')

test('sanitizeDependencyVersions caps invented majors for known packages only', () => {
    const pkg = { scripts: { start: 'node server.js' }, dependencies: { express: '^17.0.0', somelib: '^99.0.0', cors: '^2.8.5' } }
    assert.equal(sanitizeDependencyVersions(pkg), true)
    assert.equal(pkg.dependencies.express, '^4.19.2')
    assert.equal(pkg.dependencies.somelib, '^99.0.0')
    assert.equal(pkg.dependencies.cors, '^2.8.5')
    const out = JSON.parse(normalizePackageJsonStart(JSON.stringify({ scripts: { start: 'node server.js' }, dependencies: { express: '^17.0.0' } })))
    assert.equal(out.dependencies.express, '^4.19.2')
})

test('fixUnresolvableDependencies rewrites exactly the packages npm rejected', () => {
    const dir = tmpProject({ 'package.json': JSON.stringify({ name: 'x', dependencies: { express: '^17.0.0', dotenv: '^16.4.5' } }) })
    const failure = 'npm error code ETARGET\nnpm error notarget No matching version found for express@^17.0.0.'
    assert.equal(fixUnresolvableDependencies({ dir, name: 'x' }, failure), 1)
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    assert.equal(pkg.dependencies.express, '*')
    assert.equal(pkg.dependencies.dotenv, '^16.4.5')
    assert.equal(fixUnresolvableDependencies({ dir, name: 'x' }, 'some other failure'), 0)
})

const { executeStep } = require('../Library/actions/agent-os')

test('executeStep rejects placeholder paths and directory targets instead of crashing', async () => {
    const dir = tmpProject({ 'src/keep.js': 'module.exports = {}' })
    const placeholder = await executeStep({ dir, name: 'x' }, { action: 'write_file', path: 'relative_path_from_project_root', content: 'x' })
    assert.equal(placeholder.success, false)
    assert.match(placeholder.output, /placeholder/i)
    fs.mkdirSync(path.join(dir, 'src/broken.js'), { recursive: true })
    const overDir = await executeStep({ dir, name: 'x' }, { action: 'write_file', path: 'src/broken.js', content: 'x' })
    assert.equal(overDir.success, false)
    assert.match(overDir.output, /directory/i)
    const ok = await executeStep({ dir, name: 'x' }, { action: 'write_file', path: 'src/new.js', content: 'module.exports = 1' })
    assert.equal(ok.success, true)
})

const { ensureStartScript } = require('../Library/actions/agent-os')

test('fixUnresolvableDependencies removes packages that do not exist on npm', () => {
    const dir = tmpProject({ 'package.json': JSON.stringify({ name: 'x', dependencies: { express: '^4.18.0', 'minimalistic-serverless-php-sdk-lambda': '^1.0.6' } }) })
    const failure = "npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/minimalistic-serverless-php-sdk-lambda\nnpm error 404  'minimalistic-serverless-php-sdk-lambda@^1.0.6' is not in this registry."
    assert.equal(fixUnresolvableDependencies({ dir, name: 'x' }, failure), 1)
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    assert.equal(pkg.dependencies['minimalistic-serverless-php-sdk-lambda'], undefined)
    assert.equal(pkg.dependencies.express, '^4.18.0')
})

test('ensureStartScript guarantees a start script pointing at a real entrypoint', () => {
    const dir = tmpProject({
        'package.json': JSON.stringify({ name: 'x', main: 'index.js', scripts: { test: 'jest' } }),
        'server.js': 'require("http").createServer().listen(3000)',
    })
    assert.equal(ensureStartScript({ dir, name: 'x' }), 'server.js')
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    assert.equal(pkg.scripts.start, 'node server.js')
    assert.equal(pkg.main, 'server.js')
    assert.equal(ensureStartScript({ dir, name: 'x' }), null)
})

test('executeStep normalises extensionless module paths to real files', async () => {
    const dir = tmpProject({})
    const flat = await executeStep({ dir, name: 'x' }, { action: 'write_file', path: 'src/database/models', content: 'module.exports = {}' })
    assert.equal(flat.success, true)
    assert.equal(fs.existsSync(path.join(dir, 'src/database/models.js')), true)
    fs.mkdirSync(path.join(dir, 'src/config'), { recursive: true })
    const nested = await executeStep({ dir, name: 'x' }, { action: 'write_file', path: 'src/config', content: 'module.exports = {}' })
    assert.equal(nested.success, true)
    assert.equal(fs.existsSync(path.join(dir, 'src/config/index.js')), true)
})

const { sanitizeGeneratedScripts } = require('../Library/actions/agent-os')

test('sanitizeGeneratedScripts drops unbacked toolchain scripts, keeps real ones', () => {
    const dir = tmpProject({
        'package.json': JSON.stringify({
            name: 'x',
            scripts: { start: 'node server.js', build: 'webpack --mode production', test: 'jest', serve: 'http-server .' },
            dependencies: { jest: '^29.0.0', webpack: '^5.0.0' },
        }),
        'server.js': 'require("http").createServer().listen(3000)',
        'app.test.js': 'test("x", () => {})',
    })
    // webpack IS a dependency but there is no webpack config anywhere.
    assert.deepEqual(sanitizeGeneratedScripts({ dir, name: 'x' }), ['build'])
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    assert.equal(pkg.scripts.build, undefined)
    assert.equal(pkg.scripts.test, 'jest')
    assert.equal(pkg.scripts.start, 'node server.js')
})

test('sanitizeGeneratedScripts keeps a bundler build when its config exists', () => {
    const dir = tmpProject({
        'package.json': JSON.stringify({ name: 'x', scripts: { build: 'webpack --mode production' }, dependencies: { webpack: '^5.0.0' } }),
        'webpack.config.js': 'module.exports = {}',
    })
    assert.deepEqual(sanitizeGeneratedScripts({ dir, name: 'x' }), [])
})

test('executeStep refuses corrupted content and invalid package.json writes', async () => {
    const dir = tmpProject({ 'package.json': '{"name":"good"}' })
    // Corrupted provided content now triggers one clean regeneration
    // attempt; with the provider failing here, the write must still be
    // refused and nothing corrupted may land on disk.
    const xcasper = require('../Library/actions/xcasper')
    const originalChat = xcasper.chat
    xcasper.chat = async () => ({ success: false, error: 'provider down in test' })
    let corrupt
    try {
        corrupt = await executeStep({ dir, name: 'x' }, { action: 'write_file', path: 'server.js', content: 'x�e\u0013k��p' })
    } finally {
        xcasper.chat = originalChat
    }
    assert.equal(corrupt.success, false)
    assert.match(corrupt.output, /corrupted/i)
    assert.equal(fs.existsSync(path.join(dir, 'server.js')), false)
    const badJson = await executeStep({ dir, name: 'x' }, { action: 'write_file', path: 'package.json', content: '{not json' })
    assert.equal(badJson.success, false)
    assert.match(badJson.output, /not valid JSON/i)
    assert.equal(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), '{"name":"good"}')
})

const { bootCheck, validate } = require('../Library/actions/agent-os')

test('bootCheck passes a server that answers HTTP and fails one that crashes on a missing module', async () => {
    const good = tmpProject({ 'server.js': 'require("http").createServer((q,s)=>{s.end("ok")}).listen(process.env.PORT)' })
    const okRes = await bootCheck({ dir: good, name: 'x' }, 'server.js', { bootTimeout: 6000 })
    assert.equal(okRes.success, true)
    const bad = tmpProject({ 'server.js': 'require("./db")' })
    const badRes = await bootCheck({ dir: bad, name: 'x' }, 'server.js', { bootTimeout: 6000 })
    assert.equal(badRes.success, false)
    assert.match(badRes.output, /Cannot find module/)
})

test('sanitizeGeneratedScripts drops a jest test script when the project has no test files, keeps it when it does', () => {
    const noTests = tmpProject({
        'server.js': 'require("http").createServer((q,s)=>s.end("ok")).listen(3000)',
        'package.json': JSON.stringify({ name: 'x', scripts: { start: 'node server.js', test: 'jest' }, devDependencies: { jest: '^29.0.0' } }),
    })
    const removedA = sanitizeGeneratedScripts({ id: 'x', dir: noTests, name: 'x' })
    assert.ok(removedA.includes('test'))
    assert.equal(JSON.parse(fs.readFileSync(path.join(noTests, 'package.json'), 'utf8')).scripts.test, undefined)
    const withTests = tmpProject({
        'server.js': 'require("http").createServer((q,s)=>s.end("ok")).listen(3000)',
        'a.test.js': 'test("x", () => {})',
        'package.json': JSON.stringify({ name: 'x', scripts: { start: 'node server.js', test: 'jest' }, devDependencies: { jest: '^29.0.0' } }),
    })
    const removedB = sanitizeGeneratedScripts({ id: 'x', dir: withTests, name: 'x' })
    assert.ok(!removedB.includes('test'))
})

test('entrypoint check fails when package.json starts a file that does not exist', async () => {
    const dir = tmpProject({
        'package.json': JSON.stringify({ name: 'x', scripts: { start: 'node server.js' }, dependencies: { express: '*' } }),
    })
    const result = await validate({ id: 'x', dir, name: 'x' }, { installTimeout: 5000, bootTimeout: 3000 })
    const entry = result.checks.find(c => c.name === 'project-entrypoint')
    assert.equal(entry.success, false)
    assert.match(entry.output, /server\.js.*does not exist/)
    assert.equal(result.success, false)
})

test('executeStep recovers a package.json with trailing junk after the JSON object', async () => {
    const dir = tmpProject({})
    const record = { id: 'x', dir, name: 'x', events: [] }
    const good = JSON.stringify({ name: 'x', scripts: { start: 'node server.js' } })
    const step = { action: 'write_file', path: 'package.json', content: good + '\n\nHere is your file! Let me know if you need changes.' }
    const r = await executeStep(record, step, {})
    assert.equal(r.success, true)
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')), JSON.parse(good))
})
