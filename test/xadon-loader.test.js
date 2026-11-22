'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const loader = require('../Library/xadon-pack/src/loader')

const captureLoad = () => {
    const output = { logs: [], warnings: [], errors: [] }
    const original = { log: console.log, warn: console.warn, error: console.error }
    console.log = (...args) => output.logs.push(args.join(' '))
    console.warn = (...args) => output.warnings.push(args.join(' '))
    console.error = (...args) => output.errors.push(args.join(' '))
    try {
        output.commands = loader.load()
        output.declarations = loader.allCommands.length
    } finally {
        console.log = original.log
        console.warn = original.warn
        console.error = original.error
    }
    return output
}

test('duplicate command names and aliases are resolved without stderr collision warnings', () => {
    const first = captureLoad()
    const second = captureLoad()
    const summary = first.logs.find(line => line.includes('resolved'))

    assert.ok(first.commands.size > 0)
    assert.ok(first.declarations >= first.commands.size)
    assert.equal(first.commands.size, second.commands.size)
    assert.equal(first.declarations, second.declarations)
    assert.deepEqual(first.warnings, [])
    assert.deepEqual(first.errors, [])
    assert.match(summary || '', /resolved \d+ duplicate names and \d+ duplicate aliases/)
    assert.match(summary || '', /0 load failures$/)
    assert.equal(summary, second.logs.find(line => line.includes('resolved')))
})
