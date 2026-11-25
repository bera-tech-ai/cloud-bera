'use strict'

// Raw incoming messages are retained briefly so a later reply can recover the
// original view-once media fields that WhatsApp strips from quoted copies.
// Persisted to disk (throttled) so a bot restart does not wipe the window —
// restarts were the common reason a quoted view-once had no stored original
// and recovery fell back to the stripped quote (2026-11-25).
const fs = require('node:fs')
const path = require('node:path')

const entries = new Map()
const MAX_ENTRIES = 500
const TTL_MS = 3 * 60 * 60 * 1000
const STORE_FILE = process.env.BERA_VIEWONCE_STORE_FILE
    || path.join(__dirname, '..', '..', 'Database', 'view_once_store.json')

let loaded = false
let saveTimer = null

function load() {
    if (loaded) return
    loaded = true
    try {
        const rows = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'))
        const now = Date.now()
        for (const [key, entry] of Object.entries(rows || {})) {
            if (entry?.raw && now - Number(entry.at || 0) <= TTL_MS) entries.set(key, entry)
        }
    } catch { /* no store yet — fine */ }
}

function flush() {
    try { fs.writeFileSync(STORE_FILE, JSON.stringify(Object.fromEntries(entries))) } catch {}
}

function scheduleSave() {
    if (saveTimer) return
    saveTimer = setTimeout(() => { saveTimer = null; flush() }, 2000)
    saveTimer.unref?.()
}

function keyFor(chat, id) { return chat && id ? `${chat}:${id}` : null }
function prune(now = Date.now()) {
    for (const [key, entry] of entries) {
        if (now - entry.at > TTL_MS) entries.delete(key)
    }
    while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value)
}
function remember(raw) {
    load()
    const key = keyFor(raw?.key?.remoteJid, raw?.key?.id)
    if (!key || !raw?.message) return
    entries.set(key, { raw, at: Date.now() })
    prune()
    scheduleSave()
}
function get(chat, id) {
    load()
    prune()
    return entries.get(keyFor(chat, id))?.raw || null
}
function latestForChat(chat, predicate) {
    load()
    prune()
    const prefix = `${chat}:`
    const matches = []
    for (const [key, entry] of entries) {
        if (key.startsWith(prefix) && entry?.raw) matches.push(entry)
    }
    matches.sort((a, b) => Number(b.at || 0) - Number(a.at || 0))
    for (const entry of matches) {
        if (!predicate || predicate(entry.raw)) return entry.raw
    }
    return null
}
function clear() { entries.clear(); flush() }
module.exports = { remember, get, latestForChat, clear, _entries: entries, _flush: flush }
