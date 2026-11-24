module.exports = {
    name: 'pin',
    alias: ['pinmsg', 'unpin', 'pinned'],
    desc: 'Pin or unpin a message in group',
    category: 'group',
    groupOnly: false,
    adminOnly: false,
    usage: '.pin (reply to message) | .unpin | .pin 1d | .pin 7d | .pin 30d',
    reactions: { start: '📌', success: '📅', error: '❔' },

    execute: async (sock, m, { args, reply, prefix, quoted }) => {
        const sub = args[0]?.toLowerCase();

        // ── UNPIN ────────────────────────────────────────────────
        if (sub === 'unpin' || sub === 'remove') {
            // Spec §8 unpin payload: { pin: targetKey, type: 0, time: 0 }.
            // Target is the quoted message, not the command message itself.
            const unpinTarget = quoted || m.quoted;
            if (!unpinTarget) return reply('`✘ Reply to the pinned message with .unpin`');
            try {
                const sent = await sock.sendMessage(m.chat, {
                    pin: unpinTarget.key,
                    type: 0, // 0 = unpin
                    time: 0
                });
                if (!sent) throw new Error('Baileys did not accept the unpin request.');
                await sock.sendMessage(m.chat, { react: { text: '📌', key: m.key } });
                return reply('✅ Unpin request accepted by Baileys.');
            } catch (error) {
                await sock.sendMessage(m.chat, { react: { text: '❔', key: m.key } });
                return reply('`✘ Failed to unpin message: ' + error.message + '`');
            }
        }

        // ── PIN WITH DURATION ────────────────────────────────────
        const durations = {
            '1d': 86400,      // 1 day
            '7d': 604800,     // 7 days
            '30d': 2592000,   // 30 days
            '24h': 86400,
            '1h': 3600
        };

        let time = 2592000; // Default: 30 days

        if (sub && durations[sub]) {
            time = durations[sub];
        }

        // ── MUST REPLY TO A MESSAGE ─────────────────────────────
        const target = quoted || m.quoted;
        if (!target) {
            await sock.sendMessage(m.chat, { react: { text: '🙊', key: m.key } });
            return reply(
                `╭─❍ *PIN MESSAGE*\n│\n` +
                `│ ⚉ *Usage:* Reply to a message with ${prefix}pin\n│\n` +
                `│ ✪ *Durations:*\n` +
                `│ • ${prefix}pin → 30 days (default)\n` +
                `│ • ${prefix}pin 1d → 1 day\n` +
                `│ • ${prefix}pin 7d → 7 days\n` +
                `│ • ${prefix}pin 30d → 30 days\n` +
                `│ • ${prefix}unpin → Remove pin\n│\n` +
                `│ 📌 *Pins message to group chat*\n` +
                `╰──────────────────`
            );
        }

        await sock.sendMessage(m.chat, { react: { text: '📌', key: m.key } });

        try {
            const sent = await sock.sendMessage(m.chat, {
                pin: target.key,
                time: time,
                type: 1 // 1 = pin
            });
            if (!sent) throw new Error('Baileys did not accept the pin request.');

            // Format duration for response
            let durationText = '30 days';
            if (time === 86400) durationText = '1 day';
            else if (time === 604800) durationText = '7 days';
            else if (time === 3600) durationText = '1 hour';

            await sock.sendMessage(m.chat, { react: { text: '📅', key: m.key } });
            return reply('Pin request accepted by Baileys. Final device-side visibility depends on WhatsApp processing.');
         //   await reply(
        //        `╭─❍ *MESSAGE PINNED*\n│\n` +
        ///        `│ ⇆ *Status:* Pinned\n` +
        //        `│ —͟͟͞͞𖣘 *Duration:* ${durationText}\n│\n` +
        //        `│ 𝓬𝓻𝔂𝓼𝓷𝓸𝓿𝓪 𝓿𝓮𝓻𝓲𝓯𝓲𝓮𝓭\n` +
      //          `╰──────────────────`
        //    );

        } catch (error) {
            console.error('[PIN ERROR]', error.message);
            await sock.sendMessage(m.chat, { react: { text: '❔', key: m.key } });
            reply('`✘ Failed to pin message. Make sure bot is admin.`');
        }
    }
};
