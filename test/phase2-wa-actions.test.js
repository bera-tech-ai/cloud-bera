'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const waActions = require('../Library/lib/wa-actions')
const referents = require('../Library/lib/referents')

const CHAT = '254700000001@g.us'
const BOT = '254116763755@s.whatsapp.net'

const fakeConn = (overrides = {}) => {
    const sent = []
    const forwarded = []
    return {
        sent, forwarded,
        user: { id: BOT },
        onWhatsApp: async (jid) => [{ exists: true, jid }],
        sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: 'sent-1' } } },
        copyNForward: async (jid, message) => { forwarded.push({ jid, message }); return { key: { id: 'fwd-1' } } },
        ...overrides,
    }
}

test('react sends the exact key; empty text removes the reaction', async () => {
    const conn = fakeConn()
    const key = { id: 'm1', remoteJid: CHAT, fromMe: false }
    const ok = await waActions.execute(conn, BOT, { type: 'react', chat: CHAT, key, emoji: '❤️' })
    assert.equal(ok.ok, true)
    assert.deepEqual(conn.sent[0].content, { react: { text: '❤️', key } })
    const removed = await waActions.execute(conn, BOT, { type: 'react', chat: CHAT, key, emoji: '' })
    assert.equal(removed.ok, true)
    assert.equal(conn.sent[1].content.react.text, '')
})

test('pin uses type 1 with a duration; unpin uses type 0 with time 0', async () => {
    const conn = fakeConn()
    const key = { id: 'm2', remoteJid: CHAT, fromMe: false }
    await waActions.execute(conn, BOT, { type: 'pin', chat: CHAT, key, time: 604800 })
    assert.deepEqual(conn.sent[0].content, { pin: key, type: 1, time: 604800 })
    await waActions.execute(conn, BOT, { type: 'unpin', chat: CHAT, key })
    assert.deepEqual(conn.sent[1].content, { pin: key, type: 0, time: 0 })
})

test('edit is bot-authored only', async () => {
    const conn = fakeConn()
    const botKey = { id: 'b1', remoteJid: CHAT, fromMe: true }
    const ok = await waActions.execute(conn, BOT, { type: 'edit', chat: CHAT, key: botKey, text: 'fixed' })
    assert.equal(ok.ok, true)
    assert.deepEqual(conn.sent[0].content, { text: 'fixed', edit: botKey })
    const otherKey = { id: 'o1', remoteJid: CHAT, fromMe: false, participant: '254799999999@s.whatsapp.net' }
    const denied = await waActions.execute(conn, BOT, { type: 'edit', chat: CHAT, key: otherKey, text: 'fixed' })
    assert.equal(denied.ok, false)
    assert.match(denied.error, /only a message sent by this bot/)
})

test('delete and native poll check Baileys acceptance', async () => {
    const conn = fakeConn()
    const key = { id: 'm3', remoteJid: CHAT, fromMe: true }
    const deleted = await waActions.execute(conn, BOT, { type: 'delete', chat: CHAT, key })
    assert.equal(deleted.ok, true)
    assert.deepEqual(conn.sent[0].content, { delete: key })
    const polled = await waActions.execute(conn, BOT, { type: 'poll', chat: CHAT, question: 'Best day?', options: ['Friday', 'Saturday'] })
    assert.equal(polled.ok, true)
    assert.equal(conn.sent[1].content.poll.name, 'Best day?')
    assert.deepEqual(conn.sent[1].content.poll.values, ['Friday', 'Saturday'])
    const tooFew = await waActions.execute(conn, BOT, { type: 'poll', chat: CHAT, question: 'Q?', options: ['Only one'] })
    assert.equal(tooFew.ok, false)
    assert.match(tooFew.error, /2–12 options/)
    const rejected = fakeConn({ sendMessage: async () => null })
    const failed = await waActions.execute(rejected, BOT, { type: 'poll', chat: CHAT, question: 'Q?', options: ['A', 'B'] })
    assert.equal(failed.ok, false)
    assert.match(failed.error, /did not accept/)
})

