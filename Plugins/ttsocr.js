'use strict'
/**
 * TTS & OCR Plugin.
 * .tts <text> — Text to speech (sends as WhatsApp voice note)
 * .ocr       — Extract text from quoted image (Tesseract.js or GiftedAPI)
 * .screenshot2 <url> — Screenshot a website
 */
const axios = require('axios')
const { takeScreenshot } = require('../Library/actions/browser')
const { gtOcr, gtScreenshot } = require('../Library/actions/giftedapi')

const react = (conn, m, e) => conn.sendMessage(m.chat, { react: { text: e, key: m.key } }).catch(() => {})

const getMediaBuffer = async (conn, msg) => {
    try {
        if (msg?.key && msg?.message) return await conn.downloadMediaMessage({ key: msg.key, message: msg.message })
        return await conn.downloadMediaMessage(msg)
    } catch { return null }
}

// Language → Microsoft Neural Voice mapping
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
 * Fetch TTS audio buffer — 4-provider chain.
 */
const fetchTts = async (text, lang = 'en') => {
    const MAX = 700
    const safe = text.slice(0, MAX)
    const safeShort = text.slice(0, 400)

    const tryGet = async (url, headers = {}) => {
        try {
            const res = await axios.get(url, {
                responseType: 'arraybuffer', timeout: 20000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', ...headers }
            })
            const buf = Buffer.from(res.data)
            if (buf.length > 1500) return buf  // Require at least 1.5 KB — tiny files are error pages
        } catch {}
        return null
    }

    // 1. Microsoft Edge TTS via free Deno relay (best quality, handles long text, multi-lang)
    const voice = VOICE_MAP[lang] || `${lang}-Default`
    const buf1 = await tryGet(`https://tts.deno.dev/?t=${encodeURIComponent(safe)}&v=${encodeURIComponent(voice)}`)
    if (buf1) return buf1

    // 2. StreamElements — Brian (EN) or Ivy, Joanna (reliable, fast)
    const seVoice = lang === 'en' ? 'Brian' : lang === 'es' ? 'Enrique' : lang === 'fr' ? 'Mathieu' : lang === 'de' ? 'Hans' : 'Brian'
    const buf2 = await tryGet(`https://api.streamelements.com/kappa/v2/speech?voice=${seVoice}&text=${encodeURIComponent(safeShort)}`)
    if (buf2) return buf2

    // 3. Google Translate TTS — works for short texts, multi-chunk for longer
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

    // 4. VoiceRSS free tier (decent quality, 350 words/req)
    const buf4 = await tryGet(`https://api.voicerss.org/?key=11f53b18b5094a2483f26fa09a28b74c&hl=${lang}-${lang.toUpperCase()}&src=${encodeURIComponent(safe.slice(0, 300))}&f=16khz_16bit_stereo&c=MP3`)
    if (buf4) return buf4

    return null
}

