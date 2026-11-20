'use strict'

const parseMovieLookupTitle = (input) => {
    const text = String(input || '').trim().replace(/^[\s:,-]+/, '')
    const prefix = /^(?:please\s+)?(?:(?:can|could)\s+you\s+)?(?:search|find|look\s*up|lookup)\s+(?:for\s+)?(?:me\s+)?(?:(?:the|a|an)\s+)?(?:movie|film|tv\s*show|series)\s+(?:(?:called|named)\s+)?(.+?)\s*[?.!]*$/i
    const suffix = /^(?:please\s+)?(?:(?:can|could)\s+you\s+)?(?:search|find|look\s*up|lookup)\s+(?:for\s+)?(?:me\s+)?(.+?)\s+(?:movie|film|tv\s*show|series)\s*[?.!]*$/i
    const match = text.match(prefix) || text.match(suffix)
    if (!match) return null
    const title = String(match[1] || '').trim().replace(/^["'“‘]+|["'”’]+$/g, '')
    return title && !/^(?:a|an|the|called|named)$/i.test(title) ? title : null
}

const isGitHubStatusQuery = (input) => {
    const text = String(input || '')
    return /\b(?:github|git\s+hub)\b/i.test(text) &&
        /\b(?:connect(?:ed|ion)?|access|logged[ -]?in|account|credential|configured|linked|authori[sz]ed)\b/i.test(text)
}

module.exports = { parseMovieLookupTitle, isGitHubStatusQuery }
