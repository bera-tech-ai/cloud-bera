'use strict';

// ── Voice transcription (spec §16) ──────────────────────────────────────────
// Previously this command replied with a fabricated "Voice Message Info"
// card (duration, file size, ESTIMATED word count) instead of a transcript
// — it never transcribed anything. Now it transcribes for real when a
// transcription backend is configured, and says so honestly when none is:
//   1. OPENAI_API_KEY set → OpenAI Whisper (via
//      Library/actions/project-support.js transcribeExplicitVoice).
//   2. Otherwise → explicit unavailable message (no verified Xcasper STT
//      endpoint exists), with what to configure. Never an estimated transcript.

const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const TRANSCRIPTION_UNAVAILABLE =
    'Voice transcription is currently unavailable: no verified speech-to-text endpoint is configured. ' +
    'The owner can enable it by setting OPENAI_API_KEY (OpenAI Whisper) and trying again.';

module.exports = {
    commands: ['transcribe', 'voicetotext', 'vtt', 'speech'],
    description: 'Transcribe voice messages to text (reply to a voice note). Requires OPENAI_API_KEY; otherwise reports unavailable.',
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

        // No verified Xcasper STT endpoint exists; Whisper is the only
        // configured backend. Say so before downloading anything.
        if (!process.env.OPENAI_API_KEY) {
            return reply(`❌ ${TRANSCRIPTION_UNAVAILABLE}`)
        }

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
            const mime = isAudio.mimetype || 'audio/ogg'

            let transcribed = null
            try {
                const { transcribeExplicitVoice } = require('../Library/actions/project-support')
                transcribed = await transcribeExplicitVoice(buffer, mime)
            } catch (e) {
                transcribed = { success: false, error: TRANSCRIPTION_UNAVAILABLE }
            }

            if (!transcribed?.success || !(transcribed.text || transcribed.transcript)) {
                return reply(`❌ ${transcribed?.error || TRANSCRIPTION_UNAVAILABLE}`)
            }

            return sock.sendMessage(jid, {
                text: `🎤 *Voice Transcription*\n\n${String(transcribed.text || transcribed.transcript).trim()}`,
                contextInfo
            }, { quoted: message });

        } catch (err) {
            await reply('❌ Failed to process voice message. Make sure you replied to a voice note.');
        }
    }
};
