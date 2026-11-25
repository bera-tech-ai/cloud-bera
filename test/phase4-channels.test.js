'use strict'

// Phase 4 §26 matrix — Channels (spec §15), verified against the installed
// Baileys 7.0.0-rc14 newsletter API. Supported operations use the real
// method names; unsupported ones answer in the §25 format. No live WhatsApp
// session is used here — the socket is faked, and every operation is checked
// for accepted-vs-failure results, never for "returned without throwing".

const test = require('node:test')
const assert = require('node:assert/strict')
const {
    NEWSLETTER_METHODS,
    CHANNEL_FEATURES,
    getChannelSupport,
    normalizeChannelJid,
    getChannelInfo,
    followChannel,
    unfollowChannel,
    fetchChannelMessages,
    reactToChannelMessage,
    postToChannel,
    channelStatusText
} = require('../Library/lib/channels')

// Fake socket with the newsletter methods the installed Baileys exposes.
const fullSocket = (overrides = {}) => ({
    sendMessage: async () => ({ key: { id: 'sent-1' } }),
    newsletterMetadata: async (type, key) => ({ id: key, name: 'Bera Updates', description: 'News from Bera', subscriber_count: 42 }),
    newsletterFollow: async () => ({ ok: true }),
    newsletterUnfollow: async () => ({ ok: true }),
    newsletterMute: async () => ({}),
    newsletterUnmute: async () => ({}),
    newsletterFetchMessages: async () => [{ message: { conversation: 'hello channel' } }],
    newsletterReactMessage: async () => {},
    newsletterCreate: async () => ({ id: '120363000000000001@newsletter' }),
    newsletterSubscribers: async () => ({ subscribers: [] }),
    ...overrides
})

test('channel support probe detects the Baileys newsletter API and degrades cleanly', () => {
    const full = getChannelSupport(fullSocket())
    assert.equal(full.supported, true)
    assert.equal(full.canPost, true)
    assert.deepEqual(full.missing, [])
    assert.ok(full.available.includes('newsletterMetadata'))

    const bare = getChannelSupport({ sendMessage: async () => ({}) })
    assert.equal(bare.supported, false)
    assert.equal(bare.canPost, true)
    assert.deepEqual(bare.available, [])

    const empty = getChannelSupport({})
    assert.equal(empty.supported, false)
    assert.equal(empty.canPost, false)
    assert.equal(empty.missing.length, NEWSLETTER_METHODS.length)
})

test('channel JIDs accept IDs, @newsletter JIDs and invite links — and reject the rest', () => {
    assert.equal(normalizeChannelJid('120363000000000001'), '120363000000000001@newsletter')
    assert.equal(normalizeChannelJid('120363000000000001@newsletter'), '120363000000000001@newsletter')
    assert.equal(normalizeChannelJid('https://whatsapp.com/channel/120363000000000001'), '120363000000000001@newsletter')
    assert.throws(() => normalizeChannelJid(''), /channel ID/)
    assert.throws(() => normalizeChannelJid('not-a-channel'), /channel ID/)
    assert.throws(() => normalizeChannelJid('abc@newsletter'), /channel ID/)
})

test('channel info returns metadata when the API exists, unsupported when it does not', async () => {
    const ok = await getChannelInfo(fullSocket(), '120363000000000001')
    assert.equal(ok.ok, true)
    assert.equal(ok.meta.name, 'Bera Updates')
    assert.equal(ok.meta.subscriber_count, 42)

    const missing = await getChannelInfo({}, '120363000000000001')
    assert.equal(missing.ok, false)
    assert.ok(missing.unsupported)
    assert.match(missing.unsupported.text, /Unsupported: Reading channel information/)

    const failing = await getChannelInfo(fullSocket({ newsletterMetadata: async () => { throw new Error('query failed') } }), '120363000000000001')
    assert.equal(failing.ok, false)
    assert.equal(failing.error, 'query failed')

    const notFound = await getChannelInfo(fullSocket({ newsletterMetadata: async () => null }), '120363000000000001')
    assert.equal(notFound.ok, false)
    assert.match(notFound.error, /no information/)
})

test('follow / unfollow / recent / react report failure instead of claiming success', async () => {
    assert.deepEqual(await followChannel(fullSocket(), '120363000000000001'), { ok: true, jid: '120363000000000001@newsletter' })
    assert.deepEqual(await unfollowChannel(fullSocket(), '120363000000000001'), { ok: true, jid: '120363000000000001@newsletter' })

    const recent = await fetchChannelMessages(fullSocket(), '120363000000000001', 5)
    assert.equal(recent.ok, true)
    assert.equal(recent.messages.length, 1)

    const reacted = await reactToChannelMessage(fullSocket(), '120363000000000001', 'MSG-1', '❤️')
    assert.equal(reacted.ok, true)
    await assert.rejects(reactToChannelMessage(fullSocket(), '120363000000000001', ''), /message ID/)

    const denied = await followChannel({}, '120363000000000001')
    assert.equal(denied.ok, false)
    assert.ok(denied.unsupported)
})

test('channel posts claim Baileys acceptance only — falsy or thrown means failure', async () => {
    const accepted = await postToChannel(fullSocket(), '120363000000000001', 'Hello channel')
    assert.deepEqual(accepted, { ok: true, jid: '120363000000000001@newsletter', accepted: true })

    const notAccepted = await postToChannel(fullSocket({ sendMessage: async () => null }), '120363000000000001', 'Hello')
    assert.equal(notAccepted.ok, false)
    assert.match(notAccepted.error, /did not accept/)

    const threw = await postToChannel(fullSocket({ sendMessage: async () => { throw new Error('not a channel admin') } }), '120363000000000001', 'Hello')
    assert.equal(threw.ok, false)
    assert.equal(threw.error, 'not a channel admin')

    await assert.rejects(postToChannel(fullSocket(), '120363000000000001', '   '), /cannot be empty/)
})

test('the §15 feature table is explicit: supported, accepted-only and unsupported', () => {
    const byName = Object.fromEntries(CHANNEL_FEATURES.map(f => [f.feature, f]))
    assert.equal(byName['Channel information'].status, 'supported')
    assert.equal(byName['Channel follow / unfollow'].status, 'supported')
    assert.equal(byName['Channel posts'].status, 'accepted-only')
    assert.equal(byName['Channel discovery'].status, 'unsupported')
    assert.equal(byName['Channel polls'].status, 'unsupported')
    assert.equal(byName['Scheduled channel posts'].status, 'unsupported')
    assert.equal(byName['Channel report / spam'].status, 'unsupported')
    for (const feature of CHANNEL_FEATURES.filter(f => f.status === 'unsupported')) {
        assert.ok(typeof feature.unsupported === 'function')
        const response = feature.unsupported()
        assert.match(response.text, /❌ Unsupported:/)
        assert.ok(response.text.includes('Alternative:'))
    }
    const status = channelStatusText(fullSocket())
    assert.match(status, /Channel support: available/)
    assert.match(status, /Channel discovery — unsupported/)
})
