'use strict'

// ── Bera response-card system (spec §21) ──────────────────────────────────────
// Central formatter for all user-facing text. Raw code, short media captions,
// structured button/list/poll payloads, existing custom cards and explicitly
// raw output bypass it (see formatBeraCard / alreadyCarded). Every card ends
// with the single product footer: ⌬ ʙᴇʀᴀ ᴀɪ · ᴘʀᴇᴍɪᴜᴍ · v3.0.0

const VERSION = 'v3.0.0'
const FOOTER = `⌬ ʙᴇʀᴀ ᴀɪ · ᴘʀᴇᴍɪᴜᴍ · ${VERSION}`
const MAX_MESSAGE_LENGTH = 4000

const SMALL = value => String(value || '')
    .replace(/[A-Z]/g, char => ({
        A: 'ᴀ', B: 'ʙ', C: 'ᴄ', D: 'ᴅ', E: 'ᴇ', F: 'ꜰ', G: 'ɢ', H: 'ʜ', I: 'ɪ', J: 'ᴊ',
        K: 'ᴋ', L: 'ʟ', M: 'ᴍ', N: 'ɴ', O: 'ᴏ', P: 'ᴘ', Q: 'ǫ', R: 'ʀ', S: 's', T: 'ᴛ',
        U: 'ᴜ', V: 'ᴠ', W: 'ᴡ', X: 'x', Y: 'ʏ', Z: 'ᴢ'
    }[char] || char))

const BOLD = value => String(value || '')
    .replace(/[A-Za-z0-9]/g, char => {
        if (/[A-Z]/.test(char)) return String.fromCodePoint(0x1D5D4 + char.charCodeAt(0) - 65)
        if (/[a-z]/.test(char)) return String.fromCodePoint(0x1D5EE + char.charCodeAt(0) - 97)
        return String.fromCodePoint(0x1D7CE + char.charCodeAt(0) - 48)
    })

const clean = value => String(value ?? '').replace(/\r\n/g, '\n').trim()
const alreadyCarded = value => /^\s*╭[─━═]+/u.test(String(value || '')) || String(value || '').includes(FOOTER)
const stripHtml = value => String(value || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()

const CARD_TYPES = ['success', 'error', 'warning', 'confirmation', 'info', 'search', 'movie', 'group-info', 'action-result', 'progress', 'permission']

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
    info: 'ℹ️ ʀᴇsᴘᴏɴsᴇ',
    search: '🔎 ʀᴇsᴜʟᴛs',
    movie: '🎬 ᴍᴇᴅɪᴀ',
    'group-info': '👥 ɢʀᴏᴜᴘ',
    'action-result': '✅ ᴄᴏᴍᴘʟᴇᴛᴇᴅ',
    progress: '⏳ ɪɴ ᴘʀᴏɢʀᴇss',
    permission: '⛔ ᴘᴇʀᴍɪssɪᴏɴ'
}[type] || 'ℹ️ ʀᴇsᴘᴏɴsᴇ')

/**
 * Format user-facing text consistently without changing the command's content.
 * Existing custom cards are returned untouched, making this safe for legacy UI.
 */
