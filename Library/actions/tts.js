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

// ── Local neural voice (Piper) ─────────────────────────────────────────────
// The user asked 2026-11-24 for a voice that sounds like a normal human,
// "even in Sheng" — the Google Translate TTS voice sounds robotic. Piper
// (VITS, runs fully offline) is the human-sounding voice: en_US-lessac.
// Microsoft Edge neural voices were tried first: the voices-list endpoint
// answers 200, but the synthesis WebSocket 403s from this VM even with
// browser headers and the exact origin the edge-tts package uses —
// Microsoft blocks this host, so Edge is unusable here (Google stays as
// the fallback). The Piper Swahili model (sw_CD lanfrica) is NOT used: it
// crashes on every input with this Piper build ("Phonemes must be one
// codepoint"), a known voice/build incompatibility — so Swahili and Sheng
// also use the English lessac voice for now (it reads Swahili words with
// English phonetics, but with human prosody). If a working Swahili Piper
// model is ever installed, point PIPER_VOICE_MAP.sw at it.
// The binary + models live in Library/assets/piper/ (binary and ~63 MB
// models are NOT committed to git — install them on the host, or set
// BERA_PIPER_BIN / BERA_PIPER_MODEL_<LANG>). When Piper is missing, Google
// TTS is used exactly as before.
const PIPER_DIR = path.join(__dirname, '..', 'assets', 'piper')
const PIPER_VOICE_MAP = {
    en: 'en/en_US/lessac/medium/en_US-lessac-medium.onnx',
    sw: 'en/en_US/lessac/medium/en_US-lessac-medium.onnx',
    sh: 'en/en_US/lessac/medium/en_US-lessac-medium.onnx',
    sheng: 'en/en_US/lessac/medium/en_US-lessac-medium.onnx'
}
const resolvePiper = (language) => {
    try {
        const bin = process.env.BERA_PIPER_BIN || path.join(PIPER_DIR, 'piper', 'piper')
        const modelRel = process.env[`BERA_PIPER_MODEL_${String(language || 'en').toUpperCase()}`] ||
            PIPER_VOICE_MAP[language] || PIPER_VOICE_MAP.en
        const model = path.isAbsolute(modelRel) ? modelRel : path.join(PIPER_DIR, 'voices', modelRel)
        if (!fs.existsSync(bin) || !fs.existsSync(model)) return null
        return { bin, model, dir: path.dirname(bin) }
    } catch { return null }
}
const fetchPiperWav = async (content, piper, outFile) => {
    // NOTE: do NOT use execFile here. Verified 2026-11-24: execFile hangs
    // forever with this piper binary (even with no input at all — it waits
    // on stdin), while spawn with the same args/cwd finishes in <1s.
    // Root cause unknown (likely how execFile manages the child's stdin),
    // so piper is driven with spawn + an explicit stdin write/end.
    await new Promise((resolve, reject) => {
        const { spawn } = require('child_process')
        const child = spawn(piper.bin, ['--model', piper.model, '--output_file', outFile], { cwd: piper.dir })
        let stderr = ''
        const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Piper timed out after 30s')) }, 30000)
        child.stderr.on('data', (d) => { stderr += String(d) })
        child.on('error', (e) => { clearTimeout(timer); reject(e) })
        child.on('close', (code) => {
            clearTimeout(timer)
            if (code !== 0) return reject(new Error(`Piper exited with code ${code}: ${stderr.split('\n').filter(Boolean).slice(-2).join(' | ').slice(0, 200)}`))
            resolve()
        })
        child.stdin.on('error', () => {})
        child.stdin.end(content)
    })
    const stat = fs.statSync(outFile)
    if (!stat.size) throw new Error('Piper produced an empty file.')
}

