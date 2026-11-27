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
// Microsoft Edge neural voices were tried first in Nov 2026: the
// synthesis WebSocket 403'd from this VM then — but a retest on
// 2026-11-27 found the block gone (host routing changed), and Edge is
// now the first-choice Swahili voice (see the Edge section below). The
// Piper Swahili model (sw_CD lanfrica) is NOT used: it crashes on every
// input with this Piper build ("Phonemes must be one codepoint"), a
// known voice/build incompatibility — so on the Piper rung, Swahili and
// Sheng use the English lessac voice (it reads Swahili words with
// English phonetics, but with human prosody). If a working Swahili
// Piper model is ever installed, point PIPER_VOICE_MAP.sw at it.
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

// ── Microsoft Edge neural voice (cloud, first choice for Swahili) ──────
// Bera picked the Kenyan neural voice Zuri on 2026-11-27 after hearing
// samples (Zuri / Rafiki / Google): Swahili replies must not be read by
// an English voice any more. Edge TTS is free and keyless; it runs via
// the `edge-tts` Python CLI (the maintained client for Microsoft's
// Read-Aloud service), driven with spawn — the same lesson as Piper:
// execFile is not used for speech subprocesses in this codebase.
// Install: python3 -m venv ~/workspace/bera-bot/edge-tts-venv &&
//   ~/workspace/bera-bot/edge-tts-venv/bin/pip install edge-tts
// Override the binary with BERA_EDGE_TTS_BIN; override the voice with
// BERA_TTS_SW_VOICE. Ladder for Swahili (incl. Sheng, which resolves to
// 'sw'): Edge → Google → Piper. Any Edge failure falls through — it
// must never fail the reply. Disable with BERA_TTS_EDGE=0.
const EDGE_SW_VOICE_DEFAULT = 'sw-KE-ZuriNeural'
const resolveEdgeTts = () => {
    try {
        if (process.env.BERA_EDGE_TTS_BIN) return process.env.BERA_EDGE_TTS_BIN
        const venvBin = path.join(os.homedir(), 'workspace', 'bera-bot', 'edge-tts-venv', 'bin', 'edge-tts')
        if (fs.existsSync(venvBin)) return venvBin
        return null
    } catch { return null }
}
const fetchEdgeMp3 = async (content, voice, outFile, bin = resolveEdgeTts()) => {
    if (!bin) throw new Error('Edge TTS is not installed on this host.')
    await new Promise((resolve, reject) => {
        const { spawn } = require('child_process')
        const child = spawn(bin, ['--voice', voice, '--text', content, '--write-media', outFile])
        let stderr = ''
        const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Edge TTS timed out after 45s')) }, 45000)
        child.stderr.on('data', (d) => { stderr += String(d) })
        child.on('error', (e) => { clearTimeout(timer); reject(e) })
        child.on('close', (code) => {
            clearTimeout(timer)
            if (code !== 0) return reject(new Error(`Edge TTS exited with code ${code}: ${stderr.split('\n').filter(Boolean).slice(-2).join(' | ').slice(0, 200)}`))
            resolve()
        })
        child.stdin.on('error', () => {})
        child.stdin.end()
    })
    const stat = fs.statSync(outFile)
    if (!stat.size) throw new Error('Edge TTS produced an empty file.')
}

// ── Casper Orpheus voice (cloud, first choice for English) ─────────────
// Bera asked 2026-11-26 for the Casper endpoint's voice (Orpheus, via the
// same groq-audio API as the Whisper transcription in beraai.js). Verified
// live from this host: POST {task:'speak', text, voice:'hannah',
// model:'canopylabs/orpheus-v1-english'} returns a WAV in data.audioBase64
// and a Whisper round-trip of the speech was near-perfect. Pitfall: the
// site card documents the field as 'textToSpeak', but that 500s with
// "text is required for task=speak" — the field MUST be `text`.
// Limits: 200 characters per call, so longer replies are split into
// sentence-aligned chunks and re-joined with ffmpeg. The provider notes
// character charges may apply, so replies needing more than 3 chunks
// (~600 chars) skip Orpheus entirely and use Piper instead of making many
// paid calls. Any Orpheus failure falls through to Piper — it must never
// fail the reply. Swahili/Sheng stay on Piper (resolveSpeechLanguage maps
// Sheng to 'sw'). Disable with BERA_TTS_ORPHEUS=0.
const ORPHEUS_URL = 'https://apiz.xcasper.space/api/ai/groq-audio'
const ORPHEUS_MODEL = 'canopylabs/orpheus-v1-english'
const ORPHEUS_VOICE = 'hannah'
const ORPHEUS_CHUNK_CHARS = 200
const ORPHEUS_MAX_CHUNKS = 3

const resolveFfmpegBin = () => {
    // Prefer the bundled ffmpeg-static binary; fall back to a system ffmpeg.
    try { return require('ffmpeg-static') || 'ffmpeg' } catch { return 'ffmpeg' }
}

const splitOrpheusChunks = (text, maxChars = ORPHEUS_CHUNK_CHARS) => {
    const clean = String(text || '').replace(/\s+/g, ' ').trim()
    if (!clean) return []
    const sentences = clean.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [clean]
    const chunks = []
    let current = ''
    const pushCurrent = () => { if (current) { chunks.push(current); current = '' } }
    for (const rawSentence of sentences) {
        let sentence = String(rawSentence || '').trim()
        if (!sentence) continue
        // Hard-split an over-long sentence at a word boundary.
        while (sentence.length > maxChars) {
            pushCurrent()
            let cut = sentence.lastIndexOf(' ', maxChars)
            if (cut <= 0) cut = maxChars
            chunks.push(sentence.slice(0, cut).trim())
            sentence = sentence.slice(cut).trim()
        }
        if (!sentence) continue
        if (current && (current.length + 1 + sentence.length) > maxChars) pushCurrent()
        current = current ? `${current} ${sentence}` : sentence
    }
    pushCurrent()
    return chunks
}

