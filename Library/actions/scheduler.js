'use strict'
/**
 * Scheduler action library — manage cron jobs and WhatsApp reminders.
 * Uses node-cron for scheduling.
 *
 * Reminders are persistent: one-time reminders are stored in
 * `global.db.data.reminders` by Library/actions/reminders.js and delivered
 * by the loop in Connection/start.js, so they survive a restart.
 * Cron job *definitions* are likewise persisted in
 * `global.db.data.cronJobs` and re-registered on boot by restoreCronJobs().
 * The in-memory node-cron tasks themselves still only live for the current
 * process; the persisted definition is what makes them survive restarts.
 */
const cron = require('node-cron')
const { parseReminderTime, parseReminderRequest, parseNaturalReminder, formatNairobi } = require('./reminders')

// Active cron jobs: id → { task, expression, description, chatId, created, defId }
const _jobs = new Map()
let _jobIdCounter = 1

const getDb = () => (global.db && global.db.data ? global.db : null)

const getCronDefs = (db) => {
    if (!Array.isArray(db.data.cronJobs)) db.data.cronJobs = []
    return db.data.cronJobs
}

const writeDb = (db) => {
    try { db.write() } catch (e) { console.error('[scheduler] db.write failed:', e.message) }
}

/**
 * Add a new cron job.
 * @param {string} expression  Cron expression e.g. "0 9 * * *"
 * @param {string} description  Human-readable label
 * @param {string} chatId  WhatsApp chat JID (for context)
 * @param {Function} fn  Callback to execute on schedule (async ok)
 * @param {object} [opts]  { persist?: boolean, defId?: string }
 * @returns {{ success: boolean, id?: number, error?: string }}
 */
const addCronJob = (expression, description, chatId, fn, opts = {}) => {
    if (!cron.validate(expression)) {
        return { success: false, error: `Invalid cron expression: "${expression}"` }
    }
    const id = _jobIdCounter++
    const task = cron.schedule(expression, async () => {
        try { await fn(id) } catch (e) { console.error(`[scheduler] job ${id} error:`, e.message) }
    }, { timezone: 'Africa/Nairobi' })

    const defId = opts.defId || `cron_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    _jobs.set(id, { task, expression, description: description || 'No description', chatId: chatId || '', created: new Date().toISOString(), defId })

    if (opts.persist !== false) {
        const db = getDb()
        if (db) {
            const defs = getCronDefs(db)
            const existing = defs.find((d) => d.defId === defId)
            const def = { defId, expression, description: description || 'No description', chatId: chatId || '', created: new Date().toISOString() }
            if (existing) Object.assign(existing, def)
            else defs.push(def)
            writeDb(db)
        }
    }
    return { success: true, id }
}

/**
 * Re-register persisted cron jobs after a restart. The callback is generic
 * (it re-sends the saved message to the saved chat); jobs created in this
 * session keep their own callback until the process restarts.
 * @param {Function} conn  Baileys connection
 * @returns {{ restored: number, skipped: number }}
 */
const restoreCronJobs = (conn) => {
    const db = getDb()
    if (!db || !conn) return { restored: 0, skipped: 0 }
    const defs = getCronDefs(db)
    let restored = 0
    let skipped = 0
    for (const def of defs) {
        if (!def || !cron.validate(def.expression)) { skipped++; continue }
        const chatId = def.chatId
        const message = def.description
        const r = addCronJob(def.expression, message, chatId, async () => {
            try { await conn.sendMessage(chatId, { text: `⏰ *Cron:* ${message}` }) } catch (e) { console.error('[scheduler] restored job send failed:', e.message) }
        }, { persist: false, defId: def.defId })
        if (r.success) restored++
        else skipped++
    }
    return { restored, skipped }
}

/**
 * Cancel a cron job by ID.
 */
const cancelCronJob = (id) => {
    const job = _jobs.get(id)
    if (!job) return { success: false, error: `Job #${id} not found.` }
    job.task.stop()
    _jobs.delete(id)
    const db = getDb()
    if (db && job.defId) {
        const defs = getCronDefs(db)
        const idx = defs.findIndex((d) => d.defId === job.defId)
        if (idx !== -1) {
            defs.splice(idx, 1)
            writeDb(db)
        }
    }
    return { success: true }
}

