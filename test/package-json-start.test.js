'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizePackageJsonStart } = require('../Library/actions/agent-os')

test('http-server start is swapped to serve and the dependency follows', () => {
    const out = JSON.parse(normalizePackageJsonStart(JSON.stringify({ name: 'x', scripts: { start: 'http-server . -p 3000' }, dependencies: { 'http-server': '^14.1.1' } })))
    assert.equal(out.scripts.start, 'serve .')
    assert.equal(out.dependencies['http-server'], undefined)
    assert.equal(out.dependencies.serve, '^14.2.4')
})

test('http-server without a port flag is also swapped, keeping its path', () => {
    const out = JSON.parse(normalizePackageJsonStart(JSON.stringify({ name: 'x', scripts: { start: 'http-server dist' } })))
    assert.equal(out.scripts.start, 'serve dist')
    assert.equal(out.dependencies.serve, '^14.2.4')
})

test('npx http-server becomes npx serve without touching dependencies', () => {
    const pkg = JSON.stringify({ name: 'x', scripts: { start: 'npx http-server . -p 3000' } })
    const out = JSON.parse(normalizePackageJsonStart(pkg))
    assert.equal(out.scripts.start, 'npx serve .')
    assert.equal(out.dependencies, undefined)
})

test('serve with a hardcoded listen port becomes PORT-aware', () => {
    const out = JSON.parse(normalizePackageJsonStart(JSON.stringify({ name: 'x', scripts: { start: 'serve . -l 5000' } })))
    assert.equal(out.scripts.start, 'serve . -l ${PORT:-5000}')
})

test('node server start and non-JSON content are left untouched', () => {
    const pkg = JSON.stringify({ name: 'x', scripts: { start: 'node server.js' } })
    assert.equal(normalizePackageJsonStart(pkg), pkg)
    assert.equal(normalizePackageJsonStart('not json'), 'not json')
})
