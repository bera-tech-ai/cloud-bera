'use strict'
/**
 * Persistent reminders — the single canonical reminder store for cloud-bera.
 *
 * Why this module exists:
 *  - `.remind` used to exist in four places (Commands/media.js,
 *    Plugins/texttools.js, Library/xadon-pack/src/commands/tools/remind.js,
 *    and the natural-language path in Handler/index.js). Most of them used
 *    an in-memory setTimeout, so reminders were lost on every restart, could
 *    not be listed, cancelled or snoozed, and never followed up.
 *  - Every reminder now lives in `global.db.data.reminders` (lowdb JSON, or
 *    the Postgres snapshot of the same state). Connection/start.js runs
 *    `startPersistentReminderLoop()` on boot, so due reminders fire even
 *    after a restart.
 *  - All times are interpreted in Africa/Nairobi (the bot's home timezone).
 *  - A reminder fires once, then waits up to 10 minutes for `.done` or
 *    `.snooze`. If nobody answers, exactly one follow-up nudge is sent and
 *    the reminder is closed. Repeating reminders create their next
 *    occurrence when they fire.
 *
 * Reminder shape (stored in db.reminders):
 *   { id, fireAt, chat, jid, msg, repeat, status, createdAt,
 *     snoozeCount, followUpSent, firedAt, followUpDueAt, completedAt }
 *   status: 'pending' | 'fired' | 'sent' | 'done' | 'cancelled'
 *   repeat: null | { type: 'daily', hour, minute }
 *                  | { type: 'weekly', weekday (0=Sun), hour, minute }
 *
 * Legacy entries written by the old Commands/media.js code
 * ({ jid, chat, msg, fireAt, set }) are backfilled on read.
 */
const moment = require('moment-timezone')

const TIMEZONE = 'Africa/Nairobi'
const FOLLOW_UP_DELAY_MS = 10 * 60 * 1000
const MAX_SNOOZES = 3
const MAX_MESSAGE_LENGTH = 500
const PRUNE_AFTER_MS = 7 * 24 * 60 * 60 * 1000
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const getDb = () => (global.db && global.db.data ? global.db : null)

const getReminderList = (db) => {
    if (!Array.isArray(db.data.reminders)) db.data.reminders = []
    return db.data.reminders
}

