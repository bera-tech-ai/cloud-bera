// Plugins/privacy.js
// Privacy, Presence & Profile commands — using Baileys native APIs
// Commands: .privacy, .setlastseen, .setonline, .setprofilepic, .setstatus,
//           .readreceipts, .presence, .disappear, .changename, .changebio,
//           .rejectcall, .blocklist, .blockuser, .unblockuser

const handle = async (m, { conn, command, args, prefix: p, reply, isOwner } = {}) => {

    // ── .privacy — show current privacy settings ───────────────────────────
    if (command === 'privacy') {
        try {
            const settings = await conn.fetchPrivacySettings(true)
            const fmt = v => v === 'all' ? '🌐 Everyone' : v === 'contacts' ? '👥 Contacts' : v === 'contact_blacklist' ? '🚫 Except blocked' : '🔒 Nobody'
            return reply(
                `╭══〘 *🔐 PRIVACY SETTINGS* 〙═⊷\n` +
                `┃\n` +
                `┃ 👁️  Last Seen:    ${fmt(settings.last)}\n` +
                `┃ 🟢 Online:        ${fmt(settings.online)}\n` +
                `┃ 🖼️  Profile Pic:  ${fmt(settings.profile)}\n` +
                `┃ 📟 Status:       ${fmt(settings.status)}\n` +
                `┃ ✅ Read Receipts: ${settings.readreceipts === 'all' ? 'On' : 'Off'}\n` +
                `┃ 👥 Groups Add:   ${fmt(settings.groupadd)}\n` +
                `┃\n` +
                `┃ *${p}setlastseen all/contacts/none*\n` +
                `┃ *${p}setonline all/contacts*\n` +
                `┃ *${p}setprofilepic all/contacts/none*\n` +
                `┃ *${p}readreceipts on/off*\n` +
                `╰══════════════════⊷`
            )
        } catch (e) {
            return reply('❌ Could not fetch privacy settings: ' + e.message)
        }
    }

    // ── .setlastseen all | contacts | none ────────────────────────────────
    if (command === 'setlastseen') {
        if (!isOwner) return reply('❌ Owner only.')
        const val = args[0]?.toLowerCase()
        if (!['all', 'contacts', 'none'].includes(val)) {
            return reply(`Usage: *${p}setlastseen all / contacts / none*`)
        }
        try {
            await conn.updateLastSeenPrivacy(val)
            return reply(`✅ Last seen visibility set to: *${val}*`)
        } catch (e) {
            return reply('❌ ' + e.message)
        }
    }

    // ── .setonline all | contacts ──────────────────────────────────────────
    if (command === 'setonline') {
        if (!isOwner) return reply('❌ Owner only.')
        const val = args[0]?.toLowerCase()
        if (!['all', 'contacts'].includes(val)) {
            return reply(`Usage: *${p}setonline all / contacts*`)
        }
        try {
            await conn.updateOnlinePrivacy(val)
            return reply(`✅ Online visibility set to: *${val}*`)
        } catch (e) {
            return reply('❌ ' + e.message)
        }
    }

    // ── .setprofilepic all | contacts | none ──────────────────────────────
    if (command === 'setprofilepic' || command === 'setpp') {
        if (!isOwner) return reply('❌ Owner only.')
        const val = args[0]?.toLowerCase()
        if (!['all', 'contacts', 'none'].includes(val)) {
            return reply(`Usage: *${p}setprofilepic all / contacts / none*`)
        }
        try {
            await conn.updateProfilePicturePrivacy(val)
            return reply(`✅ Profile picture visibility set to: *${val}*`)
        } catch (e) {
            return reply('❌ ' + e.message)
        }
    }

    // ── .setstatus all | contacts | none ──────────────────────────────────
    if (command === 'setstatus' || command === 'setstatusprivacy') {
        if (!isOwner) return reply('❌ Owner only.')
        const val = args[0]?.toLowerCase()
        if (!['all', 'contacts', 'none'].includes(val)) {
            return reply(`Usage: *${p}setstatus all / contacts / none*`)
        }
        try {
            await conn.updateStatusPrivacy(val)
            return reply(`✅ Status visibility set to: *${val}*`)
        } catch (e) {
            return reply('❌ ' + e.message)
        }
    }

    // ── .readreceipts on | off ─────────────────────────────────────────────
    if (command === 'readreceipts' || command === 'readreceipt') {
        if (!isOwner) return reply('❌ Owner only.')
        const val = args[0]?.toLowerCase()
        if (!['on', 'off'].includes(val)) return reply(`Usage: *${p}readreceipts on / off*`)
        try {
            await conn.updateReadReceiptsPrivacy(val === 'on' ? 'all' : 'none')
            return reply(`✅ Read receipts: *${val === 'on' ? 'Enabled (everyone sees ✓✓)' : 'Disabled (no blue ticks)'}*`)
        } catch (e) {
            return reply('❌ ' + e.message)
        }
    }

    // ── .presence typing | recording | paused | available | unavailable ───
    if (command === 'presence' || command === 'setpresence') {
        if (!isOwner) return reply('❌ Owner only.')
        const val = args[0]?.toLowerCase() || 'available'
        const valid = ['composing', 'recording', 'paused', 'available', 'unavailable', 'typing']
        const mapped = val === 'typing' ? 'composing' : val
        if (!valid.includes(mapped)) return reply(`Usage: *${p}presence typing / recording / paused / available / unavailable*`)
        try {
            await conn.sendPresenceUpdate(mapped, m.chat)
            return reply(`✅ Presence updated: *${val}*`)
        } catch (e) {
            return reply('❌ ' + e.message)
        }
    }

    // ── .disappear 24h | 7d | 90d | off ──────────────────────────────────
    if (command === 'disappear' || command === 'setdisappear' || command === 'vanish') {
        if (!isOwner) return reply('❌ Owner only.')
        const val = (args[0] || 'off').toLowerCase()
        const durations = { '24h': 86400, '1d': 86400, '7d': 604800, '90d': 7776000, 'off': 0, '0': 0 }
        if (!(val in durations)) return reply(`Usage: *${p}disappear 24h / 7d / 90d / off*`)
        try {
            await conn.sendMessage(m.chat, { disappearingMessagesInChat: durations[val] })
            return reply(`✅ Disappearing messages: *${val === 'off' || val === '0' ? 'OFF' : val}*`)
        } catch (e) {
            return reply('❌ ' + e.message)
        }
    }

    // ── .changename <new name> ─────────────────────────────────────────────
    if (command === 'changename' || command === 'setname') {
        if (!isOwner) return reply('❌ Owner only.')
        const name = args.join(' ').trim()
        if (!name) return reply(`Usage: *${p}changename Bera AI Bot*`)
        try {
            await conn.updateProfileName(name)
            return reply(`✅ Bot display name changed to: *${name}*`)
        } catch (e) {
            return reply('❌ ' + e.message)
        }
    }

    // ── .changebio <text> ─────────────────────────────────────────────────
    if (command === 'changebio' || command === 'setbio' || command === 'setwabio') {
        if (!isOwner) return reply('❌ Owner only.')
        const bio = args.join(' ').trim()
        if (!bio) return reply(`Usage: *${p}changebio I am Bera AI 🤖*`)
        try {
            await conn.updateProfileStatus(bio)
            return reply(`✅ WhatsApp bio updated to:\n_${bio}_`)
        } catch (e) {
            return reply('❌ ' + e.message)
        }
    }

    // ── .blocklist ────────────────────────────────────────────────────────
    if (command === 'blocklist' || command === 'blocked') {
        if (!isOwner) return reply('❌ Owner only.')
        try {
            const result = await conn.fetchBlocklist()
            if (!result || result.length === 0) return reply('📋 Block list is empty.')
            const lines = result.slice(0, 20).map((j, i) => `${i + 1}. +${j.split('@')[0]}`)
            return reply(`╭══〘 *🚫 BLOCKED USERS* 〙═⊷\n┃\n${lines.map(l => '┃ ' + l).join('\n')}\n┃\n┃ Total: ${result.length}\n╰══════════════════⊷`)
        } catch (e) {
            return reply('❌ ' + e.message)
        }
    }

    // ── .blockuser +254xxx | @mention ──────────────────────────────────────
    if (command === 'blockuser' || command === 'blocknum') {
        if (!isOwner) return reply('❌ Owner only.')
        const target = m.mentionedJid?.[0] || m.quoted?.sender ||
            (args[0] ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null)
        if (!target) return reply(`Usage: *${p}blockuser @mention* or *${p}blockuser 254712345678*`)
        try {
            await conn.updateBlockStatus(target, 'block')
            return reply(`✅ Blocked: +${target.split('@')[0]}`)
        } catch (e) {
            return reply('❌ ' + e.message)
        }
    }

    // ── .unblockuser +254xxx | @mention ────────────────────────────────────
    if (command === 'unblockuser' || command === 'unblocknum') {
        if (!isOwner) return reply('❌ Owner only.')
        const target = m.mentionedJid?.[0] || m.quoted?.sender ||
            (args[0] ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null)
        if (!target) return reply(`Usage: *${p}unblockuser @mention* or *${p}unblockuser 254712345678*`)
        try {
            await conn.updateBlockStatus(target, 'unblock')
            return reply(`✅ Unblocked: +${target.split('@')[0]}`)
        } catch (e) {
            return reply('❌ ' + e.message)
        }
    }

    // ── .setgroupsadd all | contacts | none ───────────────────────────────
    if (command === 'setgroupsadd' || command === 'groupaddprivacy') {
        if (!isOwner) return reply('❌ Owner only.')
        const val = args[0]?.toLowerCase()
        if (!['all', 'contacts', 'contact_blacklist'].includes(val)) {
            return reply(`Usage: *${p}setgroupsadd all / contacts / contact_blacklist*`)
        }
        try {
            await conn.updateGroupsAddPrivacy(val)
            return reply(`✅ "Add to groups" privacy set to: *${val}*`)
        } catch (e) {
            return reply('❌ ' + e.message)
        }
    }
}

handle.command = [
    'privacy', 'setlastseen', 'setonline', 'setprofilepic', 'setpp',
    'setstatus', 'setstatusprivacy', 'readreceipts', 'readreceipt',
    'presence', 'setpresence', 'disappear', 'setdisappear', 'vanish',
    'changename', 'setname', 'changebio', 'setbio', 'setwabio',
    'blocklist', 'blocked', 'blockuser', 'blocknum', 'unblockuser', 'unblocknum',
    'setgroupsadd', 'groupaddprivacy'
]
handle.tags = ['privacy', 'profile', 'owner']
handle.help = ['privacy', 'setlastseen all/contacts/none', 'readreceipts on/off', 'disappear 7d/off', 'changename <name>', 'changebio <text>']

module.exports = handle
