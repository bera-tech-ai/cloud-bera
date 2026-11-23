'use strict'

const {
    normalizeNumber,
    checkNumber,
    stage,
    consume,
    cancel,
    execute,
    getAudit,
} = require('../Library/lib/wa-actions')

const HELP = `📱 *Bera WhatsApp Control*

• *.wact check <number>* — verify a number on WhatsApp
• *.wact profile <number>* — fetch WhatsApp profile/status
• *.wact groups* — list groups Bera participates in
• *.wact send <number|reply|tag|this pm> | <message>* — preview a message
• *.wact story <text>* — preview a text story
• *.wact groupstory <text>* — preview a story for the current group
• *.wact confirm <token>* — execute a pending send/story
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

const resolveTarget = async (conn, m, spec, sender) => {
    const target = String(spec || '').trim().toLowerCase()
    const replyJid = m?.quoted?.sender || m?.quoted?.key?.participant || null
    const tagJid = mentionedJids(m)[0] || null
    if (['reply', 'replied', 'quoted', 'this user', 'replied user'].includes(target)) {
        if (!replyJid) throw new Error('Reply to a user’s message first.')
        return { jid: replyJid, number: replyJid.split('@')[0].split(':')[0] }
    }
    if (['tag', 'tagged', 'mention', 'mentioned', 'tagged user'].includes(target)) {
        if (!tagJid) throw new Error('Tag a user first.')
        return { jid: tagJid, number: tagJid.split('@')[0].split(':')[0] }
    }
    if (['this pm', 'this chat', 'current pm', 'private chat'].includes(target)) {
        if (m?.isGroup || !m?.chat || m.chat.endsWith('@g.us')) throw new Error('This is a group chat. Use reply or tag to choose a private recipient.')
        return { jid: m.chat, number: m.chat.split('@')[0].split(':')[0] }
    }
    if (['me', 'myself', 'owner'].includes(target)) return { jid: sender, number: sender.split('@')[0].split(':')[0] }
    const checked = await checkNumber(conn, spec)
    if (checked.exists === false) throw new Error(`+${checked.number} is not registered on WhatsApp.`)
    return checked
}

const handle = async (m, { conn, args = [], text = '', command = 'wact', reply, isOwner, sender } = {}) => {
    if (!ownerOnly(isOwner, reply)) return
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
            const target = await resolveTarget(conn, m, match[1], sender)
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

    if (sub === 'confirm') {
        const action = consume(sender, args[1])
        if (!action) return reply('❌ Token is invalid, expired, or belongs to another owner session.')
        const result = await execute(conn, sender, action)
        if (!result.ok) return reply(`❌ Action failed: ${result.error}`)
        return reply(action.type === 'story'
            ? '✅ Text story posted to WhatsApp status.'
            : action.type === 'groupstory'
            ? '✅ Text story posted to the current group.'
            : `✅ Message sent to +${result.number}.`)
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
