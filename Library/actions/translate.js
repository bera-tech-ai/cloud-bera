const axios = require('axios')

const GIFTED = 'https://api.giftedtech.co.ke'
const GIFTED_KEY = '_0u5aff45,_0l1876s8qc'

const LANGS = {
    english: 'English', en: 'English',
    spanish: 'Spanish', es: 'Spanish',
    french: 'French', fr: 'French',
    german: 'German', de: 'German',
    portuguese: 'Portuguese', pt: 'Portuguese',
    arabic: 'Arabic', ar: 'Arabic',
    swahili: 'Swahili', sw: 'Swahili',
    chinese: 'Chinese', zh: 'Chinese',
    japanese: 'Japanese', ja: 'Japanese',
    hindi: 'Hindi', hi: 'Hindi',
    russian: 'Russian', ru: 'Russian',
    italian: 'Italian', it: 'Italian',
    dutch: 'Dutch', nl: 'Dutch',
    korean: 'Korean', ko: 'Korean',
    turkish: 'Turkish', tr: 'Turkish',
    zulu: 'Zulu', zu: 'Zulu',
    hausa: 'Hausa', ha: 'Hausa',
    yoruba: 'Yoruba', yo: 'Yoruba',
    igbo: 'Igbo', ig: 'Igbo',
    amharic: 'Amharic', am: 'Amharic',
    somali: 'Somali', so: 'Somali',
}

const resolveLanguage = (lang) => {
    if (!lang) return null
    return LANGS[lang.toLowerCase()] || lang
}

// Gifted AI endpoints for translation
const TRANSLATE_ENDPOINTS = [
    { url: `${GIFTED}/api/ai/gemini`,  param: 'q', needsKey: true },
    { url: `${GIFTED}/api/ai/gpt`,     param: 'q', needsKey: true },
    { url: `${GIFTED}/api/ai/ai`,      param: 'q', needsKey: true },
    { url: `${GIFTED}/api/ai/chatgpt`, param: 'q', needsKey: true },
]

const translate = async (text, targetLang) => {
    const resolved = resolveLanguage(targetLang) || targetLang
    const prompt = `Translate the following text to ${resolved}. Return ONLY the translated text, no explanation, no labels, no quotes, no markdown:\n\n${text}`

    for (const ep of TRANSLATE_ENDPOINTS) {
        try {
            const params = { [ep.param]: prompt }
            if (ep.needsKey) {
                params.apikey = GIFTED_KEY
            }
            
            const res = await axios.get(ep.url, { params, timeout: 20000 })
            const data = res.data
            
            // Check for errors
            if (data?.status === false || data?.success === false) continue
            if (data?.result === 'Request failed with status code 403') continue
            
            // Extract result from various possible response formats
            const result = data?.result || data?.reply || data?.message || data?.text || data?.response || ''
            
            if (!result || typeof result !== 'string') continue
            
            // Clean up the result (remove any leftover quotes or labels)
            let cleaned = result.trim()
            cleaned = cleaned.replace(/^["']|["']$/g, '') // Remove surrounding quotes
            if (cleaned.length > 0) {
                return { success: true, result: cleaned, from: 'Auto-detect', to: resolved }
            }
        } catch (e) {
            const status = e?.response?.status
            if (status === 404 || status === 403 || status === 500 || status === 502 || status === 503) continue
        }
    }
    
    return { success: false, error: 'Translation failed. Try again.' }
}

module.exports = { translate, resolveLanguage, LANGS }
