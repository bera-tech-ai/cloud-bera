// Plugins/grouptools.js — Advanced Group Management Tools
// Commands: hidetag, tagall, listadmins, listmembers, grouplink, resetlink,
//           antidelete, antilink, antispam, antinsfw, setwelcome, setbye,
//           muteall, unmuteall, kickinactive, locktopic, setdesc

const handle = {}
handle.command = [
    'hidetag', 'ht', 'htag', 'silentmention',
    'tagall', 'mentionall', 'pingall',
    'tagadmins', 'pingtoadmins', 'adminmention',
    'listadmins', 'admins', 'showadmins',
    'listmembers', 'members', 'showmembers',
    'grouplink', 'invitelink', 'glink',
    'resetlink', 'revokelink', 'newlink',
    'antidelete', 'antidel',
    'antilink', 'linkblock',
    'antispam', 'spamblock',
    'antinsfw', 'nsfw',
    'setwelcome', 'welcome',
    'setbye', 'bye', 'setgoodbye',
    'muteall', 'groupmute',
    'unmuteall', 'groupunmute',
    'kickinactive',
    'setdesc', 'groupdesc', 'setgroupdesc',
    'locktopic', 'unlocktopic',
    'groupstats', 'gstats',
    'copymembers', 'exportmembers',
    'mention',
]
handle.tags = ['group', 'admin', 'management']
handle.help = [
    'hidetag <text>      — Tag all members silently',
    'tagall <text>       — Mention all members visibly',
    'tagadmins <text>    — Mention admins only',
    'listadmins          — List all group admins',
    'listmembers         — List all members',
    'grouplink           — Get group invite link',
    'resetlink           — Reset group invite link',
    'antidelete on/off   — Toggle anti-delete',
    'antilink on/off     — Block WhatsApp group links',
    'antispam on/off     — Block spam messages',
    'antinsfw on/off     — Block NSFW media',
    'setwelcome <msg>    — Set welcome message',
    'setbye <msg>        — Set goodbye message',
    'muteall             — Mute all non-admins',
    'unmuteall           — Unmute all members',
    'setdesc <text>      — Set group description',
    'groupstats          — Show group statistics',
    'kickinactive        — Kick members with no messages',
    'mention @user <msg> — Mention specific users',
]

// In-memory settings store (keyed by group JID)
const groupSettings = global.beraGroupSettings || (global.beraGroupSettings = {})

const getSetting = (jid, key, def) => (groupSettings[jid] || {})[key] ?? def
const setSetting = (jid, key, val) => {
    if (!groupSettings[jid]) groupSettings[jid] = {}
    groupSettings[jid][key] = val
}