test('multi-destination forward forwards to each destination in turn', async () => {
    const conn = fakeConn()
    const message = { key: { id: 'q1' }, message: { conversation: 'hello' } }
    const result = await waActions.execute(conn, BOT, {
        type: 'forward', message, destinations: ['254711111111@s.whatsapp.net', '254722222222@s.whatsapp.net'],
    })
    assert.equal(result.ok, true)
    assert.deepEqual(result.destinations, ['254711111111@s.whatsapp.net', '254722222222@s.whatsapp.net'])
    assert.equal(conn.forwarded.length, 2)
})

test('close-friends status is an explicit unsupported error, not a silent post', async () => {
    const conn = fakeConn()
    const result = await waActions.execute(conn, BOT, { type: 'story', text: 'hello', audience: 'close_friends' })
    assert.equal(result.ok, false)
    assert.match(result.error, /Close-friends \/ restricted status is unsupported/)
    assert.equal(conn.sent.length, 0)
})

test('resolveTarget resolves pronouns via referents and never guesses on ambiguity', async () => {
    const chat = '254700000009@s.whatsapp.net'
    referents.clearChat(chat)
    referents.recordInbound({ chat, sender: '254711111111@s.whatsapp.net', key: { id: 'a' } })
    referents.recordInbound({ chat, sender: '254722222222@s.whatsapp.net', key: { id: 'b' } })
    const m = { chat, sender: '254733333333@s.whatsapp.net', key: { id: 'c' } }
    await assert.rejects(
        () => waActions.resolveTarget(fakeConn(), m, 'them'),
        /Which person did you mean/,
    )
    referents.clearChat(chat)
    referents.recordInbound({ chat, sender: '254711111111@s.whatsapp.net', key: { id: 'a' } })
    const single = await waActions.resolveTarget(fakeConn(), { chat, sender: '254733333333@s.whatsapp.net', key: { id: 'c' } }, 'him')
    assert.equal(single.jid, '254711111111@s.whatsapp.net')
})

test('name targets resolve from the group roster, not only the name directory', async () => {
    // 2026-11-24 TECH SPACE: "who is baba" found @baba.hany from the roster
    // while "send hello to baba" said it didn't know him — the send path
    // only consulted the learned-name directory. The roster is a real
    // WhatsApp fact, so a match here also teaches the directory.
    const groupConn = fakeConn({
        groupMetadata: async () => ({
            participants: [
                { id: '88240858083431@s.whatsapp.net', username: 'baba.hany' },
                { id: '254700000001@s.whatsapp.net', username: 'casper' },
            ],
        }),
    })
    const group = { chat: '120363210534568276@g.us', sender: '254116763755@s.whatsapp.net', isGroup: true, key: { id: 'g1' } }
    const resolved = await waActions.resolveTarget(groupConn, group, 'name:baba')
    assert.equal(resolved.jid, '88240858083431@s.whatsapp.net')
    // Learned: the name now resolves even without the roster.
    assert.equal(referents.resolveName('baba')?.jid, '88240858083431@s.whatsapp.net')
})

test('name targets ask instead of guessing when several group members match', async () => {
    const groupConn = fakeConn({
        groupMetadata: async () => ({
            participants: [
                { id: '254711000001@s.whatsapp.net', username: 'samwise' },
                { id: '254722000002@s.whatsapp.net', username: 'samuelx' },
            ],
        }),
    })
    const group = { chat: '120363210534568276@g.us', sender: '254116763755@s.whatsapp.net', isGroup: true, key: { id: 'g2' } }
    await assert.rejects(
        () => waActions.resolveTarget(groupConn, group, 'name:sam'),
        /Which person did you mean/,
    )
})

test('name targets still say plainly when nobody in the group matches', async () => {
    const groupConn = fakeConn({
        groupMetadata: async () => ({ participants: [{ id: '254700000001@s.whatsapp.net', username: 'casper' }] }),
    })
    const group = { chat: '120363210534568276@g.us', sender: '254116763755@s.whatsapp.net', isGroup: true, key: { id: 'g3' } }
    await assert.rejects(
        () => waActions.resolveTarget(groupConn, group, 'name:nobody'),
        /don't know who "nobody" is yet/,
    )
})
