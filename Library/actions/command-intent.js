'use strict'

const parseMovieLookupTitle = (input) => {
    const text = String(input || '').trim()
        .replace(/^(?:(?:hey|hi|hello|yo)\s+)?@?bera(?:\s+ai)?\s*[,;:!—-]?\s*/i, '')
        .replace(/^[\s:,-]+/, '')
    const prefix = /^(?:please\s+)?(?:(?:can|could)\s+you\s+)?(?:search|find|look\s*up|lookup)\s+(?:for\s+)?(?:me\s+)?(?:(?:the|a|an)\s+)?(?:movie|film|tv\s*show|series)\s+(?:(?:called|named)\s+)?(.+?)\s*[?.!]*$/i
    const suffix = /^(?:please\s+)?(?:(?:can|could)\s+you\s+)?(?:search|find|look\s*up|lookup)\s+(?:for\s+)?(?:me\s+)?(.+?)\s+(?:movie|film|tv\s*show|series)\s*[?.!]*$/i
    const match = text.match(prefix) || text.match(suffix)
    if (!match) return null
    const title = String(match[1] || '')
        .replace(/\s+(?:and\s+)?(?:please\s+)?(?:show|give|display|list|fetch|provide|return|tell)\s+(?:me\s+)?(?:the\s+)?(?:search\s+)?(?:results?|details?|information|info|answer)\b[\s\S]*$/i, '')
        .trim()
        .replace(/^['"“‘]+|['"”’]+$/g, '')
    return title && !/^(?:a|an|the|called|named)$/i.test(title) ? title : null
}

const parseWebSearchQuery = (input) => {
    const text = String(input || '').trim()
        .replace(/^(?:(?:hey|hi|hello|yo)\s+)?@?bera(?:\s+ai)?\s*[,;:!—-]?\s*/i, '')
        .replace(/^[\s:,-]+/, '')
    if (!text || parseMovieLookupTitle(text)) return null
    const match = text.match(/^(?:please\s+)?(?:(?:can|could)\s+you\s+)?(?:search|find|look\s*up|lookup|google|web\s+search)\s+(?:(?:the\s+)?(?:web|internet)\s+)?(?:for\s+)?(?:me\s+)?(.+?)\s*[?.!]*$/i)
    if (!match) return null
    const query = String(match[1] || '')
        .replace(/\s+(?:and\s+)?(?:please\s+)?(?:show|give|display|list|fetch|provide|return|tell)\s+(?:me\s+)?(?:the\s+)?(?:search\s+)?(?:results?|details?|information|info|answer)\b[\s\S]*$/i, '')
        .trim()
        .replace(/^['"“‘]+|['"”’]+$/g, '')
    return query && !/^(?:a|an|the|for|me)$/i.test(query) ? query : null
}

const isGitHubStatusQuery = (input) => {
    const text = String(input || '')
    return /\b(?:github|git\s+hub)\b/i.test(text) &&
        /\b(?:connect(?:ed|ion)?|access|logged[ -]?in|account|credential|configured|linked|authori[sz]ed)\b/i.test(text)
}

const parseGroupInactiveRequest = (input) => {
    const text = String(input || '')
    if (!/\b(?:inactive|least\s+active|no\s+activity|haven['’]?t\s+(?:been\s+)?active|not\s+active)\b/i.test(text)) return null
    if (!/\b(?:member|members|people|users|group|chat|here|this|all)\b/i.test(text)) return null
    const period = text.match(/\b(?:last|past|for)\s+(\d{1,3})\s*(day|days|week|weeks|month|months)\b/i)
    let days = 30
    if (period) {
        const amount = Number(period[1])
        const unit = period[2].toLowerCase()
        days = amount * (unit.startsWith('week') ? 7 : unit.startsWith('month') ? 30 : 1)
    }
    return { days: Math.min(365, Math.max(1, days)) }
}

module.exports = { parseMovieLookupTitle, parseWebSearchQuery, isGitHubStatusQuery, parseGroupInactiveRequest }
