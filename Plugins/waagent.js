'use strict'

const {
    checkNumber,
    resolveTarget,
    stage,
    consume,
    cancel,
    execute,
    getAudit,
} = require('../Library/lib/wa-actions')
const { PIN_ACCEPTED_MESSAGE, BAILEYS_ACCEPTED_MESSAGE } = require('../Library/lib/baileys-errors')

const HELP = `📱 *Bera WhatsApp Control*

• *.wact check <number>* — verify a number on WhatsApp
• *.wact profile <number>* — fetch WhatsApp profile/status
• *.wact groups* — list groups Bera participates in
• *.wact send <number|reply|tag|this pm> | <message>* — preview a message
• *.wact story <text>* — preview a text story
• *.wact groupstory <text>* — preview a story for the current group
• *.wact react <emoji|remove>* — react to the quoted message (empty removes)
• *.wact pin [1d|7d|30d]* — pin the quoted message
• *.wact unpin* — unpin the quoted message
• *.wact edit <new text>* — edit a quoted bot message
• *.wact delete* — delete the quoted message
• *.wact poll <Question | Option 1 | Option 2>* — create a native poll
• *.wact forward <number|reply|tag|this pm>[, <number>]* — preview a forward (authorized users, confirmation token)
• *.wact confirm <token>* — execute a pending send/story/forward
• *.wact cancel <token>* — cancel a pending action
• *.wact audit* — show recent action results

Outbound messages and stories always require a confirmation token.`

const ownerOnly = (isOwner, reply) => {
    if (isOwner) return true
    reply('⛔ This WhatsApp control is owner-only.')
    return false
}

const mentionedJids = (m) => m?.mentionedJid
    || m?.message?.extendedTextMessage?.contextInfo?.mentionedJid
    || []

