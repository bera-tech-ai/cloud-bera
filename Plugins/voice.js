'use strict'
const { fetchTts, VOICE_MAP, normalizeLanguage } = require('../Library/actions/tts')

const LANG_LABELS = {
    en: 'English', fr: 'French', sw: 'Swahili', sh: 'Sheng (Kenyan Sheng / English mix)', sheng: 'Sheng (Kenyan Sheng / English mix)', ar: 'Arabic',
    es: 'Spanish', de: 'German', ja: 'Japanese', zh: 'Chinese', hi: 'Hindi', pt: 'Portuguese', ko: 'Korean', ru: 'Russian', it: 'Italian', nl: 'Dutch'
}
const normalizeJid = value => String(value || '').replace(/:\d+@/, '@').toLowerCase()

module.exports = {
    commands: ['voice', 'gtts', 'language', 'lang'],
    description: 'Set reply language, opt into voice replies, or speak text as a WhatsApp voice note',
    usage: '.language auto|en|sw|sheng; .voice auto on|off; .voice <text>',
    permission: 'public',
    group: true,
    private: true,

    run: async (sock, message, args, ctx) => {
        const { jid, reply, sender, command, isOwner } = ctx
        const userKey = normalizeJid(sender || jid)
        const chatbera = () => {
            if (!global.db?.data) throw new Error('Database is not ready.')
            if (!global.db.data.chatbera) global.db.data.chatbera = {}
            if (!global.db.data.chatbera.languagePreferences) global.db.data.chatbera.languagePreferences = {}
            if (!global.db.data.chatbera.voiceReplies) global.db.data.chatbera.voiceReplies = {}
            return global.db.data.chatbera
        }

        if (command === 'language' || command === 'lang') {
            const mode = String(args[0] || '').toLowerCase()
            const state = chatbera()
            if (!mode || mode === 'status') {
                const current = normalizeLanguage(state.languagePreferences[userKey] || 'en')
                return reply(`🌐 Reply language: *${current}*\nUse: .language auto|en|sw|sheng`)
            }
            const normalized = normalizeLanguage(mode)
            if (!['auto', 'en', 'sw', 'sheng'].includes(normalized)) {
                return reply('Use `.language auto`, `.language en`, `.language sw`, or `.language sheng`. Auto mirrors the language and code-switching in the conversation.')
            }
            state.languagePreferences[userKey] = normalized
            await global.db.write()
            const labels = { auto: 'Auto (match the conversation)', en: 'English', sw: 'Swahili', sheng: 'Kenyan Sheng / English mix' }
            return reply(`✅ Reply language set to *${labels[normalized]}*.`)
        }

        if (String(args[0] || '').toLowerCase() === 'auto') {
            const choice = String(args[1] || 'status').toLowerCase()
            const state = chatbera()
            const inGroup = String(jid || '').endsWith('@g.us')
            if (choice === 'status') {
                const on = inGroup ? state.voiceChats?.[jid] === true : state.voiceReplies[userKey] === true
                return reply(`🔊 Automatic spoken replies are *${on ? 'ON' : 'OFF'}*${inGroup ? ' in this group' : ''}.\nUse: .voice auto on|off — or just say "from now on use voice".`)
            }
            if (!['on', 'off'].includes(choice)) return reply('Use `.voice auto on` or `.voice auto off`.')
            if (inGroup) {
                if (!isOwner) return reply('Only Bera can turn on voice replies for a group.')
                state.voiceChats = state.voiceChats || {}
                state.voiceChats[jid] = choice === 'on'
                await global.db.write()
                return reply(`🔊 Voice replies in this group turned *${choice.toUpperCase()}*. I\u2019ll answer with voice notes instead of text when the reply fits in one voice note.`)
            }
            state.voiceReplies[userKey] = choice === 'on'
            await global.db.write()
            return reply(`🔊 Automatic spoken replies turned *${choice.toUpperCase()}*. I\u2019ll answer with voice notes instead of text when the reply fits in one voice note.`)
        }

        if (!args.length) {
            return reply(
                `🔊 *Voice controls*\n` +
                `• .voice auto on|off — answer with voice notes instead of text (in a group, only Bera can switch it on)\n` +
                `• .language en|sw|sheng|auto — choose reply language (default: English)\n` +
                `• .voice <text> or .voice <lang> <text> — send a voice note\n` +
                `• or just say "from now on use voice" / "use text again"\n\n` +
                `Languages: ${Object.keys(LANG_LABELS).join(', ')}`
            )
        }

        let lang = 'en'
        let text
        const first = String(args[0]).toLowerCase()
        if (VOICE_MAP[first] || LANG_LABELS[first]) {
            lang = first
            text = args.slice(1).join(' ')
        } else {
            text = args.join(' ')
        }
        if (!text?.trim()) return reply('❌ Please provide text to speak.')
        if (text.length > 1200) return reply('❌ Please keep voice messages under 1,200 characters.')

        try { await sock.sendMessage(jid, { react: { text: '🔊', key: message.key } }) } catch {}
        try {
            const buf = await fetchTts(text, lang)
            const sent = await sock.sendMessage(jid, {
                audio: buf,
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true,
                waveform: [0, 24, 48, 76, 108, 126, 105, 76, 48, 22, 0]
            }, { quoted: message })
            // Register the bot's own voice note so auto-listen never transcribes it back (self-bot loop guard).
            require('../Library/actions/voice-listen').markBotSentVoice(sent?.key?.id)
            try { await sock.sendMessage(jid, { react: { text: '✅', key: message.key } }) } catch {}
        } catch (error) {
            try { await sock.sendMessage(jid, { react: { text: '❌', key: message.key } }) } catch {}
            const messageText = String(error?.message || '')
            return reply(`❌ Voice generation failed. ${messageText.includes('google-tts-api') || messageText.includes('ffmpeg') ? 'The bot host needs the configured TTS package and FFmpeg.' : 'Try again shortly.'}`)
        }
    }
}
