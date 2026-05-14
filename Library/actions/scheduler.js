'use strict'
/**
 * Scheduler action library — manage cron jobs and WhatsApp reminders.
 * Uses node-cron for scheduling.
 */
const cron = require('node-cron')

// Active cron jobs: id → { task, expression, description, chatId, created }
const _jobs = new Map()
let _jobIdCounter = 1

/**
 * Add a new cron job.
 * @param {string} expression  Cron expression e.g. "0 9 * * *"
 * @param {string} description  Human-readable label
 * @param {string} chatId  WhatsApp chat JID (for context)
 * @param {Function} fn  Callback to execute on schedule (async ok)
 * @returns {{ success: boolean, id?: number, error?: string }}
 */
const addCronJob = (expression, description, chatId, fn) => {
    if (!cron.validate(expression)) {
        return { success: false, error: `Invalid cron expression: "${expression}"` }
    }
    const id = _jobIdCounter++
    const task = cron.schedule(expression, async () => {
        try { await fn(id) } catch (e) { console.error(`[scheduler] job ${id} error:`, e.message) }
    }, { timezone: 'Africa/Nairobi' })

    _jobs.set(id, { task, expression, description: description || 'No description', chatId: chatId || '', created: new Date().toISOString() })
    return { success: true, id }
}

/**
 * Cancel a cron job by ID.
 */
const cancelCronJob = (id) => {
    const job = _jobs.get(id)
    if (!job) return { success: false, error: `Job #${id} not found.` }
    job.task.stop()
    _jobs.delete(id)
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
    return count
}

/**
 * Schedule a one-time reminder (sends a WhatsApp message after a delay).
 * @param {Function} conn  Baileys connection
 * @param {string} chatId  Target JID
 * @param {string} text  Reminder message text
 * @param {number} delayMs  Delay in milliseconds
 * @param {object} quotedMsg  Optional quoted message key
 * @returns {{ success: boolean, id: string, scheduledAt: string }}
 */
const addReminder = (conn, chatId, text, delayMs, quotedMsg = null) => {
    const id = `reminder_${Date.now()}`
    const scheduledAt = new Date(Date.now() + delayMs).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })

    setTimeout(async () => {
        try {
            const msgOpts = quotedMsg ? { quoted: quotedMsg } : {}
            await conn.sendMessage(chatId, { text: `⏰ *Reminder:*\n\n${text}` }, msgOpts)
        } catch (e) {
            console.error(`[scheduler] reminder ${id} failed:`, e.message)
        }
    }, delayMs)

    return { success: true, id, scheduledAt }
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

module.exports = { addCronJob, cancelCronJob, listCronJobs, cancelAllForChat, addReminder, parseTimeToMs }
