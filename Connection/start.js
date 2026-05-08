require('../setenv')

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

// ── Suppress libsignal-protocol session dump noise ────────────────────────
// The Signal Protocol library logs full session objects (key buffers,
// chain data, etc.) on every session rotation. This is completely normal
// behaviour but floods the logs with thousands of useless lines.
// We intercept console.log/warn/error and silently drop these lines.
const _signalNoise = [
    'Closing session:', 'Closing open session', 'Decrypted message with closed session',
    '_chains:', 'registrationId:', 'currentRatchet:', 'ephemeralKeyPair:',
    'pubKey: <Buffer', 'privKey: <Buffer', 'lastRemoteEphemeralKey:',
    'previousCounter:', 'rootKey: <Buffer', 'indexInfo:', 'baseKey: <Buffer',
    'baseKeyType:', 'remoteIdentityKey:', 'pendingPreKey:', 'signedKeyId:',
    'preKeyId:', 'closed: -1', 'used: 17', 'created: 17', 'messageKeys: {}',
    'chainKey: [Object]', 'chainType:', 'SessionEntry {',
]
const _isSignalNoise = (args) => {
    const s = String(args[0] || '')
    return _signalNoise.some(p => s.includes(p))
}
const _origLog   = console.log.bind(console)
const _origWarn  = console.warn.bind(console)
const _origError = console.error.bind(console)
console.log   = (...a) => { if (!_isSignalNoise(a)) _origLog(...a) }
console.warn  = (...a) => { if (!_isSignalNoise(a)) _origWarn(...a) }
console.error = (...a) => { if (!_isSignalNoise(a)) _origError(...a) }

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
    console.log(chalk.cyan(`
  ███╗   ██╗██╗ ██████╗██╗  ██╗
  ████╗  ██║██║██╔════╝██║ ██╔╝
  ██╔██╗ ██║██║██║     █████╔╝ 
  ██║╚██╗██║██║██║     ██╔═██╗ 
  ██║ ╚████║██║╚██████╗██║  ██╗
  ╚═╝  ╚═══╝╚═╝ ╚═════╝╚═╝  ╚═╝
    `))
    console.log(chalk.green(`  🤖 ${config.botName} Bot | @whiskeysockets/baileys`))
    console.log(chalk.gray(`  Prefix: ${config.prefix} | Owner: ${config.owner}`))
    console.log(chalk.gray(`  AI Endpoint: ${config.nickApiEndpoint}`))
    console.log('')
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
            console.log(chalk.yellow('[BOT] Requesting pairing code...'))
            try {
                const code = await conn.requestPairingCode(phoneNumber)
                showPairingCode(code)
            } catch (e) {
                console.log(chalk.red(`[BOT] Pairing code request failed: ${e.message}`))
                console.log(chalk.yellow('[BOT] Retrying in 10s... (keep WhatsApp open on link screen)'))
                setTimeout(async () => {
                    try {
                        const code = await conn.requestPairingCode(phoneNumber)
                        showPairingCode(code)
                    } catch (e2) {
                        console.log(chalk.red(`[BOT] Retry failed: ${e2.message}`))
                    }
                }, 10000)
            }
        }

        if (connection === 'close') {
            const err        = lastDisconnect?.error
            const statusCode = err instanceof Boom ? err.output.statusCode : null

            console.log(chalk.red(`[BOT] Disconnected — code: ${statusCode}`))

            // ── 401: Logged out — clear session, start fresh ─────────────
            if (statusCode === DisconnectReason.loggedOut) {
                console.log(chalk.red('[BOT] Logged out. Clearing session...'))
                fs.rmSync(SESSION_DIR, { recursive: true, force: true })
                fs.mkdirSync(SESSION_DIR, { recursive: true })
                console.log(chalk.yellow('[BOT] Session cleared. Restarting in 3s...'))
                scheduleReconnect(3000)
                return
            }

            // ── 515: restartRequired — clean reconnect, longer delay ──────
            // This is WhatsApp telling us to restart the stream. We MUST
            // close the current socket fully before opening a new one or
            // the next connection will get the crypto error.
            if (statusCode === 515) {
                console.log(chalk.yellow('[BOT] Restart required by WhatsApp — reconnecting in 8s...'))
                scheduleReconnect(8000)
                return
            }

            // ── 408: connectionTimedOut ────────────────────────────────────
            if (statusCode === 408) {
                pairingRequested = false
                if (state.creds?.registered) {
                    console.log(chalk.yellow('[BOT] Connection timed out — reconnecting in 6s...'))
                } else {
                    console.log(chalk.yellow('[BOT] Pairing timed out — requesting new code in 6s...'))
                }
                scheduleReconnect(6000)
                return
            }

            // ── All other codes — reconnect ───────────────────────────────
            console.log(chalk.yellow('[BOT] Reconnecting in 5s...'))
            scheduleReconnect(5000)
        }

        if (connection === 'open') {
            if (fs.existsSync(PHONE_FILE)) fs.unlinkSync(PHONE_FILE)
            // Only stamp first-ever connect — do NOT reset on reconnects, or the
            // message-age guard in Handler/index.js will drop messages that were
            // sent just before a reconnect cycle.
            if (!global.botReadyAt) global.botReadyAt = Math.floor(Date.now() / 1000)
            const botJid = jidNormalizedUser(conn.user?.id || '')
            console.log(chalk.green(`\n[BOT] ✅ Connected as ${conn.user?.name || 'Bera AI'} (${botJid})`))
            console.log(chalk.green(`[BOT] 🤖 ${config.botName} is online and ready!\n`))
            startReminderLoop(conn)
            startBioLoop(conn)
            applyBotImage(conn, botJid).catch(() => {})
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

    conn.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return
        for (const msg of messages) {
            // Auto status view
            if (msg.key?.remoteJid === 'status@broadcast') {
                if (global.db?.data?.settings?.autoStatusView) {
                    conn.readMessages([msg.key]).catch(() => {})
                }
                continue // don't pass statuses to command handler
            }
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
