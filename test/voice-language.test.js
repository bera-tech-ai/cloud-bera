'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeLanguage, resolveSpeechLanguage } = require('../Library/actions/tts')
const voicePlugin = require('../Plugins/voice')

test('normalizes English, Swahili, and Sheng language preferences', () => {
    assert.equal(normalizeLanguage('EN'), 'en')
    assert.equal(normalizeLanguage('sw'), 'sw')
    assert.equal(normalizeLanguage('sh'), 'sheng')
    assert.equal(normalizeLanguage('sheng'), 'sheng')
    assert.equal(normalizeLanguage('unknown'), 'auto')
})

test('chooses Swahili speech for Sheng and Swahili-language replies', () => {
    assert.equal(resolveSpeechLanguage('Sasa mkuu, uko poa?'), 'sw')
    assert.equal(resolveSpeechLanguage('Habari yako, niko sawa'), 'sw')
    assert.equal(resolveSpeechLanguage('Sasa mkuu', 'sheng'), 'sw')
})

test('keeps English speech for English replies or explicit English preference', () => {
    assert.equal(resolveSpeechLanguage('That looks good, I can help with it.'), 'en')
    assert.equal(resolveSpeechLanguage('Habari, mkuu', 'en'), 'en')
    assert.equal(resolveSpeechLanguage('Hi, how are you?', 'sw'), 'sw')
})

test('language and voice controls save per-sender choices and keep group voice off', async () => {
    const previousDb = global.db
    global.db = { data: {}, write: async () => {} }
    const sender = '254700000001@s.whatsapp.net'
    const replies = []
    const ctx = { jid: sender, sender, command: 'language', reply: async text => replies.push(text) }
    try {
        await voicePlugin.run({}, {}, ['sheng'], ctx)
        assert.equal(global.db.data.chatbera.languagePreferences[sender], 'sheng')
        ctx.command = 'voice'
        await voicePlugin.run({}, {}, ['auto', 'on'], ctx)
        assert.equal(global.db.data.chatbera.voiceReplies[sender], true)
        ctx.jid = '12345@g.us'
        await voicePlugin.run({}, {}, ['auto', 'on'], ctx)
        assert.equal(global.db.data.chatbera.voiceReplies[sender], true)
        assert.match(replies.at(-1), /private chat/i)
    } finally {
        global.db = previousDb
    }
})
