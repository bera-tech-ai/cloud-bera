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

module.exports = { parseMovieLookupTitle, parseWebSearchQuery, isGitHubStatusQuery }
