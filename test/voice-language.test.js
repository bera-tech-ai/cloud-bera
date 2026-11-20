'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeLanguage, resolveSpeechLanguage } = require('../Library/actions/tts')
const voicePlugin = require('../Plugins/voice')
const { detectIntent } = require('../Library/router')
const { parseLanguageChange, parseTranslationRequest, saveLanguagePreference } = require('../Library/actions/language-routing')

test('normalizes English as the default and preserves explicit language choices', () => {
    assert.equal(normalizeLanguage(), 'en')
    assert.equal(normalizeLanguage('EN'), 'en')
    assert.equal(normalizeLanguage('sw'), 'sw')
    assert.equal(normalizeLanguage('sh'), 'sheng')
    assert.equal(normalizeLanguage('sheng'), 'sheng')
    assert.equal(normalizeLanguage('auto'), 'auto')
    assert.equal(normalizeLanguage('unknown'), 'en')
})

test('uses English speech by default and honors explicit Swahili or Sheng preferences', () => {
    assert.equal(resolveSpeechLanguage('Sasa mkuu, uko poa?'), 'en')
    assert.equal(resolveSpeechLanguage('That looks good, I can help with it.'), 'en')
    assert.equal(resolveSpeechLanguage('Habari, mkuu', 'en'), 'en')
    assert.equal(resolveSpeechLanguage('Hi, how are you?', 'sw'), 'sw')
    assert.equal(resolveSpeechLanguage('Sasa mkuu', 'sheng'), 'sw')
})

test('natural language preference changes do not enter the translation route', () => {
    const request = 'Bera, change my reply language to English'
    assert.equal(detectIntent(request), 'set_language')
    assert.deepEqual(parseLanguageChange(request), { language: 'en' })
    assert.deepEqual(parseLanguageChange('Please switch my language to Sheng'), { language: 'sheng' })
    assert.equal(detectIntent('translate hello to French'), 'translate')
    assert.equal(detectIntent('translate "change my reply language to English" to French'), 'translate')
    assert.deepEqual(parseTranslationRequest('translate hello to French'), { target: 'french', text: 'hello' })
    assert.deepEqual(parseTranslationRequest('translate to English: habari yako'), { target: 'english', text: 'habari yako' })
    assert.equal(parseLanguageChange('translate the phrase to English'), null)
})

test('natural-language language preference saves per sender and rolls back on write failure', async () => {
    const data = { chatbera: { languagePreferences: {} } }
    let writes = 0
    const db = { data, write: async () => { writes++ } }
    await saveLanguagePreference(db, '254700000001:5@s.whatsapp.net', 'en')
    assert.equal(data.chatbera.languagePreferences['254700000001@s.whatsapp.net'], 'en')
    assert.equal(writes, 1)
    const failingDb = { data, write: async () => { throw new Error('database unavailable') } }
    await assert.rejects(saveLanguagePreference(failingDb, '254700000001@s.whatsapp.net', 'sheng'), /database unavailable/)
    assert.equal(data.chatbera.languagePreferences['254700000001@s.whatsapp.net'], 'en')
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
        await voicePlugin.run({}, {}, [], ctx)
        assert.match(replies.at(-1), /sheng/i)
        await voicePlugin.run({}, {}, ['en'], ctx)
        assert.equal(global.db.data.chatbera.languagePreferences[sender], 'en')
        ctx.command = 'voice'
        await voicePlugin.run({}, {}, ['auto', 'on'], ctx)
        assert.equal(global.db.data.chatbera.voiceReplies[sender], true)
        ctx.jid = '12345@g.us'
        await voicePlugin.run({}, {}, ['auto', 'on'], ctx)
        assert.equal(global.db.data.chatbera.voiceReplies[sender], true)
        assert.match(replies.at(-1), /private chat/i)
    } finally { global.db = previousDb }
})