const makeId = (list) => {
    let id
    do {
        id = 'rm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    } while (list && list.some((r) => r && r.id === id))
    return id
}

/** Backfill fields on entries written by older code. Mutates and returns r. */
const normalizeReminder = (r) => {
    if (!r || typeof r !== 'object') return null
    if (!r.id) r.id = makeId([])
    if (!r.status) r.status = 'pending'
    if (!r.repeat) r.repeat = null
    if (r.createdAt == null) r.createdAt = r.set || Date.now()
    if (r.snoozeCount == null) r.snoozeCount = 0
    if (r.followUpSent == null) r.followUpSent = false
    if (r.firedAt == null) r.firedAt = null
    if (r.followUpDueAt == null) r.followUpDueAt = null
    if (r.completedAt == null) r.completedAt = null
    if (!r.jid) r.jid = r.chat
    if (!r.msg) r.msg = 'Reminder!'
    return r
}

// db.write() persists the local JSON state synchronously but returns the
// Postgres snapshot promise — awaiting it is what makes a save durable.
// createReminder awaits this and fails honestly; the other mutations keep
// the fire-and-forget behaviour via writeDbQuiet (still logged on failure).
const writeDb = async (db) => { await db.write() }

const writeDbQuiet = (db) => {
    writeDb(db).catch((e) => console.error('[REMINDER] db.write failed:', e.message))
}

// ── Create / read / update ──────────────────────────────────────────────────

const createReminder = async ({ chat, jid, msg, fireAt, repeat }) => {
    const db = getDb()
    if (!db) throw new Error('Reminders are unavailable right now (database not ready).')
    if (!chat) throw new Error('No chat to send this reminder to.')
    const text = String(msg || '').trim().slice(0, MAX_MESSAGE_LENGTH)
    if (!text) throw new Error('The reminder message is empty.')
    const at = Number(fireAt)
    if (!Number.isFinite(at)) throw new Error('I could not work out when to remind you.')
    const list = getReminderList(db)
    const reminder = normalizeReminder({
        id: makeId(list),
        fireAt: at,
        chat,
        jid: jid || chat,
        msg: text,
        repeat: repeat || null,
        status: 'pending',
        createdAt: Date.now(),
        snoozeCount: 0,
        followUpSent: false,
        firedAt: null,
        followUpDueAt: null,
        completedAt: null
    })
    list.push(reminder)
    try {
        // The success reply must only be sent after the save has landed —
        // a reminder that was never persisted must not be claimed as set.
        await writeDb(db)
    } catch (e) {
        const idx = list.indexOf(reminder)
        if (idx >= 0) list.splice(idx, 1)
        console.error('[REMINDER] db.write failed:', e.message)
        throw new Error('I could not save that reminder, so it has not been set. Please try again.')
    }
    return reminder
}

/** Pending reminders, plus fired ones still waiting for .done / .snooze. */
const listReminders = (jid) => {
    const db = getDb()
    if (!db) return []
    return getReminderList(db)
        .map(normalizeReminder)
        .filter(Boolean)
        .filter((r) => r.status === 'pending' || r.status === 'fired')
        .filter((r) => !jid || r.jid === jid)
        .sort((a, b) => a.fireAt - b.fireAt)
}

const findReminder = (id, jid) => {
    const clean = String(id || '').trim().replace(/^#/, '')
    if (!clean) return null
    const db = getDb()
    if (!db) return null
    const list = getReminderList(db).map(normalizeReminder).filter(Boolean)
    return list.find((r) => (r.id === clean || r.id === 'rm-' + clean) && (!jid || r.jid === jid)) || null
}

const cancelReminder = (id, jid) => {
    const r = findReminder(id, jid)
    if (!r) return { success: false, error: `No reminder found with id "${id}". Use .reminders to list yours.` }
    if (r.status === 'done' || r.status === 'cancelled' || r.status === 'sent') {
        return { success: false, error: `Reminder [#${r.id}] is already ${r.status}.` }
    }
    r.status = 'cancelled'
    r.completedAt = Date.now()
    writeDbQuiet(getDb())
    return { success: true, reminder: r }
}

const doneReminder = (id, jid) => {
    const r = findReminder(id, jid)
    if (!r) return { success: false, error: `No reminder found with id "${id}". Use .reminders to list yours.` }
    if (r.status === 'done') return { success: false, error: `Reminder [#${r.id}] is already done.` }
    if (r.status === 'cancelled') return { success: false, error: `Reminder [#${r.id}] was cancelled.` }
    if (r.status === 'sent') return { success: false, error: `Reminder [#${r.id}] already fired and closed.` }
    r.status = 'done'
    r.completedAt = Date.now()
    writeDbQuiet(getDb())
    return { success: true, reminder: r }
}

const snoozeReminder = (id, jid, minutes) => {
    const r = findReminder(id, jid)
    if (!r) return { success: false, error: `No reminder found with id "${id}". Use .reminders to list yours.` }
    if (r.status === 'done' || r.status === 'cancelled' || r.status === 'sent') {
        return { success: false, error: `Reminder [#${r.id}] is already ${r.status}, so it cannot be snoozed.` }
    }
    if (r.snoozeCount >= MAX_SNOOZES) {
        return { success: false, error: `Reminder [#${r.id}] has already been snoozed ${MAX_SNOOZES} times.` }
    }
    const mins = Number(minutes) || 10
    r.fireAt = Date.now() + mins * 60 * 1000
    r.status = 'pending'
    r.snoozeCount += 1
    r.followUpSent = false
    r.firedAt = null
    r.followUpDueAt = null
    writeDbQuiet(getDb())
    return { success: true, reminder: r }
}

// ── Formatting ──────────────────────────────────────────────────────────────

const formatNairobi = (ms) => moment(ms).tz(TIMEZONE).format('ddd, MMM D, h:mm a')

const formatDelay = (ms) => {
    if (ms <= 0) return 'now'
    if (ms < 60000) return `in ${Math.max(1, Math.round(ms / 1000))}s`
    if (ms < 3600000) return `in ${Math.round(ms / 60000)}m`
    if (ms < 86400000) {
        const h = Math.floor(ms / 3600000)
        const m = Math.round((ms % 3600000) / 60000)
        return m ? `in ${h}h ${m}m` : `in ${h}h`
    }
    return `in ${Math.round(ms / 86400000)}d`
}

const repeatLabel = (repeat) => {
    if (!repeat) return ''
    if (repeat.type === 'daily') return `every day at ${formatClock(repeat.hour, repeat.minute)}`
    if (repeat.type === 'weekly') {
        const day = WEEKDAYS[repeat.weekday] || ''
        return `every ${day[0].toUpperCase()}${day.slice(1)} at ${formatClock(repeat.hour, repeat.minute)}`
    }
    return ''
}

const formatClock = (hour, minute) => {
    const h12 = hour % 12 === 0 ? 12 : hour % 12
    const suffix = hour < 12 ? 'am' : 'pm'
    return `${h12}:${String(minute).padStart(2, '0')}${suffix}`
}

// ── Nairobi-time parsing ────────────────────────────────────────────────────

const toMs = (amount, unit) => {
    const u = String(unit || '').toLowerCase()
    if (u.startsWith('s')) return amount * 1000
    if (u.startsWith('m') && !u.startsWith('mo')) return amount * 60000
    if (u.startsWith('h')) return amount * 3600000
    if (u.startsWith('d')) return amount * 86400000
    if (u.startsWith('w')) return amount * 7 * 86400000
    return -1
}

/** "9am" / "9:30pm" / "09:30" / "18:30" -> { hour, minute } or null. */
const parseClockTime = (raw) => {
    const s = String(raw || '').trim().toLowerCase()
    let m = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/)
    if (m) {
        let h = parseInt(m[1], 10)
        const min = parseInt(m[2], 10)
        if (h > 23 || min > 59) return null
        if (m[3] === 'pm' && h < 12) h += 12
        if (m[3] === 'am' && h === 12) h = 0
        return { hour: h, minute: min }
    }
    m = s.match(/^(\d{1,2})\s*(am|pm)$/)
    if (m) {
        let h = parseInt(m[1], 10)
        if (h < 1 || h > 12) return null
        if (m[2] === 'pm' && h < 12) h += 12
        if (m[2] === 'am' && h === 12) h = 0
        return { hour: h, minute: 0 }
    }
    return null
}

const nextOccurrence = (repeat, fromMs) => {
    if (!repeat) return moment(fromMs).tz(TIMEZONE)
    if (repeat.type === 'daily') {
        const base = moment(fromMs).tz(TIMEZONE).second(0).millisecond(0)
            .hour(repeat.hour).minute(repeat.minute)
        if (base.valueOf() <= fromMs) base.add(1, 'day')
        return base
    }
    if (repeat.type === 'weekly') {
        for (let i = 0; i < 8; i++) {
            const cand = moment(fromMs).tz(TIMEZONE).add(i, 'day')
                .hour(repeat.hour).minute(repeat.minute).second(0).millisecond(0)
            if (cand.day() === repeat.weekday && cand.valueOf() > fromMs) return cand
        }
    }
    return moment(fromMs).tz(TIMEZONE).add(1, 'day')
}

/**
 * Parse a time-only spec in Africa/Nairobi time.
 * Accepts: "30m", "in 2 hours", "tomorrow at 9am", "today at 6pm",
 * "at 9am", "every day at 9am", "every Monday at 9am", "2026-11-25 09:00".
 * Returns { fireAt, repeat } or { error }.
 */
const parseReminderTime = (spec, nowMs) => {
    const now = nowMs || Date.now()
    const s = String(spec || '').trim()
    if (!s) return { error: 'No time given.' }
    const lower = s.toLowerCase()

    let m = lower.match(/^every\s+(day|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+at\s+(.+)$/)
    if (m) {
        const clock = parseClockTime(m[2].trim())
        if (!clock) return { error: `I could not read the time in "${spec}". Try "every Monday at 9am".` }
        const repeat = m[1] === 'day'
            ? { type: 'daily', hour: clock.hour, minute: clock.minute }
            : { type: 'weekly', weekday: WEEKDAYS.indexOf(m[1]), hour: clock.hour, minute: clock.minute }
        return { fireAt: nextOccurrence(repeat, now).valueOf(), repeat }
    }

    m = lower.match(/^(tomorrow|today)?\s*at\s+(.+)$/)
    if (m) {
        const clock = parseClockTime(m[2].trim())
        if (!clock) return { error: `I could not read the time in "${spec}". Try "tomorrow at 9am".` }
        let base = moment(now).tz(TIMEZONE)
        if (m[1] === 'tomorrow') base = base.add(1, 'day')
        base = base.hour(clock.hour).minute(clock.minute).second(0).millisecond(0)
        if (!m[1] && base.valueOf() <= now) base = base.add(1, 'day')
        return { fireAt: base.valueOf(), repeat: null }
    }

    m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2}))?$/)
    if (m) {
        const base = moment.tz(
            { year: +m[1], month: +m[2] - 1, day: +m[3], hour: m[4] ? +m[4] : 9, minute: m[5] ? +m[5] : 0 },
            TIMEZONE
        )
        if (!base.isValid()) return { error: `That date does not look valid: "${spec}".` }
        return { fireAt: base.valueOf(), repeat: null }
    }

    m = lower.match(/^in\s+(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?)$/)
    if (m) return { fireAt: now + toMs(parseFloat(m[1]), m[2]), repeat: null }

    m = lower.match(/^(\d+(?:\.\d+)?)\s*(s|m|h|d|w)$/)
    if (m) return { fireAt: now + toMs(parseFloat(m[1]), m[2]), repeat: null }

    return { error: `I could not understand the time "${spec}". Try "in 30 minutes", "tomorrow at 9am", or "every Monday at 9am".` }
}

