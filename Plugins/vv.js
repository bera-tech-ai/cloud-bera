'use strict'

const {
    isViewOnceMessage,
    extractMedia,
    downloadMedia,
    resolveDestination,
    sendMedia,
    claim
} = require('../Library/lib/viewOnce')
const { isDeveloper } = require('../Library/lib/identity')

module.exports = {
    commands: ['vv', 'viewonce', 'open', 'openphoto', 'openvideo', 'vvphoto'],
    description: 'Manually reveal a view-once message (reply to it)',
    permission: 'owner',
    group: true,
    private: true,

    run: async (sock, message, args, ctx) => {
        const { jid, reply } = ctx
        if (!ctx.isOwner || !isDeveloper(ctx.sender || ctx.from || message.sender)) {
            return reply('⛔ Developer only.')
        }

        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
            message.quoted?.message
        if (!quoted) {
            return reply('❌ Reply to a view-once photo, video, or audio with this command.')
        }
        if (!isViewOnceMessage(quoted)) {
            return reply('❌ The quoted message is not a view-once photo, video, or audio.')
        }

        try {
            const media = extractMedia(quoted)
            const destination = resolveDestination(sock, jid)
            const sourceId = message.quoted?.key?.id || message.key?.id
            if (!media || !destination || !sourceId ||
                !claim(`manual:${sourceId}:${destination}`)) {
                return reply('❌ This view-once message was already handled or has no safe destination.')
            }

            const buffer = await downloadMedia(media)
            if (!buffer?.length) throw new Error('media unavailable')
            await sendMedia(sock, destination, media, buffer)
            await sock.sendMessage(jid, { react: { text: '✅', key: message.key } })
            return reply('✅ View-once media sent securely to the bot account.')
        } catch {
            await sock.sendMessage(jid, { react: { text: '❌', key: message.key } }).catch(() => {})
            await reply('❌ Failed to open the view-once media safely.')
        }
    }
}