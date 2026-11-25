'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
    buildCommandMap, RegistryCollisionError, loadCollisionAliases,
    resolveImportedRoute, generateHelp, listCommands,
} = require('../Library/lib/command-registry')

const handlerA = async () => {}
handlerA.commands = ['ping', 'pong']
const handlerB = async () => {}
handlerB.commands = ['ping', 'other']

test('strict build fails loudly on a Bera-vs-Bera collision', () => {
    assert.throws(
        () => buildCommandMap([handlerA, handlerB], { strict: true }),
        (error) => error instanceof RegistryCollisionError && /ping/.test(error.message),
    )
})

test('the same handler re-registering a name is not a collision', () => {
    const { map, collisions } = buildCommandMap([handlerA, handlerA], { strict: true })
    assert.equal(collisions.length, 0)
    assert.equal(map.get('ping'), handlerA)
})

test('non-strict build keeps the first handler and reports every collision', () => {
    const { map, collisions } = buildCommandMap([handlerA, handlerB], { strict: false })
    assert.equal(map.get('ping'), handlerA)
    assert.equal(collisions.length, 1)
    assert.equal(collisions[0].name, 'ping')
})

test('collision-alias doc parses and resolves via alias or .beraextra', () => {
    const markdown = fs.readFileSync(path.join(__dirname, '..', 'bera-command-collision-aliases.md'), 'utf8')
    assert.match(markdown, /resolved-via-registry/)
    const aliases = loadCollisionAliases(markdown)
    assert.ok(aliases.size >= 90, `expected >=90 entries, got ${aliases.size}`)
    assert.equal(aliases.get('enhance').route, '.autofix')
    assert.equal(aliases.get('upscale').route, '.beraextra Media-Modifier/Upscale.js')
    assert.equal(resolveImportedRoute('enhance', { alias: ['autofix'] }, aliases), '.autofix')
    assert.equal(
        resolveImportedRoute('upscale', { name: 'upscale', sourceFile: 'Media-Modifier/Upscale.js' }, aliases),
        '.beraextra Media-Modifier/Upscale.js',
    )
})

test('help is generated from the effective registry', () => {
    const { map } = buildCommandMap([handlerA], { strict: false })
    const help = generateHelp(map, { prefix: '.' })
    assert.match(help, /\.ping/)
    assert.match(help, /\.pong/)
    assert.match(help, /Commands \(2\)/)
    assert.equal(listCommands(map).length, 1)
    assert.deepEqual(listCommands(map)[0].aliases, ['pong'])
})
