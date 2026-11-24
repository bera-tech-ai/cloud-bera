'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { formatBeraCard } = require('../Library/lib/bera-card')
const { sendGroupReply } = require('../Library/lib/group-mentions')

test('formats plain replies with the Bera premium card', () => {
    const card = formatBeraCard('✅ Message sent', { title: 'SEND', subtitle: 'BOT COMMAND' })
    assert.match(card, /𝗕𝗘𝗥𝗔 𝗔𝗜 · SEND/)
    assert.match(card, /ʙᴏᴛ ᴄᴏᴍᴍᴀɴᴅ/)
    assert.match(card, /✅ ᴄᴏᴍᴘʟᴇᴛᴇᴅ/)
    assert.match(card, /⌬ ʙᴇʀᴀ ᴀɪ · ᴘʀᴇᴍɪᴜᴍ · v3\.0\.0/)
})

test('does not double-wrap an existing custom card', () => {
    const original = '╭──────────────────────╮\n│ ◉ 𝗞𝗔𝗚𝗨𝗥𝗔𝗕𝗔𝗖𝗛𝗜\n╰──────────────────────╯'
    assert.equal(formatBeraCard(original), original)
})

test('shared group reply formats text and preserves mentions', async () => {
    const sent = []
    await sendGroupReply({ sendMessage: async (...args) => sent.push(args) }, {
        chat: '123@g.us', isGroup: true, sender: '254700000001@s.whatsapp.net'
    }, '✅ Done', { cardTitle: 'ACTION', cardSubtitle: 'WHATSAPP AGENT' })
    assert.match(sent[0][1].text, /𝗕𝗘𝗥𝗔 𝗔𝗜 · ACTION/)
    assert.match(sent[0][1].text, /@254700000001/)
    assert.deepEqual(sent[0][1].mentions, ['254700000001@s.whatsapp.net'])
})

test('raw replies bypass cards for structured or intentionally raw output', async () => {
    const sent = []
    await sendGroupReply({ sendMessage: async (...args) => sent.push(args) }, {
        chat: '254700000001@s.whatsapp.net', sender: '254700000001@s.whatsapp.net'
    }, 'plain output', { raw: true })
    assert.equal(sent[0][1].text, 'plain output')
})
