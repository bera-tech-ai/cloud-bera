'use strict'

// ChatBera flow upgrade (2026-11-26, approved by Bera):
//  1. ChatBera replies use his persona (beraai.buildChatBeraSystemPrompt
//     / resolveChatBeraProfile) instead of the generic Bera AI persona.
//     UPDATED 2026-11-26: Bera had the training removed — the prompt must
//     carry persona facts only, never the trained style samples, and
//     ChatBera answers in English / Kiswahili / a natural mix, no Sheng.
//  2. ChatBera language flows automatically per message
//     (language-routing.detectMessageLanguage) unless a preference was stored.
//  3. Conversation history persists to the db (beraai pushHistory/getHistory
//     mirror + adopt). Style learning from Bera's outgoing messages was
//     removed with the training; the style-learning helpers remain covered
//     here as a library (the sent-reply registry is still maintained).
// Fixtures here are synthetic — never the real trained profile contents.

const test = require('node:test')
const assert = require('node:assert/strict')
const { detectMessageLanguage } = require('../Library/actions/language-routing')
const {
    shouldLearnFromMessage, registerSentReply, consumeSentReply,
    appendStyleSample, isStyleLearningEnabled, SENT_REPLIES_PER_CHAT
} = require('../Library/actions/style-learning')
const beraai = require('../Library/actions/beraai')

// ── 2. detectMessageLanguage ─────────────────────────────────────────────────

test('detectMessageLanguage: plain English is en', () => {
    assert.equal(detectMessageLanguage('Hello, are we still meeting tomorrow at the office?'), 'en')
    assert.equal(detectMessageLanguage('Please send me the report when you are done'), 'en')
    assert.equal(detectMessageLanguage(''), 'en')
    assert.equal(detectMessageLanguage(null), 'en')
})

test('detectMessageLanguage: Swahili is sw', () => {
    assert.equal(detectMessageLanguage('Habari yako, asante sana kwa msaada wako'), 'sw')
    assert.equal(detectMessageLanguage('Jambo rafiki, tutaonana kesho asubuhi'), 'sw')
    assert.equal(detectMessageLanguage('Tafadhali niambie kama umefika, kwaheri'), 'sw')
})

test('detectMessageLanguage: Sheng is sheng', () => {
    assert.equal(detectMessageLanguage('Niaje mkuu, mbogi iko rada kabisa'), 'sheng')
    assert.equal(detectMessageLanguage('Buda, hiyo ni noma, manze iza'), 'sheng')
})

test('detectMessageLanguage: Sheng/Swahili mix resolves to sheng', () => {
    assert.equal(detectMessageLanguage('Habari mkuu, niaje, tutaonana kesho'), 'sheng')
    assert.equal(detectMessageLanguage('Asante sana mkuu, uko poa'), 'sheng')
})

// ── 1. Style prompt construction ─────────────────────────────────────────────

const FAKE_PROFILE = {
    myName: 'Bruce Bera',
    myFullName: 'Bruce Bera',
    myCity: 'Nairobi',
    myCountry: 'Kenya',
    myGithub: 'bera-tech-ai',
    myMessages: ['Yooh mkuu', 'Niaje man', 'Haina noma, tutaonana baadaye', 'Poa sana, niko rada']
}

test('buildChatBeraSystemPrompt: persona facts in, trained samples OUT (training removed)', () => {
    const prompt = beraai.buildChatBeraSystemPrompt({
        profile: FAKE_PROFILE,
        languageInstruction: 'Reply in a natural mix of English and Kiswahili. Do not use Sheng slang.',
        memStr: '\n\nThings I remember about you:\nname: Otis'
    })
    assert.match(prompt, /Bruce Bera/)
    assert.match(prompt, /Nairobi/)
    assert.match(prompt, /Kenya/)
    // The training must not leak into the prompt anymore.
    assert.doesNotMatch(prompt, /Yooh mkuu/)
    assert.doesNotMatch(prompt, /Niaje man/)
    assert.doesNotMatch(prompt, /Real examples/)
    assert.match(prompt, /natural mix of English and Kiswahili/)
    // Replies as a person, never as an AI/bot, and no markdown habits.
    assert.match(prompt, /NOT an AI/)
    assert.match(prompt, /Do not use markdown/)
    // Remembered facts survive, reframed as his memory of the person.
    assert.match(prompt, /remembers about this person/)
    assert.match(prompt, /name: Otis/)
})

