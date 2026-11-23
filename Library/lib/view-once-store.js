'use strict'

// Raw incoming messages are retained briefly so a later reply can recover the
// original view-once media fields that WhatsApp strips from quoted copies.
const entries = new Map()
const MAX_ENTRIES = 500
const TTL_MS = 3 * 60 * 60 * 1000

function keyFor(chat, id) { return chat && id ? `${chat}:${id}` : null }
function prune(now = Date.now()) {
    for (const [key, entry] of entries) {
        if (now - entry.at > TTL_MS) entries.delete(key)
    }
    while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value)
}
function remember(raw) {
    const key = keyFor(raw?.key?.remoteJid, raw?.key?.id)
    if (!key || !raw?.message) return
    entries.set(key, { raw, at: Date.now() })
    prune()
}
function get(chat, id) {
    prune()
    return entries.get(keyFor(chat, id))?.raw || null
}
function clear() { entries.clear() }
module.exports = { remember, get, clear, _entries: entries }
