// Library/actions/btns.js — Button sender for Bera AI (@whiskeysockets/baileys)
//
// gifted-btns internally requires('@whiskeysockets/baileys') for its helpers.
// We redirect that to gifted-baileys (same ecosystem, same author as gifted-btns).
// @whiskeysockets/baileys is kept exclusively for the WhatsApp connection (Connection/start.js).
// gifted-baileys provides the button message-building internals gifted-btns needs.
//
// Calling conventions — both are accepted:
//   Modern (3-arg):  sendBtn(conn, jid, { text, buttons, title, footer })
//   Legacy (5-arg):  sendBtn(conn, jid, m, text, buttons, extraOpts)


let _sendButtons = null
let _sendInteractive = null
try {
    const gb     = require('gifted-btns')
    _sendButtons   = gb.sendButtons || gb.default?.sendButtons || null
    _sendInteractive = gb.sendInteractiveMessage || gb.default?.sendInteractiveMessage || null
} catch (e) {
    // gifted-btns not installed or shim failed — will use plain-text fallback
}

// ── Arg normaliser — accepts both 3-arg and 5-arg calling conventions ─────────
const _resolveBtn = (opts_or_m, textArg, buttonsArg, extraArg) => {
    if (textArg !== undefined && buttonsArg !== undefined)
        return { text: textArg, buttons: buttonsArg, ...(extraArg || {}) }
    if (opts_or_m && typeof opts_or_m === 'object' && !opts_or_m.key)
        return opts_or_m
    return {}
}
const _resolveList = (opts_or_m, textArg, sectionsArg, buttonTextArg) => {
    if (textArg !== undefined && sectionsArg !== undefined)
        return { text: textArg, sections: sectionsArg, buttonText: buttonTextArg || 'Choose' }
    if (opts_or_m && typeof opts_or_m === 'object' && !opts_or_m.key)
        return opts_or_m
    return {}
}

// ── Button normaliser ─────────────────────────────────────────────────────────
const _normalizeButtons = (rawBtns) =>
    (rawBtns || []).map(b => {
        if (b.name) return b
        return {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: b.text || b.label || 'Option',
                id: b.id || b.text || ('btn_' + Math.random().toString(36).slice(2,7))
            })
        }
    })

/**
 * sendBtn(conn, jid, opts)          — Modern 3-arg
 * sendBtn(conn, jid, m, text, btns) — Legacy 5-arg
 */
const sendBtn = async (conn, jid, opts_or_m, textArg, buttonsArg, extraArg) => {
    const opts    = _resolveBtn(opts_or_m, textArg, buttonsArg, extraArg)
    const buttons = _normalizeButtons(opts.buttons)
    if (!_sendButtons) return sendBtnFallback(conn, jid, { ...opts, buttons })
    try {
        await _sendButtons(conn, jid, { ...opts, buttons })
    } catch (e) {
        await sendBtnFallback(conn, jid, { ...opts, buttons })
    }
}

/**
 * sendList(conn, jid, opts)                      — Modern 3-arg
 * sendList(conn, jid, m, text, sections, btnTxt) — Legacy 6-arg
 */
const sendList = async (conn, jid, opts_or_m, textArg, sectionsArg, buttonTextArg) => {
    const opts     = _resolveList(opts_or_m, textArg, sectionsArg, buttonTextArg)
    // Normalise rows: gifted-btns needs 'id', not 'rowId'
    const sections = (opts.sections || []).map(s => ({
        ...s,
        rows: (s.rows || []).map(({ rowId, id, ...rest }) => ({ ...rest, id: id || rowId || '' }))
    }))
    if (!_sendButtons) return sendListFallback(conn, jid, opts)
    try {
        const listBtn = {
            name: 'single_select',
            buttonParamsJson: JSON.stringify({
                title: opts.buttonText || 'Choose',
                sections
            })
        }
        await _sendButtons(conn, jid, {
            title:   opts.title  || '',
            text:    opts.text   || '',
            footer:  opts.footer || '',
            image:   opts.image  || undefined,
            buttons: [listBtn]
        })
    } catch (e) {
        await sendListFallback(conn, jid, opts)
    }
}

/**
 * sendUrlBtn(conn, jid, opts)
 * opts: { title, text, footer, url, urlText, copyCode, copyText,
 *         callNumber, callText, extraButtons }
 */
const sendUrlBtn = async (conn, jid, opts = {}) => {
    if (!_sendButtons)
        return conn.sendMessage(jid, { text: (opts.text || '') + (opts.url ? '\n' + opts.url : '') })
    try {
        const buttons = []
        if (opts.url)
            buttons.push({ name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: opts.urlText || '🔗 Open', url: opts.url, merchant_url: opts.url }) })
        if (opts.copyCode)
            buttons.push({ name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: opts.copyText || '📋 Copy', copy_code: opts.copyCode }) })
        if (opts.callNumber)
            buttons.push({ name: 'cta_call', buttonParamsJson: JSON.stringify({ display_text: opts.callText || '📞 Call', phone_number: opts.callNumber }) })
        if (opts.extraButtons)
            buttons.push(...opts.extraButtons.map(b => ({
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({ display_text: b.text || b.label, id: b.id })
            })))
        await _sendButtons(conn, jid, {
            title:   opts.title  || '',
            text:    opts.text   || '',
            footer:  opts.footer || '',
            image:   opts.image  || undefined,
            buttons
        })
    } catch (e) {
        await conn.sendMessage(jid, { text: (opts.text || '') + (opts.url ? '\n' + opts.url : '') })
    }
}

// ── Plain-text fallbacks (when gifted-btns is unavailable) ────────────────────
const sendBtnFallback = async (conn, jid, opts) => {
    const lines = []
    if (opts.title)  lines.push('*' + opts.title + '*')
    if (opts.text)   lines.push(opts.text)
    const btnLines = (opts.buttons || []).map((b, i) => {
        const lbl = b.text || b.label ||
            (b.buttonParamsJson ? (() => { try { return JSON.parse(b.buttonParamsJson).display_text } catch { return 'Option '+(i+1) } })() : 'Option '+(i+1))
        return '  [' + (i+1) + '] ' + lbl
    }).join('\n')
    if (btnLines) lines.push('\n' + btnLines)
    if (opts.footer) lines.push('\n_' + opts.footer + '_')
    await conn.sendMessage(jid, { text: lines.join('\n') })
}

const sendListFallback = async (conn, jid, opts) => {
    const rows  = (opts.sections || []).flatMap(s => s.rows || [])
    const lines = []
    if (opts.title) lines.push('*' + opts.title + '*')
    if (opts.text)  lines.push(opts.text)
    rows.forEach((r, i) =>
        lines.push('  [' + (i+1) + '] *' + r.title + '*' + (r.description ? ' — ' + r.description : ''))
    )
    if (opts.footer) lines.push('\n_' + opts.footer + '_')
    await conn.sendMessage(jid, { text: lines.join('\n') })
}

module.exports = { sendBtn, sendList, sendUrlBtn }