handle.all = async (m, { conn, command, args, prefix, reply, isOwner, isAdmin, isGroup, sender } = {}) => {
    const chat    = m.chat || m.key?.remoteJid
    const text    = args.join(' ').trim()
    const myJid   = conn.user?.id?.split(':')[0] + '@s.whatsapp.net'

    if (!isGroup) return reply('❌ This command only works inside groups.')

    // Fetch group metadata
    let meta, participants = []
    try {
        meta         = await conn.groupMetadata(chat)
        participants = meta.participants || []
    } catch {
        return reply('❌ Failed to fetch group data.')
    }

    const admins    = participants.filter(p => p.admin).map(p => p.id)
    const members   = participants.map(p => p.id)
    const nonAdmins = participants.filter(p => !p.admin).map(p => p.id)
    const botAdmin  = admins.includes(myJid)

    // ── HIDETAG — silent mention all ────────────────────────────────────────
    if (['hidetag','ht','htag','silentmention'].includes(command)) {
        if (!isAdmin && !isOwner) return reply('⛔ Admins only.')
        const msg = text || '‎'
        await conn.sendMessage(chat, {
            text:     msg,
            mentions: members
        })
        return
    }

    // ── TAGALL — visible mention all ────────────────────────────────────────
    if (['tagall','mentionall','pingall'].includes(command)) {
        if (!isAdmin && !isOwner) return reply('⛔ Admins only.')
        const msg = (text ? text + '\n\n' : '📢 Attention everyone!\n\n') +
            members.map(m2 => '@' + m2.split('@')[0]).join(' ')
        await conn.sendMessage(chat, { text: msg, mentions: members })
        return
    }

    // ── TAGADMINS — mention admins only ─────────────────────────────────────
    if (['tagadmins','pingtoadmins','adminmention'].includes(command)) {
        const msg = (text ? text + '\n\n' : '📣 Admins, attention!\n\n') +
            admins.map(a => '@' + a.split('@')[0]).join(' ')
        await conn.sendMessage(chat, { text: msg, mentions: admins })
        return
    }

    // ── MENTION — mention specific users ─────────────────────────────────────
    if (command === 'mention') {
        const mentioned = (m.mentionedJid || [])
        if (!mentioned.length) return reply('❌ Mention someone: ' + prefix + 'mention @user message')
        const msg = text.replace(/@\d+/g, '').trim() || 'Hey!'
        await conn.sendMessage(chat, {
            text:     msg + '\n' + mentioned.map(j => '@' + j.split('@')[0]).join(' '),
            mentions: mentioned
        })
        return
    }

    // ── LISTADMINS ───────────────────────────────────────────────────────────
    if (['listadmins','admins','showadmins'].includes(command)) {
        if (!admins.length) return reply('❌ No admins found.')
        const list = admins.map((a,i) => '┃ ' + (i+1) + '. @' + a.split('@')[0]).join('\n')
        await conn.sendMessage(chat, {
            text: '╭══〘 *👑 Group Admins (' + admins.length + ')* 〙═⊷\n' + list + '\n╰══════════════════⊷',
            mentions: admins
        })
        return
    }

    // ── LISTMEMBERS ──────────────────────────────────────────────────────────
    if (['listmembers','members','showmembers'].includes(command)) {
        const chunks = []
        let   chunk  = '╭══〘 *👥 Members (' + members.length + ')* 〙═⊷\n'
        members.forEach((mem, i) => {
            const line = '┃ ' + (i+1).toString().padStart(2,' ') + '. @' + mem.split('@')[0] + (admins.includes(mem) ? ' 👑' : '') + '\n'
            if ((chunk + line).length > 3000) { chunks.push(chunk + '╰══════════════════⊷'); chunk = '┃ (continued)\n' }
            chunk += line
        })
        chunks.push(chunk + '╰══════════════════⊷')
        for (const c of chunks) {
            await conn.sendMessage(chat, { text: c, mentions: members })
            if (chunks.length > 1) await new Promise(r => setTimeout(r, 1500))
        }
        return
    }

    // ── GROUPLINK ────────────────────────────────────────────────────────────
    if (['grouplink','invitelink','glink'].includes(command)) {
        if (!botAdmin) return reply('⛔ Bot must be admin to get invite link.')
        try {
            const code = await conn.groupInviteCode(chat)
            const link = 'https://chat.whatsapp.com/' + code
            return reply(
                '╭══〘 *🔗 Group Invite Link* 〙═⊷\n' +
                '┃\n' +
                '┃ ' + link + '\n' +
                '┃\n' +
                '┃ ⚠️ Anyone with this link can join.\n' +
                '┃ Use ' + prefix + 'resetlink to revoke.\n' +
                '╰══════════════════⊷'
            )
        } catch {
            return reply('❌ Could not get invite link.')
        }
    }

    // ── RESETLINK ────────────────────────────────────────────────────────────
    if (['resetlink','revokelink','newlink'].includes(command)) {
        if (!botAdmin) return reply('⛔ Bot must be admin.')
        if (!isAdmin && !isOwner) return reply('⛔ Admins only.')
        try {
            const code = await conn.groupRevokeInvite(chat)
            const link = 'https://chat.whatsapp.com/' + code
            return reply(
                '╭══〘 *🔄 Invite Link Reset* 〙═⊷\n' +
                '┃ Old link has been revoked.\n' +
                '┃\n' +
                '┃ *New link:*\n' +
                '┃ ' + link + '\n' +
                '╰══════════════════⊷'
            )
        } catch {
            return reply('❌ Could not reset link.')
        }
    }

    // ── ANTIDELETE ───────────────────────────────────────────────────────────
    if (['antidelete','antidel'].includes(command)) {
        if (!isAdmin && !isOwner) return reply('⛔ Admins only.')
        const on = args[0]?.toLowerCase()
        if (!['on','off'].includes(on)) return reply('❌ Usage: ' + prefix + command + ' on/off')
        setSetting(chat, 'antidelete', on === 'on')
        return reply(on === 'on'
            ? '✅ *Anti-Delete ON* — Deleted messages will be re-sent by the bot.'
            : '❌ *Anti-Delete OFF* — Messages can be deleted freely.')
    }

    // ── ANTILINK ─────────────────────────────────────────────────────────────
    if (['antilink','linkblock'].includes(command)) {
        if (!isAdmin && !isOwner) return reply('⛔ Admins only.')
        const on = args[0]?.toLowerCase()
        if (!['on','off'].includes(on)) return reply('❌ Usage: ' + prefix + command + ' on/off')
        setSetting(chat, 'antilink', on === 'on')
        return reply(on === 'on'
            ? '✅ *Anti-Link ON* — WhatsApp group links will be deleted & sender warned.'
            : '❌ *Anti-Link OFF* — Links are allowed.')
    }

    // ── ANTISPAM ─────────────────────────────────────────────────────────────
    if (['antispam','spamblock'].includes(command)) {
        if (!isAdmin && !isOwner) return reply('⛔ Admins only.')
        const on = args[0]?.toLowerCase()
        if (!['on','off'].includes(on)) return reply('❌ Usage: ' + prefix + command + ' on/off')
        setSetting(chat, 'antispam', on === 'on')
        return reply(on === 'on'
            ? '✅ *Anti-Spam ON* — Repeated messages will be deleted.'
            : '❌ *Anti-Spam OFF* — Spam allowed.')
    }

    // ── ANTINSFW ─────────────────────────────────────────────────────────────
    if (['antinsfw','nsfw'].includes(command)) {
        if (!isAdmin && !isOwner) return reply('⛔ Admins only.')
        const on = args[0]?.toLowerCase()
        if (!['on','off'].includes(on)) return reply('❌ Usage: ' + prefix + command + ' on/off')
        setSetting(chat, 'antinsfw', on === 'on')
        return reply(on === 'on'
            ? '✅ *Anti-NSFW ON* — Inappropriate media will be deleted.'
            : '❌ *Anti-NSFW OFF* — NSFW content allowed.')
    }

    // ── SETWELCOME ───────────────────────────────────────────────────────────
    if (['setwelcome','welcome'].includes(command)) {
        if (!isAdmin && !isOwner) return reply('⛔ Admins only.')
        if (!text && args[0] !== 'off') return reply(
            '❌ Usage: ' + prefix + 'setwelcome <message>\n\n' +
            'Variables: {name} {group} {count}\n' +
            'Example: Welcome {name} to {group}! 🎉\n' +
            'To disable: ' + prefix + 'setwelcome off'
        )
        if (args[0] === 'off') {
            setSetting(chat, 'welcome', null)
            return reply('✅ Welcome message disabled.')
        }
        setSetting(chat, 'welcome', text)
        return reply('✅ *Welcome message set!*\n\nPreview:\n' + text.replace('{name}','@Member').replace('{group}', meta?.subject || 'Group').replace('{count}', members.length))
    }

    // ── SETBYE ───────────────────────────────────────────────────────────────
    if (['setbye','bye','setgoodbye'].includes(command)) {
        if (!isAdmin && !isOwner) return reply('⛔ Admins only.')
        if (!text && args[0] !== 'off') return reply('❌ Usage: ' + prefix + 'setbye <message>\nVariables: {name} {group}\nTo disable: ' + prefix + 'setbye off')
        if (args[0] === 'off') { setSetting(chat, 'bye', null); return reply('✅ Goodbye message disabled.') }
        setSetting(chat, 'bye', text)
        return reply('✅ *Goodbye message set!*\n\nPreview:\n' + text.replace('{name}','@Member').replace('{group}', meta?.subject || 'Group'))
    }

    // ── MUTEALL ──────────────────────────────────────────────────────────────
    if (['muteall','groupmute'].includes(command)) {
        if (!botAdmin) return reply('⛔ Bot must be admin.')
        if (!isAdmin && !isOwner) return reply('⛔ Admins only.')
        try {
            await conn.groupSettingUpdate(chat, 'announcement')
            return reply('🔇 *Group muted.* Only admins can send messages now.')
        } catch {
            return reply('❌ Failed to mute group.')
        }
    }

    // ── UNMUTEALL ────────────────────────────────────────────────────────────
    if (['unmuteall','groupunmute'].includes(command)) {
        if (!botAdmin) return reply('⛔ Bot must be admin.')
        if (!isAdmin && !isOwner) return reply('⛔ Admins only.')
        try {
            await conn.groupSettingUpdate(chat, 'not_announcement')
            return reply('🔊 *Group unmuted.* All members can send messages.')
        } catch {
            return reply('❌ Failed to unmute group.')
        }
    }

    // ── SETDESC ──────────────────────────────────────────────────────────────
    if (['setdesc','groupdesc','setgroupdesc'].includes(command)) {
        if (!botAdmin) return reply('⛔ Bot must be admin.')
        if (!isAdmin && !isOwner) return reply('⛔ Admins only.')
        if (!text) return reply('❌ Usage: ' + prefix + 'setdesc <new description>')
        try {
            await conn.groupUpdateDescription(chat, text)
            return reply('✅ Group description updated!')
        } catch {
            return reply('❌ Failed to update description.')
        }
    }

    // ── GROUPSTATS ───────────────────────────────────────────────────────────
    if (['groupstats','gstats'].includes(command)) {
        const created   = meta?.creation ? new Date(meta.creation * 1000).toLocaleDateString() : 'Unknown'
        const ephemeral = meta?.ephemeralDuration ? (meta.ephemeralDuration / 86400) + ' days' : 'Off'
        return reply(
            '╭══〘 *📊 Group Statistics* 〙═⊷\n' +
            '┃ 📛 Name:       ' + (meta?.subject || 'Unknown') + '\n' +
            '┃ 👥 Members:    ' + members.length + '\n' +
            '┃ 👑 Admins:     ' + admins.length + '\n' +
            '┃ 📅 Created:    ' + created + '\n' +
            '┃ ⏳ Disappear:  ' + ephemeral + '\n' +
            '┃ 🔒 Locked:     ' + (meta?.announce ? 'Yes' : 'No') + '\n' +
            '┃\n' +
            '┃ 🛡️ Anti-Delete: ' + (getSetting(chat,'antidelete',false) ? '✅ ON' : '❌ OFF') + '\n' +
            '┃ 🔗 Anti-Link:   ' + (getSetting(chat,'antilink',false)   ? '✅ ON' : '❌ OFF') + '\n' +
            '┃ 🚫 Anti-Spam:   ' + (getSetting(chat,'antispam',false)   ? '✅ ON' : '❌ OFF') + '\n' +
            '┃ 🔞 Anti-NSFW:   ' + (getSetting(chat,'antinsfw',false)   ? '✅ ON' : '❌ OFF') + '\n' +
            '╰══════════════════⊷'
        )
    }

    // ── KICKINACTIVE ─────────────────────────────────────────────────────────
    if (command === 'kickinactive') {
        if (!botAdmin) return reply('⛔ Bot must be admin.')
        if (!isAdmin && !isOwner) return reply('⛔ Admins only.')
        return reply(
            '⚠️ *Kick Inactive Members*\n\n' +
            'This feature requires message tracking to identify inactive members.\n\n' +
            'Enable it first with:\n' +
            prefix + 'antispam on\n\n' +
            'Then use:\n' +
            prefix + 'kickinactive 7d — kick members inactive for 7+ days'
        )
    }

    // ── COPYMEMBERS / EXPORT ─────────────────────────────────────────────────
    if (['copymembers','exportmembers'].includes(command)) {
        if (!isAdmin && !isOwner) return reply('⛔ Admins only.')
        const nums = members.map(m2 => m2.split('@')[0]).join('\n')
        return reply('📋 *Member Numbers (' + members.length + '):*\n\n' + nums)
    }

    // ── LOCKTOPIC / UNLOCKTOPIC ──────────────────────────────────────────────
    if (['locktopic','unlocktopic'].includes(command)) {
        if (!botAdmin) return reply('⛔ Bot must be admin.')
        if (!isAdmin && !isOwner) return reply('⛔ Admins only.')
        const lock = command === 'locktopic'
        try {
            await conn.groupSettingUpdate(chat, lock ? 'locked' : 'unlocked')
            return reply(lock ? '🔒 Group info locked (only admins can edit).' : '🔓 Group info unlocked (all members can edit).')
        } catch {
            return reply('❌ Failed to ' + (lock ? 'lock' : 'unlock') + ' group.')
        }
    }
}

module.exports = handle
