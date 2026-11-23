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
• *.wact send <number> | <message>* — preview a message
• *.wact story <text>* — preview a text story
• *.wact confirm <token>* — execute a pending send/story
• *.wact cancel <token>* — cancel a pending action
• *.wact audit* — show recent action results

Outbound messages and stories always require a confirmation token.`

const ownerOnly = (isOwner, reply) => {
    if (isOwner) return true
    reply('⛔ This WhatsApp control is owner-only.')
    return false
}

const handle = async (m, { conn, args = [], text = '', command = 'wact', reply, isOwner, sender } = {}) => {
    if (!ownerOnly(isOwner, reply)) return
    const alias = String(command || '').toLowerCase()
    const aliasSub = {
        wacontact: 'check',
        wacontacts: 'check',
        wactgroups: 'groups',
        wastory: 'story',
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
        const match = rest.match(/^\+?(\d{7,15})\s*\|\s*([\s\S]+)$/)
        if (!match) return reply('❓ Usage: *.wact send 254712345678 | Hello from Bera*')
        try {
            const target = await checkNumber(conn, match[1])
            if (target.exists === false) return reply(`❌ +${target.number} is not registered on WhatsApp.`)
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

    if (sub === 'confirm') {
        const action = consume(sender, args[1])
        if (!action) return reply('❌ Token is invalid, expired, or belongs to another owner session.')
        const result = await execute(conn, sender, action)
        if (!result.ok) return reply(`❌ Action failed: ${result.error}`)
        return reply(action.type === 'story'
            ? '✅ Text story posted to WhatsApp status.'
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

handle.commands = ['wact', 'wacontact', 'wacontacts', 'wactgroups', 'wastory', 'waconfirm']
handle.tags = ['owner', 'whatsapp']
module.exports = handle
