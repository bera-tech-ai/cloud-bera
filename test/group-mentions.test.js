'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { addRequesterMention } = require('../Library/lib/group-mentions')

test('group reply adds a visible @mention and Baileys mention metadata for the asker', () => {
    const asker = '254700000001@s.whatsapp.net'
    const payload = addRequesterMention({ isGroup: true, chat: '12345@g.us', sender: asker }, 'Here is the answer.')
    assert.equal(payload.text, '@254700000001 Here is the answer.')
    assert.deepEqual(payload.mentions, [asker])
})

test('group reply does not duplicate the visible mention and preserves existing mentions', () => {
    const asker = '254700000001@s.whatsapp.net'
    const other = '254700000002@s.whatsapp.net'
    const payload = addRequesterMention({ chat: '12345@g.us', sender: asker }, '@254700000001 Hello @254700000002', { mentions: [other] })
    assert.equal(payload.text, '@254700000001 Hello @254700000002')
    assert.deepEqual(payload.mentions, [other, asker])
})

test('private replies remain untagged', () => {
    const payload = addRequesterMention({ chat: '254700000001@s.whatsapp.net', sender: '254700000001@s.whatsapp.net' }, 'Here is the answer.')
    assert.equal(payload.text, 'Here is the answer.')
    assert.equal(Object.hasOwn(payload, 'mentions'), false)
})
