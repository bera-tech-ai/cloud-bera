/** Bera remind — persistent reminder (see Library/actions/reminders.js).
 *  Used to be an in-memory setTimeout (5s–24h only, lost on restart).
 *  Now it writes to db.reminders, so the loop in Connection/start.js
 *  delivers it even after a restart, with snooze / done / follow-up. */
const { parseReminderRequest, createReminder, formatNairobi, repeatLabel } = require('../../../../actions/reminders')

module.exports = {
  name: 'remind',
  alias: ['reminder', 'alarm'],
  desc: 'Set a persistent reminder',
  usage: '.remind 10m drink water',
  async run({ sock, m, args, reply, ui, prefix }) {
    const { fonts } = ui;
    const parsed = parseReminderRequest(args.join(' '));
    if (parsed.error) return reply(ui.notice('info', 'Reminder', `${fonts.mono(`${prefix}remind 10m drink water`)}\n${fonts.smallCaps('also: tomorrow at 9am · every monday at 9am')}\n${parsed.error}`));
    let created;
    try {
      created = createReminder({ chat: m.chat, jid: m.sender, msg: parsed.msg, fireAt: parsed.fireAt, repeat: parsed.repeat });
    } catch (e) { return reply(ui.notice('info', 'Reminder', e.message)); }
    const repeatNote = created.repeat ? `\n${fonts.smallCaps('repeats: ' + repeatLabel(created.repeat))}` : '';
    await reply(ui.notice('success', `Reminder [#${created.id}]`, `${fonts.italic(created.msg.slice(0, 200))}\n${fonts.smallCaps(formatNairobi(created.fireAt) + ' (Africa/Nairobi)')}${repeatNote}`));
  },
};
