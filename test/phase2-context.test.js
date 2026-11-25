'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const referents = require('../Library/lib/referents')

const CHAT = '254700000001@s.whatsapp.net'
const ALICE = '254711111111@s.whatsapp.net'
const BOB = '254722222222@s.whatsapp.net'

const inbound = (sender, overrides = {}) => ({
    chat: CHAT,
    sender,
    key: { id: `msg-${Math.random()}`, remoteJid: CHAT, fromMe: false },
    ...overrides,
})

test('resolves a pronoun to the only recent person', () => {
    referents.clearChat(CHAT)
    referents.recordInbound(inbound(ALICE))
    // Sender is Alice; the only other recent person is none — pronoun with a
    // single candidate resolves to that person when the sender is excluded
    // only if another candidate exists; here Alice herself is the candidate.
    const resolved = referents.resolvePerson(CHAT, 'him', inbound(BOB))
    assert.equal(resolved.jid, ALICE)
})

test('asks for clarification instead of guessing when two people are recent', () => {
    referents.clearChat(CHAT)
    referents.recordInbound(inbound(ALICE))
    referents.recordInbound(inbound(BOB))
    const resolved = referents.resolvePerson(CHAT, 'them', inbound('254733333333@s.whatsapp.net'))
    assert.equal(resolved.ambiguous, true)
    assert.deepEqual(resolved.candidates, [BOB, ALICE])
    const reply = referents.clarificationReply(resolved.candidates)
    assert.match(reply, /Which person did you mean/)
    assert.match(reply, /did not send anything/)
})

test('quoted and mentioned targets beat pronouns', () => {
    referents.clearChat(CHAT)
    const m = inbound(BOB, {
        quoted: { sender: ALICE, key: { participant: ALICE } },
        mentionedJid: [BOB],
    })
    referents.recordInbound(m)
    assert.equal(referents.resolvePerson(CHAT, 'quoted', m).jid, ALICE)
    assert.equal(referents.resolvePerson(CHAT, 'tagged', m).jid, BOB)
    assert.equal(referents.resolvePerson(CHAT, 'the person who replied', m).jid, BOB)
})

test('resolves "the message I just sent" to the last bot message key', () => {
    referents.clearChat(CHAT)
    const botKey = { id: 'bot-1', remoteJid: CHAT, fromMe: true }
    referents.recordOutbound(CHAT, botKey)
    assert.deepEqual(referents.resolveMessageKey(CHAT, 'the message i just sent', null, {}).key, botKey)
    const userKey = { id: 'user-1', remoteJid: CHAT, fromMe: false }
    referents.recordInbound(inbound(ALICE, { key: userKey }))
    assert.deepEqual(referents.resolveMessageKey(CHAT, 'the last message', null, {}).key, userKey)
    assert.deepEqual(referents.resolveMessageKey(CHAT, 'this message', userKey, {}).key, userKey)
})

test('stale referents expire', () => {
    referents.clearChat(CHAT)
    referents.recordInbound(inbound(ALICE))
    const entry = referents.getEntry(CHAT)
    entry.persons[0].at = Date.now() - referents.REFERENT_TTL_MS - 1000
    assert.equal(referents.resolvePerson(CHAT, 'him', inbound(BOB)).jid, null)
})
