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
    if (!query || /^(?:a|an|the|for|me)$/i.test(query)) return null
    // "find my phone" / "search my messages" ask about the user's own
    // things, not the web — a query starting with "my " is not a web search.
    if (/^my\s/i.test(query)) return null
    return query
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

const stripTrigger = (input) => String(input || '').trim()
    .replace(/^(?:(?:hey|hi|hello|yo)\s+)?@?(?:bera(?:\s+ai)?|agent)\s*[,;:!—-]?\s*/i, '')
    .replace(/^[\s:,-]+/, '')

// "list members" / "who is Casper in this group" / "who is babe".
// Returns { list: true } or { name } — the caller must check group context.
const parseMemberSearch = (input) => {
    const text = stripTrigger(input)
    if (/^(?:please\s+)?(?:list|show(?:\s+me)?|display)\s+(?:all\s+)?(?:the\s+)?(?:group\s+)?members?\b/i.test(text) ||
        /^(?:please\s+)?who(?:'s| is)\s+in\s+(?:this|the)\s+group\b/i.test(text)) return { list: true }
    const match = text.match(/^(?:please\s+)?(?:who\s+is|find|search\s+for|look\s+for|is)\s+(.+?)\s+in\s+(?:this|the)\s+group\s*[?.!]*$/i) ||
        text.match(/^(?:please\s+)?who\s+is\s+@?(.+?)\s*[?.!]*$/i) ||
        text.match(/^(?:please\s+)?(?:find|search\s+for|look\s+for|look\s+up)\s+(?:the\s+)?(?:user|username|member)\s+@?(.+?)\s*[?.!]*$/i) ||
        text.match(/^(?:please\s+)?(?:find|search\s+for|look\s+for|look\s+up)\s+@(.+?)\s*[?.!]*$/i)
    if (!match) return null
    const name = String(match[1] || '').trim().replace(/^@/, '').replace(/^['"“‘]+|['"”’]+$/g, '').replace(/\s+[?.!]*$/, '')
    if (!name || name.length < 2 || name.split(/\s+/).length > 3 || /^(everyone|everybody|all|anyone|someone|the\s+admins?|admins?)$/i.test(name)) return null
    // "who is the president" is a general question, not a member lookup:
    // names starting with "the " and role/status words are not person names.
    const lowered = name.toLowerCase()
    if (lowered.startsWith('the ') || ['online', 'president', 'owner', 'admin', 'bot', 'here'].includes(lowered)) return null
    return { name }
}

// "say hello in voice" / "send a voice note saying good morning".
// Returns { text } — the exact words to speak.
const parseSayInVoice = (input) => {
    const text = stripTrigger(input)
    const clean = (s) => String(s || '').trim().replace(/^['"“‘]+|['"”’]+$/g, '')
    const valid = (s) => {
        const v = clean(s)
        return v && v.length >= 2 && !/^(it|that|this|something|anything|that\s+for\s+me)$/i.test(v) ? v : null
    }
    // Only explicit "say/read <these exact words> in voice / out loud"
    // shapes count — the captured text is spoken literally. "tell me a
    // joke in voice" asks FOR content (a joke the bot must invent), so
    // "tell" only counts with "out loud", never with "in voice".
    let match = text.match(/^(?:please\s+)?read\s+(.+?)\s+(?:aloud|out\s+loud)\s+in\s+voice\s*[?.!]*$/i) ||
        text.match(/^(?:please\s+)?(?:say|speak|read)\s+(.+?)\s+(?:in\s+voice|as\s+a\s+voice\s+note|out\s+loud)\s*[?.!]*$/i) ||
        text.match(/^(?:please\s+)?(?:say|speak|read)\s+(.+?)\s+in\s+a\s+voice\s+note\s*[?.!]*$/i) ||
        text.match(/^(?:please\s+)?tell(?:\s+me)?\s+(.+?)\s+out\s+loud\s*[?.!]*$/i)
    if (match) {
        const spoken = valid(match[1])
        return spoken ? { text: spoken } : null
    }
    match = text.match(/^(?:please\s+)?send\s+(?:me\s+)?a\s+voice\s+note\s+(?:saying\s+)?(.+?)\s*[?.!]*$/i)
    if (match) {
        const spoken = valid(match[1])
        return spoken ? { text: spoken } : null
    }
    return null
}

// "what do you see" / "describe this image" / "what is in this picture".
// Returns { question } — the caller must check an image is actually present
// (quoted image or attached image), the parser alone does not prove that.
const parseImageQuestion = (input) => {
    const text = stripTrigger(input)
    if (/^(?:what\s+do\s+you\s+see|what\s+can\s+you\s+see)\s*[?.!]*$/i.test(text)) return { question: text }
    if (/\b(describe|explain|read|tell\s+me\s+about|what(?:'s| is)|what\s+does)\b.{0,30}\b(this|that|the)\s+(image|picture|photo|pic|screenshot)\b/i.test(text)) return { question: text }
    if (/\bwhat(?:'s| is)\s+(in|on)\s+(this|that|the)\s+(image|picture|photo|pic)\b/i.test(text)) return { question: text }
    return null
}

// "open this view once" / "reveal the view once" / bare "vv" — the user is
// asking to reveal a quoted view-once message. Returns true on a match.
const parseViewOnceReveal = (input) => {
    const text = stripTrigger(input).trim().toLowerCase()
    if (/^\.?vv2?$/.test(text) || /^rvo$/.test(text)) return true
    if (/\bview[\s-]?once\b/.test(text) && /\b(open|reveal|show|see|save|download|unlock|get|send|resend|check|display)\b/.test(text)) return true
    if (/\b(reveal|open|unlock|show)\b/.test(text) && /\bview[\s-]?once\b/.test(text)) return true
    return false
}

// "from now on use voice to communicate" / "talk to me in voice" — a
// persistent reply mode, not a one-off voice note (that's parseSayInVoice).
// Returns { on: true | false }. Checked before parseSayInVoice because
// "speak to me in voice" reads as a mode request, not words to speak.
const parseVoiceMode = (input) => {
    const text = stripTrigger(input)
    if (/^(?:please\s+)?(?:from\s+now\s+on|starting\s+now|henceforth)\b.{0,40}\bvoice\b/i.test(text) ||
        // Imperative about the bot's own replies only: the verb must be
        // followed directly by "(to me) (in) voice". "talk about voice
        // acting in kenya" is a topic, not a mode switch.
        /^(?:please\s+)?(?:use|talk|answer|reply|respond|communicate|speak)(?:\s+to\s+me)?\s+(?:in\s+)?voice\b.{0,20}$/i.test(text) ||
        /^(?:please\s+)?switch\s+to\s+voice\b/i.test(text) ||
        /^(?:please\s+)?turn\s+voice\s+on\b/i.test(text) ||
        /^(?:please\s+)?voice\s+mode\s+on\b/i.test(text) ||
        /^(?:please\s+)?can\s+you\s+talk\s+in\s+voice\b/i.test(text)) return { on: true }
    if (/^(?:please\s+)?(?:stop|disable|switch\s+off)\b.{0,30}\bvoice\b/i.test(text) ||
        /^(?:please\s+)?turn\s+(?:voice\s+)?off\b/i.test(text) ||
        /^(?:please\s+)?(?:back\s+to|switch\s+back\s+to|use|switch\s+to|talk\s+in|answer\s+in|reply\s+in)\s+text\b/i.test(text) ||
        /^(?:please\s+)?voice\s+mode\s+off\b/i.test(text)) return { on: false }
    return null
}

module.exports = { parseMovieLookupTitle, parseWebSearchQuery, isGitHubStatusQuery, parseGroupInactiveRequest, parseMemberSearch, parseSayInVoice, parseImageQuestion, parseVoiceMode, parseViewOnceReveal }
