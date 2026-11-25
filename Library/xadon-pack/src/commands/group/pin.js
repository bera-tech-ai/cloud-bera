const { assertAccepted, BAILEYS_ACCEPTED_MESSAGE, PIN_ACCEPTED_MESSAGE } = require('../../../../lib/truthful-status')

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
            try {
                const sent = await sock.sendMessage(m.chat, {
                    pin: m.key,
                    type: 0, // 0 = unpin
                    time: 0, // spec §8 unpin payload: { pin, type: 0, time: 0 }
                });
                // Baileys acceptance only — never claim the message is visibly unpinned.
                assertAccepted(sent, 'unpin');
                try {
                    await sock.sendMessage(m.chat, { react: { text: '📌', key: m.key } });
                } catch (reactError) {
                    console.error('[PIN] Unpin confirmation reaction failed:', reactError.message);
                }
                return reply(BAILEYS_ACCEPTED_MESSAGE);
            } catch (error) {
                console.error('[PIN ERROR]', error.message);
                try {
                    await sock.sendMessage(m.chat, { react: { text: '❔', key: m.key } });
                } catch (reactError) {
                    console.error('[PIN] Unpin error reaction failed:', reactError.message);
                }
                return reply('`✘ Failed to unpin message`');
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
            try {
                await sock.sendMessage(m.chat, { react: { text: '🙊', key: m.key } });
            } catch (reactError) {
                console.error('[PIN] Usage reaction failed:', reactError.message);
            }
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

        try {
            await sock.sendMessage(m.chat, { react: { text: '📌', key: m.key } });
        } catch (reactError) {
            console.error('[PIN] Pin start reaction failed:', reactError.message);
        }

        try {
            const sent = await sock.sendMessage(m.chat, {
                pin: target.key,
                time: time,
                type: 1 // 1 = pin
            });
            // Baileys acceptance only — never claim the message is visibly pinned.
            assertAccepted(sent, 'pin', PIN_ACCEPTED_MESSAGE);

            try {
                await sock.sendMessage(m.chat, { react: { text: '📅', key: m.key } });
            } catch (reactError) {
                console.error('[PIN] Pin success reaction failed:', reactError.message);
            }
            return reply(PIN_ACCEPTED_MESSAGE);
        } catch (error) {
            console.error('[PIN ERROR]', error.message);
            try {
                await sock.sendMessage(m.chat, { react: { text: '❔', key: m.key } });
            } catch (reactError) {
                console.error('[PIN] Pin error reaction failed:', reactError.message);
            }
            return reply('`✘ Failed to pin message. Make sure bot is admin.`');
        }
    }
};
