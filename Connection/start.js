try { require('../setenv') } catch (_) { /* setenv.js is optional — env vars may be injected by host */ }

const http = require('http')

const {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    jidNormalizedUser
} = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const pino = require('pino')
const fs = require('fs')
const path = require('path')
const chalk = require('chalk')
const readline = require('readline')

const axios = require('axios')
const { initDb } = require('../Database')
const { handleMessage, handleGroupEvents, handleAntiDelete, handleAntiEdit } = require('../Handler')
const config = require('../Config')

const SESSION_DIR = path.resolve('./session')
const PHONE_FILE  = path.join(SESSION_DIR, '.phone')
const logger      = pino({ level: 'silent' })

if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true })

// ── Socket lifecycle tracking — prevents dual-socket crypto conflicts ──────
let _activeConn    = null
let _reconnecting  = false
let _bannerShown   = false

const closeActiveConn = async () => {
    if (!_activeConn) return
    const c = _activeConn
    _activeConn = null
    try { c.ev.removeAllListeners() } catch {}
    try { c.ws?.terminate?.() }       catch {}
    try { c.end?.() }                 catch {}
    // give signal store time to flush before we create a new socket
    await new Promise(r => setTimeout(r, 800))
}

const scheduleReconnect = (delayMs = 5000) => {
    if (_reconnecting) return
    _reconnecting = true
    setTimeout(async () => {
        _reconnecting = false
        await closeActiveConn()
        startBot().catch(e => {
            console.error('[FATAL]', e.message)
            setTimeout(() => startBot().catch(() => {}), 10000)
        })
    }, delayMs)
}

// ── Suppress all internal crypto / pre-key / baileys noise ───────────────
// Filters out Signal Protocol session dumps, pre-key uploads, key bundle
// exchanges and any other internal chatter that isn't useful at runtime.
const _noisePatterns = [
    // Signal Protocol session objects
    'Closing session:', 'Closing open session', 'Decrypted message with closed session',
    '_chains:', 'registrationId:', 'currentRatchet:', 'ephemeralKeyPair:',
    'pubKey: <Buffer', 'privKey: <Buffer', 'lastRemoteEphemeralKey:',
    'previousCounter:', 'rootKey: <Buffer', 'indexInfo:', 'baseKey: <Buffer',
    'baseKeyType:', 'remoteIdentityKey:', 'pendingPreKey:', 'signedKeyId:',
    'preKeyId:', 'closed: -1', 'used: 17', 'created: 17', 'messageKeys: {}',
    'chainKey: [Object]', 'chainType:', 'SessionEntry {',
    // Pre-key upload / refresh noise
    'pre key', 'prekey', 'pre-key', 'uploading pre', 'need to generate',
    'generating pre', 'key bundle', 'key count', 'uploading keys',
    'count of pre keys', 'refilling keys', 'upload pre', 'refreshing keys',
    'sending key bundle', 'identity key', 'signed pre key', 'one-time pre',
    // Baileys internal noise
    'recv', 'send node', 'got ping', 'send ping', 'keep alive', 'keepalive',
    'noise handshake', 'decrypt', 'encrypt node', 'connecting to WA',
    'connect to WA', 'message retry', 'waiting for', 'decrypt message',
    'frame noise', 'frame encode', 'frame decode', 'WA noise',
]
const _isNoise = (args) => {
    const s = String(args[0] || '').toLowerCase()
    return _noisePatterns.some(p => s.includes(p.toLowerCase()))
}
const _origLog   = console.log.bind(console)
const _origWarn  = console.warn.bind(console)
const _origError = console.error.bind(console)
console.log   = (...a) => { if (!_isNoise(a)) _origLog(...a) }
console.warn  = (...a) => { if (!_isNoise(a)) _origWarn(...a) }
console.error = (...a) => { if (!_isNoise(a)) _origError(...a) }

// ── Hacker-style logger ───────────────────────────────────────────────────
const _ts = () => {
    const n = new Date()
    const p = v => String(v).padStart(2, '0')
    return chalk.dim(`${p(n.getHours())}:${p(n.getMinutes())}:${p(n.getSeconds())}`)
}

