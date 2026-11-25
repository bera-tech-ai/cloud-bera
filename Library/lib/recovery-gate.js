'use strict'

// Phase 4 — gate for deleted-message and view-once recovery tools (spec §25).
//
// Audit finding: the deleted-message recovery tools (.deleted, .getdeleted,
// .deletedp, delwatch — 43 code-search hits) and the view-once tools (.vv,
// autovv) conflict with §25, which forbids claiming arbitrary recovery of
// deleted messages or view-once media. The tools themselves only ever had
// what the bot happened to see before deletion — but their names, help text
// and replies presented them as general recovery.
//
// Decision: both families are DISABLED by default and can only be enabled
// by an explicit owner opt-in — an environment variable or a bot setting.
// When disabled, the commands and the automatic re-post paths answer with
// the standard §25 unsupported response and re-send nothing. When enabled,
// the commands keep working but their wording must not promise arbitrary
// recovery (only content this bot saw before deletion).
//
// The one deliberate exception is the antidelete text notice
// (Library/xadon-pack/src/connection.js): a group-admin-configured notice
// that quotes text the bot itself received in that chat. It repeats nothing
// the bot did not see, so it is not arbitrary recovery, and it is left
// alone. The gated paths are the ones that re-send media, mirror deletes to
// a DM, or present a recovery catalogue.

const { DELETED_RECOVERY, VIEWONCE_RECOVERY } = require('./unsupported')

const truthyEnv = value => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase())

const isDeletedRecoveryAllowed = ({ env = process.env, settings = global.db?.data?.settings } = {}) => {
    if (truthyEnv(env?.BERA_ALLOW_DELETED_RECOVERY)) return true
    if (settings?.allowDeletedRecovery === true) return true
    return false
}

const isViewOnceRecoveryAllowed = ({ env = process.env, settings = global.db?.data?.settings } = {}) => {
    if (truthyEnv(env?.BERA_ALLOW_VIEWONCE_RECOVERY)) return true
    if (settings?.allowViewOnceRecovery === true) return true
    return false
}

module.exports = { isDeletedRecoveryAllowed, isViewOnceRecoveryAllowed, DELETED_RECOVERY, VIEWONCE_RECOVERY }
