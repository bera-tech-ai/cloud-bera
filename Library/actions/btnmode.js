// Library/actions/btnmode.js
// Toggle button UI on/off per-chat or globally
// When OFF → commands reply with plain text instead of buttons
//
// Persistence: the store is mirrored into global.db.data.settings.btnMode
// (and hydrated back from it on first use), so a .btnmode choice survives
// restarts like every other setting. When global.db is unavailable (tests,
// early boot) it degrades to the original in-memory-only behaviour.

const store = global.beraBtnMode || (global.beraBtnMode = {
    global: false, // OFF by default — use .btnmode on to enable
    perChat: {},
})

let _hydrated = false
let _touched = false

const _hydrate = () => {
    if (_hydrated || _touched) return
    try {
        const saved = global.db?.data?.settings?.btnMode
        if (saved && typeof saved === 'object') {
            if (typeof saved.global === 'boolean') store.global = saved.global
            if (saved.perChat && typeof saved.perChat === 'object') store.perChat = { ...saved.perChat }
            _hydrated = true
        } else if (global.db?.data) {
            _hydrated = true // DB is up and holds no btnMode yet — nothing to adopt
        }
    } catch {}
}

const _persist = () => {
    try {
        if (!global.db?.data || typeof global.db.write !== 'function') return
        if (!global.db.data.settings) global.db.data.settings = {}
        global.db.data.settings.btnMode = { global: store.global, perChat: { ...store.perChat } }
        Promise.resolve(global.db.write()).catch(() => {})
    } catch {}
}

/**
 * getBtnMode(chatJid) → boolean
 * Returns true if buttons are enabled for this chat
 */
const getBtnMode = (chatJid) => {
    _hydrate()
    if (chatJid && store.perChat.hasOwnProperty(chatJid)) return store.perChat[chatJid]
    return store.global
}

/**
 * setBtnMode(chatJid, value, isGlobal)
 * chatJid = null → set globally
 * chatJid = jid  → set for that chat only
 */
const setBtnMode = (chatJid, value, isGlobal = false) => {
    _hydrate()
    _touched = true
    if (isGlobal || !chatJid) {
        store.global = value
        store.perChat = {} // clear overrides when setting global
    } else {
        store.perChat[chatJid] = value
    }
    _persist()
}

/**
 * clearBtnMode(chatJid)
 * Resets a chat to follow global default
 */
const clearBtnMode = (chatJid) => {
    _hydrate()
    _touched = true
    if (chatJid) delete store.perChat[chatJid]
    _persist()
}

module.exports = { getBtnMode, setBtnMode, clearBtnMode, store }
