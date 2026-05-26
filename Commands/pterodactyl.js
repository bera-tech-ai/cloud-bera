const {
    PLANS, EMAIL_DOMAIN, genPassword, getAllPages, findFreeAllocation, findServerByName, findUserByUsername,
    createPanelServer,
    listServers, getServerStatus, powerAction, sendCommand,
    listFiles, readFile, writeFile,
    listUsers, getUser, createUser, updateUser, deleteUser,
    deleteUserWithServers, deleteAllUsersExceptOwner,
    listAllServers, deleteServer, suspendServer, unsuspendServer, listNodes,
    formatUptime, statusEmoji
} = require('../Library/actions/pterodactyl')
const { generateWAMessage } = require('@whiskeysockets/baileys')

const Config = require('../Config')

let cachedServers = null
let cacheTime = 0
const CACHE_TTL = 60000

async function resolveServer(text) {
    const now = Date.now()
    if (!cachedServers || now - cacheTime > CACHE_TTL) {
        const res = await listServers()
        if (!res.success) return null
        cachedServers = res.servers
        cacheTime = now
    }
    const idx = parseInt(text) - 1
    if (!isNaN(idx) && idx >= 0 && idx < cachedServers.length) return cachedServers[idx]
    return cachedServers.find(s => s.name.toLowerCase().includes(text.toLowerCase())) || null
}

const PLAN_LIST = () =>
    Object.entries(PLANS).map(([k, v]) => `\`${k}\` (${v.label})`).join(', ')

function resolveWa(m, waArg) {
    // 1. Quoted/slid message sender
    if (m.quoted?.sender) {
        const s = m.quoted.sender.replace(/:[0-9]+/, '')
        if (s) return s
    }
    // 2. Typed number argument
    if (waArg) {
        const num = waArg.replace(/[^0-9]/g, '')
        if (num) return num + '@s.whatsapp.net'
    }
    // 3. Private DM — only if the DM partner is NOT the owner themselves
    if (!m.isGroup && m.chat?.endsWith('@s.whatsapp.net') && m.chat !== m.sender) {
        return m.chat
    }
    return null
}

async function verifyAndSendDM(conn, rawJid, msg) {
    let targetJid = rawJid
    try {
        const results = await conn.onWhatsApp(rawJid)
        console.log('[CREDS] onWhatsApp for', rawJid, '->', JSON.stringify(results?.map(r => ({ jid: r.jid, exists: r.exists }))))
        if (results && results.length && results[0].jid) {
            targetJid = results[0].jid
        }
    } catch (e) {
        console.error('[CREDS] onWhatsApp error, using raw JID:', e.message)
    }
    try {
        // Use relayMessage with useUserDevicesCache:false to force fresh key lookup
        // This avoids the "sent but not received" bug caused by stale device cache
        const fullMsg = await generateWAMessage(targetJid, { text: msg }, { userJid: conn.user.id })
        await conn.relayMessage(targetJid, fullMsg.message, {
            messageId: fullMsg.key.id,
            useUserDevicesCache: false
        })
        console.log('[CREDS] ✅ relayed to', targetJid, '| msgId:', fullMsg.key.id)
        return { sent: true, jid: targetJid }
    } catch (err) {
        console.error('[CREDS] ❌ relay failed:', err.message)
        console.error(err.stack?.split('\n').slice(0, 4).join('\n'))
        return { sent: false, reason: err.message }
    }
}

function storePendingCreds(waJid, credMsg) {
    if (!global.db?.data) return
    if (!global.db.data.pendingCreds) global.db.data.pendingCreds = {}
    global.db.data.pendingCreds[waJid] = { msg: credMsg, at: Date.now() }
    global.db.write().catch(() => {})
}

async function dispatchCreds(m, conn, chat, waJid, credMsg, displayNum) {
    const ownerNum = (Config.owner?.[0] || '').replace(/[^0-9]/g, '')
    const OWNER_NUM_DISPLAY = ownerNum || 'this bot'

    if (m.isGroup) {
        // Store creds — bot can't initiate new DMs reliably on linked device sessions
        storePendingCreds(waJid, credMsg)

        // Try a direct relay anyway (works if existing chat history exists)
        verifyAndSendDM(conn, waJid, credMsg).catch(() => {})

        // Group alert telling them exactly what to do
        await conn.sendMessage(chat, {
            text: `@${displayNum}\n\n` +
                `✅ *Panel account ready!*\n\n` +
                `📲 *To receive your credentials privately:*\n` +
                `Send *any message* to this bot number directly:\n` +
                `*+${OWNER_NUM_DISPLAY}*\n\n` +
                `The bot will instantly reply with your login details.\n\n` +
                `💡 _You only need to do this once — save the number to skip it next time._`,
            mentions: [waJid]
        }).catch(() => {})

        return { sent: true, jid: waJid }
    } else {
        await conn.sendMessage(chat, { text: credMsg }).catch(err => {
            console.error('[SEND CREDS DM]', err.message)
        })
        return { sent: true, jid: chat }
    }
}

