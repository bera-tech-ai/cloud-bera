'use strict'

const LANGUAGE_ALIASES = {
    english: 'en', en: 'en',
    swahili: 'sw', kiswahili: 'sw', sw: 'sw',
    sheng: 'sheng', sh: 'sheng',
    auto: 'auto', automatic: 'auto'
}

const parseLanguageChange = text => {
    const value = String(text || '').trim()
    if (!value || /\btranslate\b/i.test(value)) return null
    const match = value.match(/\b(?:change|switch|set|make)\b.{0,45}\b(?:my\s+)?(?:reply|response|chat|preferred)?\s*language\s+(?:to|as)\s+([a-z-]+)/i)
        || value.match(/\b(?:reply|speak|talk|respond)\s+(?:to\s+me\s+)?(?:in|using)\s+([a-z-]+)\b.{0,35}\b(?:from now|please|only|always)?/i)
    if (!match) return null
    const language = LANGUAGE_ALIASES[match[1].toLowerCase()]
    return language ? { language } : null
}

const parseTranslationRequest = text => {
    const value = String(text || '').trim()
    let match = value.match(/^\s*(?:please\s+)?translate\s+(?:this\s+)?(?:text\s+)?(?:to|into|in)\s+([a-z-]+)\s*[:\-]\s*(.+)$/i)
    if (match) return { target: match[1].toLowerCase(), text: match[2].trim() }
    match = value.match(/^\s*(?:please\s+)?translate\s+(.+?)\s+(?:to|into|in)\s+([a-z-]+)\s*[.!?]*$/i)
    if (match) return { target: match[2].toLowerCase(), text: match[1].trim() }
    match = value.match(/^\s*(?:please\s+)?translate\s+(?:to|into|in)\s+([a-z-]+)\s+(.+)$/i)
    if (match) return { target: match[1].toLowerCase(), text: match[2].trim() }
    return null
}

const saveLanguagePreference = async (db, sender, language) => {
    if (!db?.data || !sender || !['en', 'sw', 'sheng', 'auto'].includes(language)) {
        throw new Error('A ready database, sender, and supported language are required.')
    }
    db.data.chatbera ||= {}
    db.data.chatbera.languagePreferences ||= {}
    const key = String(sender).replace(/:\d+@/, '@').toLowerCase()
    const previous = db.data.chatbera.languagePreferences[key]
    db.data.chatbera.languagePreferences[key] = language
    try {
        await db.write()
    } catch (error) {
        if (previous === undefined) delete db.data.chatbera.languagePreferences[key]
        else db.data.chatbera.languagePreferences[key] = previous
        throw error
    }
    return key
}

module.exports = { LANGUAGE_ALIASES, parseLanguageChange, parseTranslationRequest, saveLanguagePreference }
