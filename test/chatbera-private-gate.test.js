'use strict'
// Regression test: ChatBera must answer PMs even when the bot is in
// PRIVATE mode. Before the fix, the private-mode gate in the Handler
// (`if (!authorized) return`, inside the non-command path) silently
// dropped every non-owner message before the ChatBera branch could run,
// so ".chatbera on" showed an active card but nobody ever got a reply.
// The fix evaluates ChatBera BEFORE the gate; the gate still blocks the
// agent and all other NLP for non-owners, and agent-claimed messages
// ("agent ..." / mentions) are never taken by ChatBera.
//
// Each case runs in a child process: loading the real Handler starts
// background timers, and the child exits explicitly when done (the same
// pattern other Handler-level tests in this repo use).
const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const REPO = path.join(__dirname, '..')
const CHILD = `
process.chdir(${JSON.stringify(REPO)})
const beraaiPath = require.resolve(${JSON.stringify(path.join(REPO, 'Library/actions/beraai'))})
require.cache[beraaiPath] = { id: beraaiPath, filename: beraaiPath, loaded: true,
    exports: { generateSimpleReply: async () => ({ success: true, reply: 'Yooh mkuu, nko poa sana' }) } }
const { handleMessage } = require(${JSON.stringify(path.join(REPO, 'Handler'))})
const CHAT = '8337380428@lid'
const chatberaOn = process.argv[2] === 'on'
const text = process.argv[3]
global.prefix = '.'
global.db = { data: { settings: { mode: 'private' },
    chatbera: { globalEnabled: chatberaOn, enabled: {}, groupEnabled: false,
        languagePreferences: {}, voiceReplies: {},
        // 5 replies already sent in this chat: the first-3 voice rule
        // does not fire, so the reply goes out as deterministic text.
        replyCounts: { [CHAT]: 5 },
        profile: { myName: 'Bruce Bera', myFullName: 'Bruce Bera', myMessages: ['Yooh mkuu'] } },
    users: {}, sudo: [], stats: {} }, write: async () => {} }
const sends = []
const conn = { user: { id: '254116763755:47@s.whatsapp.net' },
    sendMessage: async (jid, content) => { sends.push({ jid, text: content && content.text || '' }); return { key: { id: 'x' } } },
    sendPresenceUpdate: async () => {}, readMessages: async () => {},
    groupMetadata: async () => ({ participants: [] }) }
;(async () => {
    await handleMessage(conn, { key: { remoteJid: CHAT, fromMe: false, id: 'GATE-CASE' },
        message: { conversation: text }, pushName: 'jared_anthony_higgins',
        messageTimestamp: Math.floor(Date.now() / 1000) })
    console.log('RESULT ' + JSON.stringify(sends))
    process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
`

const childPath = path.join(os.tmpdir(), 'chatbera-gate-child.js')
fs.writeFileSync(childPath, CHILD)

const runCase = (mode, text) => {
    const out = execFileSync(process.execPath, [childPath, mode, text], {
        cwd: path.join(__dirname, '..'),
        timeout: 90000,
        encoding: 'utf8',
    })
    const line = out.split('\n').find(l => l.startsWith('RESULT '))
    assert.ok(line, 'child produced no RESULT line')
    return JSON.parse(line.slice('RESULT '.length))
}

test('private mode + ChatBera ON: a non-owner PM gets a ChatBera reply', () => {
    const sends = runCase('on', 'Hello')
    assert.equal(sends.length, 1)
    assert.equal(sends[0].jid, '8337380428@lid')
    assert.match(sends[0].text, /Yooh mkuu/)
})

test('private mode + ChatBera OFF: a non-owner PM is still silently dropped', () => {
    const sends = runCase('off', 'Hello')
    assert.equal(sends.length, 0)
})

test('private mode + ChatBera ON: an agent-trigger message is NOT taken by ChatBera', () => {
    const sends = runCase('on', 'agent hello')
    assert.equal(sends.length, 0)
})
