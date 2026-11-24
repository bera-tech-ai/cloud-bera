// XADON V10 · AUTO — Auto-forward every view-once message to your DM.
// Phase 4 (spec §25): cannot be switched on while the view-once recovery
// gate is off (BERA_ALLOW_VIEWONCE_RECOVERY=1). View-once media the bot
// never received cannot be recovered at all.
const { isViewOnceRecoveryAllowed, VIEWONCE_RECOVERY } = require('../../../../lib/recovery-gate');
module.exports = {
  name: 'autovv',
  alias: ['autosavevv'],
  desc: 'Auto-forward view-once messages this bot receives to your DM (disabled by default — spec §25)',
  usage: '.autovv on|off',
  owner: true, category: 'owner',
  async run({ args, reply, ui, db }) {
    const a = String(args[0] || '').toLowerCase();
    const cur = !!db.get('autovv', false);
    const val = /^(on|1|yes)$/.test(a) ? true : /^(off|0|no)$/.test(a) ? false : !cur;
    if (val && !isViewOnceRecoveryAllowed()) return reply(VIEWONCE_RECOVERY().card);
    db.set('autovv', val);
    return reply(ui.notice(val ? 'success' : 'warn', `Auto-VV ${val ? 'on' : 'off'}`, 'Auto-forward view-once messages this bot receives to your DM.'));
  },
};
