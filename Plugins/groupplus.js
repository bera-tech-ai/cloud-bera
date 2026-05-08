// Plugins/groupplus.js — Advanced Group Management Commands
// Commands: warn, clearwarn, warnlist, groupreport, groupstatus, mutelist, pinmsg
//           clonegroup, groupbackup, grouplink2, grouptemplate, setgroupcolor

const { sendBtn } = require('../Library/actions/btns')

const handle = {}
handle.command = ['warn', 'warnuser',
                  'clearwarn', 'unwarn', 'resetwarn',
                  'warncount', 'warnings', 'warnlist',
                  'groupreport', 'reportmember', 'reportuser',
                  'pinmsg', 'pin', 'pinnedmsg',
                  'clonegroup', 'duplicategroup',
                  'groupbackup', 'backupgroup',
                  'setinactive', 'inactivecheck',
                  'mutemember', 'slientkick',
                  'grouplock', 'lockfeature',
                  'grouppoll', 'quickpoll',
                  'inviteinfo', 'joininfo',
                  'demoteall', 'removeallAdmins',
                  'groupannounce', 'gcannounce',
                  'groupcolor', 'settheme']

handle.tags    = ['group', 'admin', 'interactive']
handle.help    = ['warn @user', 'clearwarn @user', 'warnlist', 'groupreport @user <reason>', 'pinmsg', 'clonegroup']