const fetchGoogleMp3Parts = async (content, googleLang, tempDir) => {
    const googleTts = require('google-tts-api')
    const axios = require('axios')
    const segments = googleTts.getAllAudioUrls(content, { lang: googleLang, slow: false })
    if (!Array.isArray(segments) || !segments.length || segments.length > 8) throw new Error('Speech service returned no usable audio segments.')
    const inputFiles = []
    for (let i = 0; i < segments.length; i++) {
        const url = segments[i]?.url
        if (!url || !/^https:\/\//i.test(url)) throw new Error('Speech service returned an invalid audio URL.')
        const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000, maxContentLength: 2 * 1024 * 1024 })
        const file = path.join(tempDir, `part-${i}.mp3`)
        fs.writeFileSync(file, Buffer.from(response.data))
        inputFiles.push(file)
    }
    return inputFiles
}

// Strip card frames, markdown, emoji and URLs so a voice note speaks the
// words, not the formatting. Agent replies arrive as Bera AI cards
// (box-drawing frame, header, footer) — reading those aloud sounds broken,
// and emoji can crash the local speech engine, so they are removed here
// for every voice path, not just the agent loop.
const toSpeechText = (text) => {
    let out = String(text || '')
    out = out.split('\n').map((line) => line.replace(/^\s*│\s?/, '')).join('\n')
    out = out.split('\n').filter((line) => {
        const t = line.trim()
        if (!t) return false
        if (/^[╭╮╰╯├┤│─━]+$/.test(t)) return false
        if (/𝗕𝗘𝗥𝗔 𝗔𝗜|ᴡʜᴀᴛsᴀᴘᴘ ᴀssɪsᴛᴀɴᴛ|ʙᴇʀᴀ ᴀɪ · ᴘʀᴇᴍɪᴜᴍ/.test(t)) return false
        if (/^◈\s/.test(t)) return false
        return true
    }).join(' ')
    out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    out = out.replace(/[*_~`]+/g, '')
    out = out.replace(/https?:\/\/\S+/g, '')
    out = out.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '')
    out = out.replace(/\s+/g, ' ').trim()
    return out
}

const fetchTts = async (text, lang = 'en') => {
    const content = String(text || '').trim()
    if (!content) throw new Error('No text was provided for speech.')
    if (content.length > 1200) throw new Error('Text is too long for a voice reply.')
    const speakable = toSpeechText(content)
    if (!speakable) throw new Error('Nothing to speak after removing formatting.')

    const language = normalizeLanguage(lang)
    const googleLang = TTS_LANG_MAP[language] || 'en'

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bera-tts-'))
    try {
        // Prefer the local neural voice; fall back to Google TTS if Piper
        // is not installed on this host or synthesis fails for any reason.
        const piper = resolvePiper(language)
        let sourceFile = null
        let sourceIsConcat = false
        if (piper) {
            try {
                const wavFile = path.join(tempDir, 'voice.wav')
                await fetchPiperWav(speakable, piper, wavFile)
                sourceFile = wavFile
            } catch (e) {
                console.error('[TTS] Piper failed, falling back to Google TTS:', e?.message || e)
            }
        }
        if (!sourceFile) {
            const inputFiles = await fetchGoogleMp3Parts(speakable, googleLang, tempDir)
            const listFile = path.join(tempDir, 'concat.txt')
            fs.writeFileSync(listFile, inputFiles.map(file => `file '${file}'`).join('\n'))
            sourceFile = listFile
            sourceIsConcat = true
        }
        const outputFile = path.join(tempDir, 'voice.ogg')
        // Prefer the bundled ffmpeg-static binary; fall back to a system ffmpeg.
        let ffmpegBin = 'ffmpeg'
        try { ffmpegBin = require('ffmpeg-static') || 'ffmpeg' } catch {}
        const inputArgs = sourceIsConcat
            ? ['-f', 'concat', '-safe', '0', '-i', sourceFile]
            : ['-i', sourceFile]
        await execFileAsync(ffmpegBin, [
            '-hide_banner', '-loglevel', 'error', '-y', ...inputArgs,
            '-vn', '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', '-application', 'voip', outputFile
        ], { timeout: 30000, maxBuffer: 1024 * 1024 })
        const audio = fs.readFileSync(outputFile)
        if (!audio.length) throw new Error('Speech audio conversion produced an empty file.')
        return audio
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true })
    }
}

module.exports = { fetchTts, VOICE_MAP, normalizeLanguage, resolveSpeechLanguage, toSpeechText, PIPER_VOICE_MAP, resolvePiper }
