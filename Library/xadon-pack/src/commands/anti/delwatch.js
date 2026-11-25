// XADON V12 · PREMIUM — delwatch: re-post deleted messages this bot saw
// before deletion back into the chat. Phase 4 (spec §25): disabled by
// default and cannot be switched on while the recovery gate is off
// (BERA_ALLOW_DELETED_RECOVERY=1). This is not arbitrary recovery.
// Usage: .delwatch on | .delwatch off | .delwatch status
const { savePolicy, groupPolicy, modeOf } = require('../../message-handler');
const { isDeletedRecoveryAllowed, DELETED_RECOVERY } = require('../../../../lib/recovery-gate');
module.exports = {
  name: 'delwatch',
  alias: ['antidelall', 'restoreall'],
  desc: 'Auto re-post deleted messages this bot saw, back into chat (disabled by default — spec §25)',
  usage: '.delwatch on | .delwatch off | .delwatch status',
  group: true, admin: true, category: 'anti',
  async run({ sock, m, args, reply, ui }) {
    const cur = modeOf(groupPolicy(m.chat).delwatch);
    const a = String(args[0] || '').toLowerCase();
    if (!a || a === 'status' || a === 'info') {
      return reply(ui.card({
        icon: '♻', title: 'Delwatch', subtitle: cur === 'off' ? 'OFF' : 'RESTORING',
        rows: [['mode', cur === 'off' ? 'off' : 'armed'], ['restores', 'only messages this bot saw before deletion']],
        body: '.delwatch on · .delwatch off\nOnly deleted messages the bot received before deletion are re-posted.',
      }));
    }
    let val;
    if (/^(on|enable|yes|1)$/.test(a)) val = true;
    else if (/^(off|disable|no|0)$/.test(a)) val = false;
    else val = cur === 'off' ? true : false;
    if (val && !isDeletedRecoveryAllowed()) return reply(DELETED_RECOVERY().card);
    const meta = await sock.groupMetadata(m.chat).catch(() => null);
    savePolicy(m.chat, { delwatch: val, groupName: meta?.subject || 'the group' });
    return reply(ui.notice(val ? 'success' : 'warn', `Delwatch ${val ? 'ON ♻' : 'OFF'}`,
      val ? 'Deletes this bot saw will be restored in-chat with media.' : 'Chat restore disabled.'));
  },
};
