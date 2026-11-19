'use strict'

const VOICE_MAP = {
    en: 'en-US-AriaNeural', sw: 'sw-KE-ZuriNeural', fr: 'fr-FR-DeniseNeural',
    de: 'de-DE-KatjaNeural', es: 'es-ES-ElviraNeural', pt: 'pt-BR-FranciscaNeural',
    ar: 'ar-EG-SalmaNeural', hi: 'hi-IN-SwaraNeural', zh: 'zh-CN-XiaoxiaoNeural',
    ja: 'ja-JP-NanamiNeural', ko: 'ko-KR-SunHiNeural', ru: 'ru-RU-SvetlanaNeural',
    it: 'it-IT-ElsaNeural', nl: 'nl-NL-ColetteNeural'
}

const fetchTts = async () => null

module.exports = { fetchTts, VOICE_MAP }