test('buildChatBeraSystemPrompt: a huge profile cannot bloat the prompt', () => {
    const big = { ...FAKE_PROFILE, myMessages: Array.from({ length: 500 }, (_, i) => `sample number ${i}`) }
    const prompt = beraai.buildChatBeraSystemPrompt({ profile: big, languageInstruction: '', memStr: '' })
    assert.doesNotMatch(prompt, /sample number/)
    assert.ok(prompt.length < 1500, `prompt too long: ${prompt.length}`)
})

test('buildChatBeraSystemPrompt: credential-shaped profile entries never reach the prompt', () => {
    const dirty = { ...FAKE_PROFILE, myMessages: ['Niaje mkuu', 'mongodb+srv://user:pass@cluster.example.net/db', 'Poa sana'] }
    const prompt = beraai.buildChatBeraSystemPrompt({ profile: dirty, languageInstruction: '', memStr: '' })
    assert.doesNotMatch(prompt, /mongodb\+srv/)
    assert.doesNotMatch(prompt, /Niaje mkuu/)
})

test('resolveChatBeraProfile: an explicit profile wins', () => {
    const resolved = beraai.resolveChatBeraProfile(FAKE_PROFILE)
    assert.deepEqual(resolved.myMessages, FAKE_PROFILE.myMessages)
    assert.equal(resolved.myName, 'Bruce Bera')
})

test('resolveChatBeraProfile: the live db profile wins over the prebuilt one', () => {
    global.db = { data: { chatbera: { profile: { myName: 'Bruce Bera', myMessages: ['Db sample one', 'Db sample two'] } } }, write: async () => {} }
    try {
        const resolved = beraai.resolveChatBeraProfile()
        assert.deepEqual(resolved.myMessages, ['Db sample one', 'Db sample two'])
    } finally { delete global.db }
})

test('resolveChatBeraProfile: falls back to the prebuilt trained profile', () => {
    delete global.db
    const resolved = beraai.resolveChatBeraProfile()
    assert.ok(resolved && Array.isArray(resolved.myMessages) && resolved.myMessages.length > 0)
    assert.equal(resolved.myName, 'Bruce Bera')
})

// ── 3a. History persistence ──────────────────────────────────────────────────

test('history: pushes mirror into db.data.chatbera.chatHistory', () => {
    const fakeDb = { data: {}, write: async () => {} }
    global.db = fakeDb
    try {
        beraai.pushHistory('hist-a@test', 'user', 'hello there')
        beraai.pushHistory('hist-a@test', 'assistant', 'hi, karibu')
        assert.deepEqual(fakeDb.data.chatbera.chatHistory['hist-a@test'], [
            { role: 'user', content: 'hello there' },
            { role: 'assistant', content: 'hi, karibu' }
        ])
        assert.deepEqual(beraai.getHistory('hist-a@test'), [
            { role: 'user', content: 'hello there' },
            { role: 'assistant', content: 'hi, karibu' }
        ])
    } finally { delete global.db }
})

test('history: mirrored history is capped at the last 20 turns', () => {
    const fakeDb = { data: {}, write: async () => {} }
    global.db = fakeDb
    try {
        for (let i = 1; i <= 25; i++) beraai.pushHistory('hist-b@test', 'user', `turn ${i}`)
        const stored = fakeDb.data.chatbera.chatHistory['hist-b@test']
        assert.equal(stored.length, 20)
        assert.equal(stored[0].content, 'turn 6')
        assert.equal(beraai.getHistory('hist-b@test').length, 20)
    } finally { delete global.db }
})

test('history: stored history is adopted back after a restart', () => {
    const staged = {
        'hist-c@test': [
            { role: 'user', content: 'old question' },
            { role: 'assistant', content: 'old answer' }
        ]
    }
    const fakeDb = { data: { chatbera: { chatHistory: JSON.parse(JSON.stringify(staged)) } }, write: async () => {} }
    global.db = fakeDb
    try {
        beraai._resetHistoryAdoption()
        assert.deepEqual(beraai.getHistory('hist-c@test'), staged['hist-c@test'])
        // And new turns append onto the adopted history and mirror back.
        beraai.pushHistory('hist-c@test', 'user', 'new question')
        const stored = fakeDb.data.chatbera.chatHistory['hist-c@test']
        assert.equal(stored.length, 3)
        assert.equal(stored[2].content, 'new question')
    } finally { delete global.db }
})

// ── 3b. Style learning decision ──────────────────────────────────────────────

const NOW = 1_700_000_000_000

