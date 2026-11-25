'use strict'

// ── OCR (spec §16) ──────────────────────────────────────────────────────────
// Previously this command always replied "OCR is disabled" even though
// Tesseract.js is a bundled dependency and the sibling .ocr plugin
// (Plugins/ttsocr.js) already uses it as a working fallback. OCR now runs
// locally via Tesseract.js — no provider endpoint needed. Failures (download
// failure, no text, engine error) are reported honestly instead of a
// blanket "disabled" message.

const { downloadMediaMessage } = require('@whiskeysockets/baileys')

module.exports = {
    commands: ['ocr', 'readtext'],
    description: 'Extract text from a quoted image with local Tesseract.js OCR.',
    permission: 'public',
    group: true,
    private: true,
    run: async (sock, message, args, ctx) => {
        const { reply } = ctx
        const contextInfo = message.message?.extendedTextMessage?.contextInfo
        const quoted = contextInfo?.quotedMessage
        const quotedMimetype = quoted?.imageMessage?.mimetype || quoted?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage?.mimetype || ''

        if (!quoted || !/image/.test(quotedMimetype)) {
            return reply('❌ Quote an image then use `.ocr` to extract its text.')
        }

        try {
            const quotedMsg = {
                key: {
                    remoteJid: message.key?.remoteJid,
                    id: contextInfo.stanzaId,
                    fromMe: false,
                    participant: contextInfo.participant
                },
                message: quoted
            }
            const buffer = await downloadMediaMessage(quotedMsg, 'buffer', {})
            if (!Buffer.isBuffer(buffer) || !buffer.length) {
                return reply('❌ Failed to download the quoted image.')
            }
            const Tesseract = require('tesseract.js')
            const { data: { text, confidence } } = await Tesseract.recognize(buffer, 'eng', { logger: () => {} })
            if (!String(text || '').trim()) return reply('❌ No text detected in this image.')
            return reply(
                `🔍 *OCR Result*\n\nConfidence: ${confidence?.toFixed(1) || 'N/A'}%\n\n${String(text).trim().slice(0, 1500)}`
            )
        } catch (e) {
            return reply(`❌ OCR failed: ${e?.message || e}`)
        }
    }
}
