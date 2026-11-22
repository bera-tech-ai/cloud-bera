const axios = require('axios')
const config = require('../Config')

// CORRECTED: matches index.js signature: async (m, ctx) where ctx contains all properties
const handle = async (m, ctx) => {
    // Destructure from ctx
    const { 
        conn, 
        command = '', 
        args = [], 
        text = '', 
        reply = (msg) => console.log('Reply:', msg),
        prefix = '.', 
        isOwner = false,
        chat = '',
        sender = ''
    } = ctx;
    
    // Early return if no message or conn
    if (!m || !conn) {
        console.log('berahost.js: Missing m or conn');
        return;
    }
    
    // ─── helpers ─────────────────────────────────────────────────────────────
    const db = global.db?.data
    const getBase = () => {
        const valid = value => value && !/\.replit\.app\/?$/i.test(String(value))
        const raw = (valid(db?.settings?.bhApiUrl) && db.settings.bhApiUrl) ||
            (valid(process.env.BERAHOST_API_URL) && process.env.BERAHOST_API_URL) ||
            (valid(process.env.BH_API_URL) && process.env.BH_API_URL) ||
            'https://berahost-cywge4uc.manus.space'
        return raw.replace(/\/api\/?$/, '').replace(/\/$/, '') + '/api'
    }
    const getKey = () => db?.settings?.bhApiKey || process.env.BH_API_KEY || process.env.BERAHOST_API_KEY || ''
    const bh = async (method, path, body, publicRead = false) => {
        const key = getKey()
        if (!key && !publicRead) throw new Error('No BeraHost API key set. Save a scoped key privately with: ' + prefix + 'bh setkey <key>')
        const res = await axios({
            method, url: getBase() + path,
            headers: { ...(key && !publicRead ? { 'x-api-key': key } : {}), 'Content-Type': 'application/json' },
            data: body, timeout: 20000
        })
        return res.data
    }

    const statusEmoji = s => ({ running:'🟢', stopped:'🔴', starting:'🟡', installing:'🔵', failed:'💀', error:'🔥' }[s] || '⚪')
    const fmtUptime = s => {
        if (!s) return 'n/a'
        const d = Math.floor(s/86400), h = Math.floor((s%86400)/3600), m2 = Math.floor((s%3600)/60)
        return d > 0 ? `${d}d ${h}h ${m2}m` : h > 0 ? `${h}h ${m2}m` : `${m2}m`
    }
    const fmtDate = d => d ? new Date(d).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', dateStyle:'short', timeStyle:'short' }) : 'n/a'

    // ─── .deploy ─────────────────────────────────────────────────────────────
    if (command === 'deploy') {
        if (!isOwner) return reply('❌ Owner only.')
        if (!args[0]) return reply(
            `*Deploy a bot on BeraHost*\n\n` +
            `*Usage:*\n` +
            `  \`${prefix}deploy <botname> <ownerNumber> [apiUrl]\`\n\n` +
            `*Examples:*\n` +
            `  \`${prefix}deploy beraai 254712345678\`\n` +
            `  \`${prefix}deploy atassa 254712345678 Gifted~yourSession\`\n\n` +
            `Use \`${prefix}bh bots\` to see available bots.`
        )

        let [botName, ownerNum, ...rest] = args
        let sessionId = null
        let apiUrlArg = null

        for (const r of rest) {
            if (r.startsWith('Gifted~') || r.startsWith('gifted~')) sessionId = r
            else if (r.startsWith('http')) apiUrlArg = r
        }
        if (apiUrlArg && db?.settings) {
            db.settings.bhApiUrl = apiUrlArg.replace(/\/api\/?$/, '').replace(/\/$/, '')
            await global.db.write()
        }

        await reply(`🔍 Looking up bot *${botName}*...`)
        let bots
        try { bots = await bh('get', '/bots', undefined, true) } catch (e) { return reply('❌ ' + e.message) }
        bots = bots.bots || bots

        const bot = bots.find(b =>
            b.name.toLowerCase().replace(/[\s\-_]/g, '').includes(botName.toLowerCase().replace(/[\s\-_]/g, '')) ||
            String(b.id) === botName
        )
        if (!bot) {
            const names = bots.map(b => `• *${b.name}* (id:${b.id})`).join('\n')
            return reply(`❌ Bot *${botName}* not found.\n\nAvailable bots:\n${names}`)
        }

        const envVars = {}
        if (ownerNum) envVars['OWNER_NUMBER'] = ownerNum
        if (sessionId) envVars['SESSION_ID'] = sessionId

        const required = Object.keys(bot.requiredVars || {})
        const missing = required.filter(k => !envVars[k])
        if (missing.length) {
            const hints = missing.map(k => `  • *${k}* — ${bot.requiredVars[k]}`).join('\n')
            return reply(`⚠️ Bot *${bot.name}* needs:\n${hints}\n\nProvide them as extra args after the number.`)
        }

        await reply(`🚀 Deploying *${bot.name}*...\n\n${Object.entries(envVars).map(([k,v])=>`• ${k}: \`${k==='SESSION_ID'?v.slice(0,12)+'…':v}\``).join('\n')}`)

        let dep
        try { dep = await bh('post', '/deployments', { botId: bot.id, envVars }) }
        catch (e) {
            const msg = e.response?.data?.error || e.response?.data?.message || e.message
            return reply('❌ Deploy failed: ' + msg)
        }

        const deployment = dep.deployment || dep
        const depId = deployment.id
        let latest = deployment
        let status = deployment.status
        let attempts = 0
        while (['queued', 'building', 'deploying', 'starting', 'installing'].includes(status) && attempts < 24) {
            await new Promise(r => setTimeout(r, 5000))
            attempts++
            try {
                const d = await bh('get', `/deployments/${depId}`)
                latest = d.deployment || d
                status = latest.status || 'unknown'
            } catch {}
        }

        return reply(
            `${statusEmoji(status)} *${bot.name} deployment*\n\n` +
            `🆔 Deployment ID: *${depId}*\n` +
            `📊 Status: *${status}*\n` +
            `${latest.url || latest.liveUrl ? `🌐 URL: ${latest.url || latest.liveUrl}\n` : ''}` +
            `\n*Useful commands:*\n` +
            `  \`${prefix}bh logs ${depId}\` — view logs\n` +
            `  \`${prefix}bh metrics ${depId}\` — CPU/RAM\n` +
            `  \`${prefix}bh stop ${depId}\` — stop bot\n` +
            `  \`${prefix}bh env ${depId} KEY=VAL\` — set env vars`
        )
    }

    // ─── .bh ─────────────────────────────────────────────────────────────────
    if (command === 'bh' || command === 'berahost') {
        if (!isOwner) return reply('❌ Owner only.')

        const sub = args[0]?.toLowerCase()

        // ── setkey ──
        if (sub === 'setkey') {
            if (!args[1]) return reply(`Usage: ${prefix}bh setkey <api_key>`)
            if (!db.settings) db.settings = {}
            db.settings.bhApiKey = args[1]
            await global.db.write()
            return reply('✅ BeraHost API key saved.')
        }

        // ── seturl ──
        if (sub === 'seturl') {
            if (!args[1]) return reply(`Usage: ${prefix}bh seturl <url>`)
            if (!db.settings) db.settings = {}
            db.settings.bhApiUrl = args[1].replace(/\/api\/?$/, '').replace(/\/$/, '')
            await global.db.write()
            return reply('✅ BeraHost API URL saved: ' + db.settings.bhApiUrl)
        }

        // ── coins balance ──
        if (['coins', 'balance', 'claim', 'txns', 'transactions'].includes(sub))
            return reply('ℹ️ Coin balance, daily-claim, and transaction endpoints are not in the current BeraHost API documentation.')

        // ── plans ──
        if (sub === 'plans') {
            let p, s
            try { [p, s] = await Promise.all([bh('get', '/payments/plans', undefined, true), bh('get', '/subscriptions/plans', undefined, true)]) }
            catch (e) { return reply('❌ ' + (e.response?.data?.error || e.message)) }
            return reply(`💳 *BeraHost Plans*\n\n*Payments:*\n${JSON.stringify(p, null, 2).slice(0, 800)}\n\n*Subscriptions:*\n${JSON.stringify(s, null, 2).slice(0, 1200)}`)
        }

        // ── pay ──
        if (sub === 'pay') {
            return reply(`The current API uses PayHero checkout; the legacy /payments/initiate route is unsupported. Use: ${prefix}bh api payments.subscribe <JSON payload> (the API requires the documented checkout fields).`)
        }

        // ── paystatus ──
        if (sub === 'paystatus') {
            if (!args[1]) return reply(`Usage: ${prefix}bh paystatus <paymentId>`)
            let r
            try { r = await bh('get', `/payments/status/${encodeURIComponent(args[1])}`) } catch (e) { return reply('❌ ' + e.message) }
            const icon = r.status === 'completed' ? '✅' : r.status === 'pending' ? '⏳' : '❌'
            return reply(`${icon} *Payment ${r.id || args[1]}*\n\nStatus: *${r.status}*\nAmount: ${r.amount ?? 'N/A'}\n${r.status === 'completed' ? 'Payment completed.' : ''}`)
        }

        if (sub === 'subscription') {
            let r
            try { r = await bh('get', '/subscriptions/status') } catch (e) { return reply('❌ ' + (e.response?.data?.error || e.message)) }
            return reply(`📦 *Subscription status*\n\n${JSON.stringify(r, null, 2).slice(0, 1800)}`)
        }
        if (sub === 'payhistory') {
            let r
            try { r = await bh('get', '/payments/history') } catch (e) { return reply('❌ ' + (e.response?.data?.error || e.message)) }
            return reply(`💳 *Payment history*\n\n${JSON.stringify(r, null, 2).slice(0, 1800)}`)
        }

        // ── bots (available templates) ──
        if (sub === 'bots') {
            let bots
            try { bots = await bh('get', '/bots', undefined, true) } catch (e) { return reply('❌ ' + e.message) }
            bots = bots.bots || bots
            if (!bots.length) return reply('📭 No bots available.')
            const lines = bots.map(b => {
                const req = Object.keys(b.requiredVars || {}).join(', ')
                const cost = b.deployCost ? `💰 ${b.deployCost} coins` : '💰 free'
                return `*[${b.id}] ${b.name}* ${b.isFeatured ? '⭐' : ''}\n  ${cost} · Needs: \`${req || 'none'}\`\n  _${(b.description || '').slice(0, 80)}..._`
            })
            return reply(
                `🤖 *Available Bots on BeraHost*\n\n${lines.join('\n\n')}\n\n` +
                `_Deploy: \`${prefix}deploy <botname> <ownerNumber>\`_`
            )
        }

        // ── list / dashboard (my deployments) ──
        if (!sub || sub === 'list' || sub === 'dashboard') {
            let deps
            try { deps = await bh('get', '/deployments') }
            catch (e) { return reply('❌ ' + e.message) }
            deps = deps.deployments || deps

            if (!deps || !deps.length) return reply(
                `📭 *No deployments yet.*\n\nDeploy your first bot:\n\`${prefix}deploy beraai 254712345678\``
            )

            const lines = deps.map(d =>
                `${statusEmoji(d.status)} *${d.bot?.name || 'Bot #' + d.botId}* — ID: \`${d.id}\`\n` +
                `  Status: *${d.status}* · Last active: ${fmtDate(d.lastActive)}\n` +
                `  Storage: ${d.storageUsedMb || 0}/${d.storageLimitMb || 100} MB`
            )

            return reply(
                `🖥️ *BeraHost Dashboard*\n\n` +
                `🤖 Bots: *${deps.length}*\n\n` +
                lines.join('\n\n') +
                `\n\n_\`${prefix}bh status <id>\` · \`${prefix}bh logs <id>\` · \`${prefix}bh subscription\`_`
            )
        }

        // ── status <id> ──
        if (sub === 'status') {
            if (!args[1]) return reply(`Usage: ${prefix}bh status <deploymentId>`)
            let [dep, met] = [null, null]
            try {
                [dep, met] = await Promise.all([
                    bh('get', `/deployments/${args[1]}`),
                    bh('get', `/deployments/${args[1]}/metrics`).catch(() => null)
                ])
            } catch (e) { return reply('❌ ' + (e.response?.data?.error || e.message)) }

            const env = Object.entries(dep.envVars || {}).map(([k, v]) =>
                `  • ${k}: \`${k.toLowerCase().includes('session') ? v.slice(0, 12) + '…' : v}\``
            ).join('\n') || '  (none)'

            return reply(
                `${statusEmoji(dep.status)} *${dep.bot?.name || 'Deployment #' + dep.id}*\n\n` +
                `🆔 ID: \`${dep.id}\`\n` +
                `📊 Status: *${dep.status}*\n` +
                `📅 Created: ${fmtDate(dep.createdAt)}\n` +
                `⏰ Last active: ${fmtDate(dep.lastActive)}\n` +
                `💾 Storage: ${dep.storageUsedMb || 0}/${dep.storageLimitMb || 100} MB\n` +
                (met ? `\n📈 *Metrics:*\n  CPU: ${met.cpu || 0}% · RAM: ${met.memMb || met.memory || 0} MB\n  Threads: ${met.threads || 1} · Uptime: ${fmtUptime(met.uptime)}\n  Logs/hr: ${met.logsLastHour || 0}` : '') +
                `\n\n🔧 *Env Vars:*\n${env}\n\n` +
                `_\`${prefix}bh logs ${dep.id}\` · \`${prefix}bh stop ${dep.id}\` · \`${prefix}bh env ${dep.id} KEY=VAL\`_`
            )
        }

        // ── metrics <id> ──
        if (sub === 'metrics') {
            if (!args[1]) return reply(`Usage: ${prefix}bh metrics <deploymentId>`)
            let met
            try { met = await bh('get', `/deployments/${args[1]}/metrics`) } catch (e) { return reply('❌ ' + (e.response?.data?.error || e.message)) }
            return reply(
                `📈 *Metrics — Deployment #${args[1]}*\n\n` +
                `🟢 Status: *${met.status}*\n` +
                `🖥️ CPU: *${met.cpu || 0}%*\n` +
                `🧠 RAM: *${met.memMb || met.memory || 0} MB*\n` +
                `🔀 Threads: *${met.threads || 1}*\n` +
                `⏱️ Uptime: *${fmtUptime(met.uptime)}*\n` +
                `📋 Logs/hr: *${met.logsLastHour || 0}*`
            )
        }

        // ── logs <id> [n] ──
        if (sub === 'logs') {
            if (!args[1]) return reply(`Usage: ${prefix}bh logs <deploymentId> [lines]`)
            let logs
            try { logs = await bh('get', `/deployments/${args[1]}/logs`) } catch (e) { return reply('❌ ' + (e.response?.data?.error || e.message)) }
            const n = parseInt(args[2]) || 20
            const lines = (Array.isArray(logs) ? logs : logs.logs || []).slice(-n)
            if (!lines.length) return reply('📭 No logs found.')
            const out = lines.map(l => `[${l.logType === 'stderr' ? '⚠️' : '📝'} ${new Date(l.createdAt || Date.now()).toLocaleTimeString('en-KE')}] ${(l.logLine || l.message || l).slice(0, 200)}`).join('\n')
            return reply(`📋 *Logs — Deployment #${args[1]}* (last ${lines.length})\n\n\`\`\`\n${out.slice(0, 3000)}\n\`\`\``)
        }

        // ── start <id> ──
        if (sub === 'start') {
            if (!args[1]) return reply(`Usage: ${prefix}bh start <deploymentId>`)
            try { await bh('post', `/deployments/${args[1]}/start`) }
            catch (e) { return reply('❌ ' + (e.response?.data?.error || e.message)) }
            return reply(`🟢 Deployment *#${args[1]}* starting...\n_Check: \`${prefix}bh status ${args[1]}\`_`)
        }

        // ── stop <id> ──
        if (sub === 'stop') {
            if (!args[1]) return reply(`Usage: ${prefix}bh stop <deploymentId>`)
            try { await bh('post', `/deployments/${args[1]}/stop`) }
            catch (e) { return reply('❌ ' + (e.response?.data?.error || e.message)) }
            return reply(`🔴 Deployment *#${args[1]}* stopped.`)
        }

        // ── restart <id> ──
        if (sub === 'restart') {
            if (!args[1]) return reply(`Usage: ${prefix}bh restart <deploymentId>`)
            try {
                await bh('post', `/deployments/${args[1]}/stop`)
                await new Promise(r => setTimeout(r, 2000))
                await bh('post', `/deployments/${args[1]}/start`)
            } catch (e) { return reply('❌ ' + (e.response?.data?.error || e.message)) }
            return reply(`🔄 Deployment *#${args[1]}* restarted.\n_Check: \`${prefix}bh status ${args[1]}\`_`)
        }

        // ── env <id> KEY=VAL [KEY2=VAL2 ...] ──
        if (sub === 'env') {
            if (!args[1] || !args[2]) return reply(
                `Usage: ${prefix}bh env <id> KEY=VAL [KEY2=VAL2]\n` +
                `Example: ${prefix}bh env 42 BOT_NAME=MyBot LANGUAGE=sw`
            )
            const envVars = {}
            args.slice(2).forEach(a => {
                const eq = a.indexOf('=')
                if (eq > 0) envVars[a.slice(0, eq)] = a.slice(eq + 1)
            })
            if (!Object.keys(envVars).length) return reply('❌ No valid KEY=VAL pairs found.')
            try { await bh('put', `/deployments/${args[1]}/env`, { envVars }) }
            catch (e) { return reply('❌ ' + (e.response?.data?.error || e.message)) }
            const pairs = Object.entries(envVars).map(([k, v]) => `  • ${k} = ${k.toLowerCase().includes('session') ? v.slice(0,12)+'…' : v}`).join('\n')
            return reply(`✅ Env vars updated on *#${args[1]}*:\n${pairs}\n\n_Restart to apply: \`${prefix}bh restart ${args[1]}\`_`)
        }

        // ── delete <id> ──
        if (sub === 'delete' || sub === 'del' || sub === 'remove') {
            if (!args[1]) return reply(`Usage: ${prefix}bh delete <deploymentId>`)
            try { await bh('delete', `/deployments/${args[1]}`) }
            catch (e) { return reply('❌ ' + (e.response?.data?.error || e.message)) }
            return reply(`🗑️ Deployment *#${args[1]}* deleted.`)
        }

        // ── documented customer API action via safe allowlist ──
        if (sub === 'api') {
            const action = args[1]
            if (!action) return reply(`Usage: ${prefix}bh api <documented-action> [JSON args]\nExample: ${prefix}bh api subscriptions.status`)
            if (action === 'apiKeys.create' && String(chat).endsWith('@g.us'))
                return reply('For security, create BeraHost API keys only in a private chat; the key is shown only once.')
            let payload = {}
            try { if (args.length > 2) payload = JSON.parse(args.slice(2).join(' ')) }
            catch { return reply('❌ API arguments must be valid JSON.') }
            const result = await require('../Library/actions/berahost').requestCustomerApi(action, payload)
            if (!result.success) return reply(`❌ ${result.error}`)
            return reply(`✅ ${action}\n\n${JSON.stringify(result.data, null, 2).slice(0, 2500)}`)
        }

        // ── help ──
        return reply(
            `🖥️ *BeraHost Commands*\n\n` +
            `*Deploy a new bot:*\n` +
            `  \`${prefix}deploy beraai 254712345678\`\n` +
            `  \`${prefix}deploy atassa 254712345678 Gifted~session\`\n\n` +
            `*Manage deployments:*\n` +
            `  \`${prefix}bh\` — dashboard (all bots + coins)\n` +
            `  \`${prefix}bh bots\` — available bot templates\n` +
            `  \`${prefix}bh status <id>\` — status + metrics\n` +
            `  \`${prefix}bh logs <id> [n]\` — last N log lines\n` +
            `  \`${prefix}bh metrics <id>\` — CPU, RAM, uptime\n` +
            `  \`${prefix}bh start <id>\` — start bot\n` +
            `  \`${prefix}bh stop <id>\` — stop bot\n` +
            `  \`${prefix}bh restart <id>\` — restart bot\n` +
            `  \`${prefix}bh env <id> KEY=VAL\` — update env vars\n` +
            `  \`${prefix}bh delete <id>\` — delete deployment\n\n` +
            `*Plans & payments:*\n` +
            `  \`${prefix}bh plans\` — public plans\n` +
            `  \`${prefix}bh subscription\` — subscription status\n` +
            `  \`${prefix}bh payhistory\` — payment history\n` +
            `  \`${prefix}bh paystatus <id>\` — payment status\n` +
            `  \`${prefix}bh api <action> [JSON args]\` — any documented allowlisted API action\n\n` +
            `*Setup:*\n` +
            `  \`${prefix}bh setkey <key>\` — save API key\n` +
            `  \`${prefix}bh seturl <url>\` — save API base URL`
        )
    }
}

handle.command = ['bh', 'berahost', 'deploy']
handle.tags = ['berahost']

module.exports = handle