async function handle(m, { conn, args, command, text, prefix, isOwner, chat, reply }) {
    if (!isOwner) return reply(`⛔ Owner only.`)

    const ptUrl    = Config.pterodactylUrl    || process.env.PTERODACTYL_URL    || ''
    const clientK  = Config.pterodactylKey    || process.env.PTERODACTYL_KEY    || ''
    const appK     = Config.pterodactylAppKey || process.env.PTERODACTYL_APP_KEY || ''

    if (!ptUrl || !clientK) return reply(`❌ Pterodactyl URL/Client key not configured.\nCheck ${prefix}setenv PTERODACTYL_URL and PTERODACTYL_KEY.`)

    const needsApp = ['ptcreate','ptaddserver','ptadmin','ptreset','ptcreds','ptdelete',
        'ptusers','ptdeluser','ptpromote','ptdemote','ptpurgeusers',
        'ptallservers','ptdelserver','ptsuspend','ptunsuspend','ptnodes','ptlist']

    if (needsApp.includes(command) && !appK) {
        return reply(`❌ Pterodactyl Application API key not set.\nSet it via ${prefix}setenv PTERODACTYL_APP_KEY <key>`)
    }

    const react = (emoji) => conn.sendMessage(chat, { react: { text: emoji, key: m.key } }).catch(() => {})

    // ── ptlist [users|servers] ──────────────────────────────────────────────
    if (command === 'ptlist' || command === 'servers') {
        const sub = (args[0] || '').toLowerCase()

        if (sub === 'users') {
            await react('👥')
            const res = await listUsers()
            if (!res.success) return reply(`❌ ${res.error}`)
            if (!res.users.length) return reply(`📭 No users on panel.`)
            const lines = res.users.map((u, i) =>
                `${i + 1}. ${u.isAdmin ? '👑' : '👤'} *${u.username}* (ID: ${u.id})\n    ┃ ${u.email}`
            ).join('\n')
            return reply(`╭══〘 *👥 PANEL USERS (${res.users.length})* 〙═⊷\n┃\n${lines}\n╰══════════════════⊷`)
        }

        if (sub === 'servers') {
            await react('🖥️')
            const res = await listAllServers()
            if (!res.success) return reply(`❌ ${res.error}`)
            if (!res.servers.length) return reply(`📭 No servers found.`)
            const lines = res.servers.map((s, i) => {
                const ram = s.limits?.memory === 0 ? 'Unli' : `${s.limits?.memory}MB`
                return `${i + 1}. *${s.name}* | RAM: ${ram} | ${s.suspended ? '🔴 Suspended' : '🟢 Active'}`
            }).join('\n')
            return reply(`╭══〘 *🖥️ ALL SERVERS (${res.servers.length})* 〙═⊷\n┃\n${lines}\n╰══════════════════⊷`)
        }

        // Client server list
        await react('📋')
        const res = await listServers()
        if (!res.success) return reply(`❌ ${res.error}`)
        if (!res.servers.length) return reply(`📭 No servers linked to this API key.`)
        cachedServers = res.servers; cacheTime = Date.now()
        const lines = res.servers.map((s, i) => `${i + 1}. *${s.name}* — ${statusEmoji(s.status)} ${s.status || 'offline'}`).join('\n')
        return reply(
            `╭══〘 *🖥️ MY SERVERS (${res.servers.length})* 〙═⊷\n┃\n${lines}\n┃\n┃ Use number or name with other pt commands\n╰══════════════════⊷`
        )
    }

    // ── ptstatus <server> ───────────────────────────────────────────────────
    if (command === 'ptstatus') {
        if (!text) return reply(`❌ Usage: ${prefix}ptstatus <server name or number>\n\nRun ${prefix}ptlist to see your servers.`)
        await react('📊')
        const server = await resolveServer(text.trim())
        if (!server) return reply(`❌ Server *${text}* not found.\n\nRun ${prefix}ptlist to see available servers.`)
        const st = await getServerStatus(server.id)
        if (!st.success) return reply(`❌ ${st.error}`)
        const lim = server.limits?.memory === 0 ? 'Unlimited' : `${server.limits?.memory} MB`
        return reply(
            `╭══〘 *📊 ${server.name}* 〙═⊷\n┃\n` +
            `┃ ${statusEmoji(st.status)} State: *${(st.status || 'offline').toUpperCase()}*\n` +
            `┃ 🖥️ CPU:    ${st.cpu}%\n` +
            `┃ 💾 RAM:    ${st.ram} MB / ${lim}\n` +
            `┃ 💿 Disk:   ${st.disk} MB\n` +
            `┃ 📡 Net↑:   ${st.network_tx} KB  ↓: ${st.network_rx} KB\n` +
            `┃ ⏱️ Uptime: ${formatUptime(st.uptime)}\n` +
            `╰══════════════════⊷`
        )
    }

    // ── ptstart/stop/restart/kill ───────────────────────────────────────────
    const powerMap = { ptstart: 'start', ptstop: 'stop', ptrestart: 'restart', ptkill: 'kill' }
    if (powerMap[command]) {
        const action = powerMap[command]
        if (!text) return reply(`❌ Usage: ${prefix}${command} <server name or number>`)
        await react('⚡')
        const server = await resolveServer(text.trim())
        if (!server) return reply(`❌ Server *${text}* not found. Run ${prefix}ptlist to see servers.`)
        const res = await powerAction(server.id, action)
        await react(res.success ? '✅' : '❌')
        const actionEmoji = { start: '▶️', stop: '⏹️', restart: '🔄', kill: '💀' }
        return reply(res.success
            ? `${actionEmoji[action] || '⚡'} Server *${server.name}* — ${action} signal sent.`
            : `❌ ${res.error}`)
    }

    // ── ptcmd <server> | <command> ──────────────────────────────────────────
    if (command === 'ptcmd' || command === 'ptcommand') {
        if (!text || !text.includes('|')) return reply(`❌ Usage: ${prefix}ptcmd <server> | <console command>\n\nExample: ${prefix}ptcmd MyServer | say Hello`)
        const [srv, ...rest] = text.split('|')
        const cmd = rest.join('|').trim()
        if (!srv.trim() || !cmd) return reply(`❌ Need both server and command: ${prefix}ptcmd <server> | <cmd>`)
        await react('⌨️')
        const server = await resolveServer(srv.trim())
        if (!server) return reply(`❌ Server not found. Run ${prefix}ptlist to see servers.`)
        const res = await sendCommand(server.id, cmd)
        await react(res.success ? '✅' : '❌')
        return reply(res.success
            ? `✅ Sent to *${server.name}*: \`${cmd}\``
            : `❌ ${res.error}`)
    }

    // ── ptfiles <server> [directory] ────────────────────────────────────────
    if (command === 'ptfiles') {
        if (!text) return reply(`❌ Usage: ${prefix}ptfiles <server> [directory]\n\nExample: ${prefix}ptfiles MyServer /\n${prefix}ptfiles MyServer /src`)
        const [srv, dir = '/'] = text.split(/\s+(.+)/)
        await react('📁')
        const server = await resolveServer(srv.trim())
        if (!server) return reply(`❌ Server not found. Run ${prefix}ptlist to see servers.`)
        const res = await listFiles(server.id, dir.trim())
        if (!res.success) return reply(`❌ ${res.error}`)
        if (!res.files.length) return reply(`📭 Directory *${dir}* is empty.`)
        const lines = res.files.map(f => {
            const icon = f.is_file ? '📄' : '📂'
            const sz = f.is_file ? ` (${(f.size / 1024).toFixed(1)} KB)` : ''
            return `${icon} ${f.name}${sz}`
        }).join('\n')
        return reply(`╭══〘 *📁 ${server.name} — ${dir}* 〙═⊷\n┃\n${lines}\n╰══════════════════⊷`)
    }

    // ── ptread <server> | <file> ─────────────────────────────────────────────
    if (command === 'ptread' || command === 'ptcat') {
        if (!text || !text.includes('|')) return reply(`❌ Usage: ${prefix}ptread <server> | <file path>\n\nExample: ${prefix}ptread MyServer | /config.json`)
        const [srv, ...fp] = text.split('|')
        const filePath = fp.join('|').trim()
        if (!srv.trim() || !filePath) return reply(`❌ Need both server and file path.`)
        await react('📖')
        const server = await resolveServer(srv.trim())
        if (!server) return reply(`❌ Server not found.`)
        const res = await readFile(server.id, filePath)
        if (!res.success) return reply(`❌ ${res.error}`)
        const content = res.content.length > 3500 ? res.content.slice(0, 3500) + '\n\n_[truncated]_' : res.content
        return reply(`╭══〘 *📖 ${filePath}* 〙═⊷\n\n${content}\n╰══════════════════⊷`)
    }

    // ── ptwrite <server> | <file>\n<content> ────────────────────────────────
    if (command === 'ptwrite') {
        if (!text || !text.includes('|')) return reply(`❌ Usage: ${prefix}ptwrite <server> | <file path>\n<content>\n\nReply to or type content after the file path.`)
        const [srv, ...rest] = text.split('|')
        const afterPipe = rest.join('|')
        const nl = afterPipe.indexOf('\n')
        if (nl === -1) return reply(`❌ Put the file content on a new line after the file path.`)
        const filePath = afterPipe.slice(0, nl).trim()
        const content  = afterPipe.slice(nl + 1)
        if (!filePath || !content.trim()) return reply(`❌ Need both a file path and content to write.`)
        await react('✍️')
        const server = await resolveServer(srv.trim())
        if (!server) return reply(`❌ Server not found.`)
        const res = await writeFile(server.id, filePath, content)
        await react(res.success ? '✅' : '❌')
        return reply(res.success ? `✅ Written to *${server.name}*: \`${filePath}\`` : `❌ ${res.error}`)
    }

    // ── ptcreate <plan> <username> [whatsapp] — or reply to user's message ──
    if (command === 'ptcreate' || command === 'pcreate') {
        if (args.length < 2) return reply(
            `❌ *Usage:*\n` +
            `• In their private chat: ${prefix}ptcreate <plan> <username>\n` +
            `• Slide/reply to their message: ${prefix}ptcreate <plan> <username>\n` +
            `• Type number manually: ${prefix}ptcreate <plan> <username> <number>\n\n` +
            `*Plans:* ${PLAN_LIST()}\n\n` +
            `*Example:* ${prefix}ptcreate 2gb eagle 254717459770`
        )
        const [plan, username, rawWaArg] = args
        if (!PLANS[plan.toLowerCase()]) return reply(`❌ Unknown plan *${plan}*\n\nAvailable: ${Object.keys(PLANS).join(', ')}`)
        const waJid = resolveWa(m, rawWaArg)
        if (!waJid) return reply(
            `❌ No WhatsApp number found.\n\n` +
            `Either reply/slide to the user's message, or add their number:\n${prefix}ptcreate ${plan} ${username} 254712345678`
        )
        const planCfg  = PLANS[plan.toLowerCase()]
        const email    = `${username}@${EMAIL_DOMAIN}`
        const password = genPassword(username)
        const displayNum = waJid.replace('@s.whatsapp.net', '')
        await reply(`⏳ Creating *${username}* on plan *${planCfg.label}*...`)
        await react('⚙️')
        try {
            const userRes = await createUser({ username, email, password, isAdmin: false })
            if (!userRes.success) return reply(`❌ User creation failed:\n${userRes.error}`)
            const userId     = userRes.user.id
            const serverName = `${username}-${plan.toLowerCase()}`
            await createPanelServer({ name: serverName, userId, planKey: plan.toLowerCase() })
            const credMsg =
                `🎉 *Panel Account Created!*\n\n` +
                `🌐 Panel: ${ptUrl}\n` +
                `👤 Username: *${username}*\n` +
                `📧 Email: \`${email}\`\n` +
                `🔑 Password: \`${password}\`\n` +
                `📦 Plan: *${planCfg.label}*\n` +
                `🖥️ Server: *${serverName}*\n\n` +
                `_Login at the panel URL with your email & password._`
            const send = await dispatchCreds(m, conn, chat, waJid, credMsg, displayNum)
            await react('✅')
            return reply(
                `✅ *Account + Server created!*\n\n` +
                `👤 Username: *${username}*\n` +
                `📦 Plan: *${planCfg.label}*\n` +
                `🖥️ Server: *${serverName}*\n\n` +
                (send.sent
                    ? `🔐 Credentials delivered privately to +${displayNum}`
                    : `⚠️ Could not deliver credentials (${send.reason})\nSend manually: \`${email}\` / \`${password}\``)
            )
        } catch (err) {
            console.error('[PTCREATE]', err.message)
            await react('❌')
            return reply(`❌ *Creation failed:*\n${err.message}`)
        }
    }

    // ── ptaddserver <plan> <username> ───────────────────────────────────────
    if (command === 'ptaddserver') {
        if (args.length < 2) return reply(
            `❌ *Usage:* ${prefix}ptaddserver <plan> <username>\n\n` +
            `*Plans:* ${PLAN_LIST()}\n\n` +
            `*Example:* ${prefix}ptaddserver 4gb eagle`
        )
        const [plan, username] = args
        if (!PLANS[plan.toLowerCase()]) return reply(`❌ Unknown plan *${plan}*\n\nAvailable: ${Object.keys(PLANS).join(', ')}`)
        const planCfg = PLANS[plan.toLowerCase()]
        await reply(`⏳ Adding *${planCfg.label}* server for *${username}*...`)
        await react('⚙️')
        try {
            const user = await findUserByUsername(username)
            if (!user) return reply(`❌ User *${username}* not found.\nCreate them first with ${prefix}ptcreate.`)
            const serverName = `${username}-${plan.toLowerCase()}`
            await createPanelServer({ name: serverName, userId: user.attributes.id, planKey: plan.toLowerCase() })
            await react('✅')
            return reply(
                `✅ *Server Added!*\n\n` +
                `👤 User: *${username}*\n` +
                `🖥️ Server: *${serverName}*\n` +
                `📦 Plan: *${planCfg.label}*`
            )
        } catch (err) {
            await react('❌')
            return reply(`❌ *Failed to add server:*\n${err.message}`)
        }
    }

    // ── ptadmin <username> [whatsapp] — or reply to their message ──────────
    if (command === 'ptadmin') {
        if (!args[0]) return reply(
            `❌ *Usage:*\n` +
            `• In their private chat: ${prefix}ptadmin <username>\n` +
            `• Slide/reply to their message: ${prefix}ptadmin <username>\n` +
            `• Type number manually: ${prefix}ptadmin <username> <number>\n\n` +
            `_Creates an admin account and sends credentials to their WhatsApp._`
        )
        const [username, rawWaArg] = args
        const waJid = resolveWa(m, rawWaArg)
        if (!waJid) return reply(
            `❌ No WhatsApp number found.\n\n` +
            `Reply/slide to their message, or add their number:\n${prefix}ptadmin ${username} 254712345678`
        )
        const email      = `${username}@${EMAIL_DOMAIN}`
        const password   = genPassword(username)
        const displayNum = waJid.replace('@s.whatsapp.net', '')
        await reply(`⏳ Creating admin account for *${username}*...`)
        await react('👑')
        const res = await createUser({ username, email, password, isAdmin: true })
        if (!res.success) { await react('❌'); return reply(`❌ Failed:\n${res.error}`) }
        const credMsg =
            `👑 *Admin Panel Account Created!*\n\n` +
            `🌐 Panel: ${ptUrl}\n` +
            `👤 Username: *${username}*\n` +
            `📧 Email: \`${email}\`\n` +
            `🔑 Password: \`${password}\`\n` +
            `🛡️ Role: *Administrator*\n\n` +
            `_Login at the panel URL with your email & password._`
        const send = await dispatchCreds(m, conn, chat, waJid, credMsg, displayNum)
        await react('✅')
        return reply(
            `✅ *Admin account created!*\n\n` +
            `👤 Username: *${username}*\n` +
            `🛡️ Role: *Administrator*\n\n` +
            (send.sent
                ? `🔐 Credentials delivered privately to +${displayNum}`
                : `⚠️ Could not deliver credentials (${send.reason})\nSend manually: \`${email}\` / \`${password}\``)
        )
    }

    // ── ptreset <username> [newpassword] ─────────────────────────────────────
    if (command === 'ptreset') {
        if (!args[0]) return reply(`❌ Usage: ${prefix}ptreset <username> [new password]\n\nLeave password blank to auto-generate one.`)
        const [username, customPw] = args
        const newPassword = customPw || genPassword(username)
        await react('🔑')
        const user = await findUserByUsername(username)
        if (!user) return reply(`❌ User *${username}* not found.`)
        const u = user.attributes
        const res = await updateUser(u.id, {
            username: u.username, email: u.email, firstName: u.first_name,
            lastName: u.last_name, isAdmin: u.root_admin, language: u.language, password: newPassword
        })
        await react(res.success ? '✅' : '❌')
        return res.success
            ? reply(`✅ Password reset for *${username}*\n\n🔑 New Password: \`${newPassword}\``)
            : reply(`❌ Reset failed: ${res.error}`)
    }

    // ── ptcreds <username> [whatsapp] — or reply to their message ───────────
    if (command === 'ptcreds') {
        if (!args[0]) return reply(
            `❌ *Usage:*\n` +
            `• In their private chat: ${prefix}ptcreds <username>\n` +
            `• Slide/reply to their message: ${prefix}ptcreds <username>\n` +
            `• Type number manually: ${prefix}ptcreds <username> <number>\n\n` +
            `_Resets their password and sends fresh credentials to their WhatsApp._`
        )
        const [username, rawWaArg] = args
        const waJid = resolveWa(m, rawWaArg)
        if (!waJid) return reply(
            `❌ No WhatsApp number found.\n\n` +
            `Reply/slide to their message, or add their number:\n${prefix}ptcreds ${username} 254712345678`
        )
        const displayNum = waJid.replace('@s.whatsapp.net', '')
        await reply(`⏳ Fetching account for *${username}*...`)
        await react('📲')
        const user = await findUserByUsername(username)
        if (!user) { await react('❌'); return reply(`❌ No panel account found for *${username}*.`) }
        const u = user.attributes
        const newPassword = genPassword(username)
        await updateUser(u.id, {
            username: u.username, email: u.email, firstName: u.first_name,
            lastName: u.last_name, isAdmin: u.root_admin, language: u.language, password: newPassword
        })
        let userServers = []
        try {
            const allServers = await getAllPages(`${ptUrl}/api/application/servers`)
            userServers = allServers.filter(s => s.attributes.user === u.id).map(s => `• ${s.attributes.name}`)
        } catch {}
        const serverBlock = userServers.length ? `\n\n🖥️ *Your servers:*\n${userServers.join('\n')}` : ''
        const credMsg =
            `┏━━◆ *ZYNEX PANEL — CREDENTIALS* 🔑 ◆━━┓\n┃\n` +
            `┃ 🌐 *Panel:* ${ptUrl}\n` +
            `┃ 👤 *Username:* ${u.username}\n` +
            `┃ 📧 *Email:* ${u.email}\n` +
            `┃ 🔑 *Password:* \`${newPassword}\`\n┃\n` +
            `┃ 🔐 Login at the panel URL above.\n` +
            `┃ Password has been reset.\n┃\n` +
            `┗━━━━━━━━━━━━━━━━━━━━━━━━━┛` + serverBlock
        const send = await dispatchCreds(m, conn, chat, waJid, credMsg, displayNum)
        await react('✅')
        return reply(
            `✅ *Credentials sent!*\n\n` +
            `👤 Username: *${u.username}*\n` +
            `🖥️ Servers: ${userServers.length}\n\n` +
            (send.sent
                ? `🔐 Delivered privately to +${displayNum}`
                : `⚠️ Could not deliver (${send.reason})\nSend manually: \`${u.email}\` / \`${newPassword}\``)
        )
    }

    // ── ptdelete server <name> / user <username> ────────────────────────────
    if (command === 'ptdelete') {
        const type = (args[0] || '').toLowerCase()
        const name  = args.slice(1).join(' ')
        if (!type || !name) return reply(
            `❌ *Usage:*\n${prefix}ptdelete server <name>\n${prefix}ptdelete user <username>\n\n` +
            `Deleting a *user* also deletes all their servers automatically.`
        )
        if (type === 'server') {
            await react('🗑️')
            try {
                const server = await findServerByName(name)
                if (!server) return reply(`❌ Server *${name}* not found.`)
                await require('axios').delete(
                    `${(require('../Config').pterodactylUrl || '').replace(/\/$/, '')}/api/application/servers/${server.attributes.id}`,
                    { headers: { Authorization: `Bearer ${appK}`, Accept: 'application/json' } }
                )
                await react('✅')
                return reply(`✅ Server *${name}* deleted.`)
            } catch (err) { await react('❌'); return reply(`❌ Delete failed: ${err?.response?.data?.errors?.[0]?.detail || err.message}`) }
        }
        if (type === 'user') {
            await react('🗑️')
            await reply(`⏳ Deleting user *${name}* and all their servers...`)
            const res = await deleteUserWithServers(name)
            await react(res.success ? '✅' : '❌')
            if (!res.success) return reply(`❌ Delete failed: ${res.error}`)
            let msg = `✅ *User deleted:* ${res.username}\n🖥️ *Servers removed:* ${res.serversDeleted}`
            if (res.failed.length) msg += `\n⚠️ Failed to remove: ${res.failed.join(', ')}`
            return reply(msg)
        }
        return reply(`❌ Type must be \`server\` or \`user\`\n${prefix}ptdelete server <name>\n${prefix}ptdelete user <username>`)
    }

    // ── ptusers ─────────────────────────────────────────────────────────────
    if (command === 'ptusers') {
        await react('👥')
        const res = await listUsers()
        if (!res.success) return reply(`❌ ${res.error}`)
        if (!res.users.length) return reply(`No users on your panel.`)
        const lines = res.users.map((u, i) =>
            `${i + 1}. ${u.isAdmin ? '👑' : '👤'} *${u.username}* (ID: ${u.id})\n    ┃ ${u.email}`
        ).join('\n')
        return reply(`╭══〘 *👥 PANEL USERS (${res.users.length})* 〙═⊷\n┃\n${lines}\n╰══════════════════⊷`)
    }

    // ── ptdeluser <id> ──────────────────────────────────────────────────────
    if (command === 'ptdeluser') {
        const id = parseInt(args[0])
        if (!id || isNaN(id)) return reply(`❌ Usage: ${prefix}ptdeluser <user ID>\n\nGet IDs from ${prefix}ptusers`)
        if (id === 1) return reply(`⛔ Cannot delete user ID 1 — that's your panel account.`)
        await react('🗑️')
        const userInfo = await getUser(id)
        const name = userInfo.success ? userInfo.user.username : `ID ${id}`
        const res = await deleteUser(id)
        await react(res.success ? '✅' : '❌')
        return reply(res.success
            ? `✅ User *${name}* (ID: ${id}) deleted.`
            : `❌ Delete failed: ${res.error}`)
    }

    // ── ptpromote / ptdemote <id> ───────────────────────────────────────────
    if (command === 'ptpromote' || command === 'ptdemote') {
        const id = parseInt(args[0])
        if (!id || isNaN(id)) return reply(`❌ Usage: ${prefix}${command} <user ID>\n\nGet IDs from ${prefix}ptusers`)
        const makeAdmin = command === 'ptpromote'
        await react(makeAdmin ? '👑' : '⬇️')
        const res = await updateUser(id, { isAdmin: makeAdmin })
        await react(res.success ? '✅' : '❌')
        return reply(res.success
            ? (makeAdmin ? `👑 User ID ${id} promoted to *Admin*.` : `✅ User ID ${id} demoted — admin removed.`)
            : `❌ Failed: ${res.error}`)
    }

    // ── ptpurgeusers ────────────────────────────────────────────────────────
    if (command === 'ptpurgeusers') {
        await reply(`⚠️ *Purging all users except ID 1...*\n_This may take a moment._`)
        await react('🗑️')
        const res = await deleteAllUsersExceptOwner(1)
        await react(res.success ? '✅' : '❌')
        if (!res.success) return reply(`❌ Purge failed: ${res.error}`)
        return reply(
            `🧹 *User Purge Complete*\n\n` +
            `┃❍ Total targeted: ${res.total}\n` +
            `┃❍ Deleted: ${res.deleted}\n` +
            `┃❍ Failed: ${res.failed}` +
            (res.failedList?.length ? `\n┃❍ Failed users: ${res.failedList.join(', ')}` : '')
        )
    }

    // ── ptallservers ────────────────────────────────────────────────────────
    if (command === 'ptallservers') {
        await react('🖥️')
        const res = await listAllServers()
        if (!res.success) return reply(`❌ ${res.error}`)
        if (!res.servers.length) return reply(`No servers on the panel.`)
        const lines = res.servers.map((s, i) => {
            const ram = s.limits?.memory === 0 ? 'Unli' : `${s.limits?.memory}MB`
            return `${i + 1}. *${s.name}* (ID: ${s.id})\n    ┃ ${s.suspended ? '🔴 Suspended' : '🟢 Active'} | RAM: ${ram}`
        }).join('\n')
        return reply(`╭══〘 *🖥️ ALL SERVERS (${res.servers.length})* 〙═⊷\n┃\n${lines}\n╰══════════════════⊷`)
    }

    // ── ptdelserver <id> [force] ─────────────────────────────────────────────
    if (command === 'ptdelserver') {
        const id    = parseInt(args[0])
        const force = (args[1] || '').toLowerCase() === 'force'
        if (!id || isNaN(id)) return reply(`❌ Usage: ${prefix}ptdelserver <server ID> [force]\n\nGet IDs from ${prefix}ptallservers`)
        await react('🗑️')
        const res = await deleteServer(id, force)
        await react(res.success ? '✅' : '❌')
        return reply(res.success
            ? `✅ Server ID ${id} deleted${force ? ' (forced)' : ''}.`
            : `❌ Delete failed: ${res.error}\n\nTip: Add \`force\` to bypass: ${prefix}ptdelserver ${id} force`)
    }

    // ── ptsuspend / ptunsuspend <id> ─────────────────────────────────────────
    if (command === 'ptsuspend' || command === 'ptunsuspend') {
        const id = parseInt(args[0])
        if (!id || isNaN(id)) return reply(`❌ Usage: ${prefix}${command} <server ID>\n\nGet IDs from ${prefix}ptallservers`)
        const isSuspend = command === 'ptsuspend'
        await react(isSuspend ? '🔒' : '🔓')
        const res = isSuspend ? await suspendServer(id) : await unsuspendServer(id)
        await react(res.success ? '✅' : '❌')
        return reply(res.success
            ? `${isSuspend ? '🔒 Server suspended' : '🔓 Server unsuspended'} (ID: ${id}).`
            : `❌ ${res.error}`)
    }

    // ── ptnodes ──────────────────────────────────────────────────────────────
    if (command === 'ptnodes') {
        await react('🔧')
        const res = await listNodes()
        if (!res.success) return reply(`❌ ${res.error}`)
        if (!res.nodes.length) return reply(`No nodes found.`)
        const lines = res.nodes.map((n, i) =>
            `${i + 1}. *${n.name}* (ID: ${n.id})\n    ┃ ${n.fqdn}\n    ┃ RAM: ${n.memory}MB | Disk: ${Math.round(n.disk / 1024)}GB`
        ).join('\n')
        return reply(`╭══〘 *🔧 NODES (${res.nodes.length})* 〙═⊷\n┃\n${lines}\n╰══════════════════⊷`)
    }

    // ── ptall / pthelp ───────────────────────────────────────────────────────
    if (command === 'ptall' || command === 'pthelp') {
        return reply(
            `╭══〘 *🦅 PTERODACTYL ADMIN* 〙═⊷\n┃\n` +
            `┃ *📦 Account Management:*\n` +
            `┃❍ ${prefix}ptcreate <plan> <user> <wa> — Create user + server + send creds\n` +
            `┃❍ ${prefix}ptaddserver <plan> <user> — Add server to existing user\n` +
            `┃❍ ${prefix}ptadmin <user> <wa> — Create admin account\n` +
            `┃❍ ${prefix}ptreset <user> [pw] — Reset password\n` +
            `┃❍ ${prefix}ptcreds <user> <wa> — Resend credentials to WhatsApp\n` +
            `┃❍ ${prefix}ptdelete user <user> — Delete user + all their servers\n` +
            `┃❍ ${prefix}ptdelete server <name> — Delete server by name\n` +
            `┃\n` +
            `┃ *📋 Plans:* ${PLAN_LIST()}\n` +
            `┃\n` +
            `┃ *👤 Users:*\n` +
            `┃❍ ${prefix}ptusers — List all users\n` +
            `┃❍ ${prefix}ptlist users — Same, different format\n` +
            `┃❍ ${prefix}ptdeluser <id> — Delete user by ID\n` +
            `┃❍ ${prefix}ptpromote <id> — Make admin\n` +
            `┃❍ ${prefix}ptdemote <id> — Remove admin\n` +
            `┃❍ ${prefix}ptpurgeusers — Delete ALL users except ID 1\n` +
            `┃\n` +
            `┃ *🖥️ Servers (Admin):*\n` +
            `┃❍ ${prefix}ptallservers — All servers with IDs\n` +
            `┃❍ ${prefix}ptlist servers — Same, different format\n` +
            `┃❍ ${prefix}ptdelserver <id> [force] — Delete by ID\n` +
            `┃❍ ${prefix}ptsuspend / ${prefix}ptunsuspend <id>\n` +
            `┃\n` +
            `┃ *🎮 Server Control (Client):*\n` +
            `┃❍ ${prefix}ptlist — My servers\n` +
            `┃❍ ${prefix}ptstatus <server> — Live CPU/RAM/uptime\n` +
            `┃❍ ${prefix}ptstart / ${prefix}ptstop / ${prefix}ptrestart / ${prefix}ptkill <server>\n` +
            `┃❍ ${prefix}ptcmd <server> | <command> — Console command\n` +
            `┃\n` +
            `┃ *📁 Files:*\n` +
            `┃❍ ${prefix}ptfiles <server> [dir] — Browse files\n` +
            `┃❍ ${prefix}ptread <server> | <file> — Read file\n` +
            `┃❍ ${prefix}ptwrite <server> | <file>\\n<content>\n` +
            `┃\n` +
            `┃ *🔧 Nodes:*\n` +
            `┃❍ ${prefix}ptnodes — List all nodes\n` +
            `╰══════════════════⊷`
        )
    }

    // ── ptdmtest <number> — test raw DM delivery ─────────────────────────────
    if (command === 'ptdmtest') {
        const rawNum = args[0]?.replace(/[^0-9]/g, '')
        if (!rawNum) return reply(`❌ Usage: ${prefix}ptdmtest <number>\nExample: ${prefix}ptdmtest 2348103566951`)
        const testJid = rawNum + '@s.whatsapp.net'
        await reply(`⏳ Sending test DM to +${rawNum}...`)
        const result = await verifyAndSendDM(conn, testJid,
            `🔔 *Bera Bot DM Test*\n\nThis is a test message from your bot.\nIf you see this, DM delivery is working!`
        )
        if (result.sent) {
            return reply(`✅ Test DM sent successfully to +${rawNum}\nCheck the logs for relay ID.`)
        } else {
            return reply(`❌ DM failed: ${result.reason}`)
        }
    }


    // ── create <plan> <username>, <number> ─────────────────────────────────
    // Friendly alias for ptcreate: .create 1gb brucebera, 254743982206
    if (command === 'create') {
        if (!appK) return reply(`❌ Pterodactyl App API key not set.`)
        if (!text) return reply(
            `╭══〘 *🖥️ CREATE SERVER* 〙═⊷\n` +
            `┃\n` +
            `┃ Usage:\n` +
            `┃ ${prefix}create <plan> <name>, <number>\n` +
            `┃\n` +
            `┃ Examples:\n` +
            `┃❍ ${prefix}create 1gb brucebera, 254743982206\n` +
            `┃❍ ${prefix}create 2gb john254, 254712345678\n` +
            `┃❍ ${prefix}create 4gb myserver, 254712345678\n` +
            `┃❍ ${prefix}create 8gb bigserver, 254712345678\n` +
            `┃❍ ${prefix}create unli unlimited1, 254712345678\n` +
            `┃❍ ${prefix}create admin adminuser, 254712345678\n` +
            `┃\n` +
            `┃ 📋 Plans: ${PLAN_LIST()}\n` +
            `╰══════════════════⊷`
        )
        // Parse: "1gb brucebera, 254743982206"
        const commaIdx = text.lastIndexOf(',')
        let waNum = '', mainPart = text
        if (commaIdx !== -1) {
            waNum    = text.slice(commaIdx + 1).trim().replace(/[^0-9]/g, '')
            mainPart = text.slice(0, commaIdx).trim()
        }
        const parts    = mainPart.trim().split(/\s+/)
        const plan     = parts[0]?.toLowerCase()
        const username = parts.slice(1).join('').trim().toLowerCase().replace(/[^a-z0-9_]/g, '')

        if (!plan || !username) return reply(`❌ Usage: ${prefix}create <plan> <username>, <number>\nExample: ${prefix}create 1gb brucebera, 254743982206`)
        if (!PLANS[plan]) return reply(`❌ Unknown plan *${plan}*\n\nAvailable: ${Object.keys(PLANS).join(', ')}`)
        if (!waNum) return reply(`❌ WhatsApp number missing. Format: ${prefix}create 1gb username, 254712345678`)

        const waJid       = waNum + '@s.whatsapp.net'
        const displayNum  = waNum
        const isAdminPlan = plan === 'admin'

        await react('⏳')
        await reply(`⏳ Setting up *${isAdminPlan ? 'Admin Panel' : plan.toUpperCase()}* server for *${username}*...`)

        try {
            // 1. Create panel user
            const password = genPassword(username)
            const email    = `${username}@${EMAIL_DOMAIN}`
            let userRes
            try {
                userRes = await createUser({
                    username, email, password,
                    firstName: username,
                    lastName: 'BeraHost',
                    isAdmin: isAdminPlan
                })
            } catch (e) {
                if (e.message.includes('already been taken') || e.message.includes('exists')) {
                    return reply(`❌ Username *${username}* already exists.\nTry a different name.`)
                }
                throw e
            }
            const userId = userRes.id

            // 2. Create server (use unli spec for admin plan)
            const serverPlan = isAdminPlan ? 'unli' : plan
            const server = await createPanelServer({ name: username, userId, planKey: serverPlan })

            // 3. Build credential message
            const panelUrl = ptUrl.replace(/\/api.*/, '').replace(/\/$/, '')
            const planLabel = isAdminPlan ? '👑 Admin (Unlimited)' : (PLANS[plan]?.label || plan)
            const credMsg =
                `╭══〘 *🖥️ YOUR SERVER IS READY* 〙═⊷\n` +
                `┃\n` +
                `┃ *Panel URL:* ${panelUrl}\n` +
                `┃ *Username:* ${username}\n` +
                `┃ *Password:* ${password}\n` +
                `┃ *Email:* ${email}\n` +
                `┃ *Plan:* ${planLabel}\n` +
                `┃ *Server:* ${username}\n` +
                `┃\n` +
                `┃ 📌 Login at the panel URL above\n` +
                `┃ 🔒 Change your password after logging in\n` +
                `┃\n` +
                `┃ Powered by *Bera AI*\n` +
                `╰══════════════════⊷`

            // 4. Send creds via DM
            const { sent } = await dispatchCreds(m, conn, chat, waJid, credMsg, displayNum)

            await react('✅')
            return reply(
                `╭══〘 *✅ SERVER CREATED* 〙═⊷\n` +
                `┃❍ *User:* ${username}\n` +
                `┃❍ *Plan:* ${planLabel}\n` +
                `┃❍ *Panel Admin:* ${isAdminPlan ? 'Yes 👑' : 'No'}\n` +
                `┃❍ *Creds sent to:* +${displayNum}${sent ? ' ✅' : ' ⚠️ (send them first message to receive)'}\n` +
                `╰══════════════════⊷`
            )
        } catch (e) {
            await react('❌')
            return reply(`❌ Server creation failed:\n${e.message}`)
        }
    }

    // ── listservers ────────────────────────────────────────────────────────
    if (command === 'listservers' || command === 'myservers') {
        await react('🖥️')
        const res = await listAllServers()
        if (!res.success) return reply(`❌ ${res.error}`)
        if (!res.servers.length) return reply(`📭 No servers on panel.`)
        const lines = res.servers.map((s, i) =>
            `${i+1}. *${s.name}* (ID: ${s.id}) — ${s.suspended ? '🔴 Suspended' : '🟢 Active'}\n   RAM: ${s.memory === 0 ? 'Unlimited' : s.memory+'MB'} | Disk: ${s.disk === 0 ? 'Unlimited' : Math.round(s.disk/1024)+'GB'}`
        ).join('\n')
        return reply(`╭══〘 *🖥️ ALL SERVERS (${res.servers.length})* 〙═⊷\n\n${lines}\n╰══════════════════⊷`)
    }

    // ── listusers ──────────────────────────────────────────────────────────
    if (command === 'listusers') {
        await react('👥')
        const res = await listUsers()
        if (!res.success) return reply(`❌ ${res.error}`)
        if (!res.users.length) return reply(`📭 No users on panel.`)
        const lines = res.users.map((u, i) =>
            `${i+1}. ${u.isAdmin ? '👑' : '👤'} *${u.username}* (ID: ${u.id})\n   ${u.email}`
        ).join('\n')
        return reply(`╭══〘 *👥 PANEL USERS (${res.users.length})* 〙═⊷\n\n${lines}\n╰══════════════════⊷`)
    }

    // ── deleteserver <name> ────────────────────────────────────────────────
    if (command === 'deleteserver' || command === 'delserver') {
        if (!text) return reply(`❌ Usage: ${prefix}deleteserver <name>\nExample: ${prefix}deleteserver brucebera`)
        await react('🗑️')
        const srv = await findServerByName(text.trim())
        if (!srv) return reply(`❌ Server *${text.trim()}* not found.`)
        const id = srv.attributes.id
        const res = await deleteServer(id)
        if (!res.success) return reply(`❌ Delete failed: ${res.error}`)
        await react('✅')
        return reply(`✅ Server *${text.trim()}* deleted successfully.`)
    }

    // ── deleteuser <username> ──────────────────────────────────────────────
    if (command === 'deleteuser' || command === 'deluser') {
        if (!text) return reply(`❌ Usage: ${prefix}deleteuser <username>\nExample: ${prefix}deleteuser brucebera`)
        await react('🗑️')
        const user = await findUserByUsername(text.trim())
        if (!user) return reply(`❌ User *${text.trim()}* not found.`)
        const userId = user.attributes.id
        const res = await deleteUserWithServers(userId)
        if (!res.success) return reply(`❌ Delete failed: ${res.error}`)
        await react('✅')
        return reply(`✅ User *${text.trim()}* and all their servers deleted.`)
    }


    // ════════════════════════════════════════════════════════════════════════════
    //  BERAHOST NATIVE API COMMANDS
    // ════════════════════════════════════════════════════════════════════════════
    const bh = require('../Library/actions/berahost')

    // ── BeraHost API key guard ────────────────────────────────────────────
    const _bhKeySet = global.db?.data?.settings?.bhApiKey || process.env.BH_API_KEY
    const _bhFunctionalCmds = ['deploy','bhd','botdeploy','newdeploy','deployments','mybots','listdeploy','bhdlist','mydeployments','startbot','bhstart','depstart','stopbot','bhstop','depstop','deletedeploy','deldeploy','bhdel','removedeploy','botlogs','bhlogs','deplogs','logbot','botmetrics','botstats','bhmetrics','depmetrics','depstats','depinfo','bhinfo','deployinfo','botinfo','updateenv','setenv','bhenv','depenv','coins','bhcoins','mycoins','balance','claimcoins','dailycoins','claim','bhclaim','redeem','voucher','bhredeem','mpesa','pay','bhpay','bhmoney','stk','paystatus','checkpay','paycheck','payhistory','payments','bhpayments','mypayments','transactions','coinhistory','bhhistory','cointx']
    if (_bhFunctionalCmds.includes(command) && !_bhKeySet) {
        return reply(
            '🔑 *BeraHost API key not set!*\n\n' +
            'Set it first with:\n' +
            '*' + prefix + 'setbhkey bh_yourKeyHere*\n\n' +
            '🌐 Get your key from:\n' +
            'https://berahost.com → API Access → Generate New Key'
        )
    }

    // ── .deploy bot <botId> <sessionId> ──────────────────────────────────────
    if (['deploy', 'bhd', 'botdeploy', 'newdeploy'].includes(command)) {
        if (!isOwner) return reply('⛔ Owner only.')
        // Flexible parsing: .deploy bot 1 Gifted~session  OR  .deploy 1 Gifted~session
        const rawArgs = text.trim().split(/\s+/)
        const firstIsBot = rawArgs[0]?.toLowerCase() === 'bot'
        const botId = firstIsBot ? rawArgs[1] : rawArgs[0]
        const sessionId = firstIsBot ? rawArgs.slice(2).join(' ') : rawArgs.slice(1).join(' ')

        if (!botId || !sessionId) {
            const botsRes = await bh.listBots()
            const botList = botsRes.success
                ? botsRes.bots.map(b => `  ${b.id}. ${b.name || b.id}`).join('\n')
                : '  1. Atassa-MD\n  2. (check .bots for full list)'
            return reply(
                `❓ *Usage:* ${prefix}deploy bot <id> <session_id>\n\n` +
                `*Example:*\n${prefix}deploy bot 1 Gifted~yourSessionHere\n\n` +
                `*Available Bots:*\n${botList}\n\n` +
                `💡 Get your session ID from the bot's QR page or existing deployment.`
            )
        }

        await conn.sendMessage(chat, { react: { text: '🚀', key: m.key } })
        await reply(`🚀 Deploying bot *${botId}* with your session...\n⏳ This may take 1-2 minutes.`)

        const r = await bh.deployBot(botId, sessionId)
        if (!r.success) {
            await conn.sendMessage(chat, { react: { text: '❌', key: m.key } })
            return reply(`❌ Deploy failed: ${r.error}`)
        }

        // Poll until running
        await reply(`🔄 Deployment *${r.id}* created — polling status...`)
        const final = await bh.pollDeployment(r.id, 120000, 5000)
        const dep = final.deployment || {}

        await conn.sendMessage(chat, { react: { text: dep.status === 'running' ? '✅' : '⚠️', key: m.key } })
        return reply(
            `╭══〘 *🚀 DEPLOYMENT READY* 〙═⊷\n` +
            `${bh.fmtDeploy(dep).split('\n').map(l => '┃ ' + l).join('\n')}\n` +
            `┃\n` +
            `┃ 💡 Use: *${prefix}botlogs ${r.id}* to see logs\n` +
            `┃        *${prefix}stopbot ${r.id}* to stop\n` +
            `╰══════════════════⊷`
        )
    }

    // ── .deployments / .mybots ────────────────────────────────────────────────
    if (['deployments', 'mybots', 'listdeploy', 'bhdlist', 'mydeployments'].includes(command)) {
        if (!isOwner) return reply('⛔ Owner only.')
        await conn.sendMessage(chat, { react: { text: '📋', key: m.key } })
        const r = await bh.listDeployments()
        if (!r.success) return reply(`❌ ${r.error}`)
        const deploys = r.deployments
        if (!deploys.length) return reply(`📋 No deployments yet.\n\nUse *${prefix}deploy bot 1 <session>* to deploy one.`)
        const rows = deploys.map((d, i) =>
            `┃ ${i+1}. ID ${d.id} — Bot ${d.botId||d.bot_id||'?'} — ${bh.statusEmoji(d.status)}`
        ).join('\n')
        return reply(
            `╭══〘 *📋 MY DEPLOYMENTS (${deploys.length})* 〙═⊷\n${rows}\n┃\n` +
            `┃ Use: ${prefix}botlogs <id>  |  ${prefix}startbot <id>  |  ${prefix}stopbot <id>\n` +
            `╰══════════════════⊷`
        )
    }

    // ── .startbot <id> ────────────────────────────────────────────────────────
    if (['startbot', 'bhstart', 'depstart'].includes(command)) {
        if (!isOwner) return reply('⛔ Owner only.')
        if (!text) return reply(`❓ Usage: ${prefix}startbot <deployment_id>`)
        await conn.sendMessage(chat, { react: { text: '▶️', key: m.key } })
        const r = await bh.startDeployment(text.trim())
        await conn.sendMessage(chat, { react: { text: r.success ? '✅' : '❌', key: m.key } })
        return reply(r.success ? `✅ ${r.output}` : `❌ ${r.error}`)
    }

    // ── .stopbot <id> ─────────────────────────────────────────────────────────
    if (['stopbot', 'bhstop', 'depstop'].includes(command)) {
        if (!isOwner) return reply('⛔ Owner only.')
        if (!text) return reply(`❓ Usage: ${prefix}stopbot <deployment_id>`)
        await conn.sendMessage(chat, { react: { text: '⏹️', key: m.key } })
        const r = await bh.stopDeployment(text.trim())
        await conn.sendMessage(chat, { react: { text: r.success ? '✅' : '❌', key: m.key } })
        return reply(r.success ? `✅ ${r.output}` : `❌ ${r.error}`)
    }

    // ── .deletedeploy <id> ────────────────────────────────────────────────────
    if (['deletedeploy', 'deldeploy', 'bhdel', 'removedeploy'].includes(command)) {
        if (!isOwner) return reply('⛔ Owner only.')
        if (!text) return reply(`❓ Usage: ${prefix}deletedeploy <deployment_id>`)
        await conn.sendMessage(chat, { react: { text: '🗑️', key: m.key } })
        const r = await bh.deleteDeployment(text.trim())
        await conn.sendMessage(chat, { react: { text: r.success ? '✅' : '❌', key: m.key } })
        return reply(r.success ? `✅ ${r.output}` : `❌ ${r.error}`)
    }

    // ── .botlogs <id> ─────────────────────────────────────────────────────────
    if (['botlogs', 'bhlogs', 'deplogs', 'logbot'].includes(command)) {
        if (!isOwner) return reply('⛔ Owner only.')
        if (!text) return reply(`❓ Usage: ${prefix}botlogs <deployment_id>`)
        await conn.sendMessage(chat, { react: { text: '📄', key: m.key } })
        const r = await bh.getDeploymentLogs(text.trim())
        if (!r.success) return reply(`❌ ${r.error}`)
        const logText = r.logs?.slice(-3000) || 'No logs yet'
        return reply(`╭══〘 *📄 LOGS: Deploy ${text.trim()}* 〙═⊷\n\n${logText}\n╰══════════════════⊷`)
    }

    // ── .botmetrics / .botstats <id> ──────────────────────────────────────────
    if (['botmetrics', 'botstats', 'bhmetrics', 'depmetrics', 'depstats'].includes(command)) {
        if (!isOwner) return reply('⛔ Owner only.')
        if (!text) return reply(`❓ Usage: ${prefix}botmetrics <deployment_id>`)
        await conn.sendMessage(chat, { react: { text: '📊', key: m.key } })
        const r = await bh.getDeploymentMetrics(text.trim())
        if (!r.success) return reply(`❌ ${r.error}`)
        return reply(
            `╭══〘 *📊 METRICS: Deploy ${text.trim()}* 〙═⊷\n` +
            `┃ 🔥 CPU:    ${r.cpu}\n` +
            `┃ 💾 RAM:    ${r.ram}\n` +
            `┃ ⏱️ Uptime: ${r.uptime}\n` +
            `┃ 📊 Status: ${bh.statusEmoji(r.status)}\n` +
            `╰══════════════════⊷`
        )
    }

    // ── .depinfo <id> ─────────────────────────────────────────────────────────
    if (['depinfo', 'bhinfo', 'deployinfo', 'botinfo'].includes(command)) {
        if (!isOwner) return reply('⛔ Owner only.')
        if (!text) return reply(`❓ Usage: ${prefix}depinfo <deployment_id>`)
        await conn.sendMessage(chat, { react: { text: 'ℹ️', key: m.key } })
        const r = await bh.getDeployment(text.trim())
        if (!r.success) return reply(`❌ ${r.error}`)
        return reply(`╭══〘 *ℹ️ DEPLOYMENT ${text.trim()}* 〙═⊷\n${bh.fmtDeploy(r.deployment).split('\n').map(l=>'┃ '+l).join('\n')}\n╰══════════════════⊷`)
    }

    // ── .updateenv <id> KEY=VALUE KEY2=VALUE2 ─────────────────────────────────
    if (['updateenv', 'setenv', 'bhenv', 'depenv'].includes(command)) {
        if (!isOwner) return reply('⛔ Owner only.')
        const parts = text.trim().split(/\s+/)
        const depId = parts[0]
        const envPairs = parts.slice(1)
        if (!depId || !envPairs.length) return reply(`❓ Usage: ${prefix}updateenv <id> KEY=VALUE SESSION_ID=newSession`)
        const envVars = {}
        for (const pair of envPairs) {
            const [k, ...v] = pair.split('=')
            if (k) envVars[k] = v.join('=')
        }
        await conn.sendMessage(chat, { react: { text: '⚙️', key: m.key } })
        const r = await bh.updateEnv(depId, envVars)
        await conn.sendMessage(chat, { react: { text: r.success ? '✅' : '❌', key: m.key } })
        return reply(r.success ? `✅ ${r.output}\n\nUpdated: ${Object.keys(envVars).join(', ')}` : `❌ ${r.error}`)
    }

    // ── .coins ────────────────────────────────────────────────────────────────
    if (['coins', 'bhcoins', 'mycoins', 'balance'].includes(command)) {
        if (!isOwner) return reply('⛔ Owner only.')
        await conn.sendMessage(chat, { react: { text: '🪙', key: m.key } })
        const r = await bh.getCoins()
        if (!r.success) return reply(`❌ ${r.error}`)
        return reply(
            `╭══〘 *🪙 BERAHOST COINS* 〙═⊷\n` +
            `┃ Balance: *${r.balance} coins*\n` +
            `┃\n` +
            `┃ 💡 Claim daily: ${prefix}claimcoins\n` +
            `┃    Buy plan:    ${prefix}plans\n` +
            `╰══════════════════⊷`
        )
    }

    // ── .claimcoins ───────────────────────────────────────────────────────────
    if (['claimcoins', 'dailycoins', 'claim', 'bhclaim'].includes(command)) {
        if (!isOwner) return reply('⛔ Owner only.')
        await conn.sendMessage(chat, { react: { text: '🪙', key: m.key } })
        const r = await bh.claimDailyCoins()
        await conn.sendMessage(chat, { react: { text: r.success ? '✅' : '❌', key: m.key } })
        if (r.success) return reply(`✅ *Daily coins claimed!*\n${r.output}${r.amount ? '\n+' + r.amount + ' coins' : ''}${r.balance ? '\nNew balance: ' + r.balance : ''}`)
        return reply(`❌ ${r.error}`)
    }

    // ── .redeem <voucher> ─────────────────────────────────────────────────────
    if (['redeem', 'voucher', 'bhredeem'].includes(command)) {
        if (!isOwner) return reply('⛔ Owner only.')
        if (!text) return reply(`❓ Usage: ${prefix}redeem <voucher_code>`)
        await conn.sendMessage(chat, { react: { text: '🎟️', key: m.key } })
        const r = await bh.redeemVoucher(text.trim())
        await conn.sendMessage(chat, { react: { text: r.success ? '✅' : '❌', key: m.key } })
        return reply(r.success ? `✅ ${r.output}` : `❌ ${r.error}`)
    }

    // ── .plans ────────────────────────────────────────────────────────────────
    if (['plans', 'bhplans', 'hostingplans', 'pricelist'].includes(command)) {
        await conn.sendMessage(chat, { react: { text: '📦', key: m.key } })
        const r = await bh.getPlans()
        if (!r.success) return reply('❌ ' + r.error)

        const pkgs  = r.coinPackages      || []
        const subs  = r.subscriptionPlans || []

        if (!pkgs.length && !subs.length) return reply('❌ No plans found from BeraHost.')

        let msg = '╭══〘 *📦 BERAHOST PLANS* 〙═⊷\n┃\n'

        if (pkgs.length) {
            msg += '┃ 🪙 *COIN PACKAGES (Buy Coins)*\n'
            msg += '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
            pkgs.forEach(p => {
                const badge = p.best ? ' 🏆 BEST' : p.popular ? ' 🔥 POPULAR' : ''
                const bonus = p.bonus > 0 ? ' (+' + p.bonus + ' bonus)' : ''
                msg += '┃ *' + p.name + '*' + badge + '\n'
                msg += '┃   💰 KES ' + p.kes + '  →  🪙 ' + p.totalCoins + ' coins' + bonus + '\n'
                msg += '┃   ID: ' + p.id + '\n'
                msg += '┃\n'
            })
        }

        if (subs.length) {
            msg += '┃ 🖥️ *SUBSCRIPTION PLANS*\n'
            msg += '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
            subs.forEach(p => {
                const price = p.priceKes === 0 ? 'FREE' : 'KES ' + p.priceKes + '/mo'
                const feats = (p.features || []).map(f => '┃     • ' + f).join('\n')
                msg += '┃ *' + p.name + '*  —  ' + price + '\n'
                msg += '┃   🤖 ' + (p.botLimit >= 9999 ? 'Unlimited' : p.botLimit) + ' bots\n'
                if (feats) msg += feats + '\n'
                msg += '┃\n'
            })
        }

        msg += '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
        msg += '┃ 💳 Pay: *' + prefix + 'mpesa <phone> <plan-id>*\n'
        msg += '┃ 🎟️ Redeem: *' + prefix + 'redeem <voucher>*\n'
        msg += '╰══════════════════⊷'

        return reply(msg)
    }

    // ── .mpesa <phone> <planId> [amount] ─────────────────────────────────────
    if (['mpesa', 'pay', 'bhpay', 'bhmoney', 'stk'].includes(command)) {
        if (!isOwner) return reply('⛔ Owner only.')
        const parts = text.trim().split(/\s+/)
        const phone = parts[0]?.replace(/\D/g, '')
        const planId = parts[1]
        const amount = parts[2]
        if (!phone || !planId) return reply(`❓ Usage: ${prefix}mpesa <phone> <planId> [amount]\n\nExample: ${prefix}mpesa 254712345678 basic\n\nSee plans: ${prefix}plans`)
        await conn.sendMessage(chat, { react: { text: '💳', key: m.key } })
        const r = await bh.initiateMpesa(phone, planId, amount)
        await conn.sendMessage(chat, { react: { text: r.success ? '📲' : '❌', key: m.key } })
        if (r.success) {
            return reply(
                `╭══〘 *📲 M-PESA STK SENT* 〙═⊷\n` +
                `┃ Phone: ${phone}\n` +
                `┃ Plan: ${planId}\n` +
                `┃ ${r.output}\n` +
                `┃ Payment ID: ${r.paymentId || 'N/A'}\n` +
                `┃\n` +
                `┃ Check status: ${prefix}paystatus ${r.paymentId || ''}\n` +
                `╰══════════════════⊷`
            )
        }
        return reply(`❌ M-Pesa failed: ${r.error}`)
    }

    // ── .paystatus <paymentId> ────────────────────────────────────────────────
    if (['paystatus', 'checkpay', 'paycheck'].includes(command)) {
        if (!isOwner) return reply('⛔ Owner only.')
        if (!text) return reply(`❓ Usage: ${prefix}paystatus <payment_id>`)
        await conn.sendMessage(chat, { react: { text: '💳', key: m.key } })
        const r = await bh.getPaymentStatus(text.trim())
        if (!r.success) return reply(`❌ ${r.error}`)
        return reply(`💳 Payment *${text.trim()}*: ${r.status?.toUpperCase() || 'unknown'}`)
    }

    // ── .payhistory ───────────────────────────────────────────────────────────
    if (['payhistory', 'payments', 'bhpayments', 'mypayments'].includes(command)) {
        if (!isOwner) return reply('⛔ Owner only.')
        await conn.sendMessage(chat, { react: { text: '🧾', key: m.key } })
        const r = await bh.getPaymentHistory()
        if (!r.success) return reply(`❌ ${r.error}`)
        const h = r.history.slice(0, 10)
        if (!h.length) return reply('No payment history yet.')
        const rows = h.map(p => `┃ ${p.id} — ${p.plan || '?'} — ${p.status || '?'} — ${p.amount || '?'}`).join('\n')
        return reply(`╭══〘 *🧾 PAYMENT HISTORY* 〙═⊷\n${rows}\n╰══════════════════⊷`)
    }

    // ── .bots — list available bots ───────────────────────────────────────────
    if (['bots', 'bhbots', 'botlist', 'availablebots'].includes(command)) {
        await conn.sendMessage(chat, { react: { text: '🤖', key: m.key } })
        const r = await bh.listBots()
        if (!r.success) return reply(`❌ ${r.error}`)
        const botRows = r.bots.map(b =>
            `┃ *${b.id}*. ${b.name || 'Bot ' + b.id}${b.description ? '\n┃    ' + b.description : ''}`
        ).join('\n')
        return reply(`╭══〘 *🤖 AVAILABLE BOTS* 〙═⊷\n${botRows || '┃ No bots listed yet'}\n┃\n┃ Deploy: ${prefix}deploy bot <id> <session_id>\n╰══════════════════⊷`)
    }

    // ── .transactions / .coinhistory ──────────────────────────────────────────
    if (['transactions', 'coinhistory', 'bhhistory', 'cointx'].includes(command)) {
        if (!isOwner) return reply('⛔ Owner only.')
        await conn.sendMessage(chat, { react: { text: '📋', key: m.key } })
        const r = await bh.getTransactions()
        if (!r.success) return reply(`❌ ${r.error}`)
        const txs = r.transactions.slice(0, 10)
        if (!txs.length) return reply('No transactions yet.')
        const rows = txs.map(t => `┃ ${t.type || '?'} ${t.amount > 0 ? '+' : ''}${t.amount} — ${t.description || t.reason || '?'}`).join('\n')
        return reply(`╭══〘 *📋 COIN HISTORY* 〙═⊷\n${rows}\n╰══════════════════⊷`)
    }

    // ── .setbhkey <key> — update BeraHost API key ─────────────────────────────
    if (['setbhkey', 'bhkey', 'setberakey', 'bhsetkey'].includes(command)) {
        if (!isOwner) return reply('⛔ Owner only.')
        const newKey = text?.trim()
        if (!newKey?.startsWith('bh_')) return reply(`❓ Usage: ${prefix}setbhkey bh_yourKeyHere\n\nGet from: https://berahost.com → API Access`)
        if (!global.db.data.settings) global.db.data.settings = {}
        global.db.data.settings.bhApiKey = newKey
        await global.db.write()
        await conn.sendMessage(chat, { react: { text: '✅', key: m.key } })
        return reply(`✅ BeraHost API key saved!\n\n🧪 Test with: ${prefix}coins`)
    }

    // ── .bhhelp ───────────────────────────────────────────────────────────────
    if (['bhhelp', 'deployhelp', 'berahost'].includes(command)) {
        return reply(
            `╭══〘 *🖥️ BERAHOST COMMANDS* 〙═⊷\n` +
            `┃\n` +
            `┃ *🚀 Deployments*\n` +
            `┃ ${prefix}deploy bot 1 <session>    ← Atassa-MD\n┃ ${prefix}deploybera <phone>        ← Bera AI (pair code)\n` +
            `┃ ${prefix}deployments — list all\n` +
            `┃ ${prefix}depinfo <id> — deployment info\n` +
            `┃ ${prefix}startbot <id>  |  ${prefix}stopbot <id>\n` +
            `┃ ${prefix}botlogs <id>   |  ${prefix}botmetrics <id>\n` +
            `┃ ${prefix}updateenv <id> KEY=VAL\n` +
            `┃ ${prefix}deletedeploy <id>\n` +
            `┃\n` +
            `┃ *🪙 Coins*\n` +
            `┃ ${prefix}coins — check balance\n` +
            `┃ ${prefix}claimcoins — claim daily\n` +
            `┃ ${prefix}transactions — coin history\n` +
            `┃ ${prefix}redeem <voucher>\n` +
            `┃\n` +
            `┃ *💳 Payments (M-Pesa)*\n` +
            `┃ ${prefix}plans — see available plans\n` +
            `┃ ${prefix}mpesa <phone> <planId>\n` +
            `┃ ${prefix}paystatus <id>\n` +
            `┃ ${prefix}payhistory\n` +
            `┃\n` +
            `┃ *🤖 Bots*\n` +
            `┃ ${prefix}bots — available bot types\n` +
            `┃\n` +
            `┃ *⚙️ Config*\n` +
            `┃ ${prefix}setbhkey bh_xxx — update API key\n` +
            `╰══════════════════⊷`
        )
    }



    // ── .deploybera <phone> — Deploy Bera AI (pair code, no session needed) ──
    if (['deploybera','beradeploy','bhbera','deployai','depbera'].includes(command)) {
        if (!isOwner) return reply('⛔ Owner only.')
        const phone = text.trim().replace(/[^0-9]/g, '')
        if (!phone || phone.length < 9) {
            return reply(
                '❓ *Usage:* ' + prefix + 'deploybera <phone>\n\n' +
                '*Example:*\n' + prefix + 'deploybera 254712345678\n\n' +
                '📱 Use your full number with country code (no + sign)\n' +
                '💡 A pair code will be sent to you — enter it in WhatsApp\n\n' +
                '*Cost:* 10 BeraHost coins'
            )
        }
        await conn.sendMessage(chat, { react: { text: '🚀', key: m.key } })
        await reply(
            '🚀 *Deploying Bera AI...*\n\n' +
            '📱 Phone: +' + phone + '\n' +
            '⏳ Starting bot — pair code coming in ~30-60 seconds...'
        )
        const dr = await bh.deployBot(2, null, { OWNER_NUMBER: phone })
        if (!dr.success) {
            await conn.sendMessage(chat, { react: { text: '❌', key: m.key } })
            return reply('❌ Deploy failed: ' + dr.error)
        }
        await reply('✅ Deployment *' + dr.id + '* created — waiting for pair code...')

        // Poll logs for the pair code (bot requests it on startup)
        const codeRes = await bh.pollForPairCode(dr.id, 180000, 7000)
        if (!codeRes.success) {
            return reply(
                '⚠️ *Bot is starting but pair code not detected yet.*\n\n' +
                'Check logs manually:\n*' + prefix + 'botlogs ' + dr.id + '*\n\n' +
                'Look for an 8-character code like *ABCD-1234*\nand enter it in WhatsApp → Linked Devices'
            )
        }
        await conn.sendMessage(chat, { react: { text: '🔑', key: m.key } })
        return reply(
            '╭══〘 *🔑 BERA AI PAIR CODE* 〙═⊷\n' +
            '┃\n' +
            '┃ Your code: *' + codeRes.code + '*\n' +
            '┃\n' +
            '┃ 📲 Steps to link:\n' +
            '┃  1. Open WhatsApp on your phone\n' +
            '┃  2. Tap ⋮ → Linked Devices\n' +
            '┃  3. Tap *Link with phone number*\n' +
            '┃  4. Enter: *' + codeRes.code + '*\n' +
            '┃\n' +
            '┃ 🆔 Deployment: ' + dr.id + '\n' +
            '┃ 📊 Status: ' + prefix + 'depinfo ' + dr.id + '\n' +
            '╰══════════════════⊷'
        )
    }


}

