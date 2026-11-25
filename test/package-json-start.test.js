'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizePackageJsonStart } = require('../Library/actions/agent-os')

test('hardcoded http-server port becomes PORT-aware', () => {
    const out = JSON.parse(normalizePackageJsonStart(JSON.stringify({ name: 'x', scripts: { start: 'http-server . -p 3000' } })))
    assert.equal(out.scripts.start, 'http-server . -p ${PORT:-3000}')
})

test('http-server without a port flag gains one', () => {
    const out = JSON.parse(normalizePackageJsonStart(JSON.stringify({ name: 'x', scripts: { start: 'http-server .' } })))
    assert.equal(out.scripts.start, 'http-server . -p ${PORT:-3000}')
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
