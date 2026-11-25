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
