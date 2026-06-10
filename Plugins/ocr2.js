'use strict';
const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
    commands:    ['ocr', 'readtext'],
    description: 'Extract text from an image (OCR)',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, ctx) => {
        const { jid, reply, contextInfo } = ctx;
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage
            || message.message?.imageMessage;
        const imgMsg = quoted?.imageMessage || message.message?.imageMessage;
        if (!imgMsg) {
            return reply('🖼️ Please reply to an image to extract its text.\nExample: Reply to image with .ocr');
        }
        await sock.sendMessage(jid, { text: '⏳ Extracting text from image...', contextInfo }, { quoted: message });
        try {
            const stream = await downloadContentFromMessage(imgMsg, 'image');
            let buf = Buffer.from([]);
            for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
            const b64 = buf.toString('base64');
            const { data } = await axios.post(
                'https://api.ocr.space/parse/image',
                `base64Image=data:image/jpeg;base64,${b64}&language=eng&isOverlayRequired=false`,
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'apikey': 'helloworld' },
                    timeout: 30000
                }
            );
            const text = data?.ParsedResults?.[0]?.ParsedText?.trim();
            if (!text) throw new Error('No text detected in image.');
            await sock.sendMessage(jid, {
                text: `📝 *Extracted Text:*\n\n${text}`,
                contextInfo
            }, { quoted: message });
        } catch (e) {
            await reply(`❌ OCR failed: ${e.message}`);
        }
    }
};
