'use strict'

// Phase 4 — operator restore procedure for tenant state backups (spec §20).
//
// Usage:
//   node scripts/tenant-restore.js <backup-file.json>          # dry run: validate and show what would be restored
//   node scripts/tenant-restore.js <backup-file.json> --apply  # validate and write the state to PostgreSQL
//
// The backup file is validated before anything is written: unknown format,
// unsupported version, or a tenant mismatch all refuse the restore. --apply
// writes the state document into <schema>.bera_state for the backup's
// tenant and reports the row written; it never deletes other tenants.
// Session files in the backup are listed, not applied — copy them into the
// tenant's session directory yourself and restart the bot.
//
// The database connection comes from DATABASE_URL in the environment, the
// same as the bot. Never pass a connection string on the command line.

const fs = require('fs')
const path = require('path')
const { restoreBackup, backupSummary } = require('../Library/lib/tenant-backup')
const { resolveDbSchema, qualified } = require('../Library/lib/db-schema')

const main = async () => {
    const args = process.argv.slice(2)
    const file = args.find(arg => !arg.startsWith('--'))
    const apply = args.includes('--apply')
    if (!file) {
        console.error('Usage: node scripts/tenant-restore.js <backup-file.json> [--apply]')
        process.exitCode = 2
        return
    }
    let snapshot
    try {
        snapshot = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'))
    } catch (error) {
        console.error(`Cannot read backup file: ${error.message}`)
        process.exitCode = 2
        return
    }
    const summary = backupSummary(snapshot)
    if (!summary.ok) {
        console.error(`Refusing to restore: ${summary.errors.join(' ')}`)
        process.exitCode = 1
        return
    }
    const restored = restoreBackup(snapshot)
    console.log(`Backup OK: tenant ${restored.tenantId}, created ${restored.createdAt || 'unknown'}`)
    console.log(`State keys: ${Object.keys(restored.state).join(', ') || '(empty)'}`)
    console.log(`Session files in backup: ${restored.sessionFiles.length ? restored.sessionFiles.map(f => f.name).join(', ') : 'none'}`)
    if (!apply) {
        console.log('Dry run — nothing was written. Re-run with --apply to restore this state into PostgreSQL.')
        return
    }
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL is not set. Refusing to apply without a database target.')
        process.exitCode = 2
        return
    }
    const { Pool } = require('pg')
    const schema = resolveDbSchema()
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false } })
    const { quoteIdent } = require('../Library/lib/db-schema')
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)}`)
    try {
        await pool.query(
            `INSERT INTO ${qualified(schema, 'bera_state')} (tenant_id, data, updated_at)
             VALUES ($1, $2::jsonb, NOW())
             ON CONFLICT (tenant_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
            [restored.tenantId, JSON.stringify(restored.state)]
        )
        console.log(`Restored tenant ${restored.tenantId} into ${schema}.bera_state. Restart the bot with BERA_TENANT_ID=${restored.tenantId}.`)
        if (restored.sessionFiles.length) {
            console.log(`Session files were NOT applied automatically. Copy them into sessions/${restored.tenantId}/ before restarting.`)
        }
    } finally {
        await pool.end()
    }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1 })
module.exports = { main }
