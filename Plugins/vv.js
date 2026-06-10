'use strict';

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

if (typeof global.antivvEnabled === 'undefined') {
    global.antivvEnabled = true;
}

module.exports = {
    commands:    ['vv', 'viewonce', 'open', 'openphoto', 'openvideo', 'vvphoto'],
    description: 'Manually reveal a view-once message (reply to it)',
    permission:  'owner',
    group:       true,
    private:     true,

    run: async (sock, message, args, ctx) => {
        const { jid, reply, contextInfo } = ctx;
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted) {
            return reply('❌ *Reply to a view-once photo / video / audio with this command.*');
        }

        let type = null;
        for (const k of ['imageMessage', 'videoMessage', 'audioMessage']) {
            if (quoted[k]) { type = k; break; }
        }

        if (!type) {
            return reply('❌ Quoted message has no image, video, or audio.');
        }

        try {
            const msgContent = quoted[type];
            const stream = await downloadContentFromMessage(msgContent, type.replace('Message', ''));
            let buffer = Buffer.alloc(0);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            if (type === 'imageMessage') {
                await sock.sendMessage(jid, {
                    image:    buffer,
                    caption:  msgContent?.caption || '',
                    mimetype: msgContent?.mimetype || 'image/jpeg'
                }, { quoted: message });
            } else if (type === 'videoMessage') {
                await sock.sendMessage(jid, {
                    video:    buffer,
                    caption:  msgContent?.caption || '',
                    mimetype: msgContent?.mimetype || 'video/mp4'
                }, { quoted: message });
            } else if (type === 'audioMessage') {
                await sock.sendMessage(jid, {
                    audio:    buffer,
                    mimetype: msgContent?.mimetype || 'audio/mp4',
                    ptt:      msgContent?.ptt || false
                }, { quoted: message });
            }

            await sock.sendMessage(jid, { react: { text: '😍', key: message.key } });
        } catch (err) {
            await sock.sendMessage(jid, { react: { text: '😔', key: message.key } });
            await reply(`❌ Failed to open media: ${err.message}`);
        }
    }
};