const TIME_TOKEN = String.raw`(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)`
const WEEKDAY_TOKEN = '(day|monday|tuesday|wednesday|thursday|friday|saturday|sunday)'

/**
 * Parse a time-first request: "<time> <message>".
 * E.g. "30m call the client", "tomorrow at 9am call mum",
 * "every Monday at 9am review goals".
 * Returns { fireAt, repeat, msg } or { error }.
 */
const parseReminderRequest = (text, nowMs) => {
    const now = nowMs || Date.now()
    const s = String(text || '').trim()
    if (!s) return { error: 'Say what to remind you about. Example: .remind 30m call the client' }
    const attempts = [
        new RegExp(`^every\\s+${WEEKDAY_TOKEN}\\s+at\\s+${TIME_TOKEN}\\s+(.+)$`, 'i'),
        new RegExp(`^(tomorrow|today)?\\s*at\\s+${TIME_TOKEN}\\s+(.+)$`, 'i'),
        /^(\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2})?)\s+(.+)$/,
        /^in\s+(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?)\s+(.+)$/i,
        /^(\d+(?:\.\d+)?)\s*(s|m|h|d|w)\s+(.+)$/i
    ]
    for (const re of attempts) {
        const m = s.match(re)
        if (!m) continue
        const msg = m[m.length - 1].trim()
        if (!msg) continue
        const spec = s.slice(0, s.length - msg.length).trim()
        const parsed = parseReminderTime(spec, now)
        if (parsed.error) return parsed
        return { fireAt: parsed.fireAt, repeat: parsed.repeat, msg }
    }
    return { error: 'I could not understand that. Try ".remind 30m call the client", ".remind tomorrow at 9am call mum", or ".remind every Monday at 9am review goals".' }
}

