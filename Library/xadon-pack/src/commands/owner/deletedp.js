// XADON V12 · deletedp — auto-forward deleted messages this bot saw before
// deletion to the owner's DM. Phase 4 (spec §25): disabled by default and
// cannot be switched on while the recovery gate is off — mirroring every
// delete to a DM is not arbitrary recovery, but it must be an explicit
// owner decision (BERA_ALLOW_DELETED_RECOVERY=1), not a quiet default.
// Usage (owner only): .deletedp on | .deletedp off | .deletedp status
const { isDeletedRecoveryAllowed, DELETED_RECOVERY } = require('../../../../lib/recovery-gate');
module.exports = {
  name: 'deletedp',
  alias: ['del2dm', 'deletedm', 'delmirror'],
  desc: 'Forward deleted messages this bot saw to owner DM (disabled by default — spec §25)',
  usage: '.deletedp on | .deletedp off | .deletedp status',
  category: 'owner',
  owner: true,
  async run({ args, reply, ui, db }) {
    const a = String(args[0] || '').toLowerCase();
    const cur = !!db.get('deletedp', false);
    if (!a || a === 'status' || a === 'info') {
      return reply(ui.card({
        icon: '🗑', title: 'Deleted → DM', subtitle: cur ? 'MIRRORING LIVE' : 'off',
        rows: [['mirror', cur ? 'ON' : 'off'], ['includes', 'only messages this bot saw before deletion']],
        body: '.deletedp on · .deletedp off\nOnly deletes this bot received before deletion are mirrored — nothing is fetched from WhatsApp after deletion.',
      }));
    }
    const val = /^(on|enable|yes|1)$/.test(a) ? true : /^(off|disable|no|0)$/.test(a) ? false : !cur;
    if (val && !isDeletedRecoveryAllowed()) return reply(DELETED_RECOVERY().card);
    db.set('deletedp', val);
    return reply(ui.notice(val ? 'success' : 'warn', `Deleted→DM ${val ? 'ON' : 'OFF'}`,
      val ? 'Deleted messages this bot saw (with media) will hit your DM.' : 'Delete mirroring paused.'));
  },
};