const _msgCount = { in: 0, out: 0 }

const beraLog = {
    recv: (from, name, text) => {
        _msgCount.in++
        const tag   = chalk.bgGreen.black.bold(' RECV ')
        const who   = chalk.greenBright(from.padEnd(18))
        const alias = name ? chalk.dim.green(`(${name}) `) : '          '
        const bar   = chalk.dim.green('│')
        const msg   = chalk.white(text.slice(0, 90))
        _origLog(`${_ts()} ${tag} ${who} ${alias}${bar} ${msg}`)
    },
    sent: (to, text) => {
        _msgCount.out++
        const tag = chalk.bgCyan.black.bold(' SENT ')
        const who = chalk.cyan(to.padEnd(18))
        const bar = chalk.dim.cyan('│')
        const msg = chalk.dim.white(text.slice(0, 90))
        _origLog(`${_ts()} ${tag} ${who}           ${bar} ${msg}`)
    },
    sys: (msg) => {
        const tag = chalk.bgYellow.black.bold(' SYS  ')
        const bar = chalk.dim.yellow('│')
        _origLog(`${_ts()} ${tag} ${chalk.dim.yellow('─────────────────────')} ${bar} ${chalk.yellow(msg)}`)
    },
    err: (msg) => {
        const tag = chalk.bgRed.white.bold(' ERR  ')
        const bar = chalk.dim.red('│')
        _origLog(`${_ts()} ${tag} ${chalk.dim.red('─────────────────────')} ${bar} ${chalk.red(msg)}`)
    },
    warn: (msg) => {
        const tag = chalk.bgHex('#FF8C00').black.bold(' WARN ')
        const bar = chalk.dim.hex('#FF8C00')('│')
        _origLog(`${_ts()} ${tag} ${chalk.dim.hex('#FF8C00')('─────────────────────')} ${bar} ${chalk.hex('#FF8C00')(msg)}`)
    },
    divider: () => {
        _origLog(chalk.dim.green('  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄'))
    }
}
global.beraLog = beraLog

// ── Catch the aesDecryptGCM / noise-handler crypto error ──────────────────
// This crash happens when an old socket and new socket share the same
// Signal keys — closing the old socket properly prevents it, but we also
// catch it here as a last resort to avoid a silent death.
process.on('uncaughtException', (err) => {
    const msg = err?.message || ''
    if (msg.includes('Unsupported state') || msg.includes('authenticate data') || msg.includes('aesDecryptGCM')) {
        console.log(chalk.red('[BOT] Crypto/noise error — scheduling clean reconnect in 6s...'))
        scheduleReconnect(6000)
        return
    }
    console.error(chalk.red('[UNCAUGHT]'), err.message)
    scheduleReconnect(8000)
})

process.on('unhandledRejection', (reason) => {
    const msg = reason?.message || String(reason)
    if (msg.includes('Unsupported state') || msg.includes('authenticate data')) {
        console.log(chalk.red('[BOT] Unhandled crypto rejection — reconnecting in 6s...'))
        scheduleReconnect(6000)
        return
    }
    console.error(chalk.yellow('[UNHANDLED REJECTION]'), msg.slice(0, 200))
})

const printBanner = () => {
    const g = chalk.greenBright
    const d = chalk.dim.green
    _origLog('')
    _origLog(g('  ██████╗ ███████╗██████╗  █████╗      █████╗ ██╗'))
    _origLog(g('  ██╔══██╗██╔════╝██╔══██╗██╔══██╗   ██╔══██╗██║'))
    _origLog(g('  ██████╔╝█████╗  ██████╔╝███████║   ███████║██║'))
    _origLog(g('  ██╔══██╗██╔══╝  ██╔══██╗██╔══██║   ██╔══██║██║'))
    _origLog(g('  ██████╔╝███████╗██║  ██║██║  ██║   ██║  ██║██║'))
    _origLog(g('  ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝  ╚═╝╚═╝'))
    _origLog('')
    _origLog(d('  ╔════════════════════════════════════════════════╗'))
    _origLog(d('  ║') + chalk.bold.white(`  🤖  ${config.botName} — WhatsApp AI Agent`.padEnd(47)) + d('║'))
    _origLog(d('  ║') + chalk.dim(`  Prefix: ${config.prefix}  │  Owner: ${config.owner}`.padEnd(47)) + d('║'))
    _origLog(d('  ║') + chalk.dim(`  Node ${process.version}  │  baileys/whiskeysockets`.padEnd(47)) + d('║'))
    _origLog(d('  ╚════════════════════════════════════════════════╝'))
    _origLog('')
    _origLog(chalk.dim.green('  TIME     TYPE   FROM/TO              ') + chalk.dim('│') + chalk.dim.green(' MESSAGE'))
    _origLog(chalk.dim.green('  ──────── ────── ──────────────────── ') + chalk.dim('┼') + chalk.dim.green('─────────────────────────────────────────────'))
}

