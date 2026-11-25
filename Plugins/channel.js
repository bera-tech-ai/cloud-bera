'use strict'

// Phase 4 — Channels (spec §15). Owner-only.
//
// Implemented against the installed Baileys runtime (7.0.0-rc14 — see
// Library/lib/channels.js and CHANNELS.md for the verified capability list):
//   .channel status — what this socket can and cannot do with channels
//   .channel info <id|link> — channel metadata
//   .channel follow <id|link> / .channel unfollow <id|link>
//   .channel recent <id|link> [count] — latest channel messages
//   .channel react <id|link> <message id> [emoji]
//   .channel post <id|link> | <text> — preview + confirmation token, then
//       .channel confirm <token> — posts are public, so they are never sent
//       without a token (same flow as .wact).
//   .channel discover / poll / schedule / report — explicit "unsupported"
//       answers, not silence and not simulation.
//
// Channel posts report Baileys acceptance only, never device-side delivery
// (spec §23). Live channel posting has not been verified with a real session.

const { formatBeraCard } = require('../Library/lib/bera-card')
const { stage, consume } = require('../Library/lib/wa-actions')
const {
    CHANNEL_DISCOVERY,
    CHANNEL_POLLS,
    CHANNEL_SCHEDULED_POSTS,
    CHANNEL_REPORT_SPAM
} = require('../Library/lib/unsupported')
const {
    getChannelSupport,
    normalizeChannelJid,
    getChannelInfo,
    followChannel,
    unfollowChannel,
    fetchChannelMessages,
    reactToChannelMessage,
    postToChannel,
    channelStatusText,
    CHANNEL_FEATURES
} = require('../Library/lib/channels')

const HELP = `📣 *Bera Channels*\n\n• *.channel status* — channel capabilities of this socket\n• *.channel info <id or link>* — channel metadata\n• *.channel follow <id or link>* / *.channel unfollow <id or link>*\n• *.channel recent <id or link> [count]* — latest messages\n• *.channel react <id or link> <message id> [emoji]*\n• *.channel post <id or link> | <text>* — preview, then *.channel confirm <token>*\n\nNot supported by the installed Baileys runtime: channel discovery, channel polls, scheduled posts, report/spam. Those answer as unsupported, never simulated.`

const ownerOnly = (isOwner, reply) => {
    if (isOwner) return true
    reply('⛔ Channel operations are owner-only.')
    return false
}

const failed = (reply, result, what) => {
    if (result.unsupported) return reply(result.unsupported.card)
    return reply(formatBeraCard(`❌ ${what} failed: ${result.error || 'unknown error'}`, { type: 'error', title: 'CHANNEL', subtitle: 'FAILED' }))
}