/**
 * Parse a task-first phrase: "<task> <time>".
 * E.g. "drink water in 5 minutes", "call mum tomorrow at 9am",
 * "review goals every Monday at 9am".
 * Returns { fireAt, repeat, msg } or { error }.
 */
const parseNaturalReminder = (phrase, nowMs) => {
    const now = nowMs || Date.now()
    const s = String(phrase || '').trim()
    if (!s) return { error: 'Say what to remind you about and when.' }
    const attempts = [
        { re: new RegExp(`^(.*)\\s+every\\s+${WEEKDAY_TOKEN}\\s+at\\s+${TIME_TOKEN}\\s*$`, 'i'), spec: (m) => `every ${m[2]} at ${m[3]}` },
        { re: /^(.+)\s+on\s+(\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2})?)\s*$/i, spec: (m) => m[2] },
        { re: new RegExp(`^(.*)\\s+(tomorrow|today)\\s+at\\s+${TIME_TOKEN}\\s*$`, 'i'), spec: (m) => `${m[2]} at ${m[3]}` },
        { re: new RegExp(`^(.*)\\s+at\\s+${TIME_TOKEN}\\s*$`, 'i'), spec: (m) => `at ${m[2]}` },
        { re: /^(.+)\s+(?:in|after)\s+(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?)\s*$/i, spec: (m) => `in ${m[2]} ${m[3]}` }
    ]
    for (const attempt of attempts) {
        const m = s.match(attempt.re)
        if (!m) continue
        const task = (m[1] || '').trim()
        if (!task) continue
        const parsed = parseReminderTime(attempt.spec(m), now)
        if (parsed.error) continue
        return { fireAt: parsed.fireAt, repeat: parsed.repeat, msg: task }
    }
    return { error: 'I could not work out the time. Try "in 5 minutes", "tomorrow at 9am", or "every Monday at 9am".' }
}

