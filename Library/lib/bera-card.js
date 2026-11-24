'use strict'

const VERSION = 'v3.0.0'
const FOOTER = `⌬ ʙᴇʀᴀ ᴀɪ · ᴘʀᴇᴍɪᴜᴍ · ${VERSION}`

const SMALL = value => String(value || '')
    .replace(/[A-Z]/g, char => ({
        A: 'ᴀ', B: 'ʙ', C: 'ᴄ', D: 'ᴅ', E: 'ᴇ', F: 'ꜰ', G: 'ɢ', H: 'ʜ', I: 'ɪ', J: 'ᴊ',
        K: 'ᴋ', L: 'ʟ', M: 'ᴍ', N: 'ɴ', O: 'ᴏ', P: 'ᴘ', Q: 'ǫ', R: 'ʀ', S: 's', T: 'ᴛ',
        U: 'ᴜ', V: 'ᴠ', W: 'ᴡ', X: 'x', Y: 'ʏ', Z: 'ᴢ'
    }[char] || char))

const clean = value => String(value ?? '').replace(/\r\n/g, '\n').trim()
const alreadyCarded = value => /^\s*╭[─━═]+/u.test(String(value || '')) || String(value || '').includes(FOOTER)

const inferType = body => {
    if (/^\s*(?:❌|⛔|🚫|ERROR|FAILED|FAIL)/i.test(body)) return 'error'
    if (/^\s*(?:⚠️|⚠|WARNING|WARN)/i.test(body)) return 'warning'
    if (/^\s*(?:✅|☑️|DONE|SUCCESS|COMPLETED)/i.test(body)) return 'success'
    if (/\b(?:confirm|confirmation|pending|preview)\b/i.test(body)) return 'confirmation'
    return 'info'
}

const statusFor = type => ({
    success: '✅ ᴄᴏᴍᴘʟᴇᴛᴇᴅ',
    error: '❌ ʀᴇᴊᴇᴄᴛᴇᴅ',
    warning: '⚠️ ᴀᴛᴛᴇɴᴛɪᴏɴ',
    confirmation: '⏳ ᴘᴇɴᴅɪɴɢ',
    info: 'ℹ️ ʀᴇsᴘᴏɴsᴇ'
}[type] || 'ℹ️ ʀᴇsᴘᴏɴsᴇ')

/**
 * Format user-facing text consistently without changing the command's content.
 * Existing custom cards are returned untouched, making this safe for legacy UI.
 */
const formatBeraCard = (value, options = {}) => {
    const body = clean(value)
    if (!body || options.enabled === false || alreadyCarded(body)) return body
    const type = options.type || inferType(body)
    const title = String(options.title || 'BERA AI').trim().toUpperCase()
    const subtitle = String(options.subtitle || 'WHATSAPP ASSISTANT').trim()
    const status = options.status || statusFor(type)
    const footer = options.footer === false ? '' : String(options.footer || FOOTER)
    const lines = body.split('\n')
    const content = lines.map(line => line ? `│ ${line}` : '│').join('\n')
    const header = [
        '╭──────────────────────╮',
        `│ ◉ 𝗕𝗘𝗥𝗔 𝗔𝗜${title === 'BERA AI' ? '' : ` · ${title}`}`,
        `│   ${SMALL(subtitle)}`,
        '├──────────────────────┤',
        `│ ◈ sᴛᴀᴛᴜs ⟶ ${status}`,
        '│'
    ].join('\n')
    const tail = footer ? `\n│\n│   ${footer}\n╰──────────────────────╯` : '\n╰──────────────────────╯'
    return `${header}\n${content}${tail}`
}

const stripCardOptions = extra => {
    const payload = { ...(extra || {}) }
    for (const key of ['card', 'cardTitle', 'cardSubtitle', 'cardType', 'cardStatus', 'cardFooter', 'raw']) delete payload[key]
    return payload
}

module.exports = {
    VERSION,
    FOOTER,
    formatBeraCard,
    stripCardOptions,
    alreadyCarded,
}
