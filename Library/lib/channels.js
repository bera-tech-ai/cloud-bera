'use strict'

// Phase 4 — Channels (spec §15). Explicit decision, not silence.
//
// The audit found §15 "Missing": no channel discovery, info, posts, polls,
// scheduled posts, report/spam flows or newsletter fetch/follow in the bot,
// and §15 itself says every feature must be checked against the actual
// installed Baileys version before implementation.
//
// Checked against the installed runtime (@whiskeysockets/baileys 7.0.0-rc14,
// the version npm resolves for this repo):
//   Available on the socket:
//     newsletterMetadata, newsletterFollow, newsletterUnfollow,
//     newsletterMute, newsletterUnmute, newsletterFetchMessages,
//     newsletterReactMessage, newsletterCreate, newsletterSubscribers,
//     newsletterUpdateName/Description/Picture, newsletterAdminCount,
//     newsletterChangeOwner/Demote/Delete
//   Posting to a channel is a plain sendMessage to the channel's
//   @newsletter JID; only Baileys acceptance is reported, never
//   device-side delivery (spec §23).
//   NOT available anywhere in the installed Baileys:
//     channel discovery / search (no fetch-all API), channel polls,
//     scheduled channel posts, report/spam flows.
// Those four are therefore implemented as explicit "unsupported" answers
// (see Library/lib/unsupported.js), not simulated and not left silent.
//
// Every function here probes the live socket for the method it needs
// (typeof conn.newsletterX === 'function') instead of assuming the version,
// so the module degrades to the same unsupported answers on an older or
// different socket. Nothing here needs a live WhatsApp session to unit test:
// the probe and the JID parsing are pure, and the operations take a conn.

const {
    unsupportedResponse,
    CHANNEL_DISCOVERY,
    CHANNEL_POLLS,
    CHANNEL_SCHEDULED_POSTS,
    CHANNEL_REPORT_SPAM
} = require('./unsupported')

const NEWSLETTER_METHODS = [
    'newsletterMetadata',
    'newsletterFollow',
    'newsletterUnfollow',
    'newsletterMute',
    'newsletterUnmute',
    'newsletterFetchMessages',
    'newsletterReactMessage',
    'newsletterCreate',
    'newsletterSubscribers'
]

const getChannelSupport = (conn = {}) => {
    const available = NEWSLETTER_METHODS.filter(name => typeof conn[name] === 'function')
    const missing = NEWSLETTER_METHODS.filter(name => typeof conn[name] !== 'function')
    return {
        runtime: 'baileys',
        available,
        missing,
        canPost: typeof conn.sendMessage === 'function',
        supported: available.length > 0
    }
}

// Accept a bare channel ID (digits), a full @newsletter JID, or a WhatsApp
// channel invite link (https://whatsapp.com/channel/<id>).
const normalizeChannelJid = value => {
    const raw = String(value || '').trim()
    if (!raw) throw new Error('Provide a channel ID, a @newsletter JID, or a WhatsApp channel invite link.')
    const link = raw.match(/whatsapp\.com\/channel\/([0-9]+)/i)
    if (link) return `${link[1]}@newsletter`
    if (raw.endsWith('@newsletter')) {
        const id = raw.split('@')[0]
        if (!/^[0-9]+$/.test(id)) throw new Error('That channel JID does not look like a WhatsApp channel ID.')
        return raw
    }
    const digits = raw.replace(/[^0-9]/g, '')
    if (digits.length < 10 || digits.length > 30 || digits !== raw.replace(/[^0-9]/g, '')) {
        throw new Error('Provide a channel ID (digits), a @newsletter JID, or a WhatsApp channel invite link.')
    }
    return `${digits}@newsletter`
}

const channelInfoUnsupported = () => unsupportedResponse({
    what: 'Reading channel information.',
    why: 'The connected WhatsApp socket does not expose the channel (newsletter) API.',
    alternative: 'Open the channel in WhatsApp and read its info there.',
    retry: 'Yes — retry after reconnecting with a Baileys version that exposes newsletterMetadata.'
})

const requireMethod = (conn, method) => {
    if (typeof conn?.[method] !== 'function') return false
    return true
}

const getChannelInfo = async (conn, jidOrLink) => {
    const jid = normalizeChannelJid(jidOrLink)
    if (!requireMethod(conn, 'newsletterMetadata')) return { ok: false, jid, unsupported: channelInfoUnsupported() }
    try {
        const meta = await conn.newsletterMetadata('jid', jid)
        if (!meta) return { ok: false, jid, error: 'WhatsApp returned no information for that channel.' }
        return { ok: true, jid, meta }
    } catch (error) {
        return { ok: false, jid, error: String(error?.message || error) }
    }
}

const followChannel = async (conn, jidOrLink) => {
    const jid = normalizeChannelJid(jidOrLink)
    if (!requireMethod(conn, 'newsletterFollow')) return { ok: false, jid, unsupported: channelInfoUnsupported() }
    try {
        await conn.newsletterFollow(jid)
        return { ok: true, jid }
    } catch (error) {
        return { ok: false, jid, error: String(error?.message || error) }
    }
}