handle.before = async (m, { conn }) => {
    try {
        if (!m || m.isGroup || m.fromMe) return
        if (!global.db?.data?.pendingCreds) return
        const pending = global.db.data.pendingCreds[m.sender]
        if (!pending) return
        // Deliver immediately — this is a reply so it always works
        await conn.sendMessage(m.chat, { text: pending.msg })
        // Remove from store after delivery
        delete global.db.data.pendingCreds[m.sender]
        await global.db.write().catch(() => {})
        console.log('[CREDS] ✅ Pending creds delivered to', m.sender)
    } catch (e) {
        console.error('[CREDS BEFORE]', e.message)
    }
}

handle.command = [
    'ptlist', 'servers', 'listservers', 'myservers',
    'ptstatus', 'ptstart', 'ptstop', 'ptrestart', 'ptkill',
    'ptcmd', 'ptcommand', 'ptfiles', 'ptread', 'ptcat', 'ptwrite',
    'ptcreate', 'pcreate', 'create',
    'ptaddserver', 'ptadmin', 'ptreset', 'ptcreds', 'ptdelete',
    'ptusers', 'listusers', 'ptdeluser', 'deleteuser', 'deluser',
    'ptpromote', 'ptdemote', 'ptpurgeusers',
    'ptallservers', 'ptdelserver', 'deleteserver', 'delserver',
    'ptsuspend', 'ptunsuspend', 'ptnodes',
    'ptall', 'pthelp', 'ptdmtest'
,
    'deploy','bhd','botdeploy','newdeploy',
    'deployments','mybots','listdeploy','bhdlist','mydeployments',
    'startbot','bhstart','depstart',
    'stopbot','bhstop','depstop',
    'deletedeploy','deldeploy','bhdel','removedeploy',
    'botlogs','bhlogs','deplogs','logbot',
    'botmetrics','botstats','bhmetrics','depmetrics','depstats',
    'depinfo','bhinfo','deployinfo','botinfo',
    'updateenv','setenv','bhenv','depenv',
    'coins','bhcoins','mycoins','balance',
    'claimcoins','dailycoins','claim','bhclaim',
    'redeem','voucher','bhredeem',
    'plans','bhplans','hostingplans','pricelist',
    'mpesa','pay','bhpay','bhmoney','stk',
    'paystatus','checkpay','paycheck',
    'payhistory','payments','bhpayments','mypayments',
    'bots','bhbots','botlist','availablebots',
    'transactions','coinhistory','bhhistory','cointx',
    'setbhkey','bhkey','setberakey','bhsetkey',
    'bhhelp','deployhelp','berahost',
    'deploybera','beradeploy','bhbera','deployai','depbera'
]
handle.tags = ['pterodactyl']

module.exports = handle
