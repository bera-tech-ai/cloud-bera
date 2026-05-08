const axios = require('axios')

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

const TRANSLATE_ENDPOINTS = [
    { url: 'https://apiskeith.top/ai/gpt41Nano',  param: 'q' },
    { url: 'https://apiskeith.top/ai/gpt',        param: 'q' },
    { url: 'https://api.siputzx.my.id/api/ai/chatgpt', param: 'text' },
    { url: 'https://api.ryzendesu.vip/api/ai/chatgpt', param: 'text' },
    { url: 'https://bk9.fun/ai/gpt',              param: 'q' },
]

const translate = async (text, targetLang) => {
    const resolved = resolveLanguage(targetLang) || targetLang
    const prompt = `Translate the following text to ${resolved}. Return ONLY the translated text, no explanation, no labels, no quotes:\n\n${text}`

    for (const ep of TRANSLATE_ENDPOINTS) {
        try {
            const res = await axios.get(ep.url, {
                params: { [ep.param]: prompt, q: prompt, text: prompt },
                timeout: 20000
            })
            const data = res.data
            if (data?.status === false || data?.success === false || typeof data?.error === 'string') continue
            const result = data?.result || data?.reply || data?.message || data?.text || data?.response || ''
            if (!result || typeof result !== 'string') continue
            return { success: true, result: result.trim(), from: 'Auto-detect', to: resolved }
        } catch (e) {
            const status = e?.response?.status
            if (status === 404 || status === 403 || status === 500 || status === 502 || status === 503) continue
        }
    }
    return { success: false, error: 'Translation failed. Try again.' }
}

module.exports = { translate, resolveLanguage, LANGS }