test('shouldLearnFromMessage: a real owner PM message is learned', () => {
    const v = shouldLearnFromMessage({ fromMe: true, isGroup: false, isSelfChat: false, text: 'Sawa mkuu, tutaonana baadaye', prefix: '.', sentReplies: [], now: NOW })
    assert.equal(v.learn, true)
    assert.equal(v.text, 'Sawa mkuu, tutaonana baadaye')
})

test('shouldLearnFromMessage: non-owner, group and self-chat messages are skipped', () => {
    assert.equal(shouldLearnFromMessage({ fromMe: false, text: 'hello there friend' }).reason, 'not-from-me')
    assert.equal(shouldLearnFromMessage({ fromMe: true, isGroup: true, text: 'hello there group' }).reason, 'group')
    assert.equal(shouldLearnFromMessage({ fromMe: true, isSelfChat: true, text: 'note to self here' }).reason, 'self-chat')
})

test('shouldLearnFromMessage: commands, triggers, URLs and tiny texts are skipped', () => {
    const base = { fromMe: true, prefix: '.', sentReplies: [], now: NOW }
    assert.equal(shouldLearnFromMessage({ ...base, text: '.menu' }).reason, 'command')
    assert.equal(shouldLearnFromMessage({ ...base, text: 'Agent, build me a site' }).reason, 'agent-trigger')
    assert.equal(shouldLearnFromMessage({ ...base, text: 'bera check this please' }).reason, 'agent-trigger')
    assert.equal(shouldLearnFromMessage({ ...base, text: 'https://example.com/page' }).reason, 'url-only')
    assert.equal(shouldLearnFromMessage({ ...base, text: 'hi' }).reason, 'too-short')
    // A link inside a real sentence is still his words.
    assert.equal(shouldLearnFromMessage({ ...base, text: 'Cheki hii https://example.com ni noma' }).learn, true)
})

test('shouldLearnFromMessage: a registered bot-sent reply is excluded, an expired one is not', () => {
    const fresh = [{ text: 'Poa sana, tutaonana kesho', ts: NOW - 60_000 }]
    const v = shouldLearnFromMessage({ fromMe: true, text: 'Poa sana, tutaonana kesho', prefix: '.', sentReplies: fresh, now: NOW })
    assert.equal(v.learn, false)
    assert.equal(v.reason, 'bot-sent')
    assert.equal(v.sentReplyIndex, 0)

    const stale = [{ text: 'Poa sana, tutaonana kesho', ts: NOW - 11 * 60_000 }]
    const v2 = shouldLearnFromMessage({ fromMe: true, text: 'Poa sana, tutaonana kesho', prefix: '.', sentReplies: stale, now: NOW })
    assert.equal(v2.learn, true)
})

test('registerSentReply / consumeSentReply: bounded registry round-trip', () => {
    const store = {}
    for (let i = 0; i < SENT_REPLIES_PER_CHAT + 2; i++) {
        assert.equal(registerSentReply(store, 'chat@x', `reply number ${i}`, NOW + i), true)
    }
    assert.equal(store.sentReplies['chat@x'].length, SENT_REPLIES_PER_CHAT)
    assert.equal(store.sentReplies['chat@x'][0].text, 'reply number 2')
    assert.equal(consumeSentReply(store, 'chat@x', 0), true)
    assert.equal(store.sentReplies['chat@x'].length, SENT_REPLIES_PER_CHAT - 1)
    assert.equal(consumeSentReply(store, 'chat@x', 99), false)
    assert.equal(registerSentReply(store, 'chat@x', '   '), false)
})

test('appendStyleSample: adds, dedupes and FIFO-caps', () => {
    const profile = { myMessages: ['first sample'] }
    assert.equal(appendStyleSample(profile, 'second sample'), true)
    assert.equal(appendStyleSample(profile, 'second sample'), false) // dupe
    assert.equal(appendStyleSample(profile, '  second   sample '), false) // dupe after normalize
    for (let i = 0; i < 6; i++) appendStyleSample(profile, `extra sample ${i}`, 5)
    assert.equal(profile.myMessages.length, 5)
    assert.equal(profile.myMessages[4], 'extra sample 5')
    assert.ok(!profile.myMessages.includes('first sample')) // oldest dropped by the cap
})

test('isStyleLearningEnabled: BERA_CHATBERA_LEARN=0 is the kill switch', () => {
    assert.equal(isStyleLearningEnabled({ BERA_CHATBERA_LEARN: '0' }), false)
    assert.equal(isStyleLearningEnabled({}), true)
    assert.equal(isStyleLearningEnabled({ BERA_CHATBERA_LEARN: '1' }), true)
})
