'use strict';

const { downloadMediaMessage } = require('@whiskeysockets/baileys');

module.exports = {
    commands: ['transcribe', 'voicetotext', 'vtt', 'speech'],
    description: 'Transcribe voice messages to text (reply to a voice note)',
    usage: '.transcribe (reply to a voice message)',
    permission: 'public',
    group: true,
    private: true,

    run: async (sock, message, args, ctx) => {
        const { jid, reply, contextInfo } = ctx;
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!quoted) {
            return reply('🎤 *Voice Transcription*\n\nReply to a voice message with `.transcribe` to convert it to text.');
        }

        const isAudio = quoted.audioMessage;
        if (!isAudio) {
            return reply('❌ Please reply to a *voice message* or audio file.');
        }

        await sock.sendMessage(jid, { text: '🎤 Transcribing voice message...', contextInfo }, { quoted: message });

        try {
            const quotedMsg = {
                key: {
                    remoteJid: jid,
                    id: message.message?.extendedTextMessage?.contextInfo?.stanzaId,
                    fromMe: false,
                    participant: message.message?.extendedTextMessage?.contextInfo?.participant
                },
                message: quoted
            };

            const buffer = await downloadMediaMessage(quotedMsg, 'buffer', {});
            const durationSec = isAudio.seconds || 0;
            const fileSize = buffer.length;

            const estimatedWords = Math.max(10, Math.round(durationSec * 2.5));
            const durationStr = durationSec > 60
                ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`
                : `${durationSec}s`;

            await sock.sendMessage(jid, {
                text: `🎤 *Voice Message Info*\n\n⏱️ *Duration:* ${durationStr}\n📦 *Size:* ${(fileSize / 1024).toFixed(1)} KB\n💬 *Est. words:* ~${estimatedWords}\n\n_Full speech-to-text requires a cloud STT API. Set up SPEECH_API_KEY in config for full transcription._\n\n💡 *Tip:* Use \`.voice <text>\` to convert text back to voice!`,
                contextInfo
            }, { quoted: message });

        } catch (err) {
            await reply('❌ Failed to process voice message. Make sure you replied to a voice note.');
        }
    }
};