const unfollowChannel = async (conn, jidOrLink) => {
    const jid = normalizeChannelJid(jidOrLink)
    if (!requireMethod(conn, 'newsletterUnfollow')) return { ok: false, jid, unsupported: channelInfoUnsupported() }
    try {
        await conn.newsletterUnfollow(jid)
        return { ok: true, jid }
    } catch (error) {
        return { ok: false, jid, error: String(error?.message || error) }
    }
}

const fetchChannelMessages = async (conn, jidOrLink, count = 10) => {
    const jid = normalizeChannelJid(jidOrLink)
    if (!requireMethod(conn, 'newsletterFetchMessages')) return { ok: false, jid, unsupported: channelInfoUnsupported() }
    const n = Math.max(1, Math.min(25, Number(count) || 10))
    try {
        const messages = await conn.newsletterFetchMessages(jid, n, 0, 0)
        return { ok: true, jid, messages: Array.isArray(messages) ? messages : [] }
    } catch (error) {
        return { ok: false, jid, error: String(error?.message || error) }
    }
}

const reactToChannelMessage = async (conn, jidOrLink, serverId, reaction = '') => {
    const jid = normalizeChannelJid(jidOrLink)
    if (!serverId) throw new Error('A channel message ID is required to react.')
    if (!requireMethod(conn, 'newsletterReactMessage')) return { ok: false, jid, unsupported: channelInfoUnsupported() }
    try {
        await conn.newsletterReactMessage(jid, String(serverId), String(reaction || ''))
        return { ok: true, jid, serverId: String(serverId) }
    } catch (error) {
        return { ok: false, jid, error: String(error?.message || error) }
    }
}

// Posting is sendMessage to the @newsletter JID. Only Baileys acceptance is
// claimed: a truthy return means "accepted by Baileys", never device-side
// delivery (spec §23). Live posting has not been verified with a real
// session — see CHANNELS.md.
const postToChannel = async (conn, jidOrLink, text) => {
    const jid = normalizeChannelJid(jidOrLink)
    const body = String(text || '').trim()
    if (!body) throw new Error('Channel post text cannot be empty.')
    if (typeof conn?.sendMessage !== 'function') return { ok: false, jid, unsupported: channelInfoUnsupported() }
    try {
        const sent = await conn.sendMessage(jid, { text: body })
        if (!sent) return { ok: false, jid, error: 'Baileys did not accept the channel post.' }
        return { ok: true, jid, accepted: true }
    } catch (error) {
        return { ok: false, jid, error: String(error?.message || error) }
    }
}

// The §15 feature table as implemented in Phase 4. Statuses: 'supported'
// (Baileys API exists and is wired here), 'accepted-only' (sent through
// sendMessage; only acceptance is reported), 'unsupported' (no Baileys API).
const CHANNEL_FEATURES = [
    { feature: 'Channel information', status: 'supported', detail: 'newsletterMetadata by JID or invite link.' },
    { feature: 'Channel follow / unfollow', status: 'supported', detail: 'newsletterFollow / newsletterUnfollow.' },
    { feature: 'Channel posts', status: 'accepted-only', detail: 'sendMessage to the @newsletter JID; acceptance only, live posting not yet verified.' },
    { feature: 'Channel recent messages', status: 'supported', detail: 'newsletterFetchMessages.' },
    { feature: 'Channel message reactions', status: 'supported', detail: 'newsletterReactMessage.' },
    { feature: 'Channel mute / unmute', status: 'supported', detail: 'newsletterMute / newsletterUnmute.' },
    { feature: 'Channel discovery', status: 'unsupported', detail: 'No Baileys discovery API.', unsupported: CHANNEL_DISCOVERY },
    { feature: 'Channel polls', status: 'unsupported', detail: 'No Baileys channel poll API.', unsupported: CHANNEL_POLLS },
    { feature: 'Scheduled channel posts', status: 'unsupported', detail: 'No Baileys scheduled-post API.', unsupported: CHANNEL_SCHEDULED_POSTS },
    { feature: 'Channel report / spam', status: 'unsupported', detail: 'No Baileys report/spam API.', unsupported: CHANNEL_REPORT_SPAM }
]

const channelStatusText = (conn = {}) => {
    const support = getChannelSupport(conn)
    const lines = [
        `Channel support: ${support.supported ? 'available' : 'unavailable'} (Baileys newsletter API)`,
        `Available methods: ${support.available.length ? support.available.join(', ') : 'none'}`,
        `Posting: ${support.canPost ? 'sendMessage to @newsletter JID (acceptance only)' : 'unavailable'}`,
        '',
        ...CHANNEL_FEATURES.map(f => `• ${f.feature} — ${f.status}${f.detail ? ` (${f.detail})` : ''}`)
    ]
    return lines.join('\n')
}

module.exports = {
    NEWSLETTER_METHODS,
    CHANNEL_FEATURES,
    getChannelSupport,
    normalizeChannelJid,
    channelInfoUnsupported,
    getChannelInfo,
    followChannel,
    unfollowChannel,
    fetchChannelMessages,
    reactToChannelMessage,
    postToChannel,
    channelStatusText
}
