'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { promisify } = require('util')
const { execFile } = require('child_process')
const execFileAsync = promisify(execFile)

const VOICE_MAP = {
    en: 'en-US-AriaNeural', sw: 'sw-KE-ZuriNeural', sh: 'sw-KE-ZuriNeural', sheng: 'sw-KE-ZuriNeural', fr: 'fr-FR-DeniseNeural',
    de: 'de-DE-KatjaNeural', es: 'es-ES-ElviraNeural', pt: 'pt-BR-FranciscaNeural',
    ar: 'ar-EG-SalmaNeural', hi: 'hi-IN-SwaraNeural', zh: 'zh-CN-XiaoxiaoNeural',
    ja: 'ja-JP-NanamiNeural', ko: 'ko-KR-SunHiNeural', ru: 'ru-RU-SvetlanaNeural',
    it: 'it-IT-ElsaNeural', nl: 'nl-NL-ColetteNeural'
}
const TTS_LANG_MAP = { en: 'en', sw: 'sw', sh: 'sw', sheng: 'sw', fr: 'fr', de: 'de', es: 'es', pt: 'pt', ar: 'ar', hi: 'hi', zh: 'zh-CN', ja: 'ja', ko: 'ko', ru: 'ru', it: 'it', nl: 'nl' }

const normalizeLanguage = value => {
    const lang = String(value || 'en').trim().toLowerCase()
    if (lang === 'auto') return 'auto'
    if (['sh', 'sheng'].includes(lang)) return 'sheng'
    if (Object.hasOwn(TTS_LANG_MAP, lang)) return lang
    return 'en'
}

const resolveSpeechLanguage = (text, preference = 'en') => {
    const preferred = normalizeLanguage(preference)
    if (preferred === 'en' || preferred === 'sw') return preferred
    if (preferred === 'sheng' || preferred === 'sh') return 'sw'
    const swahiliSignals = /\b(?:sasa|mkuu|niaje|poa|habari|sawa|niko|nko|uko|bana|basi|ama|naweza|wewe|kwani|ndo|leo|kesho|siwezi|ndio|asante|yako|iko|sina|vipi|mtu|watu|tafadhali|karibu|pole|lakini|kwenda|kazi|nyumbani)\b/gi
    const matches = String(text || '').match(swahiliSignals) || []
    return matches.length ? 'sw' : 'en'
}

const fetchTts = async (text, lang = 'en') => {
    const content = String(text || '').trim()
    if (!content) throw new Error('No text was provided for speech.')
    if (content.length > 1200) throw new Error('Text is too long for a voice reply.')

    const language = normalizeLanguage(lang)
    const googleLang = TTS_LANG_MAP[language] || 'en'
    const googleTts = require('google-tts-api')
    const axios = require('axios')
    const segments = googleTts.getAllAudioUrls(content, { lang: googleLang, slow: false })
    if (!Array.isArray(segments) || !segments.length || segments.length > 8) throw new Error('Speech service returned no usable audio segments.')

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bera-tts-'))
    try {
        const inputFiles = []
        for (let i = 0; i < segments.length; i++) {
            const url = segments[i]?.url
            if (!url || !/^https:\/\//i.test(url)) throw new Error('Speech service returned an invalid audio URL.')
            const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000, maxContentLength: 2 * 1024 * 1024 })
            const file = path.join(tempDir, `part-${i}.mp3`)
            fs.writeFileSync(file, Buffer.from(response.data))
            inputFiles.push(file)
        }
        const listFile = path.join(tempDir, 'concat.txt')
        fs.writeFileSync(listFile, inputFiles.map(file => `file '${file}'`).join('\n'))
        const outputFile = path.join(tempDir, 'voice.ogg')
        // Prefer the bundled ffmpeg-static binary; fall back to a system ffmpeg.
        let ffmpegBin = 'ffmpeg'
        try { ffmpegBin = require('ffmpeg-static') || 'ffmpeg' } catch {}
        await execFileAsync(ffmpegBin, [
            '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
            '-vn', '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', '-application', 'voip', outputFile
        ], { timeout: 30000, maxBuffer: 1024 * 1024 })
        const audio = fs.readFileSync(outputFile)
        if (!audio.length) throw new Error('Speech audio conversion produced an empty file.')
        return audio
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true })
    }
}

module.exports = { fetchTts, VOICE_MAP, normalizeLanguage, resolveSpeechLanguage }
