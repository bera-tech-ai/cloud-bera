const config = require('../Config')
const moment = require('moment-timezone')
const { makeSticker } = require('../Library/actions/sticker')

const handle = async (m, ctx) => {
    if (!ctx || typeof ctx !== 'object') {
        console.error('[general.js] Invalid context received:', ctx)
        return
    }
    const { conn, command, args, text, reply, prefix, isOwner, isAdmin } = ctx

    // ── ping ──────────────────────────────────────────────────────────────────
    if (command === 'ping') {
        const start = Date.now()
        await reply('...')
        return reply(`🏓 *Pong!* ${Date.now() - start}ms`)
    }

    // ── uptime ────────────────────────────────────────────────────────────────
    if (command === 'uptime') {
        const sec = process.uptime()
        const h = Math.floor(sec / 3600), mn = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60)
        return reply(`⏱️ *Uptime:* ${h}h ${mn}m ${s}s`)
    }

    // ── STATUS DASHBOARD ──────────────────────────────────────────────────────
    if (command === 'status' || command === 'dashboard' || command === 'botstat') {
        await reply('⏳ Fetching status...')
        try {
            const { richServerStats } = require('../Library/actions/beraai')
            const sys = await richServerStats()
            const crons = Object.entries(global._cronJobs || {})
            const monitors = Object.entries(global._monitors || {})
            const notes = Object.keys(global.db?.data?.notes || {})
            const mem = global.db?.data

            // BeraHost status
            let bhSection = '┃ ❌ Not connected (use ' + prefix + 'setbhkey)'
            let bhCoins = ''
            try {
                const bh = require('../Library/actions/berahost')
                const [deps, coins] = await Promise.all([bh.listDeployments(), bh.getCoins().catch(() => null)])
                const list = Array.isArray(deps) ? deps : (deps.deployments || [])
                if (list.length) {
                    bhSection = list.slice(0, 6).map(d =>
                        `┃ ${d.status === 'running' ? '🟢' : d.status === 'stopped' ? '🔴' : '🟡'} #${d.id} ${d.name || d.botName || ''} [${d.status}]`
                    ).join('\n')
                } else bhSection = '┃ ✅ Connected — no deployments yet'
                if (coins) bhCoins = `\n┃ 💰 Coins: ${coins.coins} | Streak: ${coins.streak} | Claim: ${coins.canClaimToday ? '✅' : '❌'}`
            } catch {}

            // PM2
            let pm2Section = '┃ none'
            try {
                const { pm2List } = require('../Library/actions/beraai')
                const procs = await pm2List()
                if (procs?.length) pm2Section = procs.slice(0, 5).map(p => `┃ ${p.status === 'online' ? '🟢' : '🔴'} ${p.name} (${p.cpu} CPU, ${p.memory})`).join('\n')
            } catch {}

            // Config status
            const bhKey = global.db?.data?.settings?.bhApiKey || process.env.BH_API_KEY
            const gitKey = global.db?.data?.settings?.gitToken || process.env.GIT_TOKEN
            const vercelKey = global.db?.data?.settings?.vercelToken || process.env.VERCEL_TOKEN
            const smtp = global.db?.data?.settings?.smtp

            const users = Object.keys(mem?.users || {}).length
            const premiums = Object.values(mem?.users || {}).filter(u => u.premium).length
            const isPrivate = mem?.settings?.mode === 'private'

            const lines = [
                '╭══〘 🤖 *BERA AI STATUS* 〙═⊷',
                `┃ ⏱️ Uptime: ${sys.uptime}`,
                `┃ 🧠 RAM: ${sys.memory.used} / ${sys.memory.total} (${sys.memory.pct})`,
                `┃ 💾 Disk: ${sys.disk.used} / ${sys.disk.total} (${sys.disk.pct})`,
                `┃ 📈 Load: ${sys.load}`,
                `┃ 🖥️ CPUs: ${sys.cpus}`,
                '┃',
                '┃ ━━━ 👥 BOT STATS ━━━',
                `┃ Users: ${users} | Premium: ${premiums}`,
                `┃ Mode: ${isPrivate ? '🔒 Private' : '🌐 Public'} | Prefix: ${prefix}`,
                '┃',
                '┃ ━━━ 🔑 INTEGRATIONS ━━━',
                `┃ BeraHost: ${bhKey ? '✅' : '❌'} | GitHub: ${gitKey ? '✅' : '❌'}`,
                `┃ Vercel: ${vercelKey ? '✅' : '❌'} | Email: ${smtp?.user ? '✅ ' + smtp.user : '❌'}`,
                '┃',
                '┃ ━━━ 🚀 BERAHOST BOTS ━━━',
                bhSection,
                bhCoins,
                '┃',
                '┃ ━━━ 🖥️ PM2 PROCESSES ━━━',
                pm2Section,
                '┃',
                `┃ ━━━ ⏰ CRON JOBS (${crons.length}) ━━━`,
                crons.length ? crons.map(([id, j]) => `┃ • ${id}: \`${j.schedule}\``).join('\n') : '┃ none',
                '┃',
                `┃ ━━━ 👁️ MONITORS (${monitors.length}) ━━━`,
                monitors.length ? monitors.map(([id, mon]) => `┃ • ${id}: ${mon.lastStatus === true ? '✅' : mon.lastStatus === false ? '🔴' : '⏳'}`).join('\n') : '┃ none',
                '┃',
                `┃ ━━━ 📝 NOTES (${notes.length}) ━━━`,
                notes.slice(0, 5).map(n => `┃ • ${n}`).join('\n') || '┃ none',
                '╰══════════════════⊷',
            ].filter(l => l !== undefined && l !== null)
            return reply(lines.join('\n'))
        } catch (e) { return reply('❌ Status error: ' + e.message) }
    }

    // ── info ──────────────────────────────────────────────────────────────────
    if (command === 'info') {
        try {
            const { richServerStats, pm2List } = require('../Library/actions/beraai')
            const [s, procs] = await Promise.all([richServerStats(), pm2List().catch(() => [])])
            const pm2Lines = procs?.length ? procs.map(p => `  ${p.status === 'online' ? '🟢' : '🔴'} ${p.name} (${p.memory}, ${p.cpu})`).join('\n') : '  none'
            return reply(
                `╭══〘 *🤖 BERA AI INFO* 〙═⊷\n` +
                `┃ 🧠 RAM: ${s.memory.used}/${s.memory.total} (${s.memory.pct})\n` +
                `┃ 💾 Disk: ${s.disk.used}/${s.disk.total} (${s.disk.pct})\n` +
                `┃ 📈 Load: ${s.load}\n` +
                `┃ ⏱️ Uptime: ${s.uptime}\n` +
                `┃ 🖥️ CPUs: ${s.cpus}\n` +
                `┃\n┃ *PM2 Processes:*\n${pm2Lines}\n` +
                `╰══════════════════⊷`
            )
        } catch { return reply(`*Bera AI v2.0* — Built by Bera Tech\nPrefix: ${prefix}`) }
    }

    // ── MENU ──────────────────────────────────────────────────────────────────
    if (['menu', 'help', 'start', 'commands'].includes(command)) {
        const time = moment().tz('Africa/Nairobi').format('HH:mm:ss')
        const date = moment().tz('Africa/Nairobi').format('dddd, DD MMM YYYY')
        const p = prefix
        const bhKey = global.db?.data?.settings?.bhApiKey || process.env.BH_API_KEY
        const gitKey = global.db?.data?.settings?.gitToken || process.env.GIT_TOKEN
        const smtp = global.db?.data?.settings?.smtp
        const isPrivate = global.db?.data?.settings?.mode === 'private'

        const menu = [
            '╭══〘 *🤖 BERA AI MENU* 〙═⊷',
            `┃❍ 🕐 ${time}  |  📅 ${date}`,
            `┃❍ ⚡ Prefix: *${p}* | Mode: ${isPrivate ? '🔒 Private' : '🌐 Public'}`,
            `┃❍ 🖥️ BeraHost: ${bhKey ? '✅' : `❌ use ${p}setbhkey`} | GitHub: ${gitKey ? '✅' : '❌'} | Email: ${smtp?.user ? '✅' : '❌'}`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🤖 *AGENT & AI*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}agent* <task> — Autonomous agent (55 tools)`,
            `┃❍ *${p}bera* <msg> — Chat with Bera AI`,
            `┃❍ *${p}chatbot* on/off — Auto AI replies`,
            `┃❍ *${p}beratrigger* <word> — Custom trigger`,
            `┃❍ *${p}tagreply* on/off — Reply when tagged`,
            `┃❍ *${p}remember* <key> <val> — Agent memory`,
            `┃❍ *${p}recall* <key> — Recall memory`,
            `┃❍ *${p}memories* — All saved memories`,
            `┃❍ *${p}forget* <key> — Delete memory`,
            `┃❍ *${p}berahistory* — Chat history`,
            `┃❍ *${p}berareset* — Clear history & memory`,
            `┃❍ *${p}cron* add/list/cancel — Schedule tasks`,
            `┃❍ *${p}apidocs* <folder> — Generate API docs`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 📡 *LIVE API FETCHING*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}agent* fetch https://api.example.com`,
            `┃❍ *${p}agent* POST https://api.com body: {"key":"val"}`,
            `┃❍ *${p}agent* check if https://mysite.com is up`,
            `┃❍ *${p}agent* scrape https://news.site.com`,
            `┃❍ *${p}agent* dns lookup google.com`,
            `┃❍ *${p}agent* whois example.com`,
            `┃❍ *${p}agent* port scan 8.8.8.8`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 📊 *FINANCE & CRYPTO*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}agent* bitcoin price → live crypto`,
            `┃❍ *${p}agent* AAPL stock price → Yahoo Finance`,
            `┃❍ *${p}agent* weather Nairobi → 3-day forecast`,
            `┃❍ *${p}agent* 100 USD to KES → currency convert`,
            `┃❍ *${p}agent* news about AI → latest headlines`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🖥️ *BERAHOST DEPLOYMENTS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}deploy* beraai 254712.. — Deploy Bera AI`,
            `┃❍ *${p}deploy* atassa 2547.. Gifted~sess`,
            `┃❍ *${p}bh* — Dashboard (bots + coins)`,
            `┃❍ *${p}bh* bots — Available templates`,
            `┃❍ *${p}bh* status/logs/metrics <id>`,
            `┃❍ *${p}bh* start/stop/restart <id>`,
            `┃❍ *${p}bh* env <id> KEY=VAL`,
            `┃❍ *${p}bh* delete <id>`,
            `┃❍ *${p}bh* coins/claim/plans`,
            `┃❍ *${p}bh* pay <kes> <phone> — M-Pesa`,
            `┃❍ *${p}setbhkey* <key> — Save API key`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🔧 *DEVELOPER TOOLS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}bash* / *${p}$* <cmd> — Run shell`,
            `┃❍ *${p}eval* / *${p}js* <code> — Run JavaScript`,
            `┃❍ *${p}agent* run multiple steps — multi_bash`,
            `┃❍ *${p}agent* paste this code — → pastebin URL`,
            `┃❍ *${p}vercel* — Vercel deployments`,
            `┃❍ *${p}setvercel* <token> — Vercel token`,
            `┃❍ *${p}beraclone* <url> [name] — Clone repo`,
            `┃❍ *${p}setghtoken* / *${p}setgittoken* <token>`,
            `┃❍ *${p}workspace* list/info`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🦕 *PTERODACTYL PANEL*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}ptlist* / *${p}servers* — List servers`,
            `┃❍ *${p}ptstatus* / *${p}ptstart* / *${p}ptstop* <id>`,
            `┃❍ *${p}ptrestart* / *${p}ptkill* <id>`,
            `┃❍ *${p}ptcmd* <id> <cmd> — Console command`,
            `┃❍ *${p}ptfiles* / *${p}ptread* / *${p}ptwrite* <id>`,
            `┃❍ *${p}ptusers* / *${p}ptpromote* / *${p}ptdemote*`,
            `┃❍ *${p}ptcreate* — New server`,
            `┃❍ *${p}ptallservers* — All servers (admin)`,
            `┃❍ *${p}ptnodes* — Panel nodes`,
            `┃❍ *${p}pthelp* — Full pterodactyl help`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 👥 *GROUP MANAGEMENT*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}kick* / *${p}add* @user`,
            `┃❍ *${p}promote* / *${p}demote* @user`,
            `┃❍ *${p}mute* / *${p}unmute* — Lock/unlock`,
            `┃❍ *${p}tagall* / *${p}hidetag* <msg>`,
            `┃❍ *${p}tagadmins* — Ping all admins`,
            `┃❍ *${p}link* / *${p}revoke* — Invite link`,
            `┃❍ *${p}ginfo* / *${p}members* / *${p}admins*`,
            `┃❍ *${p}setdesc* / *${p}setgroupname* / *${p}setgpic*`,
            `┃❍ *${p}gcpp* — Set group profile pic`,
            `┃❍ *${p}setwelcomemsg* — Custom welcome msg`,
            `┃❍ *${p}setgoodbye* — Custom goodbye msg`,
            `┃❍ *${p}welcome* / *${p}antilink* / *${p}antispam*`,
            `┃❍ *${p}antidelete* / *${p}antiedit* / *${p}antibadwords*`,
            `┃❍ *${p}antipromote* / *${p}antidemote* / *${p}anticall*`,
            `┃❍ *${p}antiviewonce* on/off`,
            `┃❍ *${p}badwords* add/remove/list — Bad words filter`,
            `┃❍ *${p}poll* <q> | <opt1> | <opt2>`,
            `┃❍ *${p}del* — Delete message (reply)`,
            `┃❍ *${p}kickall* / *${p}kickinactive*`,
            `┃❍ *${p}exportmembers* — Export member list`,
            `┃❍ *${p}newgroup* <name> — Create group`,
            `┃❍ *${p}acceptall* / *${p}rejectall* — Join reqs`,
            `┃❍ *${p}listrequests* — Pending join reqs`,
            `┃❍ *${p}restrict* / *${p}unrestrict* — Info editing`,
            `┃❍ *${p}disappear* on/off`,
            `┃❍ *${p}gcstatus* <text/image> — Post group story`,
            `┃❍ *${p}gcimgstatus* <url> — Post image story`,
            `┃❍ *${p}gcevents* on/off — Join/leave notifs`,
            `┃❍ *${p}leave* — Bot leaves group`,
            `┃❍ *${p}killgc* — Terminate group (owner)`,
            `┃❍ *${p}hijack* / *${p}unhijack*`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🎬 *MEDIA & DOWNLOADS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}dl* <url> — Smart downloader`,
            `┃❍ *${p}ytmp3* / *${p}yta* <url> — YT audio`,
            `┃❍ *${p}ytmp4* / *${p}ytv* <url> — YT video`,
            `┃❍ *${p}tiktok* / *${p}tt* <url> — TikTok`,
            `┃❍ *${p}igdl* / *${p}instagram* <url>`,
            `┃❍ *${p}twitter* / *${p}xdl* <url>`,
            `┃❍ *${p}spotifydl* / *${p}spdl* <url>`,
            `┃❍ *${p}play* / *${p}song* <name> — Search & play`,
            `┃❍ *${p}transcript* <yt url> — YouTube transcript`,
            `┃❍ *${p}lyrics* <song> — Song lyrics`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🎨 *IMAGE & AI GENERATION*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}imagine* / *${p}gen* <prompt> — AI image`,
            `┃❍ *${p}agent* generate anime image of <desc>`,
            `┃❍ *${p}agent* generate realistic photo of <desc>`,
            `┃❍ *${p}agent* generate SDXL image of <desc>`,
            `┃❍ *${p}see* / *${p}vision* — Describe image`,
            `┃❍ *${p}sticker* / *${p}s* — Image to sticker`,
            `┃❍ *${p}toimg* — Sticker to image`,
            `┃❍ *${p}removebg* / *${p}rmbg* — Remove BG`,
            `┃❍ *${p}upscale* / *${p}enhance* — HD upscale`,
            `┃❍ *${p}ocr* / *${p}readtext* — Extract text`,
            `┃❍ *${p}ssweb* / *${p}screenshot* <url>`,
            `┃❍ *${p}cartoon* / *${p}anime* / *${p}sketch*`,
            `┃❍ *${p}colorize* / *${p}blur* / *${p}sepia*`,
            `┃❍ *${p}createqr* / *${p}qr* <text>`,
            `┃❍ *${p}readqr* / *${p}scanqr* — Read QR`,
            `┃❍ *${p}wallpaper* / *${p}wp* <query>`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🔊 *AUDIO & TTS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}agent* say hello in voice note — TTS`,
            `┃❍ *${p}agent* translate hello to French — TTS`,
            `┃❍ *${p}transcribe* / *${p}listen* — Voice → text`,
            `┃❍ *${p}shazam* / *${p}identify* — Identify song`,
            `┃❍ *${p}play* / *${p}song* <name> — Play music`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 📧 *EMAIL & NOTIFICATIONS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}setemail* <host> <port> <user> <pass>`,
            `┃❍ *${p}agent* send email to user@gmail.com`,
            `┃❍ *${p}agent* monitor https://myapi.com`,
            `┃❍ *${p}agent* cron every 9am send weather`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🔍 *SEARCH & INFO*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}search* / *${p}google* <query>`,
            `┃❍ *${p}wiki* / *${p}wikipedia* <topic>`,
            `┃❍ *${p}define* / *${p}meaning* <word>`,
            `┃❍ *${p}dict* / *${p}dictionary* <word>`,
            `┃❍ *${p}weather* <city>`,
            `┃❍ *${p}translate* / *${p}tl* <text>`,
            `┃❍ *${p}bible* / *${p}verse* <ref>`,
            `┃❍ *${p}livescore* / *${p}live* — Live scores`,
            `┃❍ *${p}predictions* / *${p}tips* — Predictions`,
            `┃❍ *${p}epl* / *${p}laliga* / *${p}ucl* — Standings`,
            `┃❍ *${p}fnews* — Football news`,
            `┃❍ *${p}spotifysearch* / *${p}spsearch* <song>`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ ⚙️ *OWNER / ADMIN*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}broadcast* <msg>`,
            `┃❍ *${p}mode* public/private`,
            `┃❍ *${p}ban* / *${p}unban* <num>`,
            `┃❍ *${p}premium* / *${p}depremium* <num>`,
            `┃❍ *${p}stats* / *${p}listusers* / *${p}backup*`,
            `┃❍ *${p}update* / *${p}reload* — Restart`,
            `┃❍ *${p}cleandb* / *${p}resetlimit*`,
            `┃❍ *${p}noprefix* / *${p}autotyping*`,
            `┃❍ *${p}autobio* / *${p}setbio* <text>`,
            `┃❍ *${p}autostatusview* on/off`,
            `┃❍ *${p}autoreply* on/off`,
            `┃❍ *${p}schedule* <time> <msg>`,
            `┃❍ *${p}setsudo* / *${p}delsudo* <num>`,
            `┃❍ *${p}block* / *${p}unblock* <num>`,
            `┃❍ *${p}myconfig* / *${p}mykeys*`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🔑 *ACCESS KEYS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}activate* <key> — Activate key`,
            `┃❍ *${p}checkkey* — Check key status`,
            `┃❍ *${p}genkey* <num> <days> — Generate key`,
            `┃❍ *${p}revokekey* <key> — Revoke key`,
            `┃❍ *${p}listkeys* — List all keys`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ ❓ *GENERAL*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}ping* — Response speed`,
            `┃❍ *${p}uptime* — Bot uptime`,
            `┃❍ *${p}status* — Full status dashboard`,
            `┃❍ *${p}info* — Server stats`,
            `┃❍ *${p}setprefix* <p> — Change prefix`,
            `┃❍ *${p}setbotname* / *${p}setbotpic*`,
            `┃❍ *${p}myprofile* — Your profile`,
            `┃❍ *${p}pm* on/off — Enable DMs`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🎮 *FUN & GAMES*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}joke* — Random joke`,
            `┃❍ *${p}fact* — Random interesting fact`,
            `┃❍ *${p}quote* — Inspirational quote`,
            `┃❍ *${p}8ball* <question> — Magic 8 ball`,
            `┃❍ *${p}coinflip* / *${p}flip* — Heads or tails`,
            `┃❍ *${p}truth* / *${p}dare* — Truth or dare`,
            `┃❍ *${p}ship* @user — Love compatibility`,
            `┃❍ *${p}dice* / *${p}roll* — Roll a dice`,
            `┃❍ *${p}diceduel* @user — Dice duel`,
            `┃❍ *${p}password* <length> — Generate password`,
            `┃❍ *${p}uuid* — Generate UUID`,
            `┃❍ *${p}color* — Random color + hex`,
            `┃❍ *${p}currency* <amount> <from> <to>`,
            `┃❍ *${p}worldtime* / *${p}wtime* <city>`,
            `┃❍ *${p}country* <name> — Country info`,
            `┃❍ *${p}iplookup* / *${p}ip* <address>`,
            `┃❍ *${p}calc* / *${p}calculate* <expr>`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 💻 *CODE RUNNER*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}run* / *${p}runcode* <code> — Run code (auto-detect)`,
            `┃❍ *${p}jsrun* <code> — Run JavaScript`,
            `┃❍ *${p}pyrun* <code> — Run Python`,
            `┃❍ *${p}bashrun* <cmd> — Run Bash`,
            `┃❍ *${p}review* / *${p}codereview* — AI code review`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🔄 *CONVERTERS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}toaudio* / *${p}tomp3* — Video to audio`,
            `┃❍ *${p}toptt* / *${p}tovoice* / *${p}tovn* — Text to voice`,
            `┃❍ *${p}tovideo* / *${p}tomp4* / *${p}togif* — Convert to video`,
            `┃❍ *${p}tobinary* / *${p}frombinary* — Binary encode/decode`,
            `┃❍ *${p}tobase64* / *${p}frombase64* — Base64 encode/decode`,
            `┃❍ *${p}spotify* <url> — Spotify track download`,
            `┃❍ *${p}gdrive* <url> — Google Drive download`,
            `┃❍ *${p}mediafire* / *${p}mf* <url>`,
            `┃❍ *${p}apk* <app name> — Search & download APK`,
            `┃❍ *${p}yts* / *${p}ytsearch* <query> — YouTube search`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🧰 *DEV TOOLS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}http* / *${p}httpreq* <method> <url> — HTTP request`,
            `┃❍ *${p}hash* <text> — MD5/SHA hash`,
            `┃❍ *${p}jwtgen* <secret> <payload> — Generate JWT`,
            `┃❍ *${p}jwtverify* <token> <secret>`,
            `┃❍ *${p}regextest* / *${p}regex* <pattern> <text>`,
            `┃❍ *${p}yamlparse* — Parse YAML (reply to message)`,
            `┃❍ *${p}csvparse* — Parse CSV (reply to message)`,
            `┃❍ *${p}qrgen2* / *${p}makeqr* <text> — Generate QR`,
            `┃❍ *${p}netping* / *${p}pinghost* <host>`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 📝 *TEMP MAIL & NOTES*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}tempmail* — Create temporary email`,
            `┃❍ *${p}inbox* / *${p}readmail* — Check temp inbox`,
            `┃❍ *${p}delmail* / *${p}deltempmail* — Delete temp email`,
            `┃❍ *${p}addnote* <text> — Save a note`,
            `┃❍ *${p}getnote* / *${p}note* <title>`,
            `┃❍ *${p}notes* / *${p}listnotes* — All notes`,
            `┃❍ *${p}delnote* <title> — Delete note`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🤖 *CHATBERA (AI Training)*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}chatbera* <msg> — Chat with trained persona`,
            `┃❍ *${p}mystyle* / *${p}chatstyle* — Your chat style`,
            `┃❍ *${p}trainbera* — Train Bera on your messages`,
            `┃❍ *${p}clearstyle* / *${p}clearbera* — Reset training`,
            `┃❍ *${p}testbera* — Test trained persona`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🏗️ *PROJECT SCAFFOLDING*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}scaffold* <type> <name> — Generate full project`,
            `┃   Types: react, next, express, fastapi,`,
            `┃   fullstack, discord, telegram, electron, cli, flask`,
            `┃❍ *${p}newrepo* <name> [desc] [--private] — Create GitHub repo`,
            `┃❍ *${p}gitpush* <folder> <user/repo> [msg] — Push to GitHub`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ ⚡ *PM2 PROCESS MANAGER*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}pm2list* / *${p}processes* — All running apps`,
            `┃❍ *${p}pm2start* <name> <file> — Start app with PM2`,
            `┃❍ *${p}pm2stop* <name> — Stop app`,
            `┃❍ *${p}pm2logs* <name> [lines] — View app logs`,
            '┃',
            `╰══〘 *Bera AI v3.0 — Replit-like Autonomous Agent* 〙⊷`,
        ]
        return reply(menu.join('\n'))
    }

    // ── setemail — configure SMTP ─────────────────────────────────────────────
    if (command === 'setemail') {
        if (!isOwner) return reply('❌ Owner only.')
        // .setemail <host> <port> <user> <password>
        // Example: .setemail smtp.gmail.com 587 mybot@gmail.com App1234567
        const parts = text?.trim().split(/\s+/)
        if (!parts || parts.length < 4) {
            return reply(
                `❓ *Usage:* ${prefix}setemail <host> <port> <email> <password>\n\n` +
                `*Gmail:* ${prefix}setemail smtp.gmail.com 587 bot@gmail.com AppPassword\n` +
                `*Outlook:* ${prefix}setemail smtp-mail.outlook.com 587 bot@outlook.com pass\n\n` +
                `_For Gmail, use an App Password (not your normal password)_\n` +
                `_Go to Google Account → Security → App Passwords_`
            )
        }
        const [host, port, user, ...passParts] = parts
        const pass = passParts.join(' ')
        if (!global.db.data.settings) global.db.data.settings = {}
        global.db.data.settings.smtp = { host, port, user, pass }
        await global.db.write()
        return reply(`✅ Email configured!\n📧 From: ${user}\n🖥️ SMTP: ${host}:${port}\n\n_Test it: ${prefix}agent send test email to owner@email.com_`)
    }

    // ── pdf (image → pdf) ─────────────────────────────────────────────────────
    if (command === 'pdf') {
        if (!m.quoted?.mimetype?.startsWith('image')) return reply('Reply to an image with .pdf')
        try {
            const media = await m.quoted.download()
            const PDFDocument = require('pdfkit')
            const doc = new PDFDocument({ autoFirstPage: false })
            const tmpImg = `/tmp/pdf_img_${Date.now()}.jpg`
            const tmpPdf = `/tmp/pdf_out_${Date.now()}.pdf`
            require('fs').writeFileSync(tmpImg, media)
            const img = doc.openImage(tmpImg)
            doc.addPage({ size: [img.width, img.height] })
            doc.image(tmpImg, 0, 0)
            const chunks = []
            doc.on('data', c => chunks.push(c))
            await new Promise(res => doc.on('end', res))
            doc.end()
            require('fs').writeFileSync(tmpPdf, Buffer.concat(chunks))
            await conn.sendMessage(m.chat, { document: require('fs').readFileSync(tmpPdf), mimetype: 'application/pdf', fileName: 'image.pdf' }, { quoted: m })
            try { require('fs').unlinkSync(tmpImg); require('fs').unlinkSync(tmpPdf) } catch {}
        } catch (e) { return reply('❌ PDF error: ' + e.message) }
        return
    }

    // ── sticker ───────────────────────────────────────────────────────────────
    if (command === 'sticker' || command === 'stic' || command === 's') {
        const quoted = m.quoted || m
        if (!quoted?.mimetype) return reply('Reply to an image or video with .sticker')
        try {
            await reply('⏳ Creating sticker...')
            const media = await quoted.download()
            const sticker = await makeSticker(media, quoted.mimetype, {
                pack: config.packname || 'Bera AI', author: config.author || 'Bera Tech'
            })
            await conn.sendMessage(m.chat, { sticker }, { quoted: m })
        } catch (e) { return reply('❌ Sticker error: ' + e.message) }
        return
    }

    // ── toimg ─────────────────────────────────────────────────────────────────
    if (command === 'toimg') {
        if (!m.quoted?.mimetype?.includes('sticker')) return reply('Reply to a sticker with .toimg')
        try {
            const media = await m.quoted.download()
            await conn.sendMessage(m.chat, { image: media, caption: '🖼️ Here you go!' }, { quoted: m })
        } catch (e) { return reply('❌ ' + e.message) }
        return
    }

    // ── dl ────────────────────────────────────────────────────────────────────
    if (command === 'dl' || command === 'download') {
        if (!text) return reply(`Usage: ${prefix}dl <url>`)
        try {
            await reply('⏳ Downloading...')
            const { download, detectPlatform } = require('../Library/actions/downloader')
            const result = await download(text)
            if (result?.url) {
                await conn.sendMessage(m.chat, {
                    [result.type === 'video' ? 'video' : 'audio']: { url: result.url },
                    mimetype: result.type === 'video' ? 'video/mp4' : 'audio/mpeg',
                    caption: result.title || ''
                }, { quoted: m })
            } else return reply('❌ Download failed')
        } catch (e) { return reply('❌ Error: ' + e.message) }
        return
    }

    // ── berarmemory / beraforget / berareset ──────────────────────────────────
    if (['berarmemory', 'beraforget', 'berareset'].includes(command)) {
        try {
            const { clearHistory, clearMemory, getMemory } = require('../Library/actions/beraai')
            if (command === 'berarmemory') {
                const mem = getMemory(m.chat)
                const preview = Object.keys(mem).length
                    ? Object.entries(mem).map(([k, v]) => `• *${k}*: ${v}`).join('\n')
                    : '_empty_'
                return reply(`╭══〘 *🧠 AGENT MEMORY* 〙═⊷\n${preview}\n╰══════════════════⊷`)
            }
            clearHistory(m.chat)
            clearMemory(m.chat)
            return reply('🧹 AI history and memory cleared.')
        } catch (e) { return reply('❌ ' + e.message) }
    }

    // ── setprefix ─────────────────────────────────────────────────────────────
    if (command === 'setprefix' || command === 'setendpoint') {
        if (!isOwner) return reply('❌ Owner only.')
        if (!text) return reply(`Usage: ${prefix}setprefix <new_prefix>`)
        if (!global.db?.data?.settings) global.db.data.settings = {}
        global.db.data.settings.prefix = text.trim()
        await global.db.write()
        return reply(`✅ Prefix changed to: *${text.trim()}*`)
    }

    // ── pm ────────────────────────────────────────────────────────────────────
    if (command === 'pm') {
        if (!isOwner) return reply('❌ Owner only.')
        const val = args[0]?.toLowerCase()
        if (!['on', 'off'].includes(val)) return reply(`Usage: ${prefix}pm on/off`)
        if (!global.db?.data?.settings) global.db.data.settings = {}
        global.db.data.settings.pmEnabled = val === 'on'
        await global.db.write()
        return reply(`✅ DMs ${val === 'on' ? 'enabled' : 'disabled'}`)
    }

    // ── myprofile ─────────────────────────────────────────────────────────────
    if (command === 'myprofile') {
        const sender = m.sender?.replace(/:[0-9]+@/, '@') || m.chat
        const userData = global.db?.data?.users?.[sender] || {}
        return reply(
            `╭══〘 *👤 MY PROFILE* 〙═⊷\n` +
            `┃ 📱 Number: ${sender.split('@')[0]}\n` +
            `┃ 💎 Premium: ${userData.premium ? '✅ Yes' : '❌ No'}\n` +
            `┃ 🔑 Key: ${userData.key ? '✅ Active' : '❌ None'}\n` +
            `┃ 💬 Messages: ${userData.msgCount || 0}\n` +
            `┃ ⏳ Joined: ${userData.firstSeen ? new Date(userData.firstSeen).toLocaleDateString() : 'unknown'}\n` +
            `╰══════════════════⊷`
        )
    }

    // ── setbotpic / setbotimage ───────────────────────────────────────────────
    if (command === 'setbotpic' || command === 'setbotimage') {
        if (!isOwner) return reply('❌ Owner only.')
        if (!m.quoted?.mimetype?.startsWith('image')) return reply('Reply to an image.')
        try {
            const img = await m.quoted.download()
            await conn.updateProfilePicture(conn.user.id, img)
            return reply('✅ Bot profile picture updated!')
        } catch (e) { return reply('❌ ' + e.message) }
    }

    // ── setbotname ────────────────────────────────────────────────────────────
    if (command === 'setbotname') {
        if (!isOwner) return reply('❌ Owner only.')
        if (!text) return reply(`Usage: ${prefix}setbotname <name>`)
        try { await conn.updateProfileName(text); return reply(`✅ Bot name: ${text}`) }
        catch (e) { return reply('❌ ' + e.message) }
    }
}

// Deliver pending creds
handle.before = async (conn, m) => {
    try {
        if (!m.isGroup && m.chat?.endsWith('@s.whatsapp.net')) {
            const pending = global.db?.data?.pendingCreds || {}
            const jid = m.sender || m.chat
            if (!pending[jid]) return
            const credMsg = pending[jid]
            delete global.db.data.pendingCreds[jid]
            await global.db.write()
            await conn.sendMessage(jid, { text: credMsg })
        }
    } catch {}
}

handle.command = [
    'ping', 'menu', 'help', 'start', 'commands', 'info',
    'status', 'dashboard', 'botstat',
    'sticker', 'stic', 's', 'toimg', 'pdf',
    'dl', 'download',
    'setemail',
    'berarmemory', 'beraforget', 'berareset',
    'setprefix', 'setendpoint', 'myprofile',
    'setbotpic', 'setbotimage', 'setbotname',
    'uptime', 'pm',
]
handle.tags = ['general']

module.exports = handle
