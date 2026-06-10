'use strict'
const axios = require('axios')

const VOICE_MAP = {
    en: 'en-US-AriaNeural', sw: 'sw-KE-ZuriNeural',
    fr: 'fr-FR-DeniseNeural', de: 'de-DE-KatjaNeural',
    es: 'es-ES-ElviraNeural', pt: 'pt-BR-FranciscaNeural',
    ar: 'ar-EG-SalmaNeural', hi: 'hi-IN-SwaraNeural',
    zh: 'zh-CN-XiaoxiaoNeural', ja: 'ja-JP-NanamiNeural',
    ko: 'ko-KR-SunHiNeural', ru: 'ru-RU-SvetlanaNeural',
    it: 'it-IT-ElsaNeural', nl: 'nl-NL-ColetteNeural',
}

/**
 * Fetch TTS audio as a Buffer using a 4-provider fallback chain.
 * @param {string} text - The text to synthesise
 * @param {string} [lang='en'] - BCP-47 language code, e.g. 'en', 'sw', 'fr'
 * @returns {Promise<Buffer|null>}
 */
const fetchTts = async (text, lang = 'en') => {
    const MAX = 700
    const safe = text.slice(0, MAX)
    const safeShort = text.slice(0, 400)

    const tryGet = async (url, headers = {}) => {
        try {
            const res = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 20000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    ...headers
                }
            })
            const buf = Buffer.from(res.data)
            if (buf.length > 1500) return buf
        } catch {}
        return null
    }

    // 1. Microsoft Edge TTS via free Deno relay — best quality, multi-lang, handles long text
    const voice = VOICE_MAP[lang] || `${lang}-Default`
    const buf1 = await tryGet(
        `https://tts.deno.dev/?t=${encodeURIComponent(safe)}&v=${encodeURIComponent(voice)}`
    )
    if (buf1) return buf1

    // 2. StreamElements — reliable EN/ES/FR/DE voices
    const seVoice =
        lang === 'en' ? 'Brian' :
        lang === 'es' ? 'Enrique' :
        lang === 'fr' ? 'Mathieu' :
        lang === 'de' ? 'Hans' : 'Brian'
    const buf2 = await tryGet(
        `https://api.streamelements.com/kappa/v2/speech?voice=${seVoice}&text=${encodeURIComponent(safeShort)}`
    )
    if (buf2) return buf2

    // 3. Google Translate TTS — chunked for longer texts
    const chunks = safe.match(/.{1,180}/g) || [safe]
    const parts = []
    for (const chunk of chunks.slice(0, 4)) {
        const p = await tryGet(
            `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${lang}&client=tw-ob`,
            { Referer: 'https://translate.google.com/' }
        )
        if (p) parts.push(p)
    }
    if (parts.length) return Buffer.concat(parts)

    // 4. VoiceRSS free tier — decent quality fallback
    const buf4 = await tryGet(
        `https://api.voicerss.org/?key=11f53b18b5094a2483f26fa09a28b74c&hl=${lang}-${lang.toUpperCase()}&src=${encodeURIComponent(safe.slice(0, 300))}&f=16khz_16bit_stereo&c=MP3`
    )
    if (buf4) return buf4

    return null
}

module.exports = { fetchTts, VOICE_MAP }
