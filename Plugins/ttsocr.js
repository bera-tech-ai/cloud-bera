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

/**
 * Fetch Google TTS audio buffer.
 */
const googleTts = async (text, lang = 'en') => {
    // Use google-tts-api if available, else fall back to a TTS API
    let gTTS
    try { gTTS = require('google-tts-api') } catch {}

    if (gTTS) {
        try {
            const url = gTTS.getAudioUrl(text.slice(0, 200), { lang, slow: false, host: 'https://translate.google.com' })
            const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 })
            return Buffer.from(res.data)
        } catch {}
    }

    // Fallback TTS APIs
    const ttsApis = [
        `https://api.streamelements.com/kappa/v2/speech?voice=Brian&text=${encodeURIComponent(text.slice(0, 200))}`,
        `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.slice(0, 200))}&tl=${lang}&client=tw-ob`
    ]

    for (const url of ttsApis) {
        try {
            const res = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 15000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            })
            if (res.data && res.data.byteLength > 500) return Buffer.from(res.data)
        } catch {}
    }

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

        const buf = await googleTts(content, lang)
        if (!buf) {
            await react(conn, m, '❌')
            return reply(`❌ TTS failed — all voice providers are unavailable. Try again in a moment.`)
        }

        await conn.sendMessage(chat, { audio: buf, mimetype: 'audio/mpeg', ptt: true }, { quoted: m })
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
