'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { dispatch, parsePoll, isCloseFriendsRequest } = require('../Library/lib/agent-dispatch')
const waActions = require('../Library/lib/wa-actions')

const CHAT = '254700000001@g.us'
const BOT = '254116763755@s.whatsapp.net'
const SENDER = '254711111111@s.whatsapp.net'

const harness = (overrides = {}) => {
    const sent = []
    const replies = []
    const conn = {
        user: { id: BOT },
        onWhatsApp: async (jid) => [{ exists: true, jid }],
        sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: 'sent-1' } } },
        copyNForward: async (jid, message) => { sent.push({ jid, forwarded: message }); return { key: { id: 'fwd-1' } } },
        ...overrides.conn,
    }
    const ctx = {
        conn, sender: SENDER, isOwner: false,
        access: { isGroup: true, isSenderAdmin: true, isBotAdmin: true, isOwner: false },
        chat: CHAT,
        m: { chat: CHAT, sender: SENDER, isGroup: true, key: { id: 'in-1', remoteJid: CHAT, fromMe: false }, quoted: { key: { id: 'q-1', remoteJid: CHAT, fromMe: false } } },
        reply: async (value) => replies.push(String(value)),
        react: async () => {},
        path: 'natural',
        ...overrides.ctx,
    }
    return { conn, sent, replies, ctx }
}

test('unknown intents fall through (return false)', async () => {
    const { ctx } = harness({ ctx: { intent: 'chat', text: 'hello' } })
    assert.equal(await dispatch(ctx), false)
})

test('.agent and natural paths handle the same intent identically', async () => {
    for (const path of ['.agent', 'natural']) {
        const { ctx, replies, sent } = harness({ ctx: { path, intent: 'react_msg', text: 'react with ❤️' } })
        assert.equal(await dispatch(ctx), true)
        assert.equal(sent[0].content.react.text, '❤️')
        assert.match(replies[0], /Reaction request accepted by Baileys/)
    }
})

test('remove-reaction sends an empty react', async () => {
    const { ctx, sent, replies } = harness({ ctx: { intent: 'remove_reaction', text: 'remove my reaction' } })
    assert.equal(await dispatch(ctx), true)
    assert.equal(sent[0].content.react.text, '')
    assert.match(replies[0], /Reaction removed/)
})

test('pin uses the spec wording; unpin uses time 0 via wa-actions', async () => {
    const { ctx, replies, sent } = harness({ ctx: { intent: 'pin_msg', text: 'pin this for 7 days' } })
    assert.equal(await dispatch(ctx), true)
    assert.deepEqual(sent[0].content, { pin: { id: 'q-1', remoteJid: CHAT, fromMe: false }, type: 1, time: 604800 })
    assert.match(replies[0], /Pin request accepted by Baileys\. Final device-side visibility depends on WhatsApp processing\./)
    const unpin = harness({ ctx: { intent: 'unpin_msg', text: 'unpin that' } })
    assert.equal(await dispatch(unpin.ctx), true)
    assert.deepEqual(unpin.sent[0].content, { pin: { id: 'q-1', remoteJid: CHAT, fromMe: false }, type: 0, time: 0 })
})

test('group pin failure says whether the user or the bot lacked permission', async () => {
    const botLacks = harness({ ctx: { intent: 'pin_msg', text: 'pin this', access: { isGroup: true, isSenderAdmin: true, isBotAdmin: false, isOwner: false } } })
    await dispatch(botLacks.ctx)
    assert.match(botLacks.replies[0], /Bera is not a group admin/)
    const userLacks = harness({ ctx: { intent: 'pin_msg', text: 'pin this', access: { isGroup: true, isSenderAdmin: false, isBotAdmin: true, isOwner: false } } })
    await dispatch(userLacks.ctx)
    assert.match(userLacks.replies[0], /you are not a group admin/)
})

test('edit rejects non-bot messages; delete of a quoted message checks acceptance', async () => {
    const edit = harness({ ctx: { intent: 'edit_msg', text: 'edit this to hello again' } })
    assert.equal(await dispatch(edit.ctx), true)
    assert.match(edit.replies[0], /only a message sent by this bot/)
    assert.equal(edit.sent.length, 0)
    const del = harness({ ctx: { intent: 'delete_msg', text: 'delete this message' } })
    assert.equal(await dispatch(del.ctx), true)
    assert.deepEqual(del.sent[0].content, { delete: { id: 'q-1', remoteJid: CHAT, fromMe: false } })
})

test('poll parses question and options and checks acceptance', async () => {
    assert.deepEqual(parsePoll('create a poll: Best day? Friday | Saturday | Sunday'), { question: 'Best day?', options: ['Friday', 'Saturday', 'Sunday'] })
    const { ctx, sent, replies } = harness({ ctx: { intent: 'poll_create', text: 'create a poll: Best day? Friday | Saturday' } })
    assert.equal(await dispatch(ctx), true)
    assert.equal(sent[0].content.poll.name, 'Best day?')
    assert.match(replies[0], /Poll request accepted by Baileys/)
})

test('forward stages a confirmation token and sends nothing yet', async () => {
    const { ctx, sent, replies } = harness({
        ctx: {
            intent: 'forward_msg', text: 'forward this to 254722222222',
            m: { chat: CHAT, sender: SENDER, key: { id: 'in-1', remoteJid: CHAT }, quoted: { key: { id: 'q-1' }, message: { conversation: 'hi' } } },
        },
    })
    assert.equal(await dispatch(ctx), true)
    assert.equal(sent.length, 0)
    assert.match(replies[0], /Preview only — nothing was forwarded/)
    const token = replies[0].match(/confirm ([A-F0-9]{8})/)[1]
    const action = waActions.consume(SENDER, token)
    assert.equal(action.type, 'forward')
    assert.equal(action.jid, '254722222222@s.whatsapp.net')
})

test('close-friends requests get the unsupported reply', () => {
    assert.equal(isCloseFriendsRequest('post this to my close friends status'), true)
    assert.equal(isCloseFriendsRequest('post this on my status'), false)
})
