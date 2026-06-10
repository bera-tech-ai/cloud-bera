'use strict'
const { fetchTts, VOICE_MAP } = require('../Library/actions/tts')

const LANG_LABELS = {
    en: 'English', fr: 'French',  sw: 'Swahili',    ar: 'Arabic',
    es: 'Spanish', de: 'German',  ja: 'Japanese',   zh: 'Chinese',
    hi: 'Hindi',   pt: 'Portuguese', ko: 'Korean',  ru: 'Russian',
    it: 'Italian', nl: 'Dutch',
}

module.exports = {
    commands:    ['voice', 'gtts'],
    description: 'Convert text to a 🎵 Now Playing audio message',
    usage:       '.voice <text>  or  .voice <lang> <text>',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, ctx) => {
        const { jid, reply } = ctx

        if (!args.length) {
            return reply(
                `❌ *Usage:* \`.voice <text>\` or \`.voice <lang> <text>\`\n\n` +
                `*Languages:* ${Object.keys(LANG_LABELS).map(k => `\`${k}\``).join(', ')}\n\n` +
                `*Examples:*\n• \`.voice Hello everyone!\`\n• \`.voice sw Habari yako?\`\n• \`.voice fr Bonjour le monde\``
            )
        }

        let lang = 'en'
        let text

        const first = args[0].toLowerCase()
        if (VOICE_MAP[first] || LANG_LABELS[first]) {
            lang = first
            text = args.slice(1).join(' ')
        } else {
            text = args.join(' ')
        }

        if (!text?.trim()) return reply(`❌ Please provide text to speak.`)

        // React to show we're working
        try { await sock.sendMessage(jid, { react: { text: '🔊', key: message.key } }) } catch {}

        const buf = await fetchTts(text, lang)

        if (!buf) {
            try { await sock.sendMessage(jid, { react: { text: '❌', key: message.key } }) } catch {}
            return reply(`❌ TTS failed — all voice providers unavailable. Try again shortly.`)
        }

        // ptt: false → renders as music player (not voice-note bubble)
        await sock.sendMessage(jid, {
            audio:    buf,
            mimetype: 'audio/mpeg',
            ptt:      false,
            fileName: 'bera-tts.mp3',
        }, { quoted: message })

        try { await sock.sendMessage(jid, { react: { text: '✅', key: message.key } }) } catch {}
    }
}
