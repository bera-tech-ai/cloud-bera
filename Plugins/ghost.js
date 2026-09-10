// Plugins/ghost.js
// Ghost Mode — silently learns your style even when OFF
// When ON: replies to every DM as Bruce Bera (Sheng + Swahili + English)
// Commands: .ghost on | off | status | stats | reset | test <msg>

const axios = require('axios')

const GHOST_MAX_SAMPLES = 200
const GHOST_MAX_CONTEXT = 14
const OVERCHAT_URL = 'https://api.gifted.co.ke/api/ai/overchat'
const GIFTED_KEY   = process.env.GIFTED_API_KEY || ''

const getGhostData = () => {
    if (!global.db?.data) return {}
    if (!global.db.data.ghost) global.db.data.ghost = {}
    return global.db.data.ghost
}

// ── Passive learner — called for every incoming non-command DM ──────────────
const learnMessage = async (senderNum, senderName, text) => {
    try {
        if (!text || text.length < 2) return
        const ghost = getGhostData()
        if (!ghost.conversations) ghost.conversations = {}
        if (!ghost.conversations[senderNum]) ghost.conversations[senderNum] = []
        ghost.conversations[senderNum].push({ text, name: senderName || senderNum, ts: Date.now() })
        if (ghost.conversations[senderNum].length > GHOST_MAX_SAMPLES) {
            ghost.conversations[senderNum] = ghost.conversations[senderNum].slice(-GHOST_MAX_SAMPLES)
        }
        // Debounced write — don't hit disk on every single message
        clearTimeout(global._ghostWriteTimer)
        global._ghostWriteTimer = setTimeout(() => {
            global.db.write().catch(() => {})
        }, 6000)
    } catch {}
}

// ── Generate a ghost reply in Bruce Bera's exact style ──────────────────────
const generateGhostReply = async (senderNum, incomingText, senderName) => {
    try {
        const ghost    = getGhostData()
        const convo    = ghost.conversations?.[senderNum] || []
        const recent   = convo.slice(-GHOST_MAX_CONTEXT)
        const ctxLines = recent.map(e => `${e.name}: ${e.text}`).join('\n')

        const prompt =
`You are Bruce Bera — a 21-year-old Kenyan developer from Nairobi. Reply EXACTLY as Bruce would.

Key style rules:
- Very short replies (1–2 sentences, rarely more)
- Naturally mixes Sheng, Swahili, and casual English
- Common words: mkuu, bana, waazi, yooh, niaje, naah, bro, bruv, mzee, iza, wozza, rada
- Casual or no punctuation
- Uses 😂 🥲 😩 🫴 emojis naturally (not excessively)
- Never sounds formal, robotic, or like a chatbot
- Never starts reply with "Bruce:" or any label

Recent conversation context:
${ctxLines || '(no prior context)'}

Incoming message from ${senderName || 'them'}: "${incomingText}"

Reply as Bruce Bera:`

        const res = await axios.get(OVERCHAT_URL, {
            params: { apikey: GIFTED_KEY, model: 'deepseek', q: prompt.slice(0, 2500) },
            timeout: 16000
        })
        const raw = res.data?.result?.trim()
        // Strip any "Bruce:" label if model added one
        const cleaned = raw?.replace(/^(Bruce\s*:|Bera\s*:)/i, '').trim()
        if (cleaned && cleaned.length > 1) return cleaned
    } catch {}
    return null
}

const isGhostOn = () => getGhostData().enabled === true

