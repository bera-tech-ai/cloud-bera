'use strict'

// Phase 4 — backup and restore for bera_state + session files (spec §20).
//
// There was no backup/restore evidence for bera_state before this module:
// the Neon inspection found session_backups (4 rows, 1 active) but no
// bera_state backup table and no tested restore procedure.
//
// A backup is a plain JSON document, so an operator can inspect it without
// special tooling. It contains the tenant's application state and, when
// supplied, the session files needed to keep the linked WhatsApp device
// working after a restore. It never contains database credentials: the
// snapshot holds state only, and restore targets are supplied by the
// operator's environment, not by the file.
//
// Restore procedure (tested — see test/phase4-backup.test.js):
//   1. createBackup() on the source tenant
//   2. copy the JSON file to the target host
//   3. restoreBackup() validates format, version and tenant match, then
//      returns the state + decoded session files for the caller to write
//   4. the caller writes the state and restarts the bot; the bot loads the
//      restored state on startup
// The CLI script scripts/tenant-restore.js wraps steps 3–4 for operators.

const BACKUP_VERSION = 1
const BACKUP_FORMAT = 'bera-state-backup'

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)

const encodeSessionFiles = (sessionFiles = []) => {
    if (!Array.isArray(sessionFiles)) throw new Error('sessionFiles must be an array.')
    return sessionFiles.map(file => {
        if (!file || typeof file.name !== 'string' || !file.name) {
            throw new Error('Each session file needs a name.')
        }
        if (file.name.includes('/') || file.name.includes('\\') || file.name === '.' || file.name === '..') {
            throw new Error(`Session file name "${file.name}" must be a plain file name, not a path.`)
        }
        const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.data ?? ''), 'utf8')
        return { name: file.name, base64: data.toString('base64') }
    })
}

const createBackup = ({ tenantId, state, sessionFiles = [], createdAt = null } = {}) => {
    const tenant = String(tenantId || '').trim()
    if (!tenant) throw new Error('A tenant ID is required to create a backup.')
    if (!isPlainObject(state)) throw new Error('Backup state must be an object (the tenant state document).')
    return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        tenantId: tenant,
        createdAt: createdAt || new Date().toISOString(),
        state,
        sessionFiles: encodeSessionFiles(sessionFiles)
    }
}

const backupFileName = ({ tenantId, createdAt = null } = {}) => {
    const stamp = String(createdAt || new Date().toISOString()).replace(/[:.]/g, '-')
    return `bera_state-${String(tenantId || 'unknown')}-${stamp}.json`
}

const validateBackup = (snapshot, { tenantId = null } = {}) => {
    const errors = []
    if (!isPlainObject(snapshot)) return { ok: false, errors: ['Backup is not a JSON object.'] }
    if (snapshot.format !== BACKUP_FORMAT) errors.push(`Unknown backup format: ${String(snapshot.format || 'missing')}.`)
    if (snapshot.version !== BACKUP_VERSION) errors.push(`Unsupported backup version: ${String(snapshot.version ?? 'missing')} (expected ${BACKUP_VERSION}).`)
    if (!snapshot.tenantId || typeof snapshot.tenantId !== 'string') errors.push('Backup has no tenantId.')
    if (tenantId && snapshot.tenantId !== tenantId) {
        errors.push(`Backup belongs to tenant ${snapshot.tenantId}, not ${tenantId}. Refusing cross-tenant restore.`)
    }
    if (!isPlainObject(snapshot.state)) errors.push('Backup has no state object.')
    if (!Array.isArray(snapshot.sessionFiles)) {
        errors.push('Backup has no sessionFiles array.')
    } else {
        for (const file of snapshot.sessionFiles) {
            if (!file || typeof file.name !== 'string' || typeof file.base64 !== 'string') {
                errors.push('Backup contains a session file entry without a name and base64 data.')
            } else if (!/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64)) {
                errors.push(`Session file "${file.name}" is not valid base64.`)
            }
        }
    }
    return { ok: errors.length === 0, errors }
}

// Validate and decode a backup. Throws on any validation failure — a
// restore must never apply a snapshot it cannot vouch for. Returns
// { tenantId, createdAt, state, sessionFiles: [{ name, data: Buffer }] }.
const restoreBackup = (snapshot, options = {}) => {
    const check = validateBackup(snapshot, options)
    if (!check.ok) throw new Error(`Refusing to restore backup: ${check.errors.join(' ')}`)
    return {
        tenantId: snapshot.tenantId,
        createdAt: snapshot.createdAt || null,
        state: snapshot.state,
        sessionFiles: snapshot.sessionFiles.map(file => ({
            name: file.name,
            data: Buffer.from(file.base64, 'base64')
        }))
    }
}

const backupSummary = snapshot => {
    const check = validateBackup(snapshot)
    return {
        ok: check.ok,
        errors: check.errors,
        tenantId: snapshot?.tenantId || null,
        createdAt: snapshot?.createdAt || null,
        stateKeys: isPlainObject(snapshot?.state) ? Object.keys(snapshot.state) : [],
        sessionFileCount: Array.isArray(snapshot?.sessionFiles) ? snapshot.sessionFiles.length : 0
    }
}

module.exports = { BACKUP_FORMAT, BACKUP_VERSION, createBackup, backupFileName, validateBackup, restoreBackup, backupSummary }