const askPhoneNumber = () => {
    return new Promise((resolve) => {
        console.log(chalk.yellow('  ┌─────────────────────────────────────────┐'))
        console.log(chalk.yellow('  │  Enter your WhatsApp number             │'))
        console.log(chalk.yellow('  │  Include country code, no + or spaces   │'))
        console.log(chalk.yellow('  │  Example: 254712345678                  │'))
        console.log(chalk.yellow('  └─────────────────────────────────────────┘'))
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
        rl.question(chalk.cyan('  ➤ Number: '), (answer) => {
            rl.close()
            resolve(answer.trim().replace(/[^0-9]/g, ''))
        })
    })
}

const getSavedPhone = () => {
    try { return fs.readFileSync(PHONE_FILE, 'utf8').trim() } catch { return null }
}

const savePhone = (number) => {
    fs.writeFileSync(PHONE_FILE, number, 'utf8')
}

const showPairingCode = (code) => {
    const fmt = code.match(/.{1,4}/g)?.join('-') || code
    console.log(chalk.green('\n  ┌──────────────────────────────────────────┐'))
    console.log(chalk.green('  │') + chalk.white.bold(`   PAIRING CODE: ${fmt.padEnd(24)}`) + chalk.green('│'))
    console.log(chalk.green('  ├──────────────────────────────────────────┤'))
    console.log(chalk.green('  │  Open WhatsApp → Settings                │'))
    console.log(chalk.green('  │  → Linked Devices → Link a Device        │'))
    console.log(chalk.green('  │  → Link with phone number instead        │'))
    console.log(chalk.green('  │  → Enter the code above                  │'))
    console.log(chalk.green('  └──────────────────────────────────────────┘\n'))
}

const applyBotImage = async (conn, botJid) => {
    const src = config.botImage?.trim()
    if (!src) return

    let buffer
    try {
        if (src.startsWith('http')) {
            const res = await axios.get(src, { responseType: 'arraybuffer', timeout: 15000 })
            buffer = Buffer.from(res.data)
        } else if (fs.existsSync(src)) {
            buffer = fs.readFileSync(src)
        } else {
            console.log(chalk.yellow(`[BOT] BOT_IMAGE not found: ${src}`))
            return
        }
        // @whiskeysockets/baileys uses updateProfilePicture(jid, { url }) or (jid, buffer)
        if (typeof conn.updateProfilePicture === 'function') {
            await conn.updateProfilePicture(botJid, buffer)
        } else if (typeof conn.pp === 'function') {
            await conn.pp(botJid, buffer)
        } else {
            console.log(chalk.yellow('[BOT] updateProfilePicture not available in this build'))
            return
        }
        console.log(chalk.green('[BOT] ✅ Bot profile picture updated'))
    } catch (e) {
        console.log(chalk.yellow(`[BOT] Profile picture update failed: ${e.message}`))
    }
}

