const axios = require('axios')

const BH_BASE = 'https://bera-host-bot--berahost15.replit.app/api'
const PTERO_BASE = process.env.PTERODACTYL_URL || 'https://panel.berahost.com'

const react = (conn, m, emoji) =>
    conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } }).catch(() => {})

const getBhKey = () => global.db?.data?.settings?.bhApiKey || null
const getPtKey = () => process.env.PTERODACTYL_API_KEY || global.db?.data?.settings?.ptApiKey || null

const bhApi = async (method, path, data = null) => {
    const key = getBhKey()
    if (!key) return { error: 'No BeraHost API key set. Use .setbhkey <key>' }
    try {
        const cfg = {
            method, url: `${BH_BASE}${path}`,
            headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
            timeout: 20000
        }
        if (data) cfg.data = data
        const r = await axios(cfg)
        return r.data
    } catch (e) {
        return { error: e.response?.data?.message || e.message }
    }
}

const ptApi = async (method, path, data = null) => {
    const key = getPtKey()
    if (!key) return { error: 'No Pterodactyl API key set.' }
    try {
        const cfg = {
            method,
            url: `${PTERO_BASE}/api/client${path}`,
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: 20000
        }
        if (data) cfg.data = data
        const r = await axios(cfg)
        return r.data
    } catch (e) {
        return { error: e.response?.data?.errors?.[0]?.detail || e.message }
    }
}

const fmtBytes = (b) => {
    if (!b && b !== 0) return 'N/A'
    if (b < 1024) return b + ' B'
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'
    return (b / 1048576).toFixed(1) + ' MB'
}

