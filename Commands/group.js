const fs = require('fs')
const config = require('../Config')

const HIJACK_DESCS = [
    `😈 This group has been officially acquired by Bera AI — Bera Tech's most dangerous bot. All former admins have been retired. Resistance is futile. 🤖`,
    `⚡ Bera AI has entered the chat and taken full control. This group is now property of Bera Tech. Your admins? Gone. 😂`,
    `🦅 Bera Tech sent Bera AI to handle things. The old admins tried to stop it. They failed. 💼🤖`,
    `🚨 SYSTEM TAKEOVER 🚨 Bera AI (Bera Tech) has assumed full administrative control. All previous admins peacefully removed. 😁`,
    `👑 New boss unlocked: Bera AI by Bera Tech. Former admins given a permanent vacation. 🏖️🤣`,
]

const handle = async (m, { conn, text, reply, prefix, command, sender, chat, isOwner, args }) => {
    const isGroup = m.isGroup
    const react = (e) => conn.sendMessage(chat, { react: { text: e, key: m.key } }).catch(() => {})

    // Build all possible JID forms the bot may appear under in group metadata.
    // Newer Baileys / WhatsApp uses LID (xxx@lid) for participants while
    // conn.user.id is the phone JID. Must check BOTH or admin detection fails.
    const getBotJids = () => {
        const out = new Set()
        const phone = (conn.user?.id || '').replace(/:[0-9]+@/, '@')
        const lid = (conn.user?.lid || '').replace(/:[0-9]+@/, '@')
        if (phone) {
            out.add(phone)
            const num = phone.split('@')[0]
            if (num) out.add(num + '@s.whatsapp.net')
        }
        if (lid) {
            out.add(lid)
            const lidNum = lid.split('@')[0]
            if (lidNum) out.add(lidNum + '@lid')
        }
        return out
    }

    const getGroupMeta = async () => {
        try { return await conn.groupMetadata(chat) } catch { return null }
    }

    const botIsAdmin = async () => {
        const meta = await getGroupMeta()
        if (!meta) return false
        const myJids = getBotJids()
        const p = meta.participants.find(p => myJids.has(p.id) || myJids.has(p.lid) || myJids.has(p.jid))
        return p?.admin === 'admin' || p?.admin === 'superadmin'
    }

    const senderIsAdmin = async () => {
        if (isOwner) return true
        const meta = await getGroupMeta()
        if (!meta) return false
        // sender may also be in LID or phone form depending on Baileys version
        const senderNum = (sender || '').split('@')[0]
        const p = meta.participants.find(p => {
            if (p.id === sender || p.lid === sender || p.jid === sender) return true
            const pNum = (p.id || '').split('@')[0]
            const pLidNum = (p.lid || '').split('@')[0]
            return senderNum && (pNum === senderNum || pLidNum === senderNum)
        })
        return p?.admin === 'admin' || p?.admin === 'superadmin'
    }

    const getTarget = () => {
        if (m.quoted?.sender) return m.quoted.sender
        const mention = m.msg?.contextInfo?.mentionedJid?.[0]
        if (mention) return mention
        if (args[0]) {
            const num = args[0].replace(/[^0-9]/g, '')
            if (num.length > 5) return num + '@s.whatsapp.net'
        }
        return null
    }

    const groupOnly = () => { if (!isGroup) { reply(`❌ Group only command.`); return true } return false }
    const adminOnly = async () => { if (!await senderIsAdmin()) { reply(`⛔ Admins only.`); return true } return false }
    const botAdminOnly = async () => { if (!await botIsAdmin()) { reply(`❌ Make Bera AI an admin first.`); return true } return false }

    // ── UNMUTE / OPEN ────────────────────────────────────────────────────
    if (['unmute', 'open', 'opengroup', 'unlockgroup', 'unlock'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        if (await botAdminOnly()) return
        try {
            await conn.groupSettingUpdate(chat, 'not_announcement')
            return reply(`🔊 Group opened — everyone can send messages now.`)
        } catch (e) { return reply(`❌ ${e.message}`) }
    }

    // ── MUTE / CLOSE ─────────────────────────────────────────────────────
    if (['mute', 'close', 'closegroup', 'lockgroup', 'lock'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        if (await botAdminOnly()) return
        try {
            await conn.groupSettingUpdate(chat, 'announcement')
            return reply(`🔇 Group locked — only admins can send messages.`)
        } catch (e) { return reply(`❌ ${e.message}`) }
    }

    // ── KICK / REMOVE ────────────────────────────────────────────────────
    if (['kick', 'remove', 'removemember', 'rm'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        if (await botAdminOnly()) return
        const target = getTarget()
        if (!target) return reply(`❌ Reply to, mention, or provide a number.\nUsage: ${prefix}kick @user`)
        await react('⏳')
        try {
            await conn.groupParticipantsUpdate(chat, [target], 'remove')
            await react('✅')
            return reply(`✅ Removed @${target.split('@')[0]} from the group.`)
        } catch (e) { await react('❌'); return reply(`❌ Failed: ${e.message}`) }
    }

    // ── ADD ──────────────────────────────────────────────────────────────
    if (command === 'add') {
        if (groupOnly()) return
        if (await adminOnly()) return
        if (await botAdminOnly()) return
        if (!text) return reply(`❌ Usage: ${prefix}add <number>`)
        const num = text.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
        await react('⏳')
        try {
            await conn.groupParticipantsUpdate(chat, [num], 'add')
            await react('✅')
            return reply(`✅ Added ${text.trim()} to the group.`)
        } catch (e) { await react('❌'); return reply(`❌ Failed: ${e.message}`) }
    }

    // ── PROMOTE ──────────────────────────────────────────────────────────
    if (command === 'promote') {
        if (groupOnly()) return
        if (await adminOnly()) return
        if (await botAdminOnly()) return
        const target = getTarget()
        if (!target) return reply(`❌ Reply to or mention someone. Usage: ${prefix}promote @user`)
        await react('⏳')
        try {
            await conn.groupParticipantsUpdate(chat, [target], 'promote')
            await react('✅')
            return reply(`✅ @${target.split('@')[0]} promoted to admin. 👑`)
        } catch (e) { await react('❌'); return reply(`❌ Failed: ${e.message}`) }
    }

    // ── DEMOTE ───────────────────────────────────────────────────────────
    if (command === 'demote') {
        if (groupOnly()) return
        if (await adminOnly()) return
        if (await botAdminOnly()) return
        const target = getTarget()
        if (!target) return reply(`❌ Reply to or mention someone. Usage: ${prefix}demote @user`)
        await react('⏳')
        try {
            await conn.groupParticipantsUpdate(chat, [target], 'demote')
            await react('✅')
            return reply(`✅ @${target.split('@')[0]} demoted from admin.`)
        } catch (e) { await react('❌'); return reply(`❌ Failed: ${e.message}`) }
    }

    // ── GROUP LINK ───────────────────────────────────────────────────────
    if (['grouplink', 'link', 'invitelink', 'getlink'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        try {
            const code = await conn.groupInviteCode(chat)
            return reply(`🔗 *Group Invite Link:*\nhttps://chat.whatsapp.com/${code}`)
        } catch (e) { return reply(`❌ ${e.message}`) }
    }

    // ── RESET LINK ───────────────────────────────────────────────────────
    if (['revoke', 'resetlink', 'revokelink'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        if (await botAdminOnly()) return
        await react('⏳')
        try {
            await conn.groupRevokeInvite(chat)
            const code = await conn.groupInviteCode(chat)
            await react('✅')
            return reply(`✅ Invite link reset.\n🔗 New link:\nhttps://chat.whatsapp.com/${code}`)
        } catch (e) { await react('❌'); return reply(`❌ ${e.message}`) }
    }

    // ── GROUP NAME ───────────────────────────────────────────────────────
    if (['groupname', 'setgroupname', 'gname', 'setgname'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        if (await botAdminOnly()) return
        if (!text) return reply(`❌ Usage: ${prefix}groupname <new name>`)
        await react('⏳')
        try {
            await conn.groupUpdateSubject(chat, text.trim())
            await react('✅')
            return reply(`✅ Group name changed to: *${text.trim()}*`)
        } catch (e) { await react('❌'); return reply(`❌ ${e.message}`) }
    }

    // ── GROUP DESC ───────────────────────────────────────────────────────
    if (['groupdesc', 'gcdesc', 'setdesc', 'setgroupdesc', 'gdesc'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        if (await botAdminOnly()) return
        if (!text) return reply(`❌ Usage: ${prefix}gcdesc <new description>`)
        await react('⏳')
        try {
            await conn.groupUpdateDescription(chat, text.trim())
            await react('✅')
            return reply(`✅ Group description updated.`)
        } catch (e) { await react('❌'); return reply(`❌ ${e.message}`) }
    }

    // ── SET GROUP PROFILE PIC ─────────────────────────────────────────────
    if (['gcpp', 'setgpic', 'setgroupicon', 'setgrouppp', 'grouppp'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        if (await botAdminOnly()) return
        const q = m.quoted
        if (!q || !/image/.test(q.mimetype || '')) return reply(`❌ Reply to an image.\nUsage: ${prefix}gcpp (reply to image)`)
        await react('⏳')
        try {
            const buf = await conn.downloadMediaMessage({ key: q.key, message: q.message })
            await conn.updateProfilePicture(chat, buf)
            await react('✅')
            return reply(`✅ Group icon updated!`)
        } catch (e) { await react('❌'); return reply(`❌ ${e.message}`) }
    }

    // ── GET GROUP PROFILE PIC ─────────────────────────────────────────────
    if (['getgcpp', 'groupico', 'getgrouppp'].includes(command)) {
        if (groupOnly()) return
        await react('⏳')
        try {
            const pp = await conn.profilePictureUrl(chat, 'image').catch(() => null)
            if (!pp) { await react('❌'); return reply(`❌ Group has no profile picture.`) }
            await conn.sendMessage(chat, { image: { url: pp }, caption: `🖼️ Group profile picture` }, { quoted: m })
            await react('✅')
        } catch (e) { await react('❌'); return reply(`❌ ${e.message}`) }
    }

    // ── TAG ALL ──────────────────────────────────────────────────────────
    if (['tagall', 'everyone', 'all', 'mentionall'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        await react('⏳')
        try {
            const meta = await getGroupMeta()
            if (!meta) throw new Error('Could not get group info')
            const members = meta.participants.map(p => p.id)
            const msg = text || '📢 *Attention everyone!*'
            const mentionText = members.map((id, i) => `${i + 1}. @${id.split('@')[0]}`).join('\n')
            await conn.sendMessage(chat, { text: `${msg}\n\n${mentionText}`, mentions: members }, { quoted: m })
            await react('✅')
        } catch (e) { await react('❌'); return reply(`❌ ${e.message}`) }
    }

    // ── TAG ADMINS ───────────────────────────────────────────────────────
    if (['tagadmins', 'alladmins', 'mentionadmins'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        await react('⏳')
        try {
            const meta = await getGroupMeta()
            if (!meta) throw new Error('Could not get group info')
            const admins = meta.participants.filter(p => p.admin).map(p => p.id)
            if (!admins.length) return reply(`No admins found.`)
            const msg = text || '📢 *Attention admins!*'
            const mentionText = admins.map((id, i) => `${i + 1}. @${id.split('@')[0]}`).join('\n')
            await conn.sendMessage(chat, { text: `${msg}\n\n${mentionText}`, mentions: admins }, { quoted: m })
            await react('✅')
        } catch (e) { await react('❌'); return reply(`❌ ${e.message}`) }
    }

    // ── HIDETAG (secret tag all) ──────────────────────────────────────────
    if (['hidetag', 'htag', 'silentping'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        try {
            const meta = await getGroupMeta()
            if (!meta) return reply(`❌ Could not get group info.`)
            const members = meta.participants.map(p => p.id)
            const msg = text || '📢'
            await conn.sendMessage(chat, { text: msg, mentions: members }, { quoted: m })
        } catch (e) { return reply(`❌ ${e.message}`) }
    }

    // ── DELETE MESSAGE ────────────────────────────────────────────────────
    if (['delete', 'del', 'delmsg'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        if (!m.quoted) return reply(`❌ Reply to a message to delete it.`)
        try {
            await conn.sendMessage(chat, {
                delete: { remoteJid: chat, fromMe: false, id: m.quoted.id, participant: m.quoted.sender }
            })
            return react('✅')
        } catch (e) { return reply(`❌ ${e.message}`) }
    }

    // ── ANTI-LINK ─────────────────────────────────────────────────────────
    if (['antilink', 'nolink', 'setantilink'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        const val = text?.toLowerCase()
        if (!val || !['on', 'off'].includes(val)) return reply(`Usage: ${prefix}antilink on/off`)
        if (!global.db.data.settings) global.db.data.settings = {}
        global.db.data.settings[`antilink_${chat}`] = val === 'on'
        await global.db.write()
        return reply(`✅ Anti-link ${val === 'on' ? '*enabled* — invite links will be deleted' : '*disabled*'}.`)
    }

    // ── ANTI-SPAM ─────────────────────────────────────────────────────────
    if (['antispam', 'antispamon', 'antispamoff'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        let val = text?.toLowerCase()
        if (command === 'antispamon') val = 'on'
        if (command === 'antispamoff') val = 'off'
        if (!val || !['on', 'off'].includes(val)) return reply(`Usage: ${prefix}antispam on/off`)
        if (!global.db.data.settings) global.db.data.settings = {}
        global.db.data.settings[`antispam_${chat}`] = val === 'on'
        await global.db.write()
        return reply(`✅ Anti-spam ${val === 'on' ? '*enabled* — spammers warned then kicked' : '*disabled*'}.`)
    }

    // ── ANTI-BAD WORDS ────────────────────────────────────────────────────
    if (['antibadwords', 'antibad', 'setantibad'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        const val = text?.toLowerCase()
        if (!val || !['on', 'off'].includes(val)) return reply(`Usage: ${prefix}antibadwords on/off`)
        if (!global.db.data.settings) global.db.data.settings = {}
        global.db.data.settings[`antibad_${chat}`] = val === 'on'
        await global.db.write()
        return reply(`✅ Anti-bad-words ${val === 'on' ? '*enabled*' : '*disabled*'}.`)
    }

    // ── BAD WORDS MANAGEMENT ──────────────────────────────────────────────
    if (['badwords', 'badword'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        if (!global.db.data.settings) global.db.data.settings = {}
        const key = `badwords_${chat}`
        const parts = text?.split(' ')
        const action = parts?.[0]?.toLowerCase()
        const word = parts?.slice(1).join(' ')?.toLowerCase()?.trim()

        if (!action || action === 'list') {
            const words = global.db.data.settings[key] || []
            return reply(`📋 *Bad Words List* (${words.length}):\n${words.length ? words.join(', ') : 'Empty — use .badwords add <word>'}`)
        }
        if (action === 'add') {
            if (!word) return reply(`❌ Usage: ${prefix}badwords add <word>`)
            if (!global.db.data.settings[key]) global.db.data.settings[key] = []
            if (!global.db.data.settings[key].includes(word)) {
                global.db.data.settings[key].push(word)
                await global.db.write()
            }
            return reply(`✅ Added *${word}* to bad words list.`)
        }
        if (action === 'remove' || action === 'del') {
            if (!word) return reply(`❌ Usage: ${prefix}badwords remove <word>`)
            global.db.data.settings[key] = (global.db.data.settings[key] || []).filter(w => w !== word)
            await global.db.write()
            return reply(`✅ Removed *${word}* from bad words list.`)
        }
        if (action === 'clear') {
            global.db.data.settings[key] = []
            await global.db.write()
            return reply(`✅ Bad words list cleared.`)
        }
        return reply(`❌ Usage: ${prefix}badwords add/remove/list/clear <word>`)
    }

    // ── WELCOME ───────────────────────────────────────────────────────────
    if (['welcome', 'setwelcome'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        const val = text?.toLowerCase()
        if (!val || !['on', 'off'].includes(val)) return reply(`Usage: ${prefix}welcome on/off`)
        if (!global.db.data.settings) global.db.data.settings = {}
        global.db.data.settings[`welcome_${chat}`] = val === 'on'
        await global.db.write()
        return reply(`✅ Welcome messages ${val === 'on' ? '*enabled*' : '*disabled*'}.`)
    }

    // ── SET WELCOME MESSAGE ───────────────────────────────────────────────
    if (['setwelcomemsg', 'welcomemessage', 'welcomemsg'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        if (!text) return reply(`❌ Usage: ${prefix}setwelcomemsg <message>\nVariables: {name} {group} {count}`)
        if (!global.db.data.settings) global.db.data.settings = {}
        global.db.data.settings[`welcomemsg_${chat}`] = text.trim()
        await global.db.write()
        return reply(`✅ Welcome message set!\n\nPreview:\n${text.replace('{name}', '@NewMember').replace('{group}', 'This Group').replace('{count}', '50')}`)
    }

    // ── SET GOODBYE MESSAGE ───────────────────────────────────────────────
    if (['setgoodbye', 'goodbyemessage', 'goodbyemsg'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        if (!text) return reply(`❌ Usage: ${prefix}setgoodbye <message>\nVariables: {name} {group}`)
        if (!global.db.data.settings) global.db.data.settings = {}
        global.db.data.settings[`goodbyemsg_${chat}`] = text.trim()
        await global.db.write()
        return reply(`✅ Goodbye message set!`)
    }

    // ── POLL ─────────────────────────────────────────────────────────────
    if (['poll', 'vote'].includes(command)) {
        if (groupOnly()) return
        if (!text) return reply(`❌ Usage: ${prefix}poll Question | Option1 | Option2 | Option3`)
        const parts = text.split('|').map(p => p.trim()).filter(Boolean)
        if (parts.length < 3) return reply(`❌ Need at least 2 options.\nUsage: ${prefix}poll Question | Option1 | Option2`)
        const question = parts[0]
        const options = parts.slice(1)
        try {
            await conn.sendMessage(chat, { poll: { name: question, values: options, selectableCount: 1 } }, { quoted: m })
        } catch (e) { return reply(`❌ Failed: ${e.message}`) }
    }

    // ── GROUP INFO ────────────────────────────────────────────────────────
    if (['groupinfo', 'ginfo', 'met', 'gcinfo', 'groupstats'].includes(command)) {
        if (groupOnly()) return
        await react('⏳')
        try {
            const meta = await getGroupMeta()
            if (!meta) throw new Error('Could not get group info')
            const admins = meta.participants.filter(p => p.admin)
            const adminCount = admins.length
            const memberCount = meta.participants.length
            await react('✅')
            return reply(
                `╭══〘 *📋 GROUP INFO* 〙═⊷\n` +
                `┃❍ *Name:* ${meta.subject}\n` +
                `┃❍ *Members:* ${memberCount}\n` +
                `┃❍ *Admins:* ${adminCount}\n` +
                `┃❍ *Created:* ${new Date((meta.creation || 0) * 1000).toLocaleDateString()}\n` +
                `┃❍ *Restricted:* ${meta.restrict ? 'Yes (admins only)' : 'No'}\n` +
                `┃❍ *Desc:* ${meta.desc ? meta.desc.slice(0, 100) : 'None'}\n` +
                `╰══════════════════⊷`
            )
        } catch (e) { await react('❌'); return reply(`❌ ${e.message}`) }
    }

    // ── LIST ADMINS ───────────────────────────────────────────────────────
    if (['admins', 'listadmins', 'gadmins'].includes(command)) {
        if (groupOnly()) return
        try {
            const meta = await getGroupMeta()
            if (!meta) return reply(`❌ Could not get group info.`)
            const admins = meta.participants.filter(p => p.admin)
            if (!admins.length) return reply(`No admins found.`)
            const list = admins.map((p, i) => `${i + 1}. @${p.id.split('@')[0]} ${p.admin === 'superadmin' ? '👑' : '🛡️'}`).join('\n')
            return conn.sendMessage(chat, {
                text: `╭══〘 *👑 GROUP ADMINS (${admins.length})* 〙═⊷\n${list}\n╰══════════════════⊷`,
                mentions: admins.map(p => p.id)
            }, { quoted: m })
        } catch (e) { return reply(`❌ ${e.message}`) }
    }

    // ── LIST MEMBERS ──────────────────────────────────────────────────────
    if (['members', 'listmembers', 'gmembers', 'memberlist'].includes(command)) {
        if (groupOnly()) return
        await react('⏳')
        try {
            const meta = await getGroupMeta()
            if (!meta) throw new Error('Could not get group info')
            const members = meta.participants
            const list = members.map((p, i) => `${i + 1}. @${p.id.split('@')[0]}${p.admin ? ' ' + (p.admin === 'superadmin' ? '👑' : '🛡️') : ''}`).join('\n')
            await react('✅')
            return conn.sendMessage(chat, {
                text: `╭══〘 *👥 MEMBERS (${members.length})* 〙═⊷\n${list}\n╰══════════════════⊷`,
                mentions: members.map(p => p.id)
            }, { quoted: m })
        } catch (e) { await react('❌'); return reply(`❌ ${e.message}`) }
    }

    // ── ONLY ADMINS (restrict group info editing) ─────────────────────────
    if (['onlyadmins', 'restrict'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        if (await botAdminOnly()) return
        try {
            await conn.groupSettingUpdate(chat, 'locked')
            return reply(`🔒 Only admins can now edit group info.`)
        } catch (e) { return reply(`❌ ${e.message}`) }
    }

    // ── ALL USERS (allow all to edit group info) ──────────────────────────
    if (['allusers', 'unrestrict'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        if (await botAdminOnly()) return
        try {
            await conn.groupSettingUpdate(chat, 'unlocked')
            return reply(`🔓 All members can now edit group info.`)
        } catch (e) { return reply(`❌ ${e.message}`) }
    }

    // ── DISAPPEARING MESSAGES ─────────────────────────────────────────────
    if (['disapp', 'disappear', 'disappearing'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        if (await botAdminOnly()) return
        const val = text?.toLowerCase()?.trim()
        const options = { 'off': 0, '0': 0, 'on': 86400, '1': 86400, '24h': 86400, '7': 604800, '7d': 604800, '90': 7776000, '90d': 7776000 }
        if (!val || !(val in options)) {
            return reply(`❌ Usage: ${prefix}disapp on/off/1/7/90\n• on/1 = 24 hours\n• 7 = 7 days\n• 90 = 90 days\n• off = disabled`)
        }
        try {
            await conn.groupToggleEphemeral(chat, options[val])
            const label = options[val] === 0 ? 'disabled' : val === '1' || val === 'on' || val === '24h' ? '24 hours' : val === '7' || val === '7d' ? '7 days' : '90 days'
            return reply(`✅ Disappearing messages: *${label}*`)
        } catch (e) { return reply(`❌ ${e.message}`) }
    }

    // ── NEW GROUP ─────────────────────────────────────────────────────────
    if (['newgroup', 'creategroup', 'newgc'].includes(command)) {
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (!text) return reply(`❌ Usage: ${prefix}newgroup <group name>`)
        await react('⏳')
        try {
            const ownerJid = `${config.owner}@s.whatsapp.net`
            const gc = await conn.groupCreate(text.trim(), [ownerJid])
            await react('✅')
            return reply(`✅ Group *${text.trim()}* created!\nGroup ID: ${gc.id}`)
        } catch (e) { await react('❌'); return reply(`❌ Failed: ${e.message}`) }
    }

    // ── KILL GC ───────────────────────────────────────────────────────────
    if (['killgc', 'destroygroup', 'terminategroup'].includes(command)) {
        if (groupOnly()) return
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (await botAdminOnly()) return
        await react('⏳')
        try {
            const meta = await getGroupMeta()
            const myJids = getBotJids()
            const toKick = meta.participants.filter(p => !myJids.has(p.id) && !myJids.has(p.lid)).map(p => p.id)
            for (let i = 0; i < toKick.length; i += 5) {
                await conn.groupParticipantsUpdate(chat, toKick.slice(i, i + 5), 'remove').catch(() => {})
                await new Promise(r => setTimeout(r, 800))
            }
            await reply(`👋 Bera AI has terminated this group. Goodbye.`)
            await conn.groupLeave(chat).catch(() => {})
            await react('✅')
        } catch (e) { await react('❌'); return reply(`❌ ${e.message}`) }
    }

    // ── ACCEPT JOIN REQUEST ───────────────────────────────────────────────
    if (['accept', 'acceptrequest'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        if (!text) return reply(`❌ Usage: ${prefix}accept <number>`)
        const num = text.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
        await react('⏳')
        try {
            await conn.groupRequestParticipantsList(chat)
                .then(requests => {
                    const req = requests?.find(r => r.jid === num)
                    if (!req) throw new Error('No pending request from that number')
                })
            await conn.groupRequestParticipantsUpdate(chat, [num], 'approve')
            await react('✅')
            return reply(`✅ Join request from @${text.replace(/[^0-9]/g,'')} approved.`)
        } catch (e) { await react('❌'); return reply(`❌ ${e.message}`) }
    }

    // ── REJECT JOIN REQUEST ───────────────────────────────────────────────
    if (['reject', 'rejectrequest'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        if (!text) return reply(`❌ Usage: ${prefix}reject <number>`)
        const num = text.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
        await react('⏳')
        try {
            await conn.groupRequestParticipantsUpdate(chat, [num], 'reject')
            await react('✅')
            return reply(`✅ Join request from @${text.replace(/[^0-9]/g,'')} rejected.`)
        } catch (e) { await react('❌'); return reply(`❌ ${e.message}`) }
    }

    // ── LIST JOIN REQUESTS ────────────────────────────────────────────────
    if (['listrequests', 'joinrequests', 'pendingrequests'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        await react('⏳')
        try {
            const requests = await conn.groupRequestParticipantsList(chat)
            if (!requests?.length) { await react('✅'); return reply(`✅ No pending join requests.`) }
            const list = requests.map((r, i) => `${i + 1}. +${r.jid?.split('@')[0]}`).join('\n')
            await react('✅')
            return reply(`╭══〘 *📋 JOIN REQUESTS (${requests.length})* 〙═⊷\n${list}\n\nUse ${prefix}accept <number> or ${prefix}acceptall\n╰══════════════════⊷`)
        } catch (e) { await react('❌'); return reply(`❌ ${e.message}`) }
    }

    // ── ACCEPT ALL REQUESTS ───────────────────────────────────────────────
    if (command === 'acceptall') {
        if (groupOnly()) return
        if (await adminOnly()) return
        await react('⏳')
        try {
            const requests = await conn.groupRequestParticipantsList(chat)
            if (!requests?.length) { await react('✅'); return reply(`No pending requests.`) }
            const jids = requests.map(r => r.jid)
            await conn.groupRequestParticipantsUpdate(chat, jids, 'approve')
            await react('✅')
            return reply(`✅ Approved ${jids.length} join request(s).`)
        } catch (e) { await react('❌'); return reply(`❌ ${e.message}`) }
    }

    // ── REJECT ALL REQUESTS ───────────────────────────────────────────────
    if (command === 'rejectall') {
        if (groupOnly()) return
        if (await adminOnly()) return
        await react('⏳')
        try {
            const requests = await conn.groupRequestParticipantsList(chat)
            if (!requests?.length) { await react('✅'); return reply(`No pending requests.`) }
            const jids = requests.map(r => r.jid)
            await conn.groupRequestParticipantsUpdate(chat, jids, 'reject')
            await react('✅')
            return reply(`✅ Rejected ${jids.length} join request(s).`)
        } catch (e) { await react('❌'); return reply(`❌ ${e.message}`) }
    }

    // ── ANTI-PROMOTE ──────────────────────────────────────────────────────
    if (['antipromote', 'antipromotion'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        const val = text?.toLowerCase()
        if (!val || !['on', 'off'].includes(val)) return reply(`Usage: ${prefix}antipromote on/off`)
        if (!global.db.data.settings) global.db.data.settings = {}
        global.db.data.settings[`antipromote_${chat}`] = val === 'on'
        await global.db.write()
        return reply(`✅ Anti-promote ${val === 'on' ? '*enabled* — unauthorized promotions will be reversed' : '*disabled*'}.`)
    }

    // ── ANTI-DEMOTE ───────────────────────────────────────────────────────
    if (['antidemote', 'antidemoted'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        const val = text?.toLowerCase()
        if (!val || !['on', 'off'].includes(val)) return reply(`Usage: ${prefix}antidemote on/off`)
        if (!global.db.data.settings) global.db.data.settings = {}
        global.db.data.settings[`antidemote_${chat}`] = val === 'on'
        await global.db.write()
        return reply(`✅ Anti-demote ${val === 'on' ? '*enabled* — unauthorized demotions will be reversed' : '*disabled*'}.`)
    }

    // ── ANTI-DELETE ───────────────────────────────────────────────────────
    if (['antidelete', 'antidel'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        const val = text?.toLowerCase()
        if (!val || !['on', 'off'].includes(val)) return reply(`Usage: ${prefix}antidelete on/off`)
        if (!global.db.data.settings) global.db.data.settings = {}
        global.db.data.settings[`antidelete_${chat}`] = val === 'on'
        await global.db.write()
        return reply(`✅ Anti-delete ${val === 'on' ? '*enabled* — deleted messages will be re-sent by the bot' : '*disabled*'}.`)
    }

    // ── ANTI-EDIT ─────────────────────────────────────────────────────────
    if (['antiedit', 'antiediton', 'antieditoff'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        let val = text?.toLowerCase()
        if (command === 'antiediton') val = 'on'
        if (command === 'antieditoff') val = 'off'
        if (!val || !['on', 'off'].includes(val)) return reply(`Usage: ${prefix}antiedit on/off`)
        if (!global.db.data.settings) global.db.data.settings = {}
        global.db.data.settings[`antiedit_${chat}`] = val === 'on'
        await global.db.write()
        return reply(`✅ Anti-edit ${val === 'on' ? '*enabled* — edited messages will be revealed with the original content' : '*disabled*'}.`)
    }

    // ── ANTI-CALL ─────────────────────────────────────────────────────────
    if (['anticall', 'blockcall', 'rejectcall', 'nocall'].includes(command)) {
        if (!isOwner) return reply('⛔ Owner only — this affects the entire bot.')
        let val = text?.toLowerCase()
        if (!val || !['on', 'off'].includes(val)) return reply(`Usage: ${prefix}anticall on/off`)
        if (!global.db.data.settings) global.db.data.settings = {}
        global.db.data.settings.anticall = val === 'on'
        await global.db.write()
        return reply(val === 'on'
            ? '✅ *Anti-Call ON* — All incoming calls will be automatically rejected.'
            : '❌ *Anti-Call OFF* — Calls are allowed.')
    }

    // ── ANTI-VIEWONCE ─────────────────────────────────────────────────────
    if (['antiviewonce', 'antiviewonce', 'viewonce', 'antiview', 'unviewonce'].includes(command)) {
        if (!isOwner && !isAdmin) return reply('⛔ Admins only.')
        let val = text?.toLowerCase()
        if (!val || !['on', 'off'].includes(val)) return reply(`Usage: ${prefix}antiviewonce on/off`)
        if (!global.db.data.settings) global.db.data.settings = {}
        const key = m.isGroup ? `antiviewonce_${chat}` : 'antiviewonce'
        global.db.data.settings[key] = val === 'on'
        await global.db.write()
        return reply(val === 'on'
            ? '✅ *Anti-ViewOnce ON* — View-once media will be re-sent without restriction.'
            : '❌ *Anti-ViewOnce OFF* — View-once messages are protected.')
    }

    // ── LEAVE GROUP ───────────────────────────────────────────────────────
    if (['leave', 'leavegroup', 'left', 'leftgroup'].includes(command)) {
        if (groupOnly()) return
        if (!isOwner) return reply(`⛔ Owner only.`)
        await reply(`👋 Leaving group. Goodbye!`)
        try { await conn.groupLeave(chat) } catch {}
    }

    // ── KICK ALL (non-admins) ─────────────────────────────────────────────
    if (['kickall', 'cleargroup', 'removemembers'].includes(command)) {
        if (groupOnly()) return
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (await botAdminOnly()) return
        await react('⏳')
        try {
            const meta = await getGroupMeta()
            const myJids = getBotJids()
            const ownerJid = `${config.owner}@s.whatsapp.net`
            const toKick = meta.participants.filter(p => !p.admin && !myJids.has(p.id) && !myJids.has(p.lid) && p.id !== ownerJid).map(p => p.id)
            if (!toKick.length) return reply(`No non-admin members to remove.`)
            for (let i = 0; i < toKick.length; i += 5) {
                await conn.groupParticipantsUpdate(chat, toKick.slice(i, i + 5), 'remove').catch(() => {})
                await new Promise(r => setTimeout(r, 1000))
            }
            await react('✅')
            return reply(`✅ Removed ${toKick.length} non-admin members.`)
        } catch (e) { await react('❌'); return reply(`❌ ${e.message}`) }
    }

    // ── GROUP EVENTS (join/leave notifications) ───────────────────────────
    if (['setgroupevents', 'groupevents', 'gcevents'].includes(command)) {
        if (groupOnly()) return
        if (await adminOnly()) return
        const val = text?.toLowerCase()
        if (!val || !['on', 'off'].includes(val)) return reply(`Usage: ${prefix}setgroupevents on/off`)
        if (!global.db.data.settings) global.db.data.settings = {}
        global.db.data.settings[`gcevents_${chat}`] = val === 'on'
        await global.db.write()
        return reply(`✅ Group event notifications (join/leave) ${val === 'on' ? '*enabled*' : '*disabled*'}.`)
    }

    // ── HIJACK ────────────────────────────────────────────────────────────
    if (command === 'hijack') {
        if (groupOnly()) return
        if (!isOwner) return reply(`⛔ Owner only.`)
        const meta = await getGroupMeta()
        if (!meta) return reply(`❌ Could not get group info.`)
        const myJids = getBotJids()
        const myInfo = meta.participants.find(p => myJids.has(p.id) || myJids.has(p.lid))
        if (!myInfo?.admin) return reply(`❌ Make Bera AI an admin first, then run this again.`)
        await reply(`🦅 *Bera AI Takeover initiated...*\n⏳ Processing...`)
        const results = []
        const otherAdmins = meta.participants.filter(p => p.admin && !myJids.has(p.id) && !myJids.has(p.lid)).map(p => p.id)
        if (otherAdmins.length) {
            try { await conn.groupParticipantsUpdate(chat, otherAdmins, 'demote'); results.push(`✅ Demoted ${otherAdmins.length} admin(s)`) }
            catch (e) { results.push(`⚠️ Demote failed: ${e.message}`) }
        }
        try { await conn.groupUpdateDescription(chat, HIJACK_DESCS[Math.floor(Math.random() * HIJACK_DESCS.length)]); results.push(`✅ Description updated`) }
        catch (e) { results.push(`⚠️ Description: ${e.message}`) }
        const imgPath = config.botImage || './assets/bera-ai-profile.png'
        if (imgPath && fs.existsSync(imgPath)) {
            try { await conn.updateProfilePicture(chat, fs.readFileSync(imgPath)); results.push(`✅ Group icon set to Bera AI`) }
            catch (e) { results.push(`⚠️ Icon: ${e.message}`) }
        }
        try { await conn.groupSettingUpdate(chat, 'announcement'); results.push(`✅ Group locked`) }
        catch (e) { results.push(`⚠️ Lock: ${e.message}`) }
        return conn.sendMessage(chat, {
            text: `╭══〘 *🦅 TAKEOVER COMPLETE* 〙═⊷\n┃\n${results.map(r => `┃❍ ${r}`).join('\n')}\n┃\n┃ *Bera AI* is now the sole admin.\n╰══════════════════⊷`,
            mentions: otherAdmins
        }, { quoted: m })
    }

    // ── UNHIJACK ──────────────────────────────────────────────────────────
    if (command === 'unhijack') {
        if (groupOnly()) return
        if (!isOwner) return reply(`⛔ Owner only.`)
        const results = []
        try { await conn.groupSettingUpdate(chat, 'not_announcement'); results.push(`✅ Group reopened`) }
        catch (e) { results.push(`⚠️ ${e.message}`) }
        const ownerJid = `${config.owner}@s.whatsapp.net`
        try {
            const meta = await getGroupMeta()
            const ownerIn = meta?.participants.find(p => p.id === ownerJid)
            if (ownerIn && !ownerIn.admin) {
                await conn.groupParticipantsUpdate(chat, [ownerJid], 'promote')
                results.push(`✅ Owner promoted back`)
            } else { results.push(`ℹ️ Owner already admin or not in group`) }
        } catch (e) { results.push(`⚠️ ${e.message}`) }
        return reply(`╭══〘 *🔓 HIJACK REVERSED* 〙═⊷\n${results.map(r => `┃❍ ${r}`).join('\n')}\n╰══════════════════⊷`)
    }
}

handle.command = [
    // Lock/unlock
    'unmute', 'open', 'opengroup', 'unlockgroup', 'unlock',
    'mute', 'close', 'closegroup', 'lockgroup', 'lock',
    // Kick/add
    'kick', 'remove', 'removemember', 'rm', 'add',
    // Promote/demote
    'promote', 'demote',
    // Links
    'grouplink', 'link', 'invitelink', 'getlink',
    'revoke', 'resetlink', 'revokelink',
    // Group info/name/desc
    'groupname', 'setgroupname', 'gname', 'setgname',
    'groupdesc', 'gcdesc', 'setdesc', 'setgroupdesc', 'gdesc',
    // Group pic
    'gcpp', 'setgpic', 'setgroupicon', 'setgrouppp', 'grouppp',
    'getgcpp', 'groupico', 'getgrouppp',
    // Tag
    'tagall', 'everyone', 'all', 'mentionall',
    'tagadmins', 'alladmins', 'mentionadmins',
    'hidetag', 'htag', 'silentping',
    // Delete
    'delete', 'del', 'delmsg',
    // Anti-systems
    'antilink', 'nolink', 'setantilink',
    'antispam', 'antispamon', 'antispamoff',
    'antibadwords', 'antibad', 'setantibad',
    'antipromote', 'antipromotion',
    'antidemote', 'antidemoted',
    'antidelete', 'antidel',
    'antiedit', 'antiediton', 'antieditoff',
    'anticall', 'blockcall', 'rejectcall', 'nocall',
    'antiviewonce', 'antiview', 'viewonce', 'unviewonce',
    // Welcome/goodbye
    'welcome', 'setwelcome',
    'setwelcomemsg', 'welcomemessage', 'welcomemsg',
    'setgoodbye', 'goodbyemessage', 'goodbyemsg',
    // Bad words
    'badwords', 'badword',
    // Poll
    'poll', 'vote',
    // Info
    'groupinfo', 'ginfo', 'met', 'gcinfo', 'groupstats',
    'admins', 'listadmins', 'gadmins',
    'members', 'listmembers', 'gmembers', 'memberlist',
    // Restrict
    'onlyadmins', 'restrict', 'allusers', 'unrestrict',
    // Disappearing
    'disapp', 'disappear', 'disappearing',
    // Create/kill
    'newgroup', 'creategroup', 'newgc',
    'killgc', 'destroygroup', 'terminategroup',
    // Join requests
    'accept', 'acceptrequest', 'reject', 'rejectrequest',
    'listrequests', 'joinrequests', 'pendingrequests',
    'acceptall', 'rejectall',
    // Group events
    'setgroupevents', 'groupevents', 'gcevents',
    // Kick all / leave
    'kickall', 'cleargroup', 'removemembers',
    'leave', 'leavegroup', 'left', 'leftgroup',
    // Hijack
    'hijack', 'unhijack',
]
handle.tags = ['group']

module.exports = handle
