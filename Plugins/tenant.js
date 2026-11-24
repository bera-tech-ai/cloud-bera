'use strict'

// Phase 4 — tenant provisioning and operations (spec §20).
//
// Owner-only commands for multi-tenant operations. No customer needs a
// hand-made environment variable: provisioning auto-generates the tenant ID,
// the session ID and the storage paths, and records them in bot state.
//   .tenant provision [phone] [owner-phone] — create a tenant record
//   .tenant status — current tenant, schema, provider, write health
//   .tenant list — provisioned tenants known to this bot
//   .tenant backup — write a bera_state backup file for this tenant
//   .tenant health — database write-failure alarm status
//
// Backup files contain the tenant's state: keep them private, never send
// them over WhatsApp, and never commit them. Restores are an operator
// procedure (scripts/tenant-restore.js), not a chat command — applying a
// foreign state document to a live bot is too destructive to do by chat.

const fs = require('fs')
const path = require('path')
const { formatBeraCard } = require('../Library/lib/bera-card')
const { provisionTenant, listTenants } = require('../Library/lib/tenant')
const { createBackup, backupFileName } = require('../Library/lib/tenant-backup')
const { getWriteHealth, alarmMessage } = require('../Library/lib/db-health')

const HELP = `🏢 *Bera Tenant Operations*\n\n• *.tenant provision [phone] [owner-phone]* — create a tenant (IDs and paths auto-generated)\n• *.tenant status* — current tenant, database schema and write health\n• *.tenant list* — tenants provisioned on this bot\n• *.tenant backup* — write a state backup file for this tenant\n• *.tenant health* — database write-failure alarm\n\nTenant commands are owner-only. Start a bot for a provisioned tenant with BERA_TENANT_ID=<tenant id>.`

const ownerOnly = (isOwner, reply) => {
    if (isOwner) return true
    reply('⛔ Tenant operations are owner-only.')
    return false
}

const tenantStore = () => {
    const state = global.db?.data
    if (!state) throw new Error('Bot state is not initialised.')
    if (!state.tenants || typeof state.tenants !== 'object') state.tenants = {}
    return {
        save: record => { state.tenants[record.tenantId] = record },
        get: tenantId => state.tenants[tenantId] || null,
        list: () => Object.values(state.tenants)
    }
}

const handle = async (m, { args = [], text = '', command = 'tenant', reply, isOwner } = {}) => {
    if (!ownerOnly(isOwner, reply)) return
    const sub = String(args[0] || 'help').toLowerCase()
    // Text after the command word AND the subcommand word, e.g.
    // '.tenant provision +2547...' -> '+2547...'. args.length guards the
    // case where there is no subcommand at all.
    const rest = args.length > 1 ? String(text || '').replace(/^\S+\s+\S+\s*/i, '').trim() : ''

    if (sub === 'help' || sub === 'menu') return reply(HELP)

    if (sub === 'status') {
        const health = getWriteHealth()
        const body = [
            `Tenant: ${global.db?.tenantId || 'unknown'} (source: ${global.db?.tenantSource || 'unknown'})`,
            `Database schema: ${global.db?.dbSchema || 'unknown'}`,
            `Provider: ${global.db?.provider || 'unknown'}`,
            `Session lease: ${global.db?.provider === 'postgresql' ? 'enabled' : 'local only'}`,
            '',
            alarmMessage(health)
        ].join('\n')
        return reply(formatBeraCard(body, { type: health.ok ? 'success' : 'error', title: 'TENANT', subtitle: 'STATUS' }))
    }

    if (sub === 'list') {
        const tenants = listTenants(tenantStore())
        if (!tenants.length) return reply('No tenants have been provisioned on this bot yet. Use *.tenant provision* to create one.')
        const body = tenants.map(t => `• ${t.tenantId} — session ${t.sessionId}${t.phone ? ` — +${t.phone}` : ' — no number yet'} (created ${t.createdAt || 'unknown'})`).join('\n')
        return reply(formatBeraCard(body, { type: 'info', title: 'TENANTS', subtitle: `${tenants.length} PROVISIONED` }))
    }

    if (sub === 'health') {
        const health = getWriteHealth()
        return reply(formatBeraCard(alarmMessage(health), { type: health.ok ? 'success' : 'error', title: 'DB HEALTH', subtitle: 'WRITE ALARM' }))
    }

    if (sub === 'provision') {
        const parts = rest.split(/\s+/).filter(Boolean)
        try {
            const record = provisionTenant({ phone: parts[0] || null, owner: parts[1] || null, store: tenantStore() })
            await global.db.write()
            const body = [
                `Tenant: ${record.tenantId}`,
                `Session ID: ${record.sessionId}`,
                `Phone: ${record.phone ? `+${record.phone}` : 'not set — pair a number to derive the session ID'}`,
                `Session dir: ${record.storagePaths.sessionDir}`,
                `State file: ${record.storagePaths.dbFile}`,
                `Backup dir: ${record.storagePaths.backupDir}`,
                '',
                'Start a bot for this tenant with:',
                `BERA_TENANT_ID=${record.tenantId}`
            ].join('\n')
            return reply(formatBeraCard(body, { type: 'success', title: 'TENANT', subtitle: 'PROVISIONED' }))
        } catch (error) {
            return reply(formatBeraCard(`❌ Provisioning failed: ${error.message}`, { type: 'error', title: 'TENANT', subtitle: 'PROVISION FAILED' }))
        }
    }

    if (sub === 'backup') {
        try {
            const tenantId = global.db?.tenantId || 'unknown'
            const backup = createBackup({ tenantId, state: global.db?.data || {} })
            const dir = path.resolve('backups', tenantId)
            fs.mkdirSync(dir, { recursive: true })
            const file = path.join(dir, backupFileName(backup))
            fs.writeFileSync(file, JSON.stringify(backup, null, 2), 'utf8')
            const size = fs.statSync(file).size
            const body = [
                `Tenant: ${tenantId}`,
                `Backup: ${file}`,
                `Size: ${size} bytes`,
                `Created: ${backup.createdAt}`,
                '',
                'Keep this file private — it contains the tenant state. Restore with scripts/tenant-restore.js.'
            ].join('\n')
            return reply(formatBeraCard(body, { type: 'success', title: 'TENANT', subtitle: 'BACKUP WRITTEN' }))
        } catch (error) {
            return reply(formatBeraCard(`❌ Backup failed: ${error.message}`, { type: 'error', title: 'TENANT', subtitle: 'BACKUP FAILED' }))
        }
    }

    return reply(HELP)
}

handle.commands = ['tenant', 'tenants']

module.exports = handle
