// XADON V12 · getdeleted — pull one deleted item this bot saw before
// deletion into YOUR DM. Phase 4 (spec §25): disabled by default, same gate
// as .deleted — no arbitrary recovery.
// Usage: .getdeleted 1 | .getdeleted 2
const store = require('../../lib/msgstore');
const cache = require('../../lib/mediacache');
const { isDeletedRecoveryAllowed, DELETED_RECOVERY } = require('../../../../lib/recovery-gate');
module.exports = {
  name: 'getdeleted',
  alias: ['fetchdeleted', 'dmdeleted'],
  desc: 'Send a deleted item this bot saw to your DM (disabled by default — spec §25)',
  usage: '.getdeleted 2',
  category: 'tools',
  async run({ sock, m, args, reply, ui }) {
    if (!isDeletedRecoveryAllowed()) return reply(DELETED_RECOVERY().card);
    let n = parseInt(args[0] || '1', 10);
    if (!Number.isFinite(n)) n = 1;
    n = Math.max(1, Math.min(5, n));
    const list = store.getDeleted(m.chat, 5);
    const entry = list[n - 1];
    if (!entry) return reply(ui.notice('info', 'Nothing there', `No deleted message #${n} in this chat. See .deleted first.`));
    const target = m.sender;
    const ok = await cache.repost(sock, m.chat, target, entry, `🗑 deleted #${n} from ${(m.isGroup ? 'group' : 'chat')}`);
    if (!ok) return reply(ui.notice('error', 'DM failed', 'I could not DM you (privacy?). It is still visible via .deleted.'));
    return reply(ui.notice('success', 'Sent to your DM', `Deleted #${n}${cache.has(m.chat, entry.id) ? ' with its media 📎' : ''} — check your DM.`));
  },
};
