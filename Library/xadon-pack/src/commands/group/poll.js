module.exports = {
  name: 'poll',
  alias: ['vote', 'askgroup'],
  desc: 'Create a group poll',
  usage: '.poll Best day? | Monday | Friday | Sunday',
  group: true,
  async run({ sock, m, reply, ui, prefix }) {
    const { fonts } = ui;
    const parts = (m.body.slice(m.body.indexOf(' ') + 1) || '').split('|').map((s) => s.trim()).filter(Boolean);
    // Fallback: use args-joined text when body parsing is ambiguous.
    if (parts.length < 3) return reply(ui.notice('info', 'Poll', `${fonts.mono(`${prefix}poll Best day? | Monday | Friday`)}\n${fonts.smallCaps('question first, then 2-12 options')}`));
    const [question, ...options] = parts;
    try {
      // Native poll (spec §11); acceptance is checked, never assumed.
      // Poll v3 encoding is as sent by the installed Baileys rc13 runtime;
      // re-verify against rc14 after PR #3 lands.
      const sent = await sock.sendMessage(m.chat, { poll: { name: question.slice(0, 300), values: options.slice(0, 12).map((o) => o.slice(0, 100)), selectableCount: 1 } });
      if (!sent) throw new Error('Baileys did not accept the poll.');
      await reply(ui.notice('success', 'Poll created', 'Poll request accepted by Baileys. Final device-side visibility depends on WhatsApp processing.'));
    } catch (error) { await reply(ui.notice('error', 'Poll failed', error?.message || 'WhatsApp rejected this poll.')); }
  },
};
