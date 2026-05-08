// Library/actions/btnmode.js
// Toggle button UI on/off per-chat or globally
// When OFF → commands reply with plain text instead of buttons

// Global store (persists in memory for bot session)
const store = global.beraBtnMode || (global.beraBtnMode = {
    global: true, // true = buttons ON by default
    perChat: {},  // override per chat/group
})

/**
 * getBtnMode(chatJid) → boolean
 * Returns true if buttons are enabled for this chat
 */
const getBtnMode = (chatJid) => {
    if (chatJid && store.perChat.hasOwnProperty(chatJid)) return store.perChat[chatJid]
    return store.global
}

/**
 * setBtnMode(chatJid, value, isGlobal)
 * chatJid = null → set globally
 * chatJid = jid  → set for that chat only
 */
const setBtnMode = (chatJid, value, isGlobal = false) => {
    if (isGlobal || !chatJid) {
        store.global = value
        store.perChat = {} // clear overrides when setting global
    } else {
        store.perChat[chatJid] = value
    }
}

/**
 * clearBtnMode(chatJid)
 * Resets a chat to follow global default
 */
const clearBtnMode = (chatJid) => {
    if (chatJid) delete store.perChat[chatJid]
}

module.exports = { getBtnMode, setBtnMode, clearBtnMode, store }