const handle = async (m, { conn, command, args, reply, prefix, text, isOwner, isAdmin }) => {

    // ── .berahost / .bh ─────────────────────────────────────────────────────
    if (command === 'berahost' || command === 'bh') {
        const sub = args[0]?.toLowerCase() || 'help'

        // Help / no args
        if (sub === 'help' || sub === '--help') {
            return reply(
`🖥️ *BeraHost Dashboard*
──────────────────────────
❍ *.bh bots* — List all deployed bots
❍ *.bh status <id>* — Bot status
❍ *.bh start <id>* — Start a bot
❍ *.bh stop <id>* — Stop a bot
❍ *.bh restart <id>* — Restart a bot
❍ *.bh logs <id>* — Last 50 log lines
❍ *.bh deploy <url>* — Deploy from GitHub
❍ *.bh env <id> KEY=VAL* — Set env variable
❍ *.bh domain add <domain>* — Add custom domain
❍ *.bh promote <from> <to>* — Promote environment
❍ *.bh delete <id>* — Delete a bot

📌 Set your key: *.setbhkey <api-key>*`)
        }

        // LIST BOTS
        if (sub === 'bots' || sub === 'list') {
            await react(conn, m, '⏳')
            const r = await bhApi('GET', '/bots')
            if (r.error) {
                await react(conn, m, '❌')
                return reply(`❌ ${r.error}`)
            }
            const bots = r.bots || r.data || r
            if (!Array.isArray(bots) || !bots.length) {
                await react(conn, m, '✅')
                return reply('📭 No bots deployed yet.')
            }
            await react(conn, m, '✅')
            const lines = bots.map(b => {
                const st = b.status === 'running' ? '🟢' : b.status === 'stopped' ? '🔴' : '🟡'
                return `${st} *${b.name || b.id}* (${b.id})\n   CPU: ${b.cpu || 'N/A'} | RAM: ${fmtBytes(b.memory)} | ${b.status || 'unknown'}`
            })
            return reply(`🖥️ *BeraHost Bots* (${bots.length})\n${'─'.repeat(30)}\n\n${lines.join('\n\n')}`)
        }

        // STATUS
        if (sub === 'status') {
            const id = args[1]
            if (!id) return reply(`Usage: *.bh status <bot-id>*`)
            await react(conn, m, '⏳')
            const r = await bhApi('GET', `/bots/${id}`)
            if (r.error) { await react(conn, m, '❌'); return reply(`❌ ${r.error}`) }
            await react(conn, m, '✅')
            const b = r.bot || r
            const st = b.status === 'running' ? '🟢 Running' : b.status === 'stopped' ? '🔴 Stopped' : `🟡 ${b.status}`
            return reply(`🖥️ *${b.name || id}*\n${'─'.repeat(28)}\n📌 ID: ${b.id || id}\n⚡ Status: ${st}\n🔗 URL: ${b.url || 'N/A'}\n💾 RAM: ${fmtBytes(b.memory)}\n🖥️ CPU: ${b.cpu || 'N/A'}\n📅 Created: ${b.created_at || 'N/A'}`)
        }

        // START
        if (sub === 'start') {
            if (!(isOwner || isAdmin)) return reply('❌ Owner/admin only.')
            const id = args[1]; if (!id) return reply(`Usage: *.bh start <id>*`)
            await react(conn, m, '⏳')
            const r = await bhApi('POST', `/bots/${id}/start`)
            if (r.error) { await react(conn, m, '❌'); return reply(`❌ ${r.error}`) }
            await react(conn, m, '✅')
            return reply(`✅ Bot *${id}* started.`)
        }

        // STOP
        if (sub === 'stop') {
            if (!(isOwner || isAdmin)) return reply('❌ Owner/admin only.')
            const id = args[1]; if (!id) return reply(`Usage: *.bh stop <id>*`)
            await react(conn, m, '⏳')
            const r = await bhApi('POST', `/bots/${id}/stop`)
            if (r.error) { await react(conn, m, '❌'); return reply(`❌ ${r.error}`) }
            await react(conn, m, '✅')
            return reply(`🛑 Bot *${id}* stopped.`)
        }

        // RESTART
        if (sub === 'restart') {
            if (!(isOwner || isAdmin)) return reply('❌ Owner/admin only.')
            const id = args[1]; if (!id) return reply(`Usage: *.bh restart <id>*`)
            await react(conn, m, '⏳')
            const r = await bhApi('POST', `/bots/${id}/restart`)
            if (r.error) { await react(conn, m, '❌'); return reply(`❌ ${r.error}`) }
            await react(conn, m, '✅')
            return reply(`🔄 Bot *${id}* restarted.`)
        }

        // LOGS
        if (sub === 'logs') {
            const id = args[1]; if (!id) return reply(`Usage: *.bh logs <bot-id>*`)
            await react(conn, m, '⏳')
            const r = await bhApi('GET', `/bots/${id}/logs`)
            if (r.error) { await react(conn, m, '❌'); return reply(`❌ ${r.error}`) }
            await react(conn, m, '✅')
            const logs = r.logs || r.data || r
            const logStr = Array.isArray(logs) ? logs.slice(-50).join('\n') :
                String(logs).split('\n').slice(-50).join('\n')
            const trimmed = logStr.slice(-3500)
            return reply(`📋 *Logs: ${id}*\n${'─'.repeat(28)}\n\`\`\`\n${trimmed || 'No logs.'}\n\`\`\``)
        }

        // DEPLOY
        if (sub === 'deploy') {
            if (!(isOwner || isAdmin)) return reply('❌ Owner/admin only.')
            const url = args[1]
            if (!url || !url.startsWith('http')) return reply(`Usage: *.bh deploy <github-url>*`)
            await react(conn, m, '⏳')
            const r = await bhApi('POST', '/bots/deploy', { repoUrl: url })
            if (r.error) { await react(conn, m, '❌'); return reply(`❌ ${r.error}`) }
            await react(conn, m, '✅')
            const b = r.bot || r
            return reply(`🚀 *Deployed!*\n📌 ID: ${b.id || 'N/A'}\n🔗 URL: ${b.url || 'N/A'}\n⚡ Status: ${b.status || 'starting'}`)
        }

        // ENV
        if (sub === 'env') {
            if (!(isOwner || isAdmin)) return reply('❌ Owner/admin only.')
            const id = args[1]; const kv = args.slice(2).join(' ')
            if (!id || !kv) return reply(`Usage: *.bh env <id> KEY=VALUE*`)
            const [k, ...vp] = kv.split('='); const v = vp.join('=')
            if (!k || v === undefined) return reply('❌ Format: KEY=VALUE')
            await react(conn, m, '⏳')
            const r = await bhApi('POST', `/bots/${id}/env`, { key: k.trim(), value: v })
            if (r.error) { await react(conn, m, '❌'); return reply(`❌ ${r.error}`) }
            await react(conn, m, '✅')
            return reply(`✅ Env var *${k.trim()}* set for bot *${id}*.`)
        }

        // DOMAIN
        if (sub === 'domain') {
            if (!(isOwner || isAdmin)) return reply('❌ Owner/admin only.')
            const action = args[1]; const domain = args[2]
            if (action === 'add') {
                if (!domain) return reply(`Usage: *.bh domain add <domain>*`)
                await react(conn, m, '⏳')
                const r = await bhApi('POST', '/domains', { domain })
                if (r.error) { await react(conn, m, '❌'); return reply(`❌ ${r.error}`) }
                await react(conn, m, '✅')
                return reply(`✅ Domain *${domain}* added.`)
            }
            return reply(`Usage: *.bh domain add <domain>*`)
        }

        // PROMOTE
        if (sub === 'promote') {
            if (!(isOwner || isAdmin)) return reply('❌ Owner/admin only.')
            const from = args[1]; const to = args[2]
            if (!from || !to) return reply(`Usage: *.bh promote <from-id> <to-id>*`)
            await react(conn, m, '⏳')
            const r = await bhApi('POST', '/bots/promote', { from, to })
            if (r.error) { await react(conn, m, '❌'); return reply(`❌ ${r.error}`) }
            await react(conn, m, '✅')
            return reply(`✅ Promoted *${from}* → *${to}* successfully.`)
        }

        // DELETE
        if (sub === 'delete') {
            if (!isOwner) return reply('❌ Owner only.')
            const id = args[1]; if (!id) return reply(`Usage: *.bh delete <id>*`)
            await react(conn, m, '⏳')
            const r = await bhApi('DELETE', `/bots/${id}`)
            if (r.error) { await react(conn, m, '❌'); return reply(`❌ ${r.error}`) }
            await react(conn, m, '✅')
            return reply(`🗑️ Bot *${id}* deleted.`)
        }

        return reply(`❓ Unknown subcommand. Type *.bh help* to see available commands.`)
    }

    // ── PTERODACTYL COMMANDS ─────────────────────────────────────────────────
    if (command === 'ptlist') {
        await react(conn, m, '⏳')
        const r = await ptApi('GET', '/servers')
        if (r.error) { await react(conn, m, '❌'); return reply(`❌ ${r.error}`) }
        const servers = r.data || []
        if (!servers.length) { await react(conn, m, '✅'); return reply('📭 No servers found.') }
        await react(conn, m, '✅')
        const lines = servers.slice(0, 10).map(s => {
            const a = s.attributes || s
            const st = a.status === 'running' ? '🟢' : '🔴'
            return `${st} *${a.name}* [${a.identifier}]\n   RAM: ${fmtBytes((a.limits?.memory || 0) * 1048576)} | CPU: ${a.limits?.cpu || 0}%`
        })
        return reply(`🖥️ *Pterodactyl Servers*\n${'─'.repeat(28)}\n\n${lines.join('\n\n')}`)
    }

    if (command === 'ptstatus') {
        const id = args[0]; if (!id) return reply(`Usage: *.ptstatus <server-id>*`)
        await react(conn, m, '⏳')
        const r = await ptApi('GET', `/servers/${id}/resources`)
        if (r.error) { await react(conn, m, '❌'); return reply(`❌ ${r.error}`) }
        await react(conn, m, '✅')
        const s = r.attributes || r
        const cpu = ((s.cpu_absolute || 0)).toFixed(1)
        const ram = fmtBytes(s.memory_bytes || 0)
        const disk = fmtBytes(s.disk_bytes || 0)
        const net = s.network || {}
        const stMap = { running: '🟢 Running', offline: '🔴 Offline', starting: '🟡 Starting', stopping: '🟠 Stopping' }
        return reply(`🖥️ *Server ${id}*\n${'─'.repeat(28)}\n⚡ Status: ${stMap[s.current_state] || s.current_state || 'Unknown'}\n🖥️ CPU: ${cpu}%\n💾 RAM: ${ram}\n💿 Disk: ${disk}\n📡 Net ↑: ${fmtBytes(net.rx_bytes)} / ↓: ${fmtBytes(net.tx_bytes)}`)
    }

    if (command === 'ptstart' || command === 'ptstop' || command === 'ptrestart') {
        if (!(isOwner || isAdmin)) return reply('❌ Owner/admin only.')
        const id = args[0]; if (!id) return reply(`Usage: *.${command} <server-id>*`)
        const signal = command === 'ptstart' ? 'start' : command === 'ptstop' ? 'kill' : 'restart'
        await react(conn, m, '⏳')
        const r = await ptApi('POST', `/servers/${id}/power`, { signal })
        if (r.error) { await react(conn, m, '❌'); return reply(`❌ ${r.error}`) }
        await react(conn, m, '✅')
        const labels = { start: 'started ✅', kill: 'stopped 🛑', restart: 'restarting 🔄' }
        return reply(`Server *${id}* ${labels[signal]}`)
    }

    if (command === 'ptcmd' || command === 'ptcommand') {
        if (!(isOwner || isAdmin)) return reply('❌ Owner/admin only.')
        const id = args[0]; const cmd = args.slice(1).join(' ')
        if (!id || !cmd) return reply(`Usage: *.ptcmd <server-id> <command>*`)
        await react(conn, m, '⏳')
        const r = await ptApi('POST', `/servers/${id}/command`, { command: cmd })
        if (r.error) { await react(conn, m, '❌'); return reply(`❌ ${r.error}`) }
        await react(conn, m, '✅')
        return reply(`✅ Command sent to server *${id}*: \`${cmd}\``)
    }

    // .ptwatch
    if (command === 'ptwatch') {
        if (!(isOwner || isAdmin)) return reply('❌ Owner/admin only.')
        const id = args[0]; if (!id) return reply(`Usage: *.ptwatch <server-id>*`)
        const db = global.db?.data
        if (!db.settings.ptWatchers) db.settings.ptWatchers = {}
        if (db.settings.ptWatchers[id]) return reply(`👁️ Already watching server *${id}*.`)
        db.settings.ptWatchers[id] = { chat: m.chat, lastStatus: null }
        await global.db.write().catch(() => {})
        // Start watcher interval
        const interval = setInterval(async () => {
            const r = await ptApi('GET', `/servers/${id}/resources`)
            if (r.error) return
            const status = r.attributes?.current_state
            const prev = global.db?.data?.settings?.ptWatchers?.[id]?.lastStatus
            if (prev && status !== prev) {
                const chatId = global.db?.data?.settings?.ptWatchers?.[id]?.chat
                const stMap = { offline: '🔴 went OFFLINE!', running: '🟢 is back ONLINE', starting: '🟡 is starting...' }
                await conn.sendMessage(chatId, { text: `⚠️ *Pterodactyl Alert*\nServer *${id}* ${stMap[status] || `status: ${status}`}` }).catch(() => {})
            }
            if (global.db?.data?.settings?.ptWatchers?.[id]) {
                global.db.data.settings.ptWatchers[id].lastStatus = status
                await global.db.write().catch(() => {})
            }
        }, 60000)
        // Store interval ref
        if (!global._ptWatchIntervals) global._ptWatchIntervals = {}
        global._ptWatchIntervals[id] = interval
        await react(conn, m, '✅')
        return reply(`👁️ Now watching server *${id}* — you'll be alerted on status changes.`)
    }

    if (command === 'ptunwatch') {
        const id = args[0]; if (!id) return reply(`Usage: *.ptunwatch <server-id>*`)
        if (global._ptWatchIntervals?.[id]) {
            clearInterval(global._ptWatchIntervals[id])
            delete global._ptWatchIntervals[id]
        }
        if (global.db?.data?.settings?.ptWatchers?.[id]) {
            delete global.db.data.settings.ptWatchers[id]
            await global.db.write().catch(() => {})
        }
        return reply(`🛑 Stopped watching server *${id}*.`)
    }
}

handle.command = [
    'berahost', 'bh',
    'ptlist', 'ptstatus', 'ptstart', 'ptstop', 'ptrestart', 'ptcmd', 'ptcommand',
    'ptwatch', 'ptunwatch'
]
handle.tags = ['admin', 'servers', 'hosting']

module.exports = handle