const formatBeraCard = (value, options = {}) => {
    const body = clean(value)
    if (!body || options.enabled === false || alreadyCarded(body)) return body
    const type = CARD_TYPES.includes(options.type) ? options.type : inferType(body)
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

// ── Spec §17 movie card ──────────────────────────────────────────────────────
// Exact layout from the spec (TVMaze example). `show` is the normalized shape
// returned by Library/actions/movie.js searchShow().

const formatMovieCard = show => {
    const s = show || {}
    const title = BOLD(String(s.name || s.Title || 'Unknown').toUpperCase())
    const rating = s.rating?.average ?? s.rating ?? s.imdbRating ?? 'N/A'
    const status = SMALL(String(s.status || 'unknown').toUpperCase())
    const genres = SMALL((((s.genres || [])).join(', ') || (s.Genre || 'general')).toUpperCase())
    const summary = stripHtml(s.summary || s.Plot || '').slice(0, 900) || 'No summary available.'
    return [
        '╭──────────────────────╮',
        `│ ◉ ${title}`,
        '│   ᴛᴠᴍᴀᴢᴇ',
        '├──────────────────────┤',
        `│ ◈ ʀᴀᴛɪɴɢ ⟶ ${BOLD(String(rating))}`,
        `│ ◈ sᴛᴀᴛᴜs ⟶ ${status}`,
        `│ ◈ ɢᴇɴʀᴇs ⟶ ${genres}`,
        '│',
        ...summary.split('\n').map(line => line ? `│ ${line}` : '│'),
        '│',
        `│   ${FOOTER}`,
        '╰──────────────────────╯'
    ].join('\n')
}

// ── Search card (§17/§21) ────────────────────────────────────────────────────
// Numbered results; URLs are preserved whole (never wrapped or truncated).

const formatSearchCard = (query, results) => {
    const rows = (Array.isArray(results) ? results : []).slice(0, 5)
    if (!rows.length) {
        return formatBeraCard(`No results found for: ${String(query || '').trim()}`, { type: 'search', title: 'SEARCH' })
    }
    const body = [`Results for: ${String(query || '').trim()}`, ''].concat(rows.flatMap((item, index) => {
        const lines = [`${index + 1}. ${String(item.title || item.name || 'Result').trim()}`]
        if (item.snippet || item.description) lines.push(String(item.snippet || item.description).trim().slice(0, 300))
        if (item.url || item.link) lines.push(String(item.url || item.link).trim())
        lines.push('')
        return lines
    })).join('\n').trim()
    return formatBeraCard(body, { type: 'search', title: 'SEARCH' })
}

// ── Group-information card (§21) ────────────────────────────────────────────

const formatGroupInfoCard = group => {
    const g = group || {}
    const lines = []
    if (g.name || g.subject) lines.push(`Name: ${g.name || g.subject}`)
    if (g.id) lines.push(`ID: ${g.id}`)
    if (g.participantCount != null) lines.push(`Members: ${g.participantCount}`)
    if (Array.isArray(g.admins) && g.admins.length) lines.push(`Admins: ${g.admins.join(', ')}`)
    if (g.description || g.desc) lines.push('', String(g.description || g.desc).slice(0, 500))
    return formatBeraCard(lines.join('\n') || 'No group information available.', { type: 'group-info', title: 'GROUP INFO' })
}

// ── Action-result card (§21/§23) ─────────────────────────────────────────────
// Truthful status: 'accepted' means Baileys accepted the request only —
// device-side confirmation is NOT claimed. See spec §23.

const BAILEYS_ACCEPTED_LINE = 'Request accepted by Baileys. Final device-side visibility depends on WhatsApp processing.'

const formatActionResultCard = ({ action, target, outcome, detail } = {}) => {
    const outcomeLower = String(outcome || 'accepted').toLowerCase()
    const lines = []
    if (action) lines.push(`Action: ${action}`)
    if (target) lines.push(`Target: ${target}`)
    lines.push('')
    if (outcomeLower === 'accepted') {
        lines.push(BAILEYS_ACCEPTED_LINE)
        return formatBeraCard(lines.join('\n'), { type: 'action-result', title: 'ACTION', status: '✅ ᴀᴄᴄᴇᴘᴛᴇᴅ' })
    }
    if (outcomeLower === 'failed' || outcomeLower === 'rejected') {
        if (detail) lines.push(detail)
        return formatBeraCard(lines.join('\n'), { type: 'error', title: 'ACTION' })
    }
    if (detail) lines.push(detail)
    return formatBeraCard(lines.join('\n'), { type: 'action-result', title: 'ACTION' })
}

// ── Progress card (§21) ──────────────────────────────────────────────────────

const formatProgressCard = ({ title, done, total, detail } = {}) => {
    const step = total ? `Step ${done || 0} of ${total}` : `Step ${done || 0}`
    const percent = total ? Math.round(((done || 0) / total) * 100) : null
    const bar = percent == null ? '' : `\n${'█'.repeat(Math.round(percent / 10))}${'░'.repeat(10 - Math.round(percent / 10))} ${percent}%`
    const body = [step, bar, detail ? `\n${detail}` : ''].join('').trim()
    return formatBeraCard(body, { type: 'progress', title: title || 'PROGRESS' })
}

// ── Permission card (§21/§22) ────────────────────────────────────────────────
// Always says WHO lacked permission — the user or the bot — never a generic
// "you can't do this". `who` is 'user' or 'bot'.

const formatPermissionCard = ({ action, who, reason, detail } = {}) => {
    const lines = []
    if (action) lines.push(`Action: ${action}`)
    lines.push('')
    if (who === 'bot') {
        lines.push('Bera AI does not have the WhatsApp permission needed for this action.')
        lines.push('The bot must be a group admin for this. Ask a group admin to make Bera AI an admin and try again.')
    } else {
        lines.push('You do not have permission for this action.')
        lines.push('Only the bot owner, a sudo user, or a group admin can do this.')
    }
    if (reason) lines.push('', `Reason: ${reason}`)
    if (detail) lines.push(detail)
    return formatBeraCard(lines.join('\n'), { type: 'permission', title: 'PERMISSION' })
}

// ── Long-list pagination + safe splitting (§21) ──────────────────────────────
// paginateList slices a list into pages; splitMessage splits long text on line
// boundaries (never mid-line, so URLs stay whole) and keeps ``` code fences
// balanced across chunks.

const paginateList = (items, { page = 1, perPage = 10 } = {}) => {
    const list = Array.isArray(items) ? items : []
    const size = Math.max(1, Number(perPage) || 10)
    const totalPages = Math.max(1, Math.ceil(list.length / size))
    const current = Math.min(Math.max(1, Number(page) || 1), totalPages)
    const start = (current - 1) * size
    return {
        items: list.slice(start, start + size),
        page: current,
        perPage: size,
        total: list.length,
        totalPages,
        hasNext: current < totalPages,
        hasPrev: current > 1,
        label: `Page ${current} of ${totalPages} (${list.length} total)`
    }
}

const splitMessage = (text, maxLength = MAX_MESSAGE_LENGTH) => {
    const body = String(text ?? '')
    if (!body) return []
    const limit = Math.max(500, Number(maxLength) || MAX_MESSAGE_LENGTH)
    if (body.length <= limit) return [body]
    const chunks = []
    let current = ''
    let inFence = false
    const pushChunk = () => {
        if (!current) return
        chunks.push(inFence ? `${current}\n\`\`\`` : current)
        current = inFence ? '```' : ''
    }
    for (const line of body.split('\n')) {
        const next = current ? `${current}\n${line}` : line
        if (next.length > limit && current) {
            pushChunk()
            current = line
        } else {
            current = next
        }
        if (/^\s*```/.test(line)) inFence = !inFence
    }
    if (current) chunks.push(current)
    return chunks
}

module.exports = {
    VERSION,
    FOOTER,
    MAX_MESSAGE_LENGTH,
    CARD_TYPES,
    BAILEYS_ACCEPTED_LINE,
    formatBeraCard,
    stripCardOptions,
    alreadyCarded,
    formatMovieCard,
    formatSearchCard,
    formatGroupInfoCard,
    formatActionResultCard,
    formatProgressCard,
    formatPermissionCard,
    paginateList,
    splitMessage,
}
