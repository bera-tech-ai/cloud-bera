'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const pinCommand = require('../Library/xadon-pack/src/commands/group/pin')
const { BAILEYS_ACCEPTED_MESSAGE, PIN_ACCEPTED_MESSAGE } = require('../Library/lib/truthful-status')

const key = (id) => ({ remoteJid: '123@g.us', fromMe: false, id })
const run = (overrides = {}) => {
    const sent = []
    const replies = []
    const sock = {
        sendMessage: async (jid, content) => {
            sent.push({ jid, content })
            if (overrides.failOn && overrides.failOn(content)) throw new Error(overrides.failError || 'send failed')
            return { key: { id: 'sent' } }
        },
    }
    const m = {
        chat: '123@g.us',
        key: key('cmd-msg'),
        quoted: overrides.quoted || null,
    }
    const ctx = {
        args: overrides.args || [],
        reply: async (value) => { replies.push(String(value)); return value },
        prefix: '.',
        quoted: overrides.quoted || null,
    }
    return { sock, m, ctx, sent, replies }
}

test('unpin sends the spec §8 payload including time: 0', async () => {
    const target = { key: key('target-msg') }
    const { sock, m, ctx, sent, replies } = run({ args: ['unpin'], quoted: target })
    await pinCommand.execute(sock, m, ctx)
    assert.equal(sent.length, 2) // unpin payload + confirmation reaction
    assert.deepEqual(sent[0].content, { pin: target.key, type: 0, time: 0 })
    assert.equal(replies[0], BAILEYS_ACCEPTED_MESSAGE)
    assert.doesNotMatch(replies[0], /unpinned!/i)
})

test('unpin via the "remove" alias also includes time: 0', async () => {
    const target = { key: key('target-msg') }
    const { sock, m, ctx, sent } = run({ args: ['remove'], quoted: target })
    await pinCommand.execute(sock, m, ctx)
    assert.deepEqual(sent[0].content, { pin: target.key, type: 0, time: 0 })
})

test('unpin with no quoted message asks for the pinned message instead of unpinning the command itself', async () => {
    const { sock, m, ctx, sent, replies } = run({ args: ['unpin'] })
    await pinCommand.execute(sock, m, ctx)
    assert.equal(sent.length, 0)
    assert.match(replies[0], /Reply to the pinned message/)
})

test('pin for 7 days sends { pin, type: 1, time: 604800 } and the spec pin wording', async () => {
    const target = { key: key('target-msg') }
    const { sock, m, ctx, sent, replies } = run({ args: ['7d'], quoted: target })
    await pinCommand.execute(sock, m, ctx)
    const pinPayload = sent.find((s) => s.content.pin)
    assert.deepEqual(pinPayload.content, { pin: target.key, type: 1, time: 604800 })
    assert.equal(replies[0], PIN_ACCEPTED_MESSAGE)
    assert.doesNotMatch(replies[0], /pinned/i)
})

test('pin defaults to 30 days when no duration is given', async () => {
    const target = { key: key('target-msg') }
    const { sock, m, ctx, sent } = run({ args: [], quoted: target })
    await pinCommand.execute(sock, m, ctx)
    const pinPayload = sent.find((s) => s.content.pin)
    assert.deepEqual(pinPayload.content, { pin: target.key, type: 1, time: 2592000 })
})

test('a rejected unpin is reported as failure, never as success', async () => {
    const target = { key: key('target-msg') }
    const { sock, m, ctx, replies } = run({
        args: ['unpin'],
        quoted: target,
        failOn: (content) => content.pin !== undefined,
        failError: 'not admin',
    })
    await pinCommand.execute(sock, m, ctx)
    assert.match(replies[0], /Failed to unpin/)
    assert.doesNotMatch(replies[0], /accepted by Baileys/)
})

test('a falsy Baileys return on pin is reported as failure', async () => {
    const target = { key: key('target-msg') }
    const sent = []
    const replies = []
    const sock = {
        sendMessage: async (jid, content) => {
            sent.push({ jid, content })
            if (content.pin) return null // Baileys did not accept
            return { key: { id: 'sent' } }
        },
    }
    await pinCommand.execute(sock, { chat: '123@g.us', key: key('cmd-msg'), quoted: target }, {
        args: ['7d'],
        reply: async (value) => { replies.push(String(value)); return value },
        prefix: '.',
        quoted: target,
    })
    assert.match(replies[0], /Failed to pin/)
    assert.doesNotMatch(replies[0], /accepted by Baileys/)
})