const handle = async (m, { conn, text, reply, prefix, command, sender, chat, isOwner, args }) => {

    // ── .tts <text> ───────────────────────────────────────────────────────────
    if (command === 'tts' || command === 'say' || command === 'speak') {
        if (!text && !(m.quoted?.text || m.quoted?.body)) {
            return reply(
                `❌ *Usage:* ${prefix}tts <text>\n\n` +
                `Examples:\n` +
                `• ${prefix}tts Hello everyone!\n` +
                `• ${prefix}tts en Hello World\n` +
                `• ${prefix}tts sw Habari yako?\n\n` +
                `Supported: en, sw, fr, de, es, ar, zh, hi, pt...`
            )
        }

        let lang = 'en'
        let content = text || m.quoted?.text || m.quoted?.body || ''

        // Extract optional language code (2-letter) as first word
        const firstWord = content.trim().split(/\s+/)[0]
        if (/^[a-z]{2}$/.test(firstWord)) {
            lang = firstWord
            content = content.replace(firstWord, '').trim()
        }

        if (!content.trim()) return reply(`❌ Provide text to convert to speech.`)

        await react(conn, m, '🔊')

        const buf = await fetchTts(content, lang)
        if (!buf) {
            await react(conn, m, '❌')
            return reply(`❌ TTS failed — all voice providers are unavailable. Try again shortly.`)
        }

        await conn.sendMessage(chat, {
            audio: buf,
            mimetype: 'audio/mpeg',
            ptt: true,
            waveform: [0, 30, 60, 90, 120, 100, 80, 60, 40, 20, 0],
        }, { quoted: m })
        await react(conn, m, '✅')
    }

    // ── .ocr — extract text from quoted image ─────────────────────────────────
    if (command === 'ocr' || command === 'readimage' || command === 'textfromimage') {
        const quoted = m.quoted
        if (!quoted || !/image/.test(quoted.mimetype || '')) {
            return reply(`❌ Quote an image then use ${prefix}ocr to extract its text.`)
        }

        await react(conn, m, '🔍')

        // Try GiftedTech OCR first
        try {
            const buf = await getMediaBuffer(conn, quoted)
            if (buf) {
                const result = await gtOcr(buf)
                if (result?.success && result?.text) {
                    await react(conn, m, '✅')
                    return reply(
                        `╭══〘 *🔍 OCR RESULT* 〙═⊷\n` +
                        `┃ Confidence: ${result.confidence || 'N/A'}\n` +
                        `┃\n` +
                        result.text.trim().slice(0, 1500) + '\n' +
                        `╰══════════════════⊷`
                    )
                }
            }
        } catch {}

        // Fallback: Tesseract.js
        try {
            const Tesseract = require('tesseract.js')
            const buf = await getMediaBuffer(conn, quoted)
            if (!buf) {
                await react(conn, m, '❌')
                return reply(`❌ Failed to download image.`)
            }

            const { data: { text, confidence } } = await Tesseract.recognize(buf, 'eng', {
                logger: () => {}
            })

            await react(conn, m, '✅')
            if (!text.trim()) return reply(`❌ No text detected in this image.`)
            return reply(
                `╭══〘 *🔍 OCR RESULT* 〙═⊷\n` +
                `┃ Confidence: ${confidence?.toFixed(1) || 'N/A'}%\n` +
                `┃\n` +
                text.trim().slice(0, 1500) + '\n' +
                `╰══════════════════⊷`
            )
        } catch (e) {
            await react(conn, m, '❌')
            return reply(`❌ OCR failed: ${e.message}`)
        }
    }

    // ── .screenshot2 <url> ────────────────────────────────────────────────────
    if (command === 'screenshot2' || command === 'webss2' || command === 'ss2') {
        if (!text) return reply(`❌ Usage: ${prefix}screenshot2 <URL>\nExample: ${prefix}screenshot2 https://github.com`)
        let url = text.trim()
        if (!url.startsWith('http')) url = 'https://' + url

        await react(conn, m, '📸')

        // Try GiftedTech first
        try {
            const result = await gtScreenshot(url)
            if (result?.success && result?.buffer) {
                await conn.sendMessage(chat, { image: result.buffer, caption: `📸 Screenshot of *${url}*` }, { quoted: m })
                await react(conn, m, '✅')
                return
            }
        } catch {}

        // Fallback: browser.js
        const result = await takeScreenshot(url)
        if (!result.success) {
            await react(conn, m, '❌')
            return reply(`❌ Screenshot failed: ${result.error}`)
        }

        await conn.sendMessage(chat, { image: result.buffer, caption: `📸 Screenshot of *${url}*` }, { quoted: m })
        await react(conn, m, '✅')
    }
}

handle.command = ['tts', 'say', 'speak', 'ocr', 'readimage', 'textfromimage', 'screenshot2', 'webss2', 'ss2']
handle.tags = ['media']
module.exports = handle