const buildStats = () => {
    const ghost  = getGhostData()
    const convos = ghost.conversations || {}
    const senders = Object.keys(convos)
    const total  = senders.reduce((t, k) => t + convos[k].length, 0)
    const top    = senders
        .map(k => ({ num: k, count: convos[k].length }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
    return { senders: senders.length, total, top }
}

// ── Command handler ─────────────────────────────────────────────────────────
const handle = async (m, { conn, command, args, prefix: p, reply, isOwner } = {}) => {
    if (!isOwner) return reply('❌ Ghost Mode is owner-only.')
    const ghost = getGhostData()
    const isOn  = ghost.enabled === true
    const sub   = (command === 'ghoston' ? 'on' : command === 'ghostoff' ? 'off' : (args[0] || '')).toLowerCase()

    // ── .ghost status (default) ────────────────────────────────────────────
    if (!sub || sub === 'status') {
        const st = buildStats()
        return reply(
            `╭══〘 *👻 GHOST MODE* 〙═⊷\n` +
            `┃\n` +
            `┃  ${isOn ? '🟢 *ACTIVE — replying as you*' : '⚫ *OFF — learning silently*'}\n` +
            `┃\n` +
            `┃ 📱 Senders tracked: *${st.senders}*\n` +
            `┃ 💬 Messages learned: *${st.total}*\n` +
            `┃ 🧠 Languages: *Sheng • Swahili • English*\n` +
            `┃\n` +
            `┃ *${p}ghost on*    → Start replying as you\n` +
            `┃ *${p}ghost off*   → Stop (keeps learning)\n` +
            `┃ *${p}ghost stats* → Conversation breakdown\n` +
            `┃ *${p}ghost test <msg>* → Test a reply\n` +
            `┃ *${p}ghost reset* → Clear all data\n` +
            `╰══════════════════⊷`
        )
    }

    // ── .ghost on ──────────────────────────────────────────────────────────
    if (sub === 'on') {
        ghost.enabled = true
        await global.db.write()
        return reply(
            `╭══〘 *👻 GHOST ON* 〙═⊷\n` +
            `┃ 🟢 *Active — Replying as Bruce Bera*\n` +
            `┃\n` +
            `┃ Every DM you receive will get\n` +
            `┃ a reply in your exact style.\n` +
            `┃ Groups: always silent.\n` +
            `┃\n` +
            `┃ Disable: *${p}ghost off*\n` +
            `╰══════════════════⊷`
        )
    }

    // ── .ghost off ─────────────────────────────────────────────────────────
    if (sub === 'off') {
        ghost.enabled = false
        await global.db.write()
        return reply(
            `╭══〘 *👻 GHOST OFF* 〙═⊷\n` +
            `┃ ⚫ *Disabled — Still learning silently*\n` +
            `┃\n` +
            `┃ Auto-replies stopped but I'm still\n` +
            `┃ watching conversations and updating\n` +
            `┃ my style model in the background.\n` +
            `┃\n` +
            `┃ Re-enable: *${p}ghost on*\n` +
            `╰══════════════════⊷`
        )
    }

    // ── .ghost stats ───────────────────────────────────────────────────────
    if (sub === 'stats') {
        const st = buildStats()
        const topLines = st.top.length
            ? st.top.map((t, i) => `┃  ${i + 1}. +${t.num} — ${t.count} msgs`).join('\n')
            : '┃  No data yet'
        return reply(
            `╭══〘 *👻 GHOST STATS* 〙═⊷\n` +
            `┃\n` +
            `┃ 📱 Senders tracked: *${st.senders}*\n` +
            `┃ 💬 Total messages: *${st.total}*\n` +
            `┃\n` +
            `┃ 🔝 Most messages from:\n` +
            topLines + '\n' +
            `┃\n` +
            `┃ Style: Sheng • Swahili • English\n` +
            `╰══════════════════⊷`
        )
    }

    // ── .ghost test <msg> ──────────────────────────────────────────────────
    if (sub === 'test') {
        const testMsg = args.slice(1).join(' ')
        if (!testMsg) return reply(`Usage: *${p}ghost test Niaje mkuu`)
        await reply('🤔 Generating ghost reply...')
        const ownerNum = (m.sender || '').split('@')[0]
        const result   = await generateGhostReply(ownerNum, testMsg, 'tester')
        return reply(result ? `*Ghost would say:*\n${result}` : '❌ Could not generate reply — check AI connection.')
    }

    // ── .ghost reset ───────────────────────────────────────────────────────
    if (sub === 'reset') {
        ghost.conversations = {}
        ghost.enabled = false
        await global.db.write()
        return reply('🗑️ Ghost Mode reset. All learned conversations deleted.')
    }

    return reply(`Usage: *${p}ghost on / off / status / stats / test <msg> / reset*`)
}

handle.command = ['ghost', 'ghostmode', 'ghoston', 'ghostoff']
handle.tags    = ['owner', 'ghost']
handle.help    = ['ghost on', 'ghost off', 'ghost status', 'ghost stats', 'ghost test <msg>']

// ── Exports for Handler hook ────────────────────────────────────────────────
handle.learnMessage       = learnMessage
handle.generateGhostReply = generateGhostReply
handle.isGhostOn          = isGhostOn

module.exports = handle