const fetchOrpheusChunk = async (chunk) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30000)
    try {
        const response = await fetch(ORPHEUS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task: 'speak', text: chunk, voice: ORPHEUS_VOICE, model: ORPHEUS_MODEL }),
            signal: controller.signal
        })
        if (!response.ok) throw new Error(`Orpheus request failed (${response.status}).`)
        const data = await response.json()
        const wav = data?.success && data?.data?.audioBase64 ? Buffer.from(data.data.audioBase64, 'base64') : null
        if (!wav || wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
            throw new Error('Orpheus returned no valid WAV audio.')
        }
        return wav
    } finally { clearTimeout(timer) }
}

// Returns the path of one combined WAV inside tempDir, or null when the
// text is not Orpheus-sized (0 chunks, or more than ORPHEUS_MAX_CHUNKS).
// Throws on provider/concat failure so the caller can fall back to Piper.
const fetchOrpheusWav = async (content, tempDir) => {
    const chunks = splitOrpheusChunks(content)
    if (!chunks.length || chunks.length > ORPHEUS_MAX_CHUNKS) return null
    const files = []
    for (let i = 0; i < chunks.length; i++) {
        const file = path.join(tempDir, `orpheus-${i}.wav`)
        fs.writeFileSync(file, await fetchOrpheusChunk(chunks[i]))
        files.push(file)
    }
    if (files.length === 1) return files[0]
    // Same model + voice ⇒ identical WAV params (verified live:
    // pcm_s16le, 24 kHz, mono), so the concat demuxer can stream-copy;
    // if that ever fails, retry with a lossless re-encode.
    const listFile = path.join(tempDir, 'orpheus-concat.txt')
    fs.writeFileSync(listFile, files.map(file => `file '${file}'`).join('\n'))
    const outFile = path.join(tempDir, 'orpheus-joined.wav')
    const ffmpegBin = resolveFfmpegBin()
    const concatArgs = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile]
    try {
        await execFileAsync(ffmpegBin, [...concatArgs, '-c', 'copy', outFile], { timeout: 30000, maxBuffer: 1024 * 1024 })
    } catch {
        await execFileAsync(ffmpegBin, [...concatArgs, '-c:a', 'pcm_s16le', outFile], { timeout: 30000, maxBuffer: 1024 * 1024 })
    }
    if (!fs.existsSync(outFile) || !fs.statSync(outFile).size) throw new Error('Orpheus concat produced an empty file.')
    return outFile
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
        let sourceFile = null
        let sourceIsConcat = false
        // First choice for English: the Casper Orpheus voice. Sheng
        // resolves to 'sw' via resolveSpeechLanguage, so it stays on
        // Piper with Swahili; other languages keep their existing path.
        const speechLanguage = resolveSpeechLanguage(speakable, language)
        if (process.env.BERA_TTS_ORPHEUS !== '0' && (language === 'en' || language === 'auto') && speechLanguage === 'en') {
            try {
                const orpheusFile = await fetchOrpheusWav(speakable, tempDir)
                if (orpheusFile) {
                    sourceFile = orpheusFile
                    console.log('[TTS] Using Casper Orpheus voice')
                }
            } catch (e) {
                console.error('[TTS] Orpheus failed, falling back to Piper:', e?.message || e)
            }
        }
        // Swahili ladder (Bera's pick, 2026-11-27): the Edge Zuri voice
        // first, then Google's Swahili voice, and Piper only as the last
        // resort — Piper's Swahili is an English voice reading Swahili.
        // Sheng resolves to 'sw' in resolveSpeechLanguage, so it takes
        // this ladder too.
        if (!sourceFile && speechLanguage === 'sw' && process.env.BERA_TTS_EDGE !== '0') {
            try {
                const edgeFile = path.join(tempDir, 'edge.mp3')
                await fetchEdgeMp3(speakable, process.env.BERA_TTS_SW_VOICE || VOICE_MAP.sw || EDGE_SW_VOICE_DEFAULT, edgeFile)
                sourceFile = edgeFile
                console.log('[TTS] Using Edge Zuri voice (Swahili)')
            } catch (e) {
                console.error('[TTS] Edge TTS failed, falling back to Google (Swahili):', e?.message || e)
            }
        }
        if (!sourceFile && speechLanguage === 'sw') {
            try {
                const inputFiles = await fetchGoogleMp3Parts(speakable, 'sw', tempDir)
                const listFile = path.join(tempDir, 'concat.txt')
                fs.writeFileSync(listFile, inputFiles.map(file => `file '${file}'`).join('\n'))
                sourceFile = listFile
                sourceIsConcat = true
                console.log('[TTS] Using Google voice (Swahili)')
            } catch (e) {
                console.error('[TTS] Google TTS failed, falling back to Piper (Swahili):', e?.message || e)
            }
        }
        // Next: the local neural voice; fall back to Google TTS if Piper
        // is not installed on this host or synthesis fails for any reason.
        const piper = resolvePiper(language)
        if (!sourceFile && piper) {
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
        const ffmpegBin = resolveFfmpegBin()
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

module.exports = { fetchTts, VOICE_MAP, normalizeLanguage, resolveSpeechLanguage, toSpeechText, PIPER_VOICE_MAP, resolvePiper, fetchOrpheusWav, splitOrpheusChunks, ORPHEUS_CHUNK_CHARS, ORPHEUS_MAX_CHUNKS, resolveEdgeTts, fetchEdgeMp3, EDGE_SW_VOICE_DEFAULT }
