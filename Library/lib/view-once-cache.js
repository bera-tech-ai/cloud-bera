'use strict'

// File-backed cache of view-once media bytes, captured at arrival time.
// A quoted view-once copy loses its download address, and a re-upload
// request depends on the sender's phone — the only reliable copy is the
// one downloaded when the message first arrives. Entries live 3 hours,
// matching the raw-message store's window.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const TTL_MS = 3 * 60 * 60 * 1000
const MAX_ENTRIES = 100
const DIR = process.env.BERA_VIEWONCE_MEDIA_DIR
    || path.join(__dirname, '..', '..', 'Database', 'view_once_media')
const INDEX_FILE = path.join(DIR, 'index.json')

let index = null

function loadIndex() {
    if (index) return index
    try { index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')) } catch { index = {} }
    return index
}

function saveIndex() {
    try {
        fs.mkdirSync(DIR, { recursive: true })
        // Atomic write: a crash mid-write must not corrupt the index.
        const tmp = `${INDEX_FILE}.tmp-${process.pid}`
        fs.writeFileSync(tmp, JSON.stringify(index))
        fs.renameSync(tmp, INDEX_FILE)
    } catch {}
}

function fileFor(key) {
    return path.join(DIR, crypto.createHash('sha1').update(key).digest('hex') + '.bin')
}

function prune(now = Date.now()) {
    const idx = loadIndex()
    let changed = false
    for (const [key, entry] of Object.entries(idx)) {
        if (now - Number(entry.at || 0) > TTL_MS) {
            try { fs.unlinkSync(fileFor(key)) } catch {}
            delete idx[key]
            changed = true
        }
    }
    const keys = Object.keys(idx)
    if (keys.length > MAX_ENTRIES) {
        keys.sort((a, b) => Number(idx[a].at || 0) - Number(idx[b].at || 0))
        for (const key of keys.slice(0, keys.length - MAX_ENTRIES)) {
            try { fs.unlinkSync(fileFor(key)) } catch {}
            delete idx[key]
            changed = true
        }
    }
    if (changed) saveIndex()
}

function put(chat, id, buffer, meta = {}) {
    if (!chat || !id || !buffer?.length) return false
    try {
        const idx = loadIndex()
        const key = `${chat}:${id}`
        fs.mkdirSync(DIR, { recursive: true })
        fs.writeFileSync(fileFor(key), buffer)
        idx[key] = { at: Date.now(), ...meta }
        saveIndex()
        prune()
        return true
    } catch { return false }
}

function get(chat, id) {
    if (!chat || !id) return null
    try {
        prune()
        const idx = loadIndex()
        const entry = idx[`${chat}:${id}`]
        if (!entry) return null
        const buffer = fs.readFileSync(fileFor(`${chat}:${id}`))
        return buffer.length ? { buffer, meta: entry } : null
    } catch { return null }
}

module.exports = { put, get, _dir: DIR }
