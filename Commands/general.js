const axios = require('axios')
const config = require('../Config')
const moment = require('moment-timezone')
const { makeSticker } = require('../Library/actions/sticker')
const { download, detectPlatform } = require('../Library/actions/downloader')

const handle = async (conn, m, { command, args, text, reply, prefix, isOwner, isAdmin, isBotAdmin, m: msg }) => {
    // ── ping / uptime ────────────────────────────────────────────────────────
    if (command === 'ping') {
        const start = Date.now()
        await reply('...')
        return reply(`🏓 *Pong!* ${Date.now() - start}ms`)
    }

    if (command === 'uptime') {
        const sec = process.uptime()
        const h = Math.floor(sec / 3600), mn = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60)
        return reply(`⏱️ *Uptime:* ${h}h ${mn}m ${s}s`)
    }

    // ── pdf (image → pdf) ────────────────────────────────────────────────────
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

    // ── MENU ─────────────────────────────────────────────────────────────────
    if (command === 'menu' || command === 'help' || command === 'start') {
        const time = moment().tz('Africa/Nairobi').format('HH:mm:ss')
        const date = moment().tz('Africa/Nairobi').format('dddd, DD MMM YYYY')
        const p = prefix
        const isPrivate = (global.db?.data?.settings?.mode || 'public') === 'private'
        const modeIcon = isPrivate ? '🔒 Private' : '🌐 Public'
        const bhKey = global.db?.data?.settings?.bhApiKey || process.env.BH_API_KEY
        const gitKey = global.db?.data?.settings?.gitToken || process.env.GIT_TOKEN

        const lines = [
            '╭══〘 *🤖 BERA AI MENU* 〙═⊷',
            `┃❍ 🕐 ${time}  |  📅 ${date}`,
            `┃❍ ⚡ Prefix: *${p}*  |  Mode: *${modeIcon}*`,
            `┃❍ 🖥️ BeraHost: ${bhKey ? '✅ Connected' : `❌ Not set — use ${p}setbhkey`}`,
            `┃❍ 🐙 GitHub: ${gitKey ? '✅ Token set' : `❌ Not set — use ${p}setgittoken`}`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🤖 *AGENT & AI*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}agent* <task> — Autonomous AI agent (46 tools)`,
            `┃❍ *${p}bera* <msg> — Chat with Bera AI`,
            `┃❍ *${p}chatbot* on/off — Toggle auto AI replies`,
            `┃❍ *${p}beratrigger* <word> — Set custom trigger word`,
            `┃❍ *${p}tagreply* on/off — Reply when tagged`,
            `┃❍ *${p}berahistory* — Show conversation history`,
            `┃❍ *${p}berareset* — Clear AI history`,
            `┃❍ *${p}remember* <key> <value> — Save to agent memory`,
            `┃❍ *${p}recall* <key> — Recall from memory`,
            `┃❍ *${p}memories* — Show all memories`,
            `┃❍ *${p}forget* <key> — Delete memory`,
            `┃❍ *${p}cron* add/list/cancel — Schedule tasks`,
            `┃❍ *${p}apidocs* <folder> — Generate API docs`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🖥️ *BERAHOST — Bot Deployment*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}deploy* beraai 254712345678 — Deploy Bera AI`,
            `┃❍ *${p}deploy* atassa 2547.. Gifted~sess — Deploy Atassa-MD`,
            `┃❍ *${p}bh* — Dashboard (all bots + coins)`,
            `┃❍ *${p}bh* bots — Available bot templates`,
            `┃❍ *${p}bh* status/logs/metrics <id>`,
            `┃❍ *${p}bh* start/stop/restart <id>`,
            `┃❍ *${p}bh* env <id> KEY=VAL — Update env vars`,
            `┃❍ *${p}bh* delete <id> — Remove deployment`,
            `┃❍ *${p}bh* coins/claim/plans/txns`,
            `┃❍ *${p}bh* pay <kes> <phone> — M-Pesa top-up`,
            `┃❍ *${p}setbhkey* <key> — Save BeraHost API key`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🔧 *DEVELOPER TOOLS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}bash* <cmd> — Run shell command on server`,
            `┃❍ *${p}run* / *${p}eval* <js code> — Run JavaScript`,
            `┃❍ *${p}$ * <cmd> — Quick shell (alias)`,
            `┃❍ *${p}> * <expr> — Quick eval`,
            `┃❍ *${p}vercel* <project> — Vercel deployments`,
            `┃❍ *${p}setvercel* <token> — Save Vercel token`,
            `┃❍ *${p}vercellist* — List Vercel projects`,
            `┃❍ *${p}workspace* list/info — Workspace manager`,
            `┃❍ *${p}beraclone* <url> [name] — Clone repo to workspace`,
            `┃❍ *${p}setghtoken* <token> — Save GitHub token`,
            `┃❍ *${p}setgittoken* <token> — Save Git token`,
            `┃❍ *${p}setgitusername* <user> — Save Git username`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🦕 *PTERODACTYL PANEL*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}ptlist* / *${p}servers* — List servers`,
            `┃❍ *${p}ptstatus* <id> — Server status`,
            `┃❍ *${p}ptstart* / *${p}ptstop* / *${p}ptrestart* <id>`,
            `┃❍ *${p}ptcmd* <id> <command> — Send console command`,
            `┃❍ *${p}ptfiles* <id> — List server files`,
            `┃❍ *${p}ptread* <id> <file> — Read server file`,
            `┃❍ *${p}ptwrite* <id> <file> — Write server file`,
            `┃❍ *${p}ptusers* — List panel users`,
            `┃❍ *${p}ptpromote* / *${p}ptdemote* <id>`,
            `┃❍ *${p}ptallservers* — All servers (admin)`,
            `┃❍ *${p}ptnodes* — List panel nodes`,
            `┃❍ *${p}ptcreate* — Create new server`,
            `┃❍ *${p}ptall* / *${p}pthelp* — Full pterodactyl help`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 👥 *GROUP MANAGEMENT*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}kick* @user — Remove member`,
            `┃❍ *${p}add* 254... — Add member`,
            `┃❍ *${p}promote* @user — Make admin`,
            `┃❍ *${p}demote* @user — Remove admin`,
            `┃❍ *${p}mute* / *${p}unmute* — Lock/unlock group`,
            `┃❍ *${p}tagall* — Mention all members`,
            `┃❍ *${p}hidetag* <msg> — Silent mention all`,
            `┃❍ *${p}tagadmins* — Mention all admins`,
            `┃❍ *${p}link* / *${p}revoke* — Group invite link`,
            `┃❍ *${p}ginfo* / *${p}gcinfo* — Group info`,
            `┃❍ *${p}setdesc* <text> — Set group description`,
            `┃❍ *${p}setgroupname* <name> — Rename group`,
            `┃❍ *${p}setgpic* — Set group icon (reply to image)`,
            `┃❍ *${p}welcome* on/off — Welcome new members`,
            `┃❍ *${p}antilink* on/off — Block invite links`,
            `┃❍ *${p}antispam* on/off — Anti-spam protection`,
            `┃❍ *${p}antidelete* on/off — Recover deleted msgs`,
            `┃❍ *${p}antibadwords* on/off — Bad word filter`,
            `┃❍ *${p}antipromote* on/off — Block promotions`,
            `┃❍ *${p}anticall* on/off — Block group calls`,
            `┃❍ *${p}antiviewonce* on/off — Un-viewonce media`,
            `┃❍ *${p}members* — List all members`,
            `┃❍ *${p}admins* — List group admins`,
            `┃❍ *${p}poll* <question> | <opt1> | <opt2> — Create poll`,
            `┃❍ *${p}kickall* — Remove all non-admins`,
            `┃❍ *${p}kickinactive* — Remove inactive members`,
            `┃❍ *${p}exportmembers* — Export member list`,
            `┃❍ *${p}newgroup* <name> — Create new group`,
            `┃❍ *${p}acceptall* / *${p}rejectall* — Join requests`,
            `┃❍ *${p}disappear* on/off — Disappearing messages`,
            `┃❍ *${p}hijack* / *${p}unhijack* — Hijack group`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🎬 *MEDIA & DOWNLOADS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}dl* <url> — Download from any platform`,
            `┃❍ *${p}ytmp3* / *${p}yta* <url> — YouTube audio`,
            `┃❍ *${p}ytmp4* / *${p}ytv* <url> — YouTube video`,
            `┃❍ *${p}tiktok* / *${p}tt* <url> — TikTok download`,
            `┃❍ *${p}igdl* / *${p}instagram* <url> — Instagram`,
            `┃❍ *${p}twitter* / *${p}xdl* <url> — X/Twitter`,
            `┃❍ *${p}spotifydl* / *${p}spdl* <url> — Spotify`,
            `┃❍ *${p}play* / *${p}song* <name> — Search & play music`,
            `┃❍ *${p}transcript* <yt url> — YouTube transcript`,
            `┃❍ *${p}lyrics* <song> — Song lyrics`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🖼️ *IMAGE & AI TOOLS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}imagine* / *${p}gen* <prompt> — AI image gen`,
            `┃❍ *${p}see* / *${p}vision* — Describe image (reply)`,
            `┃❍ *${p}sticker* / *${p}s* — Image/video to sticker`,
            `┃❍ *${p}toimg* — Sticker to image`,
            `┃❍ *${p}removebg* / *${p}rmbg* — Remove background`,
            `┃❍ *${p}upscale* / *${p}enhance* — Upscale image`,
            `┃❍ *${p}ocr* / *${p}readtext* — Extract text from image`,
            `┃❍ *${p}ssweb* / *${p}screenshot* <url> — Screenshot`,
            `┃❍ *${p}cartoon* / *${p}anime* <img> — Cartoonify`,
            `┃❍ *${p}colorize* — Colorize B&W image`,
            `┃❍ *${p}sketch* / *${p}bw* / *${p}sepia* — Filters`,
            `┃❍ *${p}blur* / *${p}sharpen* / *${p}invert* — Filters`,
            `┃❍ *${p}img2img* / *${p}restyle* — Restyle image`,
            `┃❍ *${p}createqr* / *${p}qr* <text> — Create QR code`,
            `┃❍ *${p}readqr* / *${p}scanqr* — Read QR code`,
            `┃❍ *${p}wallpaper* / *${p}wp* <query> — Get wallpaper`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🔍 *SEARCH & INFO*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}search* / *${p}google* <query> — Web search`,
            `┃❍ *${p}wiki* / *${p}wikipedia* <topic> — Wikipedia`,
            `┃❍ *${p}define* / *${p}meaning* <word> — Dictionary`,
            `┃❍ *${p}weather* <city> — Weather forecast`,
            `┃❍ *${p}translate* / *${p}tl* <text> — Translate`,
            `┃❍ *${p}shazam* / *${p}identify* — Identify song`,
            `┃❍ *${p}bible* / *${p}verse* <ref> — Bible verse`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ ⚽ *SPORTS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}livescore* / *${p}live* — Live scores`,
            `┃❍ *${p}predictions* / *${p}tips* — Match predictions`,
            `┃❍ *${p}fnews* — Football news`,
            `┃❍ *${p}spotifysearch* / *${p}spsearch* <song> — Spotify search`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 📢 *STATUS & REMINDERS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}poststatus* / *${p}setstatus* <text> — Post status`,
            `┃❍ *${p}autostatusview* on/off — Auto view statuses`,
            `┃❍ *${p}remind* <time> <msg> — Set reminder`,
            `┃❍ *${p}reminders* — List your reminders`,
            `┃❍ *${p}autoreply* on/off — Auto-reply`,
            `┃❍ *${p}schedule* <time> <msg> — Schedule message`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ ⚙️ *OWNER / ADMIN*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}broadcast* <msg> — Send to all users`,
            `┃❍ *${p}mode* public/private — Bot access mode`,
            `┃❍ *${p}ban* / *${p}unban* <num> — Block/unblock user`,
            `┃❍ *${p}premium* / *${p}depremium* <num> — Premium user`,
            `┃❍ *${p}stats* — Bot usage statistics`,
            `┃❍ *${p}listusers* — List all users`,
            `┃❍ *${p}backup* — Backup bot database`,
            `┃❍ *${p}cleandb* — Clean database`,
            `┃❍ *${p}update* / *${p}reload* — Reload bot`,
            `┃❍ *${p}noprefix* on/off — Toggle prefix requirement`,
            `┃❍ *${p}autotyping* on/off — Show typing indicator`,
            `┃❍ *${p}autobio* on/off — Auto-rotating status bio`,
            `┃❍ *${p}setbio* <text> — Set bot bio`,
            `┃❍ *${p}setprefix* <p> — Change command prefix`,
            `┃❍ *${p}setbotname* <name> — Set bot name`,
            `┃❍ *${p}setbotpic* — Set bot profile pic`,
            `┃❍ *${p}block* / *${p}unblock* <num>`,
            `┃❍ *${p}setsudo* / *${p}delsudo* <num> — Sudo users`,
            `┃❍ *${p}myconfig* / *${p}mykeys* — View your config`,
            `┃❍ *${p}pm* on/off — Enable/disable DMs`,
            `┃❍ *${p}myprofile* — View your profile`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🔑 *ACCESS KEYS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}activate* <key> — Activate your key`,
            `┃❍ *${p}checkkey* — Check key status`,
            `┃❍ *${p}genkey* <num> <days> — Generate key (owner)`,
            `┃❍ *${p}revokekey* <key> — Revoke a key`,
            `┃❍ *${p}listkeys* — List all keys`,
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ ❓ *GENERAL*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `┃❍ *${p}ping* — Check bot response speed`,
            `┃❍ *${p}uptime* — How long bot has been running`,
            `┃❍ *${p}info* — Bot information`,
            `┃❍ *${p}transcribe* / *${p}listen* — Transcribe voice note`,
            '┃',
            `╰══════════════════⊷ *Bera AI v2.0 — Most Powerful WhatsApp Agent*`,
        ]
        return reply(lines.join('\n'))
    }

    // ── info ──────────────────────────────────────────────────────────────────
    if (command === 'info') {
        try {
            const { richServerStats } = require('../Library/actions/beraai')
            const s = await richServerStats()
            const pm2List = s.pm2?.length ? s.pm2.map(p => `  ${p.status === 'online' ? '🟢' : '🔴'} ${p.name} (${p.memory}, ${p.cpu})`).join('\n') : '  none'
            return reply(
                `╭══〘 *🤖 BERA AI INFO* 〙═⊷\n` +
                `┃ 🧠 RAM: ${s.memory.used}/${s.memory.total} (${s.memory.pct})\n` +
                `┃ 💾 Disk: ${s.disk.used}/${s.disk.total} (${s.disk.pct})\n` +
                `┃ 📈 Load: ${s.load}\n` +
                `┃ ⏱️ Uptime: ${s.uptime}\n` +
                `┃ 🖥️ CPUs: ${s.cpus}\n` +
                `┃\n┃ *PM2 Processes:*\n${pm2List}\n` +
                `╰══════════════════⊷`
            )
        } catch {
            return reply(`╭══〘 *🤖 BERA AI INFO* 〙═⊷\n┃ Version: 2.0\n┃ Built by Bera Tech\n╰══════════════════⊷`)
        }
    }

    // ── sticker ───────────────────────────────────────────────────────────────
    if (command === 'sticker' || command === 'stic' || command === 's') {
        const quoted = m.quoted || m
        if (!quoted?.mimetype) return reply('Reply to an image or video with .sticker')
        try {
            await reply('⏳ Creating sticker...')
            const media = await quoted.download()
            const sticker = await makeSticker(media, quoted.mimetype, { pack: config.packname || 'Bera AI', author: config.author || 'Bera Tech' })
            await conn.sendMessage(m.chat, { sticker }, { quoted: m })
        } catch (e) { return reply('❌ Sticker error: ' + e.message) }
        return
    }

    // ── toimg ─────────────────────────────────────────────────────────────────
    if (command === 'toimg') {
        if (!m.quoted?.mimetype?.includes('sticker')) return reply('Reply to a sticker with .toimg')
        try {
            const media = await m.quoted.download()
            await conn.sendMessage(m.chat, { image: media, caption: '🖼️ Converted!' }, { quoted: m })
        } catch (e) { return reply('❌ Error: ' + e.message) }
        return
    }

    // ── dl ────────────────────────────────────────────────────────────────────
    if (command === 'dl' || command === 'download') {
        if (!text) return reply(`Usage: ${prefix}dl <url>`)
        try {
            await reply('⏳ Downloading...')
            const platform = detectPlatform(text)
            const result = await download(text)
            if (result?.url) {
                const mimeType = result.type === 'video' ? 'video/mp4' : 'audio/mpeg'
                await conn.sendMessage(m.chat, {
                    [result.type === 'video' ? 'video' : 'audio']: { url: result.url },
                    mimetype: mimeType,
                    caption: result.title || ''
                }, { quoted: m })
            } else { return reply('❌ Download failed') }
        } catch (e) { return reply('❌ Error: ' + e.message) }
        return
    }

    // ── berarmemory ───────────────────────────────────────────────────────────
    if (command === 'berarmemory' || command === 'beraforget' || command === 'berareset') {
        try {
            const { clearHistory, clearMemory, getMemory } = require('../Library/actions/beraai')
            if (command === 'berarmemory') {
                const mem = getMemory(m.chat)
                const hist = []
                const preview = Object.keys(mem).length
                    ? Object.entries(mem).map(([k, v]) => `• ${k}: ${v}`).join('\n')
                    : '_empty_'
                return reply(`╭══〘 *🧠 BERA AI MEMORY* 〙═⊷\n${preview}\n╰══════════════════⊷`)
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
        if (!val || !['on', 'off'].includes(val)) return reply(`Usage: ${prefix}pm on/off`)
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
            `╭══〘 *👤 PROFILE* 〙═⊷\n` +
            `┃ 📱 Number: ${sender.split('@')[0]}\n` +
            `┃ 💎 Premium: ${userData.premium ? 'Yes' : 'No'}\n` +
            `┃ 🔑 Key: ${userData.key ? 'Active' : 'None'}\n` +
            `┃ 💬 Msgs: ${userData.msgCount || 0}\n` +
            `╰══════════════════⊷`
        )
    }

    // ── setbotpic / setbotname ────────────────────────────────────────────────
    if (command === 'setbotpic' || command === 'setbotimage') {
        if (!isOwner) return reply('❌ Owner only.')
        if (!m.quoted?.mimetype?.startsWith('image')) return reply('Reply to an image.')
        try {
            const img = await m.quoted.download()
            await conn.updateProfilePicture(conn.user.id, img)
            return reply('✅ Bot profile picture updated!')
        } catch (e) { return reply('❌ ' + e.message) }
    }

    if (command === 'setbotname') {
        if (!isOwner) return reply('❌ Owner only.')
        if (!text) return reply(`Usage: ${prefix}setbotname <name>`)
        try {
            await conn.updateProfileName(text)
            return reply(`✅ Bot name changed to: ${text}`)
        } catch (e) { return reply('❌ ' + e.message) }
    }
}

// Handle before — deliver pending creds
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
    'ping', 'menu', 'help', 'start', 'info',
    'sticker', 'stic', 's', 'toimg', 'pdf',
    'dl', 'download',
    'berarmemory', 'beraforget', 'berareset',
    'setprefix', 'setendpoint', 'myprofile',
    'setbotpic', 'setbotimage', 'setbotname',
    'uptime', 'pm',
]
handle.tags = ['general']

module.exports = handle