const handle = async (m, { conn, args = [], text = '', command = 'channel', reply, isOwner, sender } = {}) => {
    if (!ownerOnly(isOwner, reply)) return
    const sub = String(args[0] || 'help').toLowerCase()
    // Text after the command word AND the subcommand word, e.g.
    // '.channel post 120363... | Hello' -> '120363... | Hello'.
    const rest = args.length > 1 ? String(text || '').replace(/^\S+\s+\S+\s*/i, '').trim() : ''
    const target = args[1]

    if (sub === 'help' || sub === 'menu') return reply(HELP)

    if (sub === 'status') {
        const support = getChannelSupport(conn)
        const body = channelStatusText(conn) +
            `\n\nVerified against Baileys ${support.supported ? 'newsletter API present' : 'newsletter API NOT present on this socket'}.` +
            `\nFeatures: ${CHANNEL_FEATURES.filter(f => f.status !== 'unsupported').length} supported, ${CHANNEL_FEATURES.filter(f => f.status === 'unsupported').length} unsupported (see CHANNELS.md).`
        return reply(formatBeraCard(body, { type: support.supported ? 'info' : 'warning', title: 'CHANNEL', subtitle: 'STATUS' }))
    }

    if (sub === 'discover' || sub === 'search' || sub === 'find') return reply(CHANNEL_DISCOVERY().card)
    if (sub === 'poll' || sub === 'vote') return reply(CHANNEL_POLLS().card)
    if (sub === 'schedule') return reply(CHANNEL_SCHEDULED_POSTS().card)
    if (sub === 'report' || sub === 'spam' || sub === 'block') return reply(CHANNEL_REPORT_SPAM().card)

    if (sub === 'info') {
        if (!target) return reply('Provide a channel ID, a @newsletter JID, or an invite link. Example: *.channel info 120363000000000000@newsletter*')
        try {
            const result = await getChannelInfo(conn, target)
            if (!result.ok) return failed(reply, result, 'Channel info')
            const meta = result.meta || {}
            const body = [
                `Channel: ${meta.name || meta.subject || result.jid}`,
                `ID: ${meta.id || result.jid}`,
                meta.description ? `About: ${String(meta.description).slice(0, 300)}` : null,
                meta.subscriber_count != null ? `Subscribers: ${meta.subscriber_count}` : null,
                meta.verified ? 'Verified: yes' : null
            ].filter(Boolean).join('\n')
            return reply(formatBeraCard(body, { type: 'info', title: 'CHANNEL', subtitle: 'INFO' }))
        } catch (error) {
            return reply(formatBeraCard(`❌ Channel info failed: ${error.message}`, { type: 'error', title: 'CHANNEL', subtitle: 'FAILED' }))
        }
    }

    if (sub === 'follow' || sub === 'unfollow') {
        if (!target) return reply(`Provide a channel ID or invite link. Example: *.channel ${sub} 120363000000000000@newsletter*`)
        const result = sub === 'follow' ? await followChannel(conn, target) : await unfollowChannel(conn, target)
        if (!result.ok) return failed(reply, result, `Channel ${sub}`)
        return reply(formatBeraCard(`✅ Channel ${sub === 'follow' ? 'followed' : 'unfollowed'}: ${result.jid}`, { type: 'success', title: 'CHANNEL', subtitle: sub.toUpperCase() }))
    }

    if (sub === 'recent') {
        if (!target) return reply('Provide a channel ID or invite link. Example: *.channel recent 120363000000000000@newsletter 5*')
        const result = await fetchChannelMessages(conn, target, args[2])
        if (!result.ok) return failed(reply, result, 'Channel messages')
        if (!result.messages.length) return reply(`No recent messages returned for ${result.jid}.`)
        const lines = result.messages.slice(0, 10).map((msg, i) => {
            const text = msg?.message?.conversation || msg?.message?.extendedTextMessage?.text || '[media / non-text message]'
            return `${i + 1}. ${String(text).slice(0, 200)}`
        })
        return reply(formatBeraCard(lines.join('\n\n'), { type: 'info', title: 'CHANNEL', subtitle: `RECENT · ${result.jid}` }))
    }

    if (sub === 'react') {
        if (!target || !args[2]) return reply('Usage: *.channel react <channel id> <message id> [emoji]*')
        const result = await reactToChannelMessage(conn, target, args[2], args[3] || '')
        if (!result.ok) return failed(reply, result, 'Channel reaction')
        return reply(formatBeraCard(`✅ Reaction sent to channel message ${result.serverId}.`, { type: 'success', title: 'CHANNEL', subtitle: 'REACTION' }))
    }

    if (sub === 'post') {
        const pipe = rest.indexOf('|')
        const jidPart = pipe >= 0 ? rest.slice(0, pipe).trim() : target
        const body = pipe >= 0 ? rest.slice(pipe + 1).trim() : rest.replace(/^\S+\s*/i, '').trim()
        if (!jidPart || !body) return reply('Usage: *.channel post <channel id> | <text>*')
        try {
            const jid = normalizeChannelJid(jidPart)
            const token = stage(sender, { type: 'channelpost', jid, text: body })
            return reply(formatBeraCard(
                `⏳ Preview only — nothing was posted.\nChannel: ${jid}\nPost: ${body.slice(0, 500)}\nToken: ${token}\nReply: .channel confirm ${token} within 2 minutes`,
                { type: 'confirmation', title: 'CHANNEL', subtitle: 'POST PREVIEW' }
            ))
        } catch (error) {
            return reply(formatBeraCard(`❌ Channel post preview failed: ${error.message}`, { type: 'error', title: 'CHANNEL', subtitle: 'FAILED' }))
        }
    }

    if (sub === 'confirm') {
        const token = target
        if (!token) return reply('Provide a token: *.channel confirm <token>*')
        const action = consume(sender, token)
        if (!action || action.type !== 'channelpost') {
            return reply(formatBeraCard('❌ Unknown, expired, or already-used token. Preview the post again with .channel post.', { type: 'error', title: 'CHANNEL', subtitle: 'BAD TOKEN' }))
        }
        const result = await postToChannel(conn, action.jid, action.text)
        if (!result.ok) return failed(reply, result, 'Channel post')
        return reply(formatBeraCard(
            '✅ Channel post accepted by Baileys. Final device-side visibility depends on WhatsApp processing.',
            { type: 'success', title: 'CHANNEL', subtitle: 'POSTED' }
        ))
    }

    return reply(HELP)
}

handle.commands = ['channel', 'channels']

module.exports = handle