const handle = async (m, { conn, args = [], text = '', command = 'wact', reply, isOwner, sender } = {}) => {
    // Forwarding is confirmation-gated for authorized users (spec §12), not
    // owner-only; Handler already blocks unauthorized callers before dispatch.
    const _earlySub = String(args[0] || '').toLowerCase()
    if (_earlySub !== 'forward' && !ownerOnly(isOwner, reply)) return
    const alias = String(command || '').toLowerCase()
    const aliasSub = {
        wacontact: 'check',
        wacontacts: 'check',
        wactgroups: 'groups',
        wastory: 'story',
        wactgroupstory: 'groupstory',
        waconfirm: 'confirm',
    }[alias]
    const sub = aliasSub || String(args[0] || 'help').toLowerCase()
    const rest = aliasSub ? String(text || '').trim() : String(text || '').replace(/^\S+\s*/i, '').trim()

    if (aliasSub === 'check' && !args[1]) args = ['check', rest]
    if (aliasSub === 'story' && rest) args = ['story', rest]
    if (aliasSub === 'confirm' && rest) args = ['confirm', rest]

    if (sub === 'help' || sub === 'menu') return reply(HELP)

    if (sub === 'check' || sub === 'exists' || sub === 'contact') {
        const number = args[1]
        if (!number) return reply('❓ Usage: *.wact check 254712345678*')
        try {
            const result = await checkNumber(conn, number)
            return reply(result.exists
                ? `✅ *+${result.number}* is registered on WhatsApp.\nJID: ${result.jid}`
                : `❌ *+${result.number}* is not registered on WhatsApp.`)
        } catch (error) { return reply(`❌ ${error.message}`) }
    }

    if (sub === 'profile') {
        const number = args[1]
        if (!number) return reply('❓ Usage: *.wact profile 254712345678*')
        try {
            const target = await checkNumber(conn, number)
            if (target.exists === false) return reply(`❌ +${target.number} is not registered on WhatsApp.`)
            const status = await conn.fetchStatus?.(target.jid).catch?.(() => null)
            const profile = await conn.profilePictureUrl?.(target.jid, 'image').catch?.(() => null)
            return reply(`👤 *WhatsApp Profile*\n\n📞 +${target.number}\n🆔 ${target.jid}\n💬 ${status?.status || 'Status unavailable'}${profile ? `\n🖼️ Profile picture available` : ''}`)
        } catch (error) { return reply(`❌ Profile lookup failed: ${error.message}`) }
    }

    if (sub === 'groups' || sub === 'listgroups') {
        try {
            const groups = await conn.groupFetchAllParticipating()
            const entries = Object.entries(groups || {})
            if (!entries.length) return reply('ℹ️ Bera is not participating in any groups.')
            const lines = entries.slice(0, 80).map(([jid, meta], index) => `${index + 1}. *${meta.subject || 'Unnamed group'}*\n   ${jid}`)
            return reply(`👥 *Bera Groups (${entries.length})*\n\n${lines.join('\n')}`)
        } catch (error) { return reply(`❌ Could not list groups: ${error.message}`) }
    }

    if (sub === 'send' || sub === 'message' || sub === 'text') {
        const match = rest.match(/^(.+?)\s*\|\s*([\s\S]+)$/)
        if (!match) return reply('❓ Usage: *.wact send 254712345678 | Hello from Bera*\nOr reply/tag a user: *.wact send reply | Hello*')
        try {
            const target = await resolveTarget(conn, m, match[1])
            const token = stage(sender, { type: 'send', number: target.number, jid: target.jid, text: match[2].trim() })
            return reply(`⚠️ *Message preview*\n\nTo: +${target.number}\nText: _${match[2].trim()}_\n\nReply with *.wact confirm ${token}* within 2 minutes to send it.`)
        } catch (error) { return reply(`❌ ${error.message}`) }
    }

    if (sub === 'story' || sub === 'status') {
        const story = rest.replace(/^(story|status)\s*/i, '').trim()
        if (!story) return reply('❓ Usage: *.wact story Bera AI is online*')
        const token = stage(sender, { type: 'story', text: story })
        return reply(`⚠️ *Story preview*\n\n_${story.slice(0, 700)}_\n\nReply with *.wact confirm ${token}* within 2 minutes to post it.`)
    }

    if (sub === 'groupstory' || sub === 'groupstatus') {
        if (!m?.isGroup || !m?.chat?.endsWith('@g.us')) return reply('❌ Use groupstory inside the group where the story should be posted.')
        const story = rest.replace(/^(groupstory|groupstatus)\s*/i, '').trim()
        if (!story) return reply('❓ Usage: *.wact groupstory Hello group*')
        const token = stage(sender, { type: 'groupstory', groupJid: m.chat, text: story })
        return reply(`⚠️ *Group story preview*\n\nGroup: ${m.chat}\n_${story.slice(0, 700)}_\n\nReply with *.wact confirm ${token}* within 2 minutes to post it.`)
    }

    if (sub === 'react') {
        const key = m?.quoted?.key || m?.key
        if (!key) return reply('❓ Quote the message to react to.')
        const emojiArg = (args[1] || '').trim()
        const emoji = /^(remove|none|clear)$/i.test(emojiArg) ? '' : (emojiArg || '👍')
        const result = await execute(conn, sender, { type: 'react', chat: m?.chat, key, emoji })
        return reply(result.ok ? (emoji ? `✅ Reaction request accepted by Baileys: ${emoji}` : '✅ Reaction removed. Request accepted by Baileys.') : `❌ Reaction failed: ${result.error}`)
    }

    if (sub === 'pin' || sub === 'unpin') {
        const key = m?.quoted?.key || m?.key
        if (!key) return reply('❓ Quote the message to pin or unpin.')
        const durations = { '1d': 86400, '7d': 604800, '30d': 2592000 }
        const time = sub === 'pin' ? (durations[String(args[1] || '').toLowerCase()] || 604800) : 0
        const result = await execute(conn, sender, { type: sub, chat: m?.chat, key, ...(sub === 'pin' ? { time } : {}) })
        return reply(result.ok ? (sub === 'pin' ? PIN_ACCEPTED_MESSAGE : '✅ Unpinned successfully as requested.') : `❌ Failed to ${sub}: ${result.error}`)
    }

    if (sub === 'edit') {
        const key = m?.quoted?.key
        const replacement = rest.replace(/^edit\s*/i, '').trim()
        if (!key) return reply('❓ Quote the bot message to edit.')
        if (!replacement) return reply('❓ Usage: *.wact edit <new text>* (quote a bot message)')
        const result = await execute(conn, sender, { type: 'edit', chat: m?.chat, key, text: replacement })
        return reply(result.ok ? `✅ ${BAILEYS_ACCEPTED_MESSAGE}` : `❌ Edit failed: ${result.error}`)
    }

    if (sub === 'delete' || sub === 'del') {
        const key = m?.quoted?.key
        if (!key) return reply('❓ Quote the message to delete.')
        const result = await execute(conn, sender, { type: 'delete', chat: m?.chat, key })
        return reply(result.ok ? '✅ Delete request accepted by Baileys.' : `❌ Delete failed: ${result.error}`)
    }

    if (sub === 'poll') {
        const raw = rest.replace(/^poll\s*/i, '').trim()
        const parts = raw.split('|').map(x => x.trim()).filter(Boolean)
        if (parts.length < 3) return reply('❓ Usage: *.wact poll Question | Option 1 | Option 2*')
        const result = await execute(conn, sender, { type: 'poll', chat: m?.chat, question: parts[0], options: parts.slice(1) })
        return reply(result.ok ? `✅ Poll request accepted by Baileys: *${parts[0]}*` : `❌ Poll failed: ${result.error}`)
    }

    if (sub === 'forward') {
        const qMsg = m?.quoted?.message ? m.quoted : null
        if (!qMsg) return reply('❓ Quote the message to forward, then run *.wact forward 254712345678*')
        const specs = rest.replace(/^forward\s*/i, '').split(/[,;]/).map(x => x.trim()).filter(Boolean)
        if (!specs.length) return reply('❓ Usage: *.wact forward 254712345678* (quote a message first)')
        try {
            const targets = []
            for (const spec of specs) targets.push(await resolveTarget(conn, m, spec))
            if (targets.length === 1) {
                const token = stage(sender, { type: 'forward', jid: targets[0].jid, number: targets[0].number, message: m.quoted })
                return reply(`⚠️ *Forward preview*\n\nTo: +${targets[0].number}\n\nReply with *.wact confirm ${token}* within 2 minutes to forward it.`)
            }
            const tokens = targets.map(t => stage(sender, { type: 'forward', jid: t.jid, number: t.number, message: m.quoted }))
            return reply(`⚠️ *Forward preview (${targets.length} destinations)*\n\n${targets.map((t, i) => `• +${t.number} — confirm ${tokens[i]}`).join('\n')}\n\nReply with *.wact confirm <token>* within 2 minutes for each destination.`)
        } catch (error) { return reply(`❌ ${error.message}`) }
    }

    if (sub === 'confirm') {
        const action = consume(sender, args[1])
        if (!action) return reply('❌ Token is invalid, expired, or belongs to another owner session.')
        const result = await execute(conn, sender, action)
        if (!result.ok) return reply(`❌ Action failed: ${result.error}`)
        if (action.type === 'story') return reply(`✅ Text story posted to WhatsApp status. ${BAILEYS_ACCEPTED_MESSAGE}`)
        if (action.type === 'groupstory') return reply('✅ Text story posted to the current group. Request accepted by Baileys.')
        if (action.type === 'forward') return reply(`✅ Message forwarded to +${result.number || action.number}. Request accepted by Baileys.`)
        return reply(`✅ Message sent to +${result.number}.`)
    }

    if (sub === 'cancel') {
        return reply(cancel(sender, args[1]) ? '✅ Pending action cancelled.' : '❌ Token is invalid or expired.')
    }

    if (sub === 'audit') {
        const rows = getAudit(sender)
        if (!rows.length) return reply('ℹ️ No WhatsApp actions have been recorded yet.')
        return reply(`🧾 *Recent WhatsApp actions*\n\n${rows.map(row => `${row.ok ? '✅' : '❌'} ${row.type} → ${row.target}${row.error ? ` (${row.error})` : ''}`).join('\n')}`)
    }

    return reply(HELP)
}

handle.commands = ['wact', 'wacontact', 'wacontacts', 'wactgroups', 'wastory', 'waconfirm', 'wactgroupstory']
handle.tags = ['owner', 'whatsapp']
module.exports = handle
