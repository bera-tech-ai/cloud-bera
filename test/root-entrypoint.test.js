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
