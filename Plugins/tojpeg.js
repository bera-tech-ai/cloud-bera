'use strict';
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
    commands:    ['tojpeg', 'toimg', 'stickertoimg', 'unwebp'],
    description: 'Convert sticker to JPEG image',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, ctx) => {
        const { jid, reply, contextInfo } = ctx;
        const quotedCtx  = message.message?.extendedTextMessage?.contextInfo;
        const quoted     = quotedCtx?.quotedMessage;
        const stickerMsg = quoted?.stickerMessage || message.message?.stickerMessage;
        if (!stickerMsg) {
            return reply('🖼️ Reply to a sticker with this command to convert it to an image.');
        }
        try {
            const stream = await downloadContentFromMessage(stickerMsg, 'sticker');
            let buf = Buffer.from([]);
            for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
            await sock.sendMessage(jid, {
                image:    buf,
                mimetype: 'image/webp',
                caption:  '🖼️ *Sticker converted to image*',
                contextInfo
            }, { quoted: message });
        } catch (e) {
            await reply(`❌ Conversion failed: ${e.message}`);
        }
    }
};