/**
 * List all active cron jobs.
 */
const listCronJobs = () => {
    if (!_jobs.size) return []
    return Array.from(_jobs.entries()).map(([id, j]) => ({
        id,
        expression: j.expression,
        description: j.description,
        chatId: j.chatId,
        created: j.created
    }))
}

/**
 * Cancel all cron jobs for a specific chat.
 */
const cancelAllForChat = (chatId) => {
    let count = 0
    for (const [id, job] of _jobs.entries()) {
        if (job.chatId === chatId) {
            job.task.stop()
            _jobs.delete(id)
            count++
        }
    }
    if (count) {
        const db = getDb()
        if (db) {
            const defs = getCronDefs(db)
            const kept = defs.filter((d) => d.chatId !== chatId)
            if (kept.length !== defs.length) {
                db.data.cronJobs = kept
                writeDb(db)
            }
        }
    }
    return count
}

/**
 * Schedule a one-time reminder. Persistent: the reminder is written to
 * `global.db.data.reminders` and delivered by the reminder loop, so it
 * survives a restart. Falls back to the old in-memory timer only when the
 * database is not available.
 * NOTE: the quoted-message option is not preserved by the persistent path —
 * the loop sends the reminder as a plain message. The text is unchanged.
 * @param {Function} conn  Baileys connection (kept for the fallback path)
 * @param {string} chatId  Target JID
 * @param {string} text  Reminder message text
 * @param {number} delayMs  Delay in milliseconds
 * @param {object} quotedMsg  Optional quoted message key (persistent path: ignored)
 * @returns {{ success: boolean, id: string, scheduledAt: string }}
 */
const addReminder = (conn, chatId, text, delayMs, quotedMsg = null) => {
    const fireAt = Date.now() + delayMs
    try {
        const { createReminder } = require('./reminders')
        const reminder = createReminder({ chat: chatId, jid: chatId, msg: text, fireAt, repeat: null })
        return { success: true, id: reminder.id, scheduledAt: formatNairobi(fireAt) }
    } catch (e) {
        console.error('[scheduler] persistent reminder failed, using in-memory fallback:', e.message)
        const id = `reminder_${Date.now()}`
        const scheduledAt = new Date(fireAt).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })
        setTimeout(async () => {
            try {
                const msgOpts = quotedMsg ? { quoted: quotedMsg } : {}
                await conn.sendMessage(chatId, { text: `⏰ *Reminder:*\n\n${text}` }, msgOpts)
            } catch (err) {
                console.error(`[scheduler] reminder ${id} failed:`, err.message)
            }
        }, delayMs)
        return { success: true, id, scheduledAt }
    }
}

/**
 * Parse human-readable time like "30 minutes", "2 hours", "1 day".
 * @param {string} str  e.g. "30 minutes", "2 hours", "1 day", "45 secs"
 * @returns {number} Milliseconds, or -1 on parse failure
 */
const parseTimeToMs = (str) => {
    if (!str) return -1
    const s = str.trim().toLowerCase()

    // Match: <number> <unit>
    const m = s.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)$/)
    if (!m) return -1

    const val = parseFloat(m[1])
    const unit = m[2]

    const multipliers = {
        s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000,
        m: 60000, min: 60000, mins: 60000, minute: 60000, minutes: 60000,
        h: 3600000, hr: 3600000, hrs: 3600000, hour: 3600000, hours: 3600000,
        d: 86400000, day: 86400000, days: 86400000,
        w: 604800000, week: 604800000, weeks: 604800000
    }

    return val * (multipliers[unit] || -1)
}

module.exports = { addCronJob, cancelCronJob, listCronJobs, cancelAllForChat, addReminder, parseTimeToMs, restoreCronJobs, parseReminderTime, parseReminderRequest, parseNaturalReminder }
