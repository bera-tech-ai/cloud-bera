'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const bridge = require('../Library/lib/xadon-bridge')
const adminHandler = require('../Commands/admin')

test('loads the available command declarations but excludes imported eval execution', () => {
  assert.equal(bridge.allCommands.length, 740)
  assert.ok(!bridge.allCommands.some(cmd => cmd.sourceFile === 'owner/eval.js'))
  assert.ok(bridge.allCommands.some(cmd => cmd.sourceFile === 'owner/update.js'))
  assert.equal(bridge.wrapped.has('owner/eval.js'), false)
  assert.equal(bridge.isPrivileged(bridge.allCommands.find(cmd => cmd.sourceFile === 'owner/update.js')), true)
})

test('keeps Bera handlers and registers only the Bera-neutral namespace', () => {
  const existing = () => 'Bera handler'
  const map = new Map([['age', existing], ['eval', existing], ['sh', existing], ['#', existing]])
  const result = bridge.register(map)
  assert.equal(map.get('age'), existing)
  assert.equal(map.get('eval'), existing)
  assert.equal(map.get('sh'), existing)
  assert.equal(map.get('#'), existing)
  assert.equal(typeof map.get('beraextra'), 'function')
  assert.equal(map.has('xadon'), false)
  assert.ok(result.total > 700)
})

test('Bera native admin command exports the eval and shell aliases', () => {
  for (const alias of ['eval', '>', '#', 'js', 'jseval', 'evaljs', '$', 'bash', 'shell', 'sh', 'exec', 'run', 'terminal', 'cmd']) {
    assert.ok(adminHandler.command.includes(alias), `missing native alias: ${alias}`)
  }
})

test('native shell and eval aliases reject non-owners before execution', async () => {
  for (const command of ['sh', '#']) {
    let response = ''
    await adminHandler({}, {
      command, text: 'not executed', args: ['not', 'executed'], isOwner: false,
      reply: async value => { response = String(value) }
    })
    assert.match(response, /Owner only/i)
  }
})

test('non-eval privileged commands remain disabled by default and require the Bera allowlist', async () => {
  const oldValue = process.env.BERA_IMPORTED_PRIVILEGED_ALLOWLIST
  const oldLegacyValue = process.env.BERA_XADON_PRIVILEGED_ALLOWLIST
  delete process.env.BERA_IMPORTED_PRIVILEGED_ALLOWLIST
  process.env.BERA_XADON_PRIVILEGED_ALLOWLIST = 'owner/update.js'
  try {
    const handler = bridge.wrapped.get('owner/update.js')
    assert.equal(typeof handler, 'function')
    let response = ''
    await handler({}, {
      command: 'update', args: [], text: '', prefix: '.',
      isOwner: true, isGroup: false, conn: {}, chat: '123@s.whatsapp.net', sender: '123@s.whatsapp.net',
      reply: async text => { response = String(text) }
    })
    assert.match(response, /disabled until reviewed/i)
    assert.match(response, /BERA_IMPORTED_PRIVILEGED_ALLOWLIST/)

    process.env.BERA_IMPORTED_PRIVILEGED_ALLOWLIST = 'owner/update.js'
    response = ''
    await handler({}, {
      command: 'update', args: [], text: '', prefix: '.',
      isOwner: false, isGroup: false, conn: {}, chat: '123@s.whatsapp.net', sender: '123@s.whatsapp.net',
      reply: async text => { response = String(text) }
    })
    assert.match(response, /restricted to the Bera owner/i)
  } finally {
    if (oldValue === undefined) delete process.env.BERA_IMPORTED_PRIVILEGED_ALLOWLIST
    else process.env.BERA_IMPORTED_PRIVILEGED_ALLOWLIST = oldValue
    if (oldLegacyValue === undefined) delete process.env.BERA_XADON_PRIVILEGED_ALLOWLIST
    else process.env.BERA_XADON_PRIVILEGED_ALLOWLIST = oldLegacyValue
  }
})

test('routes imported eval requests back to Bera native commands without executing them', async () => {
  const map = new Map()
  bridge.register(map)
  const replies = []
  await map.get('beraextra')({}, {
    command: 'beraextra', args: ['eval'], text: '', prefix: '.',
    isOwner: true, isGroup: false, conn: {}, chat: '123@s.whatsapp.net', sender: '123@s.whatsapp.net',
    reply: async text => { replies.push(String(text)) }
  })
  assert.match(replies.join('\n'), /Use Bera owner commands \.eval, \.>, \.#, or \.sh/i)
  assert.doesNotMatch(replies.join('\n'), /XADON/i)
})

test('the public command list uses neutral names and does not disclose source-brand aliases', async () => {
  const map = new Map()
  bridge.register(map)
  let response = ''
  await map.get('beraextra')({}, {
    command: 'beraextra', args: ['list'], text: '', prefix: '.',
    isOwner: false, isGroup: false, conn: {}, chat: '123@s.whatsapp.net', sender: '123@s.whatsapp.net',
    reply: async text => { response = String(text) }
  })
  assert.match(response, /Bera extra commands:/)
  assert.match(response, /Usage: \.beraextra/)
  assert.doesNotMatch(response, /XADON|\.xadon/i)
})

test('unknown source-branded names are rejected without echoing the name', async () => {
  const map = new Map()
  bridge.register(map)
  let response = ''
  await map.get('beraextra')({}, {
    command: 'beraextra', args: ['xadon'], text: '', prefix: '.',
    isOwner: false, isGroup: false, conn: {}, chat: '123@s.whatsapp.net', sender: '123@s.whatsapp.net',
    reply: async text => { response = String(text) }
  })
  assert.match(response, /Unknown Bera extra command/i)
  assert.doesNotMatch(response, /XADON/i)
})

test('rebrands visible imported message content', () => {
  const result = bridge.rebrandContent({ text: 'XADON AI says hello', caption: 'Meet XADON', mimetype: 'text/plain' })
  assert.equal(result.text, 'Bera AI says hello')
  assert.equal(result.caption, 'Meet Bera AI')
  assert.equal(result.mimetype, 'text/plain')
})
