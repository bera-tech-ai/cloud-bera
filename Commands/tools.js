'use strict'
const https = require('https')

const handle = async (ctx) => {
    const { conn, command, args, text, reply, prefix, isOwner, m } = ctx
    const sender = m.sender?.replace(/:[0-9]+@/, '@') || m.chat

    // ── URL Shortener ─────────────────────────────────────────────────────────
    if (['shorten','short','shortenurl','tinyurl'].includes(command)) {
        const url = text?.trim()
        if (!url || !url.startsWith('http'))
            return reply(`❓ *Usage:* ${prefix}shorten <url>\n_Example: ${prefix}shorten https://google.com_`)
        try {
            const short = await new Promise((resolve, reject) => {
                const req = https.get(
                    `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`,
                    res => {
                        let d = ''
                        res.on('data', c => d += c)
                        res.on('end', () => resolve(d.trim()))
                    }
                )
                req.on('error', reject)
                req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')) })
            })
            if (!short.startsWith('http')) throw new Error('Unexpected response')
            return reply(`🔗 *Shortened URL*\n\n📎 Original:\n${url}\n\n✂️ Short:\n${short}`)
        } catch (e) {
            return reply(`❌ Couldn't shorten URL: ${e.message}`)
        }
    }

    // ── Password Generator ────────────────────────────────────────────────────
    if (['password','genpass','passgen','genpassword'].includes(command)) {
        const len = Math.min(Math.max(parseInt(args[0]) || 16, 4), 128)
        const upper  = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
        const lower  = 'abcdefghjkmnpqrstuvwxyz'
        const digits = '23456789'
        const syms   = '!@#$%^&*()-_=+'
        const all    = upper + lower + digits + syms
        // Guarantee at least one of each class
        let pass = [
            upper[Math.floor(Math.random() * upper.length)],
            lower[Math.floor(Math.random() * lower.length)],
            digits[Math.floor(Math.random() * digits.length)],
            syms[Math.floor(Math.random() * syms.length)],
        ]
        for (let i = 4; i < len; i++) pass.push(all[Math.floor(Math.random() * all.length)])
        pass = pass.sort(() => Math.random() - 0.5).join('')
        const strength = len >= 20 ? '🟢 Strong' : len >= 12 ? '🟡 Medium' : '🔴 Weak'
        return reply(`🔑 *Password Generator*\n\n\`\`\`${pass}\`\`\`\n\n📏 Length: ${len} chars | ${strength}`)
    }

    // ── Site Monitor ──────────────────────────────────────────────────────────
    if (['monitor','sitewatch','watchsite'].includes(command)) {
        const { startMonitor, stopMonitor, pingURL } = require('../Library/lib/monitor')
        const db = global.db?.data
        if (!db.monitors) db.monitors = []
        const sub = (args[0] || 'list').toLowerCase()

        if (sub === 'list') {
            const mons = db.monitors
            if (!mons.length) return reply(`📡 No monitors set.\n\n_Add one: ${prefix}monitor add https://mysite.com_`)
            const lines = mons.map((mon, i) => {
                const st = global._monitors?.[mon.id]?.getStatus?.()
                const icon = st === true ? '🟢' : st === false ? '🔴' : '⏳'
                return `${i+1}. ${icon} *${mon.url}*\n   ID: \`${mon.id}\` | Every ${Math.round((mon.intervalMs||300000)/60000)}min | ${mon.active===false?'⏸️ paused':'▶️ active'}`
            })
            return reply(`📡 *Site Monitors (${mons.length})*\n\n${lines.join('\n\n')}\n\n_${prefix}monitor remove <id> to remove_`)
        }

        if (sub === 'add') {
            const url = args[1]?.trim()
            if (!url || !url.startsWith('http'))
                return reply(`❓ Usage: ${prefix}monitor add <url> [check_interval_minutes]\n_Example: ${prefix}monitor add https://mysite.com 5_`)
            const mins = Math.max(parseInt(args[2]) || 5, 1)
            const intervalMs = mins * 60 * 1000
            const id = `mon_${Date.now()}`
            db.monitors.push({ id, url, intervalMs, active: true, notifyJid: m.chat, addedAt: Date.now() })
            await global.db.write()
            startMonitor(id, url, m.chat, intervalMs)
            return reply(
                `✅ *Monitor Added!*\n\n` +
                `📡 URL: ${url}\n` +
                `⏱️ Check every: ${mins} minute(s)\n` +
                `🆔 ID: \`${id}\`\n\n` +
                `_I'll send you an alert when it goes down or comes back online._`
            )
        }

        if (sub === 'remove' || sub === 'delete') {
            const id = args[1]
            if (!id) return reply(`❓ Usage: ${prefix}monitor remove <id>`)
            const idx = db.monitors.findIndex(x => x.id === id)
            if (idx === -1) return reply(`❌ Monitor \`${id}\` not found.\n_Use ${prefix}monitor list to see IDs._`)
            db.monitors.splice(idx, 1)
            await global.db.write()
            stopMonitor(id)
            return reply(`🗑️ Monitor \`${id}\` removed.`)
        }

        if (sub === 'pause' || sub === 'stop') {
            const id = args[1]
            if (!id) return reply(`❓ Usage: ${prefix}monitor pause <id>`)
            const mon = db.monitors.find(x => x.id === id)
            if (!mon) return reply(`❌ Monitor not found.`)
            mon.active = false
            await global.db.write()
            stopMonitor(id)
            return reply(`⏸️ Monitor \`${id}\` paused.`)
        }

        if (sub === 'resume' || sub === 'start') {
            const id = args[1]
            if (!id) return reply(`❓ Usage: ${prefix}monitor resume <id>`)
            const mon = db.monitors.find(x => x.id === id)
            if (!mon) return reply(`❌ Monitor not found.`)
            mon.active = true
            await global.db.write()
            startMonitor(id, mon.url, mon.notifyJid, mon.intervalMs)
            return reply(`▶️ Monitor \`${id}\` resumed.`)
        }

        if (sub === 'check') {
            const id = args[1]
            if (!id) return reply(`❓ Usage: ${prefix}monitor check <id>`)
            const mon = db.monitors.find(x => x.id === id)
            if (!mon) return reply(`❌ Monitor not found.`)
            await reply('⏳ Pinging...')
            const up = await pingURL(mon.url)
            return reply(`${up ? '🟢 ONLINE' : '🔴 OFFLINE'}: ${mon.url}`)
        }

        return reply(
            `📡 *Monitor Help*\n\n` +
            `• ${prefix}monitor list\n` +
            `• ${prefix}monitor add <url> [mins]\n` +
            `• ${prefix}monitor remove <id>\n` +
            `• ${prefix}monitor pause/resume <id>\n` +
            `• ${prefix}monitor check <id>`
        )
    }

    // ── Health Alerts ─────────────────────────────────────────────────────────
    if (['alert','setalert','healthalert'].includes(command)) {
        const db = global.db?.data
        if (!db.settings) db.settings = {}
        if (!db.settings.alerts) db.settings.alerts = {}
        const alerts = db.settings.alerts
        const sub = (args[0] || '').toLowerCase()

        if (!sub || sub === 'list' || sub === 'show') {
            const lines = ['cpu','ram','disk'].map(k =>
                alerts[k] ? `✅ *${k.toUpperCase()}*: alert when > ${alerts[k]}%` : `❌ *${k.toUpperCase()}*: not set`
            )
            return reply(
                `🔔 *Health Alert Thresholds*\n\n${lines.join('\n')}\n\n` +
                `_Example: ${prefix}alert cpu 80 — alert when CPU > 80%_\n` +
                `_Checks run every 10 minutes_`
            )
        }

        if (['cpu','ram','disk'].includes(sub)) {
            const pct = parseInt(args[1])
            if (!pct || pct < 1 || pct > 99)
                return reply(`❓ Usage: ${prefix}alert ${sub} <1-99>\n_Example: ${prefix}alert ${sub} 80_`)
            alerts[sub] = pct
            await global.db.write()
            return reply(`✅ *Alert set!*\nI'll notify you when *${sub.toUpperCase()}* exceeds *${pct}%*\n_Checks every 10 min_`)
        }

        if (sub === 'clear' || sub === 'remove') {
            const metric = args[1]?.toLowerCase()
            if (['cpu','ram','disk'].includes(metric)) {
                delete alerts[metric]
                await global.db.write()
                return reply(`🗑️ ${metric.toUpperCase()} alert cleared.`)
            }
            db.settings.alerts = {}
            await global.db.write()
            return reply('🗑️ All health alerts cleared.')
        }

        return reply(
            `🔔 *Alert Help*\n\n` +
            `• ${prefix}alert list — show thresholds\n` +
            `• ${prefix}alert cpu/ram/disk <1-99> — set threshold\n` +
            `• ${prefix}alert clear [cpu/ram/disk] — remove alert`
        )
    }

    // ── AI Model Switcher ─────────────────────────────────────────────────────
    if (['beramodel','switchmodel','aimodel','setmodel'].includes(command)) {
        const MODELS = ['mistral','deepseek','llama','unity','phi','openai','bidder','mireille','auto']
        const db = global.db?.data
        if (!db.settings) db.settings = {}

        if (!text?.trim() || args[0] === 'list') {
            const cur = db.settings.aiModel || 'auto'
            const lines = MODELS.map(mdl => `${mdl === cur ? '✅' : '▫️'} \`${mdl}\``)
            return reply(
                `🤖 *Available AI Models*\n\n${lines.join('\n')}\n\n` +
                `_Current: *${cur}*_\n\n` +
                `${prefix}beramodel <name> — switch\n` +
                `${prefix}beramodel auto — let Bera rotate automatically`
            )
        }

        const model = args[0]?.toLowerCase()
        if (!MODELS.includes(model))
            return reply(`❌ Unknown model: \`${model}\`\n\nAvailable: ${MODELS.join(', ')}`)
        db.settings.aiModel = model === 'auto' ? null : model
        await global.db.write()
        return reply(`✅ AI model switched to *${model}*${model === 'auto' ? ' (auto-rotation)' : ''}`)
    }

    // ── Custom System Prompt per user ─────────────────────────────────────────
    if (['mysys','myprompt','berasys','customsys','setprompt'].includes(command)) {
        const db = global.db?.data
        if (!db.users) db.users = {}
        if (!db.users[sender]) db.users[sender] = {}
        const user = db.users[sender]
        const sub = args[0]?.toLowerCase()

        if (sub === 'set') {
            const prompt = text.replace(/^set\s+/i, '').trim()
            if (!prompt)
                return reply(
                    `❓ Usage: ${prefix}mysys set <your custom persona>\n\n` +
                    `_Example: ${prefix}mysys set You are a helpful Swahili-speaking coding tutor_`
                )
            user.systemPrompt = prompt
            await global.db.write()
            return reply(
                `✅ *Custom persona set!*\n\nBera will use this style when chatting with you:\n\n` +
                `_"${prompt.slice(0, 120)}${prompt.length > 120 ? '...' : ''}"_`
            )
        }

        if (sub === 'show' || sub === 'get') {
            return reply(
                user.systemPrompt
                    ? `📝 *Your Persona*\n\n_${user.systemPrompt}_`
                    : `_No custom persona set. Use ${prefix}mysys set <prompt>_`
            )
        }

        if (sub === 'clear' || sub === 'reset') {
            delete user.systemPrompt
            await global.db.write()
            return reply('🗑️ Custom persona cleared. Using default Bera personality.')
        }

        return reply(
            `🧠 *Custom System Prompt*\n\n` +
            `• ${prefix}mysys set <persona> — set AI style\n` +
            `• ${prefix}mysys show — view your persona\n` +
            `• ${prefix}mysys clear — reset to default\n\n` +
            `_Example: ${prefix}mysys set You are a witty DevOps engineer who always includes code examples_`
        )
    }

    // ── Intent Debugger ───────────────────────────────────────────────────────
    if (['debug','beradebug','intentdebug'].includes(command)) {
        const { detectIntent } = require('../Library/router')
        const testText = text?.trim() || 'hello world'
        const intent = detectIntent(testText)
        const last = global._lastAIDebug?.[sender]
        return reply(
            `🔍 *Intent Debug*\n\n` +
            `📝 Input: _"${testText}"_\n` +
            `🎯 Detected intent: *${intent}*\n\n` +
            (last
                ? `📬 *Last AI call:*\n` +
                  `Input: _"${(last.input || '').slice(0, 80)}"_\n` +
                  `Model: ${last.model || 'auto'}\n` +
                  `Reply: _"${(last.output || '').slice(0, 150)}..."_`
                : `_No recent AI call recorded yet_`)
        )
    }

    // ── GitHub Webhook Relay ──────────────────────────────────────────────────
    if (['ghwebhook','githubwebhook','webhookrelay'].includes(command)) {
        if (!isOwner) return reply('❌ Owner only.')
        const db = global.db?.data
        if (!db.settings) db.settings = {}
        const sub = (args[0] || 'status').toLowerCase()

        if (sub === 'on' || sub === 'enable') {
            db.settings.ghWebhook = { enabled: true, chat: m.chat, createdAt: Date.now() }
            await global.db.write()
            return reply(
                `✅ *GitHub Webhook Relay ON*\n\n` +
                `📬 GitHub events will be forwarded to this chat.\n\n` +
                `*Setup on GitHub:*\n` +
                `1. Repo → Settings → Webhooks → Add webhook\n` +
                `2. Payload URL: the URL where your bot is hosted + \`/webhook/github\`\n` +
                `3. Content type: \`application/json\`\n` +
                `4. Pick events: Push, Pull requests, Issues\n\n` +
                `_Events: push, PR opened/merged, issues, releases will all be forwarded here._`
            )
        }

        if (sub === 'off' || sub === 'disable') {
            if (db.settings.ghWebhook) db.settings.ghWebhook.enabled = false
            await global.db.write()
            return reply('⏹️ GitHub webhook relay disabled.')
        }

        const cur = db.settings.ghWebhook
        return reply(
            `🐙 *GitHub Webhook Relay*\n\n` +
            `Status: ${cur?.enabled ? '✅ Active' : '❌ Inactive'}\n` +
            (cur?.enabled ? `Chat: ${cur.chat}\n` : '') +
            `\n• ${prefix}ghwebhook on — enable\n` +
            `• ${prefix}ghwebhook off — disable`
        )
    }
}

handle.command = [
    'shorten','short','shortenurl','tinyurl',
    'password','genpass','passgen','genpassword',
    'monitor','sitewatch','watchsite',
    'alert','setalert','healthalert',
    'beramodel','switchmodel','aimodel','setmodel',
    'mysys','myprompt','berasys','customsys','setprompt',
    'debug','beradebug','intentdebug',
    'ghwebhook','githubwebhook','webhookrelay',
]
handle.tags = ['tools']
module.exports = handle