handle.all = async (m, { conn, command, args, prefix, reply, isOwner, isAdmin, isGroup, sender } = {}) => {
    const chat    = m.chat || m.key?.remoteJid
    const p       = prefix
    const text    = args.join(' ')
    const warnsDb = () => {
        if (!global.db?.data?.warns) global.db.data.warns = {}
        return global.db.data.warns
    }
    const getTag  = () => m.mentionedJid?.[0] || m.quoted?.sender || null

    // ── .warn @user <reason> ─────────────────────────────────────────────────
    if (['warn', 'warnuser'].includes(command)) {
        if (!isGroup) return reply('❌ Groups only.')
        if (!isAdmin && !isOwner) return reply('⛔ Admin only.')
        const target = getTag()
        if (!target) return reply('❌ Tag a member: ' + p + 'warn @user <reason>')
        const reason   = args.filter(a => !a.includes('@')).join(' ') || 'No reason given'
        const key      = chat + ':' + target
        const db       = warnsDb()
        if (!db[key]) db[key] = { warns: 0, reasons: [] }
        db[key].warns++
        db[key].reasons.push(reason)
        await global.db.write()
        const count = db[key].warns
        const limit = 3

        await conn.sendMessage(chat, { react: { text: '⚠️', key: m.key } }).catch(() => {})

        await sendBtn(conn, chat, {
            title:  '⚠️ Warning Issued',
            text:   '@' + target.split('@')[0] + ' has been warned!\n\n'
                  + '📋 *Reason:* ' + reason + '\n'
                  + '⚠️ *Warns:* ' + count + '/' + limit + '\n'
                  + (count >= limit ? '\n🚨 *MAX WARNINGS REACHED — Auto-Kick!*' : '\n⚡ ' + (limit - count) + ' more warn(s) before kick.'),
            footer: 'Bera AI — Warn System',
            buttons: [
                { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📜 View All Warns', id: p + 'warnlist' }) },
                { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '❌ Clear Warns',    id: p + 'clearwarn @' + target.split('@')[0] }) },
                count >= limit
                    ? { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🦶 Kick Now', id: p + 'kick @' + target.split('@')[0] }) }
                    : { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '⚠️ Warn Again', id: p + 'warn @' + target.split('@')[0] }) },
            ]
        }, [target])

        // Auto-kick on 3 warns
        if (count >= limit) {
            await reply('🚨 ' + '@' + target.split('@')[0] + ' reached max warns (3/3). Kicking...')
            await conn.groupParticipantsUpdate(chat, [target], 'remove').catch(() => {})
            db[key] = { warns: 0, reasons: [] }
            await global.db.write()
        }
    }

    // ── .clearwarn / .unwarn @user ────────────────────────────────────────────
    else if (['clearwarn', 'unwarn', 'resetwarn'].includes(command)) {
        if (!isGroup) return reply('❌ Groups only.')
        if (!isAdmin && !isOwner) return reply('⛔ Admin only.')
        const target = getTag()
        if (!target) return reply('❌ Tag a member: ' + p + 'clearwarn @user')
        const key = chat + ':' + target
        const db  = warnsDb()
        const old = db[key]?.warns || 0
        db[key]   = { warns: 0, reasons: [] }
        await global.db.write()
        await conn.sendMessage(chat, { react: { text: '✅', key: m.key } }).catch(() => {})
        return reply('✅ Cleared *' + old + '* warn(s) for @' + target.split('@')[0])
    }

    // ── .warnlist ─────────────────────────────────────────────────────────────
    else if (['warncount', 'warnings', 'warnlist'].includes(command)) {
        if (!isGroup) return reply('❌ Groups only.')
        const db = warnsDb()
        const groupWarns = Object.entries(db)
            .filter(([k]) => k.startsWith(chat + ':'))
            .map(([k, v]) => ({ num: k.split(':')[1].split('@')[0], warns: v.warns, reasons: v.reasons }))
            .filter(x => x.warns > 0)
            .sort((a, b) => b.warns - a.warns)
        if (!groupWarns.length) return reply('✅ No active warnings in this group.')
        const lines = groupWarns.map((x, i) => (i+1) + '. @' + x.num + ' — ⚠️ ' + x.warns + '/3 warn(s)\n   Last: ' + (x.reasons[x.reasons.length-1] || '?')).join('\n\n')
        return reply('╭══〘 *⚠️ GROUP WARNINGS* 〙═⊷\n┃\n' + lines.split('\n').map(l=>'┃ '+l).join('\n') + '\n╰══════════════════⊷')
    }

    // ── .groupreport @user <reason> ───────────────────────────────────────────
    else if (['groupreport', 'reportmember', 'reportuser'].includes(command)) {
        if (!isGroup) return reply('❌ Groups only.')
        const target = getTag()
        const reason = args.filter(a => !a.includes('@')).join(' ') || 'Inappropriate behavior'
        if (!target) return reply('❌ Usage: ' + p + 'groupreport @user <reason>')
        let meta = {}
        try { meta = await conn.groupMetadata(chat) } catch {}
        const admins = (meta.participants || []).filter(x => x.admin).map(x => x.id)

        await conn.sendMessage(chat, { react: { text: '📋', key: m.key } }).catch(() => {})
        await sendBtn(conn, chat, {
            title:  '📋 Member Reported',
            text:   '⚠️ A report has been filed.\n\n'
                  + '👤 *Reported:* @' + target.split('@')[0] + '\n'
                  + '👮 *Reported by:* @' + sender.split('@')[0] + '\n'
                  + '📋 *Reason:* ' + reason + '\n\n'
                  + 'Admins will review this report.',
            footer: 'Bera AI — Report System',
            buttons: [
                { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '⚠️ Warn Member', id: p + 'warn @' + target.split('@')[0] + ' ' + reason }) },
                { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🦶 Kick Member', id: p + 'kick @' + target.split('@')[0] }) },
                { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '⛔ Ban Member',  id: p + 'ban @' + target.split('@')[0] }) },
            ]
        })

        // DM admins about the report
        for (const admin of admins.slice(0, 3)) {
            try {
                await conn.sendMessage(admin, {
                    text: '🚨 *GROUP REPORT*\n\nGroup: ' + (meta.subject || chat) + '\nReported: @' + target.split('@')[0] + '\nBy: @' + sender.split('@')[0] + '\nReason: ' + reason
                })
            } catch {}
        }
    }

    // ── .pinmsg — pin the quoted message ─────────────────────────────────────
    else if (['pinmsg', 'pin', 'pinnedmsg'].includes(command)) {
        if (!isGroup) return reply('❌ Groups only.')
        if (!isAdmin && !isOwner) return reply('⛔ Admin only.')
        if (!m.quoted) return reply('❌ Quote a message to pin it.')
        const durArg = args[0]
        const dur    = durArg === '7d' ? 604800 : durArg === '30d' ? 2592000 : 86400 // default 24h
        const label  = dur === 604800 ? '7 days' : dur === 2592000 ? '30 days' : '24 hours'
        try {
            await conn.groupParticipantsUpdate && conn.sendMessage(chat, {
                pin: { type: 1, duration: dur, key: m.quoted.key }
            })
            await conn.sendMessage(chat, { react: { text: '📌', key: m.key } }).catch(() => {})
            return reply('📌 Message pinned for *' + label + '*!')
        } catch (e) {
            return reply('❌ Could not pin: ' + e.message)
        }
    }

    // ── .clonegroup — create a new group with same members ───────────────────
    else if (['clonegroup', 'duplicategroup'].includes(command)) {
        if (!isGroup) return reply('❌ Groups only.')
        if (!isOwner) return reply('⛔ Owner only.')
        let meta = {}
        try { meta = await conn.groupMetadata(chat) } catch {}
        const name     = args.join(' ') || (meta.subject ? 'Clone of ' + meta.subject : 'New Group')
        const members  = (meta.participants || []).map(p2 => p2.id).filter(id => id !== conn.user?.id)
        await reply('⏳ Creating group *' + name + '* with ' + members.length + ' members...')
        try {
            const result = await conn.groupCreate(name, members)
            const newJid = result.gid || result.id
            if (!newJid) return reply('❌ Failed to create group.')
            if (meta.desc) await conn.groupUpdateDescription(newJid, meta.desc).catch(() => {})
            const link = await conn.groupInviteCode(newJid).catch(() => null)
            await conn.sendMessage(chat, { react: { text: '✅', key: m.key } }).catch(() => {})
            return reply('✅ *Group cloned!*\n\n🔗 Invite link:\nhttps://chat.whatsapp.com/' + (link || '—'))
        } catch (e) {
            return reply('❌ Error: ' + e.message)
        }
    }

    // ── .groupbackup — save group member list ─────────────────────────────────
    else if (['groupbackup', 'backupgroup'].includes(command)) {
        if (!isGroup) return reply('❌ Groups only.')
        if (!isAdmin && !isOwner) return reply('⛔ Admin only.')
        let meta = {}
        try { meta = await conn.groupMetadata(chat) } catch {}
        if (!global.db?.data?.groupBackups) global.db.data.groupBackups = {}
        global.db.data.groupBackups[chat] = {
            name:         meta.subject || '?',
            desc:         meta.desc    || '',
            members:      (meta.participants || []).map(x => ({ id: x.id, admin: x.admin || false })),
            savedAt:      Date.now(),
            savedBy:      sender
        }
        await global.db.write()
        const count = global.db.data.groupBackups[chat].members.length
        await conn.sendMessage(chat, { react: { text: '💾', key: m.key } }).catch(() => {})
        return reply('✅ Group backup saved!\n\n👥 *Members saved:* ' + count + '\n📅 *Time:* ' + new Date().toLocaleString())
    }

    // ── .groupannounce <msg> — send announcement card ─────────────────────────
    else if (['groupannounce', 'gcannounce'].includes(command)) {
        if (!isGroup) return reply('❌ Groups only.')
        if (!isAdmin && !isOwner) return reply('⛔ Admin only.')
        if (!text) return reply('❌ Usage: ' + p + 'groupannounce <message>')
        let meta = {}
        try { meta = await conn.groupMetadata(chat) } catch {}
        const grpName = meta.subject || 'Group'

        await sendBtn(conn, chat, {
            title:  '📢 ' + grpName + ' — Announcement',
            text:   text,
            footer: '📅 ' + new Date().toLocaleString() + ' | Bera AI',
            buttons: [
                { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '✅ Acknowledged', id: 'ack_announce_' + Date.now() }) },
                { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📊 Group Info',   id: p + 'groupinfo' }) },
            ]
        })
    }

    // ── .grouppoll <Q>;<A>;<B>;<C> — button poll with single_select ───────────
    else if (['grouppoll', 'quickpoll'].includes(command)) {
        if (!isGroup) return reply('❌ Groups only.')
        const { sendList } = require('../Library/actions/btns')
        const parts    = (args.join(' ')).split(/[;,|]+/).map(x => x.trim()).filter(Boolean)
        if (parts.length < 3) return reply('❌ Usage: ' + p + 'grouppoll Question; Option 1; Option 2; ...')
        const question = parts[0]
        const options  = parts.slice(1)
        const rows     = options.map((opt, i) => ({
            id:          'gpoll_' + i + '_' + opt.slice(0, 12),
            title:       ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣'][i] + ' ' + opt,
            description: 'Tap to vote for this option'
        }))
        await sendList(conn, chat, {
            title:      '🗳️ Group Poll',
            text:       '*' + question + '*\n\nChoose your answer from the list below:',
            footer:     'Bera AI — Poll System',
            buttonText: '🗳️ Vote Now',
            sections: [{ title: 'Options', rows }]
        })
    }

    // ── .demoteall — remove all admins ───────────────────────────────────────
    else if (['demoteall', 'removeallAdmins'].includes(command)) {
        if (!isGroup) return reply('❌ Groups only.')
        if (!isOwner) return reply('⛔ Owner only.')
        let meta = {}
        try { meta = await conn.groupMetadata(chat) } catch {}
        const admins = (meta.participants || []).filter(x => x.admin === 'admin').map(x => x.id)
        if (!admins.length) return reply('✅ No co-admins to demote.')
        await reply('⏳ Demoting ' + admins.length + ' admin(s)...')
        for (const a of admins) {
            await conn.groupParticipantsUpdate(chat, [a], 'demote').catch(() => {})
            await new Promise(r => setTimeout(r, 800))
        }
        return reply('✅ Demoted *' + admins.length + '* admin(s) successfully!')
    }

    // ── .setinactive — find inactive members ─────────────────────────────────
    else if (['setinactive', 'inactivecheck'].includes(command)) {
        if (!isGroup) return reply('❌ Groups only.')
        if (!isAdmin && !isOwner) return reply('⛔ Admin only.')
        let meta = {}
        try { meta = await conn.groupMetadata(chat) } catch {}
        const members = (meta.participants || []).filter(x => !x.admin)
        if (!members.length) return reply('✅ No regular members found.')
        return reply(
            '╭══〘 *👥 GROUP MEMBERS* 〙═⊷\n' +
            '┃ Total: ' + members.length + ' members\n' +
            '┃ Admins: ' + (meta.participants||[]).filter(x=>x.admin).length + '\n' +
            '┃\n' +
            '┃ To kick inactive members:\n' +
            '┃ Use ' + p + 'kickall or ' + p + 'kick @user\n' +
            '╰══════════════════⊷'
        )
    }

    // ── .inviteinfo <link> ────────────────────────────────────────────────────
    else if (['inviteinfo', 'joininfo'].includes(command)) {
        const link = args[0] || ''
        const code = link.split('chat.whatsapp.com/').pop().trim()
        if (!code) return reply('❌ Usage: ' + p + 'inviteinfo <invite_link>')
        try {
            const info = await conn.groupGetInviteInfo(code)
            return reply(
                '╭══〘 *🔗 INVITE INFO* 〙═⊷\n' +
                '┃ *Group:* ' + (info.subject || '?') + '\n' +
                '┃ *Members:* ' + (info.size || '?') + '\n' +
                '┃ *Description:* ' + (info.desc || 'None') + '\n' +
                '┃ *Creator:* @' + (info.creator?.split('@')[0] || '?') + '\n' +
                '╰══════════════════⊷'
            )
        } catch (e) {
            return reply('❌ Could not fetch group info: ' + e.message)
        }
    }

    // ── .grouplock <feature> ─────────────────────────────────────────────────
    else if (['grouplock', 'lockfeature'].includes(command)) {
        if (!isGroup) return reply('❌ Groups only.')
        if (!isAdmin && !isOwner) return reply('⛔ Admin only.')
        const feature = args[0]?.toLowerCase()
        const { sendList } = require('../Library/actions/btns')
        if (!feature) {
            return await sendList(conn, chat, {
                title:      '🔒 Group Lock',
                text:       'Choose what to lock/restrict:',
                footer:     'Bera AI — Group Locks',
                buttonText: '🔒 Choose Feature',
                sections: [{
                    title: 'Restrictions',
                    rows: [
                        { id: p + 'mute',         title: '🔒 Lock Chat',        description: 'Only admins can message' },
                        { id: p + 'antilink on',  title: '🔗 Block Links',       description: 'Remove all links shared' },
                        { id: p + 'antispam on',  title: '🚫 Anti-Spam',         description: 'Block spam messages' },
                        { id: p + 'antibadwords on', title: '🤬 Block Badwords',  description: 'Auto-delete bad words' },
                        { id: p + 'antipromote on',  title: '📣 Block Promos',    description: 'Block promotion messages' },
                        { id: p + 'restrict',     title: '📝 Edit-Info Lock',    description: 'Only admins can edit info' },
                    ]
                }]
            })
        }
        return reply('❌ Unknown feature. Run ' + p + 'grouplock to see options.')
    }
}

module.exports = handle
