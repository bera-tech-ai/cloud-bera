'use strict'

// Library/lib/baileys-errors.js — Spec §13 / §23 (Phase 2).
//
// Interprets Baileys/Boom errors instead of returning generic text, and
// gives §13 user-vs-bot permission-failure wording.
//
// STOPGAP NOTE: BAILEYS_ACCEPTED_MESSAGE / PIN_ACCEPTED_MESSAGE /
// assertAccepted() duplicate PR #3's Library/lib/truthful-status.js.
// They are re-exported here so Phase 2 code has one import surface on
// main; on rebase onto PR #3, delete the duplicates here and import
// truthful-status.js instead (see PR description).

const BAILEYS_ACCEPTED_MESSAGE = 'Request accepted by Baileys. Final device-side visibility depends on WhatsApp processing.'
const PIN_ACCEPTED_MESSAGE = 'Pin request accepted by Baileys. Final device-side visibility depends on WhatsApp processing.'

const assertAccepted = (result, actionLabel, acceptedMessage = BAILEYS_ACCEPTED_MESSAGE) => {
    if (!result) throw new Error(`Baileys did not accept the ${actionLabel || 'request'}.`)
    return acceptedMessage
}

// Extract a Boom / HTTP status code from the many shapes Baileys errors take.
const statusCodeOf = (error) => {
    if (!error || typeof error !== 'object') return null
    const direct = error.statusCode || error.status || error.code
    if (typeof direct === 'number') return direct
    if (typeof direct === 'string' && /^\d{3}$/.test(direct)) return Number(direct)
    const output = error.output?.statusCode
    if (typeof output === 'number') return output
    const data = error.data?.statusCode
    if (typeof data === 'number') return data
    return null
}

const STATUS_MEANINGS = {
    400: 'WhatsApp rejected the request as malformed or invalid for this chat.',
    401: 'WhatsApp rejected the request: the session is not authorized.',
    403: 'WhatsApp refused the request: the bot does not have permission for this action.',
    404: 'WhatsApp could not find the target message, chat, or participant.',
    409: 'WhatsApp reported a conflict: the request conflicts with the current state.',
    410: 'WhatsApp reported the target is gone (message or session no longer available).',
    412: 'WhatsApp reported a precondition failure for this action.',
    428: 'WhatsApp requires the bot to be a group admin for this action.',
    429: 'WhatsApp rate-limited the request. Try again later.',
    500: 'WhatsApp returned a server error.',
    503: 'WhatsApp is temporarily unavailable.',
}

// Spec §13 rule 8: a permission failure must explain whether the *user* or
// the *bot* lacked permission. `access` is the getAccessContext() result.
const groupPermissionFailure = (access, actionLabel = 'this action') => {
    const action = actionLabel || 'this action'
    if (!access?.isGroup) return `❌ ${action} is only available in a group.`
    const userLacks = !access.isOwner && !access.isSenderAdmin
    const botLacks = !access.isBotAdmin
    if (userLacks && botLacks) {
        return `❌ Cannot ${action}: you are not a group admin, and Bera is not a group admin either. Ask a group admin to make Bera an admin, then try again.`
    }
    if (userLacks) {
        return `❌ Cannot ${action}: you are not a group admin. Only a group admin or the bot owner can do this. Bera itself is an admin, so the bot side is fine.`
    }
    if (botLacks) {
        return `❌ Cannot ${action}: Bera is not a group admin. You are an admin, but WhatsApp requires the bot itself to be an admin for this. Ask a group admin to promote Bera, then try again.`
    }
    return `❌ Cannot ${action}: permission was denied.`
}

const interpretBaileysError = (error, context = {}) => {
    const message = String(error?.message || error || 'Unknown error')
    const status = statusCodeOf(error)
    const lower = message.toLowerCase()
    let detail = STATUS_MEANINGS[status] || null
    if (!detail) {
        if (/not-?authorized|unauthorized|forbidden|not allowed|no permission|admin/.test(lower)) {
            detail = 'WhatsApp refused the request: permission was denied.'
        } else if (/not found|no such|unknown (message|chat|participant)/.test(lower)) {
            detail = 'WhatsApp could not find the target.'
        } else if (/too old|expired|too late|edit.*time|delete.*time/.test(lower)) {
            detail = 'WhatsApp no longer allows this action on that message (it may be too old).'
        } else if (/rate|too many|throttl/.test(lower)) {
            detail = 'WhatsApp rate-limited the request. Try again later.'
        }
    }
    const label = context.actionLabel ? ` (${context.actionLabel})` : ''
    const base = detail ? `${detail}${label}` : `WhatsApp rejected the request${label}: ${message}`
    // When the caller knows the access context, prefer the §13 wording.
    if (context.access && (/403|428|admin|permission|not-?authorized|forbidden/i.test(message) || status === 403 || status === 428)) {
        return groupPermissionFailure(context.access, context.actionLabel || 'perform this action')
    }
    return `❌ ${base}`
}

module.exports = {
    BAILEYS_ACCEPTED_MESSAGE,
    PIN_ACCEPTED_MESSAGE,
    assertAccepted,
    statusCodeOf,
    STATUS_MEANINGS,
    groupPermissionFailure,
    interpretBaileysError,
}
