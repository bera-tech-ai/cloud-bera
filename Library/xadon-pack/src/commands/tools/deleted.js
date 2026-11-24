// XADON V12 · deleted — show deleted messages this bot saw BEFORE deletion.
// Phase 4 (spec §25): this is NOT arbitrary recovery — WhatsApp cannot
// return a message after the sender deletes it, and Bera cannot fetch what
// it never received. Recovery is disabled by default and only an explicit
// owner opt-in (BERA_ALLOW_DELETED_RECOVERY=1) enables it; when disabled
// the command answers with the standard unsupported response. `clear` still
// works when disabled: dropping the local log is not recovery.
// Usage: .deleted [1-5] | .deleted clear
const store = require('../../lib/msgstore');
const cache = require('../../lib/mediacache');
const { isDeletedRecoveryAllowed, DELETED_RECOVERY } = require('../../../../lib/recovery-gate');
const short = (j = '') => String(j).split('@')[0].split(':')[0];
module.exports = {
  name: 'deleted',
  alias: ['dels', 'antidel', 'showdeleted'],
  desc: 'Show deleted messages this bot saw before deletion (disabled by default — spec §25)',
  usage: '.deleted [1-5] | .deleted clear',
  category: 'tools',
  async run({ sock, m, args, reply, ui }) {
    const t = String(args[0] || '').toLowerCase();
    if (t === 'clear' || t === 'clean') {
      store.clearDeleted(m.chat);
      try { cache.dropChat(m.chat); } catch {}
      return reply(ui.notice('success', 'Cleared', 'Deleted-message log + cached media for this chat were cleared.'));
    }
    if (!isDeletedRecoveryAllowed()) return reply(DELETED_RECOVERY().card);
    let n = parseInt(args[0] || '5', 10);
    if (!Number.isFinite(n)) n = 5;
    n = Math.max(1, Math.min(5, n));
    const list = store.getDeleted(m.chat, 5).slice(0, n);
    if (!list.length) return reply(ui.notice('info', 'No deleted messages', 'Nothing deleted here yet. Only messages this bot received before deletion are ever listed.'));
    const lines = list.map((d, i) => {
      const who = d.sender ? '@' + short(d.sender) : 'unknown';
      const when = d.deletedAt ? new Date(d.deletedAt).toLocaleTimeString('en-GB') : '';
      const mediaMark = cache.has(m.chat, d.id) ? ' 📎[media recovered]' : '';
      const body = (d.body || `[${d.type || 'media'}]`).slice(0, 300);
      return `${i + 1}. ${who} ${when ? '(' + when + ')' : ''}${mediaMark}\n   ${body}`;
    });
    const mentions = list.map((d) => d.sender).filter(Boolean);
    await reply(ui.card({ icon: '♻', title: 'Deleted messages', subtitle: `${list.length} of last 5 in this chat`, rows: [], body: lines.join('\n\n') }), { mentions });
    // re-send every recovered media item, newest first
    for (const d of list) {
      const snap = cache.get(m.chat, d.id);
      const payload = cache.toPayload(snap);
      if (!payload) continue;
      try {
        const who = d.sender ? '@' + short(d.sender) : 'Someone';
        if (payload.image || payload.video) {
          await sock.sendMessage(m.chat, { ...payload, caption: `♻ ${who}${payload.caption ? '\n' + payload.caption : ''}`.slice(0, 1000), mentions: d.sender ? [d.sender] : [] }, { quoted: m.raw });
        } else {
          await sock.sendMessage(m.chat, payload).catch(() => {});
        }
        await new Promise((r) => setTimeout(r, 600));
      } catch {}
    }
  },
};
