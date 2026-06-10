'use strict';

module.exports = {
    commands:    ['spp', 'getpp'],
    description: "Get a user's profile picture",
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, ctx) => {
        const { sender, isGroup, mentionedJid, contextInfo, jid, reply } = ctx;
        try {
            let user = sender;
            if (isGroup) {
                if (mentionedJid?.length) {
                    user = mentionedJid[0];
                } else {
                    const quoted = message.message?.extendedTextMessage?.contextInfo;
                    if (quoted?.participant) user = quoted.participant;
                }
            }

            const pp = await sock.profilePictureUrl(user, 'image').catch(() =>
                'https://files.catbox.moe/5uli5p.jpeg'
            );

            const name = user.split('@')[0];

            await sock.sendMessage(jid, {
                image:   { url: pp },
                caption: `🖼️ *Profile Picture*\n\n📱 *User:* +${name}`,
                contextInfo
            }, { quoted: message });
        } catch (err) {
            console.error('[GetPP]', err.message);
            await reply("❌ Couldn't fetch profile picture. The user may not have one set.");
        }
    }
};
