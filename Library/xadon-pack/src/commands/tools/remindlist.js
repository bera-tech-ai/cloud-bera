// XADON AI · remindlist — lists persistent reminders (Library/actions/reminders.js).
const { listReminders, formatNairobi, repeatLabel } = require('../../../../actions/reminders')

module.exports = {
  name: 'remindlist',
  aliases: ['remins', 'myreminds'],
  description: 'List your pending reminders',
  category: 'tools',
  groupOnly: false,
  ownerOnly: false,
  async execute(sock, m, extra) {
    const { reply, ui } = extra;
    const mine = listReminders(m.sender);
    if (!mine.length) return reply(ui.notice('info', 'Reminders', 'No pending reminders. Set one with .remind 10m drink water.'));
    const lines = mine.map((r) => {
      const waiting = r.status === 'fired' ? ' (waiting: .done ' + r.id + ')' : '';
      const repeat = r.repeat ? ' (' + repeatLabel(r.repeat) + ')' : '';
      return `[${r.id}] ${r.msg} — ${formatNairobi(r.fireAt)}${repeat}${waiting}`;
    }).join('\n');
    return reply(ui.notice('info', 'Reminders', lines));
  },
};
