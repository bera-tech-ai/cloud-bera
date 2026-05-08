const fs = require('fs')
const path = require('path')
const archiver = require('archiver')
const os = require('os')

const handle = async (m, { conn, text, reply, prefix, command, sender, chat, isOwner, args }) => {

    if (command === 'broadcast') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (!text) return reply(`❌ Usage: ${prefix}broadcast <message>`)
        const users = Object.keys(global.db.data.users || {})
        if (!users.length) return reply(`❌ No users in database yet.`)
        let sent = 0, failed = 0
        await reply(`📢 Broadcasting to ${users.length} users...`)
        for (const jid of users) {
            if (jid.includes('@newsletter')) continue
            try {
                await conn.sendMessage(jid, { text: `📢 *Bera Broadcast*\n\n${text}` })
                sent++
                await new Promise(r => setTimeout(r, 1000))
            } catch { failed++ }
        }
        return reply(`✅ Broadcast done!\n✅ Sent: ${sent}\n❌ Failed: ${failed}`)
    }

    if (command === 'backup') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        await reply(`📦 Creating backup...`)
        try {
            const tmpPath = path.join(os.tmpdir(), `nick_backup_${Date.now()}.zip`)
            await new Promise((resolve, reject) => {
                const out = fs.createWriteStream(tmpPath)
                const archive = archiver('zip', { zlib: { level: 9 } })
                out.on('close', resolve)
                archive.on('error', reject)
                archive.pipe(out)
                archive.file('./Database/db.json', { name: 'db.json' })
                if (fs.existsSync('./session/creds.json')) {
                    archive.file('./session/creds.json', { name: 'session/creds.json' })
                }
                archive.finalize()
            })
            const buffer = fs.readFileSync(tmpPath)
            fs.unlink(tmpPath, () => {})
            await conn.sendMessage(chat, {
                document: buffer,
                mimetype: 'application/zip',
                fileName: `nick_backup_${new Date().toISOString().slice(0, 10)}.zip`,
                caption: `✅ Backup ready — contains db.json and session credentials.`
            }, { quoted: m })
        } catch (e) {
            return reply(`❌ Backup failed: ${e.message}`)
        }
    }

    if (command === 'stats') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const users = global.db.data.users || {}
        const settings = global.db.data.settings || {}
        const userCount = Object.keys(users).filter(j => !j.includes('@newsletter')).length
        const premiumCount = Object.values(users).filter(u => u.premium).length
        const bannedCount = Object.values(users).filter(u => u.banned).length
        const totalCmds = global.db.data.stats?.totalCommands || 0
        const topUsers = Object.entries(users)
            .filter(([jid]) => !jid.includes('@newsletter'))
            .map(([jid, u]) => ({ jid, cmds: u.commandCount || 0 }))
            .sort((a, b) => b.cmds - a.cmds)
            .slice(0, 3)
            .map((u, i) => `┃❍ ${i + 1}. +${u.jid.split('@')[0]} (${u.cmds} cmds)`)
            .join('\n')
        return reply(
            `╭══〘 *📊 BOT STATS* 〙═⊷\n` +
            `┃❍ *Total Users:* ${userCount}\n` +
            `┃❍ *Premium:* ${premiumCount}\n` +
            `┃❍ *Banned:* ${bannedCount}\n` +
            `┃❍ *Commands Run:* ${totalCmds}\n` +
            `┃\n` +
            `┃ *🏆 Top Users:*\n` +
            (topUsers || '┃❍ No data yet') + `\n` +
            `╰══════════════════⊷`
        )
    }

    if (command === 'ban') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const target = m.quoted?.sender || m.msg?.contextInfo?.mentionedJid?.[0]
        if (!target) return reply(`❌ Reply to a message or mention someone.`)
        if (!global.db.data.users[target]) global.db.data.users[target] = {}
        global.db.data.users[target].banned = true
        await global.db.write()
        return reply(`✅ Banned +${target.split('@')[0]}. They can no longer use Bera AI.`)
    }

    if (command === 'unban') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const target = m.quoted?.sender || m.msg?.contextInfo?.mentionedJid?.[0]
        if (!target) return reply(`❌ Reply to a message or mention someone.`)
        if (global.db.data.users[target]) global.db.data.users[target].banned = false
        await global.db.write()
        return reply(`✅ Unbanned +${target.split('@')[0]}.`)
    }

    if (command === 'premium') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const target = m.quoted?.sender || m.msg?.contextInfo?.mentionedJid?.[0]
        if (!target) return reply(`❌ Reply to a message or mention someone.`)
        if (!global.db.data.users[target]) global.db.data.users[target] = {}
        global.db.data.users[target].premium = true
        global.db.data.users[target].limit = 9999
        await global.db.write()
        return reply(`⭐ +${target.split('@')[0]} is now premium — unlimited access.`)
    }

    if (command === 'depremium') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const target = m.quoted?.sender || m.msg?.contextInfo?.mentionedJid?.[0]
        if (!target) return reply(`❌ Reply to a message or mention someone.`)
        if (global.db.data.users[target]) {
            global.db.data.users[target].premium = false
            global.db.data.users[target].limit = 10
        }
        await global.db.write()
        return reply(`✅ Removed premium from +${target.split('@')[0]}.`)
    }

    if (command === 'autoreply') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const settings = global.db.data.settings
        if (!settings.autoReplies) settings.autoReplies = {}

        if (!text || text === 'list') {
            const all = settings.autoReplies
            const entries = Object.entries(all)
            if (!entries.length) return reply(`📝 No auto-replies set.\n\nUsage:\n${prefix}autoreply <keyword> = <response>\n${prefix}autoreply delete <keyword>`)
            const list = entries.map(([k, v]) => `• *${k}* → ${v}`).join('\n')
            return reply(`📝 *Auto-Replies (${entries.length}):*\n\n${list}`)
        }

        if (text.toLowerCase().startsWith('delete ')) {
            const kw = text.slice(7).trim().toLowerCase()
            if (!settings.autoReplies[kw]) return reply(`❌ No auto-reply for "${kw}"`)
            delete settings.autoReplies[kw]
            await global.db.write()
            return reply(`✅ Deleted auto-reply for "*${kw}*"`)
        }

        if (text.includes('=')) {
            const [keyword, ...responseParts] = text.split('=')
            const kw = keyword.trim().toLowerCase()
            const response = responseParts.join('=').trim()
            if (!kw || !response) return reply(`❌ Usage: ${prefix}autoreply <keyword> = <response>`)
            settings.autoReplies[kw] = response
            await global.db.write()
            return reply(`✅ Auto-reply set:\n*"${kw}"* → ${response}`)
        }

        return reply(`Usage:\n${prefix}autoreply <keyword> = <response>\n${prefix}autoreply delete <keyword>\n${prefix}autoreply list`)
    }

    if (command === 'schedule') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (!text) return reply(
            `⏰ *Schedule a message*\n\nUsage: ${prefix}schedule <time> <message>\n\nExamples:\n${prefix}schedule 30s Good morning!\n${prefix}schedule 5m Meeting in 5 minutes!\n${prefix}schedule 2h Time for a break!\n\nView scheduled: ${prefix}schedule list\nCancel: ${prefix}schedule cancel <id>`
        )

        if (text.toLowerCase() === 'list') {
            const schedules = global.db.data.settings.schedules || []
            if (!schedules.length) return reply(`⏰ No scheduled messages.`)
            const list = schedules.map(s => {
                const remaining = Math.max(0, s.runAt - Date.now())
                const mins = Math.round(remaining / 60000)
                return `• [${s.id}] "${s.message.slice(0, 30)}..." in ~${mins}m`
            }).join('\n')
            return reply(`⏰ *Scheduled Messages:*\n\n${list}`)
        }

        if (text.toLowerCase().startsWith('cancel ')) {
            const id = text.slice(7).trim()
            const schedules = global.db.data.settings.schedules || []
            const idx = schedules.findIndex(s => s.id === id)
            if (idx === -1) return reply(`❌ No scheduled message with id "${id}"`)
            schedules.splice(idx, 1)
            global.db.data.settings.schedules = schedules
            await global.db.write()
            return reply(`✅ Cancelled scheduled message ${id}.`)
        }

        const match = text.match(/^(\d+)(s|m|h|d)\s+(.+)/i)
        if (!match) return reply(`❌ Format: ${prefix}schedule <time> <message>\nExamples: 30s, 5m, 2h, 1d`)
        const [, amount, unit, message] = match
        const ms = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit.toLowerCase()] * parseInt(amount)
        if (ms > 86400000 * 7) return reply(`❌ Max schedule time is 7 days.`)

        const id = Math.random().toString(36).slice(2, 7).toUpperCase()
        const runAt = Date.now() + ms
        if (!global.db.data.settings.schedules) global.db.data.settings.schedules = []
        global.db.data.settings.schedules.push({ id, chat, message, runAt, sender })
        await global.db.write()

        setTimeout(async () => {
            try {
                await conn.sendMessage(chat, { text: `⏰ *Scheduled Message:*\n\n${message}` })
                global.db.data.settings.schedules = (global.db.data.settings.schedules || []).filter(s => s.id !== id)
                await global.db.write()
            } catch {}
        }, ms)

        const timeLabel = `${amount}${unit}`
        return reply(`✅ Scheduled! [${id}]\nMessage will send in *${timeLabel}*.\nCancel with: ${prefix}schedule cancel ${id}`)
    }

    if (command === 'noprefix') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const toggle = args[0]?.toLowerCase()
        if (!toggle || !['on', 'off'].includes(toggle)) {
            const current = global.db.data.settings?.noPrefix ? 'ON' : 'OFF'
            return reply(
                `❌ Usage: ${prefix}noprefix on/off\n\n` +
                `Current status: *${current}*\n\n` +
                `When ON, commands work without any prefix.\n` +
                `Example: just type *play Burna Boy* instead of *${prefix}play Burna Boy*`
            )
        }
        global.db.data.settings.noPrefix = toggle === 'on'
        await global.db.write()
        if (toggle === 'on') {
            return reply(
                `✅ *No-prefix mode ON*\n\n` +
                `Commands now work without *${prefix}*\n` +
                `• Type *play Burna Boy* instead of *${prefix}play Burna Boy*\n` +
                `• Type *imagine a lion* instead of *${prefix}imagine a lion*\n` +
                `• Type *menu* instead of *${prefix}menu*\n\n` +
                `_Prefix still works too — both modes active._`
            )
        }
        return reply(`✅ *No-prefix mode OFF*\nPrefix *${prefix}* is required again.`)
    }

    if (command === 'autostatusview' || command === 'statusview') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const toggle = args[0]?.toLowerCase()
        if (!toggle || !['on', 'off'].includes(toggle)) return reply(`❌ Usage: ${prefix}autostatusview on/off`)
        global.db.data.settings.autoStatusView = toggle === 'on'
        await global.db.write()
        return reply(`👁️ Auto status view *${toggle.toUpperCase()}*.\nNick will ${toggle === 'on' ? 'automatically view' : 'no longer view'} all WhatsApp statuses.`)
    }

    if (command === 'autotyping') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const toggle = args[0]?.toLowerCase()
        if (!toggle || !['on', 'off'].includes(toggle)) return reply(`❌ Usage: ${prefix}autotyping on/off`)
        global.db.data.settings.autoTyping = toggle === 'on'
        await global.db.write()
        return reply(`⌨️ Auto typing indicator *${toggle.toUpperCase()}*.\nNick will ${toggle === 'on' ? 'show typing...' : 'no longer show typing...'} while processing commands.`)
    }

    if (command === 'autobio') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const toggle = args[0]?.toLowerCase()
        if (!toggle || !['on', 'off'].includes(toggle)) return reply(`❌ Usage: ${prefix}autobio on/off`)
        global.db.data.settings.autobio = toggle === 'on'
        await global.db.write()
        const bios = global.db.data.settings.bios || []
        if (toggle === 'on' && !bios.length) return reply(`⚠️ Auto-bio turned ON but no bios set.\n\nAdd bios with:\n${prefix}addbio <text>\n\nVariables: {time} {date} {users} {commands} {botname}`)
        return reply(`📝 Auto bio *${toggle.toUpperCase()}*. Rotates every hour.\n\nBios set: ${bios.length}`)
    }

    if (command === 'addbio') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (!text) return reply(
            `❌ Usage: ${prefix}addbio <bio text>\n\n` +
            `Variables you can use:\n` +
            `• {time} — current time\n` +
            `• {date} — current date\n` +
            `• {users} — total bot users\n` +
            `• {commands} — total commands run\n` +
            `• {botname} — bot name\n\n` +
            `Example: ${prefix}addbio 🤖 Bera AI | {users} users | {time}`
        )
        if (!global.db.data.settings.bios) global.db.data.settings.bios = []
        if (global.db.data.settings.bios.length >= 10) return reply(`❌ Max 10 bios. Remove some with ${prefix}clearbio <number>`)
        global.db.data.settings.bios.push(text.trim())
        await global.db.write()
        return reply(`✅ Bio added (#${global.db.data.settings.bios.length}):\n_"${text.trim()}"_`)
    }

    if (command === 'setbio') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (!text) return reply(`❌ Usage: ${prefix}setbio <bio text>`)
        try {
            await conn.updateProfileStatus(text.trim())
            return reply(`✅ Bio updated to:\n_"${text.trim()}"_`)
        } catch (e) {
            return reply(`❌ Failed: ${e.message}`)
        }
    }

    if (command === 'listbios') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const bios = global.db.data.settings?.bios || []
        const autoOn = global.db.data.settings?.autobio
        if (!bios.length) return reply(`📭 No bios set. Add with ${prefix}addbio <text>`)
        const list = bios.map((b, i) => `${i + 1}. _"${b}"_`).join('\n')
        return reply(`📝 *Auto-Bio List* (${autoOn ? '🟢 ON' : '🔴 OFF'}):\n\n${list}\n\nRotates every hour.`)
    }

    if (command === 'clearbio') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (args[0]) {
            const idx = parseInt(args[0]) - 1
            const bios = global.db.data.settings.bios || []
            if (isNaN(idx) || idx < 0 || idx >= bios.length) return reply(`❌ Invalid number. Use ${prefix}listbios to see the list.`)
            const removed = bios.splice(idx, 1)[0]
            global.db.data.settings.bios = bios
            await global.db.write()
            return reply(`✅ Removed bio #${idx + 1}:\n_"${removed}"_`)
        }
        global.db.data.settings.bios = []
        global.db.data.settings.currentBioIndex = 0
        await global.db.write()
        return reply(`✅ All bios cleared.`)
    }

    if (command === 'cleandb') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const users = global.db.data.users
        const before = Object.keys(users).length
        const kept = {}
        let removed = 0
        for (const [jid, u] of Object.entries(users)) {
            const hasActivity = u.commandCount > 0 || u.premium || u.banned ||
                jid === `${require('../Config').owner.replace(/[^0-9]/g, '')}@s.whatsapp.net`
            if (hasActivity) {
                kept[jid] = u
            } else {
                removed++
            }
        }
        global.db.data.users = kept
        await global.db.write()
        return reply(`🧹 *DB Cleaned*\n\n┃❍ Before: ${before} entries\n┃❍ Removed: ${removed} inactive users\n┃❍ Kept: ${Object.keys(kept).length} active users`)
    }

    if (command === 'listusers') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const users = Object.entries(global.db.data.users || {})
            .filter(([jid]) => !jid.includes('@newsletter'))
        if (!users.length) return reply(`No users yet.`)
        const list = users.slice(0, 30).map(([jid, u]) =>
            `${u.premium ? '⭐' : u.banned ? '🔴' : '👤'} +${jid.split('@')[0]}`
        ).join('\n')
        return reply(`*Users (${users.length} total, showing 30):*\n\n${list}`)
    }

    if (command === 'resetlimit') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const target = m.quoted?.sender || m.msg?.contextInfo?.mentionedJid?.[0]
        if (target) {
            if (!global.db.data.users[target]) return reply(`❌ User not found.`)
            global.db.data.users[target].limit = 10
            global.db.data.users[target].limitReset = ''
            await global.db.write()
            return reply(`✅ Reset limit for +${target.split('@')[0]}`)
        }
        for (const jid of Object.keys(global.db.data.users || {})) {
            global.db.data.users[jid].limit = 10
            global.db.data.users[jid].limitReset = ''
        }
        await global.db.write()
        return reply(`✅ Reset daily limits for all users.`)
    }
    if (command === 'mode') {
        if (!isOwner) return reply('⛔ Owner only.')
        const modeInput = text?.trim().toLowerCase()
        if (!modeInput || !['public','private'].includes(modeInput)) {
            const current = global.db?.data?.settings?.mode || 'public'
            return reply(
                `╭══〘 *⚙️ BOT MODE* 〙═⊷\n` +
                `┃❍ Current: *${current.toUpperCase()}*\n` +
                `┃❍ Usage: .mode public\n` +
                `┃❍         .mode private\n` +
                `┃\n` +
                `┃ 🌐 Public — Everyone can use the bot\n` +
                `┃ 🔒 Private — Only owner can use the bot\n` +
                `╰══════════════════⊷`
            )
        }
        if (!global.db.data.settings) global.db.data.settings = {}
        global.db.data.settings.mode = modeInput
        await global.db.write()
        const icon = modeInput === 'public' ? '🌐' : '🔒'
        return reply(
            `╭══〘 *⚙️ BOT MODE CHANGED* 〙═⊷\n` +
            `┃❍ Mode: *${icon} ${modeInput.toUpperCase()}*\n` +
            `┃❍ ${modeInput === 'public' ? 'Everyone can now use the bot.' : 'Only you (owner) can use the bot now.'}` +
            `\n╰══════════════════⊷`
        )
    }
    // ── SET GITHUB USERNAME ─────────────────────────────────────────────
    if (command === 'setgitusername') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (!text) return reply(`❌ Usage: ${prefix}setgitusername <your-github-username>`)
        if (!global.db.data.settings) global.db.data.settings = {}
        global.db.data.settings.githubUsername = text.trim()
        await global.db.write()
        return reply(`✅ GitHub username saved: *${text.trim()}*
Bera AI GitHub commands will now use this account.`)
    }

    // ── SET GITHUB TOKEN ────────────────────────────────────────────────
    if (command === 'setgittoken') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (!text) return reply(`❌ Usage: ${prefix}setgittoken <your-github-token>
Generate at: https://github.com/settings/tokens`)
        if (!global.db.data.settings) global.db.data.settings = {}
        global.db.data.settings.githubToken = text.trim()
        await global.db.write()
        return reply(`✅ GitHub token saved!\nToken: ghp_***${text.trim().slice(-4)}\n⚠️ Keep this private — it grants access to your GitHub.`)
    }

    // ── SET BERAHOST API KEY ─────────────────────────────────────────────
    if (command === 'setbhkey') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (!text) return reply(`❌ Usage: ${prefix}setbhkey <your-berahost-api-key>
Get yours at: https://berahost.com`)
        if (!global.db.data.settings) global.db.data.settings = {}
        global.db.data.settings.berahostApiKey = text.trim()
        await global.db.write()
        return reply(`✅ BeraHost API key saved!\nKey: bh_***${text.trim().slice(-4)}\nAll BeraHost commands will now use your key.`)
    }

    // ── VIEW MY CONFIG ───────────────────────────────────────────────────
    if (['myconfig', 'mykeys', 'configs'].includes(command)) {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const ghUser = global.db?.data?.settings?.githubUsername || 'Not set'
        const ghTok  = global.db?.data?.settings?.githubToken
            ? `ghp_***${global.db.data.settings.githubToken.slice(-4)}`
            : 'Not set'
        const bhKey  = global.db?.data?.settings?.berahostApiKey
            ? `bh_***${global.db.data.settings.berahostApiKey.slice(-4)}`
            : 'Not set (using default)'
        return reply(
            `╭══〘 *⚙️ MY CONFIG* 〙═⊷\n` +
            `┃❍ *GitHub User:* ${ghUser}\n` +
            `┃❍ *GitHub Token:* ${ghTok}\n` +
            `┃❍ *BeraHost Key:* ${bhKey}\n` +
            `┃\n` +
            `┃ Use .setgitusername, .setgittoken, .setbhkey\n` +
            `┃ to update these values.\n` +
            `╰══════════════════⊷`
        )
    }


    // ── SHELL COMMAND EXECUTION (.$ or .bash) ───────────────────────────
    if (['$', 'bash', 'shell', 'exec', 'run', 'terminal', 'cmd'].includes(command)) {
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (!text) return reply(`❌ Usage: ${prefix}$ <command>\nExample: ${prefix}$ ls -la`)
        const { exec } = require('child_process')
        await react('💻')
        const timeout = 30000
        const output = await new Promise((resolve) => {
            exec(text.trim(), { timeout, maxBuffer: 1024 * 1024 * 5, shell: '/bin/bash' }, (err, stdout, stderr) => {
                const out = (stdout || '').trim()
                const errOut = (stderr || '').trim()
                if (err && !out && !errOut) return resolve(`Error: ${err.message}`)
                resolve(out || errOut || '(no output)')
            })
        })
        await react('✅')
        const truncated = output.length > 3000 ? output.slice(0, 3000) + '\n...(truncated)' : output
        return reply(`\`\`\`\n${truncated}\n\`\`\``)
    }

    // ── JS EVAL (.> or .eval) ────────────────────────────────────────────
    if (['>', 'eval', 'js', 'jseval', 'evaljs'].includes(command)) {
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (!text) return reply(`❌ Usage: ${prefix}> <javascript expression>\nExample: ${prefix}> 2+2\nExample: ${prefix}> Object.keys(global.db.data).join(', ')`)
        await react('💻')
        try {
            // Safe eval with access to useful globals
            const result = await (async () => {
                const db = global.db
                const config = require('../Config')
                return eval(text.trim()) // eslint-disable-line no-eval
            })()
            const output = result === undefined ? 'undefined'
                : typeof result === 'object' ? JSON.stringify(result, null, 2)
                : String(result)
            await react('✅')
            const truncated = output.length > 3000 ? output.slice(0, 3000) + '\n...(truncated)' : output
            return reply(`\`\`\`\n${truncated}\n\`\`\``)
        } catch (e) {
            await react('❌')
            return reply(`❌ *Error:* ${e.message}`)
        }
    }

    // ── GET PROFILE PICTURE (.getpp) ─────────────────────────────────────
    if (['getpp', 'profilepic', 'pfp', 'getpfp'].includes(command)) {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const target = (() => {
            if (m.quoted?.sender) return m.quoted.sender
            const mention = m.msg?.contextInfo?.mentionedJid?.[0]
            if (mention) return mention
            if (text) {
                const num = text.replace(/[^0-9]/g, '')
                if (num.length > 5) return num + '@s.whatsapp.net'
            }
            return sender
        })()
        await react('⏳')
        try {
            const pp = await conn.profilePictureUrl(target, 'image').catch(() => null)
            if (!pp) { await react('❌'); return reply(`❌ No profile picture found for +${target.split('@')[0]}.`) }
            await conn.sendMessage(chat, {
                image: { url: pp },
                caption: `🖼️ Profile pic of +${target.split('@')[0]}`
            }, { quoted: m })
            await react('✅')
        } catch (e) { await react('❌'); return reply(`❌ ${e.message}`) }
    }

    // ── BLOCK ────────────────────────────────────────────────────────────
    if (command === 'block') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const target = (() => {
            if (m.quoted?.sender) return m.quoted.sender
            const mention = m.msg?.contextInfo?.mentionedJid?.[0]
            if (mention) return mention
            if (text) return text.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
            return null
        })()
        if (!target) return reply(`❌ Reply to, mention, or provide number.\nUsage: ${prefix}block <number>`)
        await react('⏳')
        try {
            await conn.updateBlockStatus(target, 'block')
            await react('✅')
            return reply(`✅ Blocked +${target.split('@')[0]}.`)
        } catch (e) { await react('❌'); return reply(`❌ ${e.message}`) }
    }

    // ── UNBLOCK ──────────────────────────────────────────────────────────
    if (command === 'unblock') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (!text) return reply(`❌ Usage: ${prefix}unblock <number>`)
        const target = text.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
        await react('⏳')
        try {
            await conn.updateBlockStatus(target, 'unblock')
            await react('✅')
            return reply(`✅ Unblocked +${text.replace(/[^0-9]/g,'')}`)
        } catch (e) { await react('❌'); return reply(`❌ ${e.message}`) }
    }

    // ── BLOCK LIST ───────────────────────────────────────────────────────
    if (['blocklist', 'listblocked', 'blocked'].includes(command)) {
        if (!isOwner) return reply(`⛔ Owner only.`)
        await react('⏳')
        try {
            const list = await conn.fetchBlocklist()
            if (!list?.length) { await react('✅'); return reply(`✅ No blocked contacts.`) }
            const formatted = list.map((jid, i) => `${i + 1}. +${jid.split('@')[0]}`).join('\n')
            await react('✅')
            return reply(`╭══〘 *🚫 BLOCKED (${list.length})* 〙═⊷\n${formatted}\n╰══════════════════⊷`)
        } catch (e) { await react('❌'); return reply(`❌ ${e.message}`) }
    }

    // ── SUDO: ADD ────────────────────────────────────────────────────────
    if (['setsudo', 'addsudo', 'sudo'].includes(command)) {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const target = (() => {
            if (m.quoted?.sender) return m.quoted.sender
            const mention = m.msg?.contextInfo?.mentionedJid?.[0]
            if (mention) return mention
            if (text) return text.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
            return null
        })()
        if (!target) return reply(`❌ Reply to or mention someone.\nUsage: ${prefix}setsudo @user`)
        if (!global.db.data.settings) global.db.data.settings = {}
        if (!Array.isArray(global.db.data.settings.sudoUsers)) global.db.data.settings.sudoUsers = []
        const num = target.split('@')[0]
        if (!global.db.data.settings.sudoUsers.includes(num)) {
            global.db.data.settings.sudoUsers.push(num)
            await global.db.write()
        }
        return reply(`✅ @${num} added as sudo user. They can now use all commands.`)
    }

    // ── SUDO: LIST ───────────────────────────────────────────────────────
    if (['getsudo', 'listsudo', 'sudolist', 'sudousers'].includes(command)) {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const sudos = global.db?.data?.settings?.sudoUsers || []
        if (!sudos.length) return reply(`❌ No sudo users set.\nUse ${prefix}setsudo to add one.`)
        return reply(`╭══〘 *👑 SUDO USERS (${sudos.length})* 〙═⊷\n${sudos.map((n, i) => `${i+1}. +${n}`).join('\n')}\n╰══════════════════⊷`)
    }

    // ── SUDO: REMOVE ─────────────────────────────────────────────────────
    if (['delsudo', 'removesudo', 'unsudo'].includes(command)) {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const target = (() => {
            if (m.quoted?.sender) return m.quoted.sender
            const mention = m.msg?.contextInfo?.mentionedJid?.[0]
            if (mention) return mention
            if (text) return text.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
            return null
        })()
        if (!target) return reply(`❌ Reply to or mention someone.`)
        const num = target.split('@')[0]
        const sudos = global.db?.data?.settings?.sudoUsers || []
        const newSudos = sudos.filter(s => s !== num)
        if (!global.db.data.settings) global.db.data.settings = {}
        global.db.data.settings.sudoUsers = newSudos
        await global.db.write()
        return reply(`✅ Removed @${num} from sudo users.`)
    }



    if (['update','reload','hotreload','selfupdate','up'].includes(command)) {
        if (!isOwner) return reply('⛔ Owner only.')
        await conn.sendMessage(chat, { react: { text: '⏳', key: m.key } })
        await reply('⏳ Pulling latest code from GitHub...')
        try {
            const { exec } = require('child_process')
            const sh = (cmd, t = 30000) => new Promise(res =>
                exec(cmd, { timeout: t, cwd: require('path').join(__dirname, '..') },
                    (e, so, se) => res((so || '') + (se ? '\n' + se : ''))))

            const beforeHash = (await sh('git rev-parse --short HEAD')).trim()
            // Force fetch + hard reset so .update is GUARANTEED to match remote main
            await sh('git fetch origin main')
            const afterRemote = (await sh('git rev-parse --short origin/main')).trim()
            const hardReset = await sh('git reset --hard origin/main')
            const afterHash = (await sh('git rev-parse --short HEAD')).trim()
            const lastCommit = (await sh('git log -1 --format=%s')).trim()

            const changedFiles = (await sh(`git diff --name-only ${beforeHash} ${afterHash}`)).trim().split('\n').filter(Boolean)
            const already = beforeHash === afterHash

            let npmOut = ''
            if (changedFiles.some(f => f === 'package.json' || f === 'package-lock.json')) {
                npmOut = await sh('npm install --production --loglevel=error 2>&1', 90000)
            }

            // Hot-reload Plugins + Commands by busting require cache
            const _path = require('path'), _fs = require('fs')
            const _root = _path.join(__dirname, '..')
            let _loaded = 0, _failed = 0
            for (const dir of ['Plugins', 'Commands']) {
                const dPath = _path.join(_root, dir)
                if (!_fs.existsSync(dPath)) continue
                for (const f of _fs.readdirSync(dPath).filter(x => x.endsWith('.js'))) {
                    const fp = _path.join(dPath, f)
                    try {
                        delete require.cache[require.resolve(fp)]
                        require(fp)
                        _loaded++
                    } catch (e) { _failed++; console.error(`[RELOAD] ${f}: ${e.message}`) }
                }
            }
            // Bust action library cache too so prompt/AI changes take effect
            for (const f of _fs.readdirSync(_path.join(_root, 'Library', 'actions')).filter(x => x.endsWith('.js'))) {
                try { delete require.cache[require.resolve(_path.join(_root, 'Library', 'actions', f))] } catch {}
            }

            await conn.sendMessage(chat, { react: { text: '✅', key: m.key } })
            return reply(
                '╭══〘 *🔄 BOT UPDATED* 〙═⊷\n' +
                '┃ Status: ' + (already ? '✅ Already up to date' : `🆕 ${changedFiles.length} file(s) updated`) + '\n' +
                `┃ Before: \`${beforeHash}\`\n` +
                `┃ After:  \`${afterHash}\`\n` +
                `┃ Remote: \`${afterRemote}\`\n` +
                `┃ Latest: _${lastCommit.slice(0, 60)}_\n` +
                `┃ Reloaded: *${_loaded}* files (${_failed} failed)\n` +
                (changedFiles.length && !already ? '┃ Changed: ' + changedFiles.slice(0, 5).join(', ') + (changedFiles.length > 5 ? '...' : '') + '\n' : '') +
                (npmOut ? '┃ npm: deps reinstalled\n' : '') +
                '┃ 🔌 Connection: *maintained*\n' +
                '╰══════════════════⊷\n\n' +
                (already ? 'ℹ️ Already on latest commit. If you expected new code, the push may not have reached GitHub yet.' :
                    '✅ Use `.restart` for a clean restart with the new code, or test changes immediately — most fixes are now live in memory.')
            )
        } catch (e) {
            await conn.sendMessage(chat, { react: { text: '❌', key: m.key } })
            return reply('❌ Update failed: ' + e.message)
        }
    }

    if (command === 'deploy' || command === 'skydeploy' || command === 'host') {
        if (!text) return reply('Usage: ' + prefix + 'deploy <github-repo-url> [project-name]\nExample: ' + prefix + 'deploy https://github.com/bera-tech-ai/notes-app')
        const parts = text.trim().split(/\s+/)
        const repoUrl = parts[0]
        const name = parts[1] || repoUrl.split('/').pop().replace(/\.git$/, '')
        if (!/^https?:\/\/github\.com\//i.test(repoUrl)) return reply('❌ That doesn\'t look like a github URL. Use https://github.com/owner/repo')
        try {
            const sky = require('../Library/actions/skyhost')
            await reply('🚀 Deploying *' + name + '* to Sky Hosting... (30-180s)')
            const r = await sky.deployRepo({ repoUrl, name })
            if (r.success) {
                return reply('✅ *Deployed!*\n\n🚀 Live URL: ' + r.liveUrl + '\n🛠️ Runtime: ' + (r.runtime || 'auto') + '\n📦 Project: ' + r.projectId)
            } else {
                return reply('❌ Deploy failed: ' + r.error + (r.logs ? '\n\n*Last logs:*\n' + r.logs : ''))
            }
        } catch (e) {
            return reply('❌ Deploy error: ' + e.message)
        }
    }

}

handle.command = ['update','reload','hotreload','selfupdate','up','broadcast', 'backup', 'stats', 'ban', 'unban', 'premium', 'depremium',
    'autoreply', 'schedule', 'listusers', 'resetlimit', 'cleandb', 'mode',
    'autostatusview', 'statusview', 'autotyping', 'autobio',
    'addbio', 'setbio', 'listbios', 'clearbio', 'noprefix',
    'setgitusername', 'setgittoken', 'setbhkey', 'myconfig', 'mykeys', 'configs',
    'deploy', 'skydeploy', 'host',
    // Shell/eval commands
    'bash', 'shell', 'exec', 'run', 'terminal', 'cmd',
    'eval', 'js', 'jseval', 'evaljs',
    // User mgmt
    'getpp', 'profilepic', 'pfp', 'getpfp',
    'block', 'unblock', 'blocklist', 'listblocked', 'blocked',
    'setsudo', 'addsudo', 'sudo',
    'getsudo', 'listsudo', 'sudolist', 'sudousers',
    'delsudo', 'removesudo', 'unsudo',
    // Dollar sign and eval shorthand added programmatically below
]
handle.command.push(String.fromCharCode(36), String.fromCharCode(62))
handle.tags = ['admin']

module.exports = handle
