'use strict'

const DEFAULT_DEVELOPER_NUMBERS = ['254116763755', '254743982206']

/**
 * Return the phone-number portion of a WhatsApp JID or formatted phone number.
 * Device suffixes (for example :12) and all non-digit formatting are removed.
 */
const normalizePhoneNumber = (value) => {
    if (value === null || value === undefined) return ''
    let local = String(value).trim().split('@')[0]
    local = local.split(':')[0]
    return local.replace(/\D/g, '')
}

/**
 * Normalize phone JIDs to the canonical bare-number form while preserving
 * non-phone JID servers such as groups and broadcasts.
 */
const normalizeJid = (value) => {
    if (value === null || value === undefined) return ''
    const raw = String(value).trim()
    if (!raw) return ''

    if (raw.includes('@')) {
        const [local, server] = raw.split('@', 2)
        if (!local || !server) return ''
        if (server === 's.whatsapp.net' || server === 'c.us') {
            const number = normalizePhoneNumber(local)
            return number ? `${number}@s.whatsapp.net` : ''
        }
        return `${local.split(':')[0]}@${server}`
    }

    const number = normalizePhoneNumber(raw)
    return number ? `${number}@s.whatsapp.net` : ''
}

const configuredNumbers = [
    ...DEFAULT_DEVELOPER_NUMBERS,
    ...(process.env.DEVELOPER_NUMBERS || '').split(/[,\s]+/),
    process.env.DEVELOPER_PHONE || '',
    process.env.OWNER_NUMBER || ''
].map(normalizePhoneNumber).filter(Boolean)

const DEVELOPER_NUMBERS = new Set(configuredNumbers)

const isDeveloper = (value) => {
    const number = normalizePhoneNumber(value)
    return Boolean(number && DEVELOPER_NUMBERS.has(number))
}

const isSameUser = (left, right) => {
    const leftNumber = normalizePhoneNumber(left)
    const rightNumber = normalizePhoneNumber(right)
    return Boolean(leftNumber && leftNumber === rightNumber)
}

const isSimpleGreeting = (text) => {
    const normalized = String(text || '')
        .trim()
        .toLowerCase()
        .replace(/[!?.,:;]+$/g, '')
        .replace(/\s+/g, ' ')

    return new Set([
        'hi',
        'hello',
        'hey',
        'good morning',
        'good afternoon',
        'good evening',
        'greetings'
    ]).has(normalized)
}

module.exports = {
    DEFAULT_DEVELOPER_NUMBERS,
    DEVELOPER_NUMBERS,
    normalizePhoneNumber,
    normalizeJid,
    isDeveloper,
    isSameUser,
    isSimpleGreeting
}