const resolveBioVars = (template) => {
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const date = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`
    const users = Object.keys(global.db?.data?.users || {}).filter(j => !j.includes('@newsletter')).length
    const cmds = global.db?.data?.stats?.totalCommands || 0
    return template
        .replace(/\{time\}/gi, time)
        .replace(/\{date\}/gi, date)
        .replace(/\{users\}/gi, users)
        .replace(/\{commands\}/gi, cmds)
        .replace(/\{botname\}/gi, config.botName)
}

let bioLoopStarted = false

const startBioLoop = (conn) => {
    if (bioLoopStarted) return
    bioLoopStarted = true
    console.log(chalk.gray('[BOT] Auto-bio loop started'))

    const applyBio = async () => {
        try {
            const s = global.db?.data?.settings
            if (!s?.autobio) return
            const bios = s.bios || []
            if (!bios.length) return

            const idx = (s.currentBioIndex || 0) % bios.length
            const bio = resolveBioVars(bios[idx])
            await conn.updateProfileStatus(bio)
            s.currentBioIndex = (idx + 1) % bios.length
            await global.db.write()
        } catch {}
    }

    applyBio()
    setInterval(applyBio, 60 * 60 * 1000) // rotate every hour
}

let reminderLoopStarted = false

const startReminderLoop = (conn) => {
    if (reminderLoopStarted) return
    reminderLoopStarted = true
    console.log(chalk.gray('[BOT] Reminder loop started'))

    setInterval(async () => {
        try {
            if (!global.db?.data?.reminders?.length) return
            const now = Date.now()
            const due = global.db.data.reminders.filter(r => r.fireAt <= now)
            if (!due.length) return

            global.db.data.reminders = global.db.data.reminders.filter(r => r.fireAt > now)
            await global.db.write()

            for (const r of due) {
                try {
                    await conn.sendMessage(r.chat, {
                        text: `⏰ *Reminder!*\n\n_${r.msg}_\n\n_(set by @${r.jid.split('@')[0]})_`,
                        mentions: [r.jid]
                    })
                } catch (e) {
                    console.error('[REMINDER]', e.message)
                }
            }
        } catch {}
    }, 30000) // check every 30 seconds
}

const startBot = async () => {
    if (!_bannerShown) { printBanner(); _bannerShown = true }
    await initDb()

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)
    const { version } = await fetchLatestBaileysVersion()

    console.log(chalk.yellow(`[BOT] Using WA version ${version.join('.')}`))

    let phoneNumber = null

    if (!state.creds.registered) {
        console.log(chalk.cyan('\n[BOT] No session — pairing code mode\n'))

        phoneNumber = getSavedPhone()

        if (!phoneNumber) {
            if (config.owner && config.owner !== '0000000000') {
                phoneNumber = config.owner.replace(/[^0-9]/g, '')
                console.log(chalk.gray(`[BOT] Using owner number from config: ${phoneNumber}`))
            } else {
                phoneNumber = await askPhoneNumber()
            }
            if (!phoneNumber || phoneNumber.length < 7) {
                console.log(chalk.red('[BOT] Invalid number. Restart and try again.'))
                process.exit(1)
            }
            savePhone(phoneNumber)
        } else {
            console.log(chalk.gray(`[BOT] Using saved number: ${phoneNumber}`))
        }
    }

    const conn = makeWASocket({
        version,
        logger,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        printQRInTerminal: false,
        browser: ['Ubuntu', 'Chrome', '22.0.0'],
        markOnlineOnConnect: true,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        keepAliveIntervalMs: 20000,   // slightly longer to reduce keepalive noise
        connectTimeoutMs:   90000,    // 90s gives more time before 408
        defaultQueryTimeoutMs: 30000,
        retryRequestDelayMs: 250,
        maxMsgRetryCount: 3,
    })

    // Track for proper teardown — MUST be set before any listeners are added
    _activeConn   = conn
    global.conn   = conn

    let pairingRequested = false

    conn.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr && phoneNumber && !pairingRequested) {
            pairingRequested = true
            beraLog.sys('Requesting pairing code...')
            try {
                const code = await conn.requestPairingCode(phoneNumber)
                showPairingCode(code)
            } catch (e) {
                beraLog.err(`Pairing code failed: ${e.message}`)
                beraLog.warn('Retrying in 10s — keep WhatsApp open on link screen')
                setTimeout(async () => {
                    try {
                        const code = await conn.requestPairingCode(phoneNumber)
                        showPairingCode(code)
                    } catch (e2) {
                        beraLog.err(`Pairing retry failed: ${e2.message}`)
                    }
                }, 10000)
            }
        }

        if (connection === 'close') {
            const err        = lastDisconnect?.error
            const statusCode = err instanceof Boom ? err.output.statusCode : null

            if (statusCode === DisconnectReason.loggedOut) {
                beraLog.err('Logged out — clearing session and restarting in 3s...')
                fs.rmSync(SESSION_DIR, { recursive: true, force: true })
                fs.mkdirSync(SESSION_DIR, { recursive: true })
                scheduleReconnect(3000)
                return
            }

            if (statusCode === 515) {
                beraLog.warn('WA requested restart — reconnecting in 8s...')
                scheduleReconnect(8000)
                return
            }

            if (statusCode === 408) {
                pairingRequested = false
                beraLog.warn(state.creds?.registered
                    ? 'Connection timed out — reconnecting in 6s...'
                    : 'Pairing timed out — new code in 6s...')
                scheduleReconnect(6000)
                return
            }

            beraLog.warn(`Disconnected (code: ${statusCode}) — reconnecting in 5s...`)
            scheduleReconnect(5000)
        }

        if (connection === 'open') {
            if (fs.existsSync(PHONE_FILE)) fs.unlinkSync(PHONE_FILE)
            if (!global.botReadyAt) global.botReadyAt = Math.floor(Date.now() / 1000)
            const botJid = jidNormalizedUser(conn.user?.id || '')
            beraLog.divider()
            beraLog.sys(`✅  Online as ${conn.user?.name || 'Bera AI'}  (${botJid})`)
            beraLog.sys(`🤖  ${config.botName} is armed and ready`)
            beraLog.divider()
            startReminderLoop(conn)
            startBioLoop(conn)
            applyBotImage(conn, botJid).catch(() => {})
            // ── Set global._conn so monitor alerts can reach WhatsApp ────────
            global._conn = conn

            // ── Auto-create workspace directory on startup ────────────────
            try {
                const _wspath = require('path').join(process.cwd(), 'workspace')
                require('fs').mkdirSync(_wspath, { recursive: true })
            } catch {}

            // ── Restore persistent server monitor if it was enabled ────────
            try {
                const monitorEnabled = global.db?.data?.settings?.monitorEnabled
                const monitorChat    = global.db?.data?.settings?.monitorChat
                if (monitorEnabled && monitorChat) {
                    const { init: initMon } = require('../Library/lib/monitor')
                    initMon(conn)
                    console.log(chalk.green('[BOT] 📊 Server monitor restored'))
                }
            } catch (me) { console.log(chalk.yellow('[BOT] Monitor restore skipped:', me.message)) }
            // Send connection message to owner
            try {
                const ownerJid = config.owner.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
                const prefix = global.db?.data?.settings?.prefix || config.prefix
                const now = new Date()
                const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
                const date = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                await conn.sendMessage(ownerJid, {
                    text: [
                        '━━━━━━━━━━━━━━━━━━━━━',
                        '🤖 *BERA AI — ONLINE*',
                        '━━━━━━━━━━━━━━━━━━━━━',
                        '',
                        '✅ Successfully connected to WhatsApp.',
                        '',
                        `📅 *Date:* ${date}`,
                        `🕐 *Time:* ${time}`,
                        `⚡ *Prefix:* ${prefix}`,
                        `🔖 *Version:* 2.0.0`,
                        '',
                        `💬 Chat with me: *${prefix}bera hello*`,
                        `📋 Full command list: *${prefix}menu*`,
                        '',
                        '━━━━━━━━━━━━━━━━━━━━━',
                        '_Bera AI is ready and at your service._',
                        '━━━━━━━━━━━━━━━━━━━━━'
                    ].join('\n')
                })
            } catch (e) {
                console.log(chalk.yellow('[BOT] Could not send connection message: ' + e.message))
            }
        }
    })

    conn.ev.on('creds.update', saveCreds)

    // ── Patch sendMessage to log outgoing messages ────────────────────────
    const _origSend = conn.sendMessage.bind(conn)
    conn.sendMessage = async (jid, content, opts) => {
        try {
            if (!content?.react && !content?.delete) {
                const preview = content?.text
                    ? content.text.slice(0, 90).replace(/\n/g, ' ')
                    : content?.image  ? '📷 [image]'
                    : content?.audio  ? '🎵 [audio]'
                    : content?.video  ? '🎬 [video]'
                    : content?.sticker ? '🎴 [sticker]'
                    : content?.document ? '📄 [document]'
                    : '[media]'
                const to = jid.endsWith('@g.us')
                    ? 'grp:' + jid.split('@')[0].slice(-6)
                    : '+' + jid.replace('@s.whatsapp.net', '')
                beraLog.sent(to, preview)
            }
        } catch {}
        return _origSend(jid, content, opts)
    }

    conn.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return
        for (const msg of messages) {
            // Auto status view
            if (msg.key?.remoteJid === 'status@broadcast') {
                if (global.db?.data?.settings?.autoStatusView) {
                    conn.readMessages([msg.key]).catch(() => {})
                }
                continue
            }
            // ── Log incoming messages ─────────────────────────────────────
            try {
                if (!msg.key?.fromMe) {
                    const M = msg.message
                    const mtype = M ? Object.keys(M).find(k => k !== 'messageContextInfo') : ''
                    const text = M?.[mtype]?.text || M?.[mtype]?.caption
                        || (mtype === 'conversation' ? M.conversation : '')
                        || (mtype?.includes('image') ? '📷 [image]' : '')
                        || (mtype?.includes('video') ? '🎬 [video]' : '')
                        || (mtype?.includes('audio') ? '🎵 [audio]' : '')
                        || (mtype?.includes('sticker') ? '🎴 [sticker]' : '')
                        || (mtype?.includes('document') ? '📄 [document]' : '')
                        || '[message]'
                    const from = msg.key?.remoteJid?.endsWith('@g.us')
                        ? 'grp:' + msg.key.remoteJid.split('@')[0].slice(-6)
                        : '+' + (msg.key?.participant || msg.key?.remoteJid || '').replace('@s.whatsapp.net', '')
                    beraLog.recv(from, msg.pushName || '', text.replace(/\n/g, ' '))
                }
            } catch {}
            await handleMessage(conn, msg).catch(e => console.error('[MSG ERROR]', e.message))
        }
    })

    conn.ev.on('group-participants.update', async (event) => {
        await handleGroupEvents(conn, { 'group-participants.update': [event] }).catch(() => {})
    })

    // ── Anti-Delete: intercept message deletions ───────────────────────────
    conn.ev.on('messages.delete', async (deleteEvent) => {
        await handleAntiDelete(conn, deleteEvent).catch(() => {})
    })

    // ── Anti-Edit: intercept message edits ────────────────────────────────
    conn.ev.on('messages.update', async (updates) => {
        await handleAntiEdit(conn, { updates }).catch(() => {})
    })

    // ── Anti-Call: auto-reject all incoming calls ──────────────────────────
    conn.ev.on('call', async (callEvents) => {
        const anticallOn = global.db?.data?.settings?.anticall
        if (!anticallOn) return
        for (const callEvent of callEvents) {
            if (callEvent.status !== 'offer') continue
            try {
                await conn.rejectCall(callEvent.id, callEvent.from)
                await conn.sendMessage(callEvent.from, {
                    text: '📵 *Anti-Call is enabled.*\nVoice and video calls are automatically rejected by this bot.'
                })
                console.log('[ANTICALL] Rejected call from:', callEvent.from)
            } catch (e) {
                console.log('[ANTICALL] Could not reject call:', e.message)
            }
        }
    })

    return conn
}

// Minimal HTTP server required by Replit Autoscale deployments
const PORT = process.env.PORT || 3000
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('Bera AI Bot is running 🤖')
}).listen(PORT, '0.0.0.0', () => {
    console.log(chalk.gray(`[BOT] Health server listening on port ${PORT}`))
})

startBot().catch(e => {
    console.error('[FATAL]', e.message)
    setTimeout(startBot, 10000)
})
