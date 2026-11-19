'use strict'

const xcasper = require('./xcasper')

const LANGS = {
    english: 'English', en: 'English', spanish: 'Spanish', es: 'Spanish', french: 'French', fr: 'French',
    german: 'German', de: 'German', portuguese: 'Portuguese', pt: 'Portuguese', arabic: 'Arabic', ar: 'Arabic',
    swahili: 'Swahili', sw: 'Swahili', chinese: 'Chinese', zh: 'Chinese', japanese: 'Japanese', ja: 'Japanese',
    hindi: 'Hindi', hi: 'Hindi', russian: 'Russian', ru: 'Russian', italian: 'Italian', it: 'Italian',
    dutch: 'Dutch', nl: 'Dutch', korean: 'Korean', ko: 'Korean', turkish: 'Turkish', tr: 'Turkish',
    zulu: 'Zulu', zu: 'Zulu', hausa: 'Hausa', ha: 'Hausa', yoruba: 'Yoruba', yo: 'Yoruba', igbo: 'Igbo', ig: 'Igbo',
    amharic: 'Amharic', am: 'Amharic', somali: 'Somali', so: 'Somali'
}

const resolveLanguage = lang => lang ? (LANGS[String(lang).toLowerCase()] || lang) : null

const translate = async (text, targetLang) => {
    const resolved = resolveLanguage(targetLang) || targetLang
    const prompt = `Translate the following text to ${resolved}. Return ONLY the translated text, with no explanation, labels, quotes, or markdown.\n\n${text}`
    try {
        const result = await xcasper.chat([{ role: 'user', content: prompt }])
        if (!result.success || !result.text) return { success: false, error: result.error || 'Translation failed.' }
        return { success: true, result: result.text.trim().replace(/^['"]|['"]$/g, ''), from: 'Auto-detect', to: resolved, provider: result.provider }
    } catch (e) {
        return { success: false, error: `Translation failed: ${e.message}` }
    }
}

module.exports = { translate, resolveLanguage, LANGS }