// ── Delivery loop ───────────────────────────────────────────────────────────

const reminderPrefix = (db) => {
    try {
        const p = db && db.data && db.data.settings && db.data.settings.prefix
        return p ? String(p) : '.'
    } catch { return '.' }
}

/**
 * Fire every due reminder once, reschedule repeats, and send one follow-up
 * nudge for reminders that fired 10+ minutes ago without .done / .snooze.
 * Safe to call on every tick: only pending reminders fire, and a fired
 * reminder is never fired twice.
 */
const deliverDue = async (conn, nowMs) => {
    const db = getDb()
    if (!db || !conn) return { fired: 0, nudged: 0 }
    const now = nowMs || Date.now()
    const prefix = reminderPrefix(db)
    let changed = false
    let fired = 0
    let nudged = 0

    // Drop terminal entries older than a week so the list never grows forever.
    const list = getReminderList(db)
    const kept = list.filter((r) => {
        const done = ['sent', 'done', 'cancelled'].includes(r.status)
        const at = r.completedAt || r.createdAt || 0
        return !(done && now - at > PRUNE_AFTER_MS)
    })
    if (kept.length !== list.length) {
        db.data.reminders = kept
        changed = true
    }

    for (const r of getReminderList(db)) {
        normalizeReminder(r)
        if (r.status !== 'pending' || r.fireAt > now) continue
        try {
            await conn.sendMessage(r.chat, {
                text: `⏰ *Reminder!* [#${r.id}]\n\n_${r.msg}_\n\nReply \`${prefix}done ${r.id}\` when done, or \`${prefix}snooze ${r.id} 10m\` to snooze.`,
                mentions: [r.jid].filter(Boolean)
            })
        } catch (e) {
            console.error('[REMINDER] send failed for', r.id, e.message)
            continue
        }
        fired++
        changed = true
        if (r.repeat) {
            // Next occurrence is computed from now, not from the original
            // fire time, so a bot that was down for days does not spam
            // one catch-up message per missed day.
            const next = nextOccurrence(r.repeat, now)
            const nextReminder = normalizeReminder({
                id: makeId(getReminderList(db)),
                fireAt: next.valueOf(),
                chat: r.chat,
                jid: r.jid,
                msg: r.msg,
                repeat: r.repeat,
                status: 'pending',
                createdAt: now,
                snoozeCount: 0,
                followUpSent: false,
                firedAt: null,
                followUpDueAt: null,
                completedAt: null
            })
            getReminderList(db).push(nextReminder)
        }
        r.status = 'fired'
        r.firedAt = now
        r.followUpDueAt = now + FOLLOW_UP_DELAY_MS
    }

    for (const r of getReminderList(db)) {
        if (r.status !== 'fired' || r.followUpSent || !r.followUpDueAt || r.followUpDueAt > now) continue
        try {
            await conn.sendMessage(r.chat, {
                text: `⏰ Still waiting on this one: _${r.msg}_\n\n[#${r.id}] Reply \`${prefix}done ${r.id}\` or \`${prefix}snooze ${r.id} 10m\`.`,
                mentions: [r.jid].filter(Boolean)
            })
        } catch (e) {
            console.error('[REMINDER] follow-up failed for', r.id, e.message)
            continue
        }
        r.followUpSent = true
        r.status = 'sent'
        r.completedAt = now
        nudged++
        changed = true
    }

    if (changed) {
        try { await writeDb(db) } catch (e) { console.error('[REMINDER] db.write failed:', e.message) }
    }
    return { fired, nudged }
}

let _loopStarted = false

const startPersistentReminderLoop = (conn) => {
    if (_loopStarted) return true
    _loopStarted = true
    console.log('[REMINDER] Persistent reminder loop started (Africa/Nairobi)')
    deliverDue(conn).catch((e) => console.error('[REMINDER]', e.message))
    setInterval(() => {
        deliverDue(conn).catch((e) => console.error('[REMINDER]', e.message))
    }, 30000)
    return true
}

module.exports = {
    TIMEZONE,
    FOLLOW_UP_DELAY_MS,
    MAX_SNOOZES,
    createReminder,
    listReminders,
    findReminder,
    cancelReminder,
    doneReminder,
    snoozeReminder,
    formatNairobi,
    formatDelay,
    repeatLabel,
    parseReminderTime,
    parseReminderRequest,
    parseNaturalReminder,
    nextOccurrence,
    deliverDue,
    startPersistentReminderLoop
}
