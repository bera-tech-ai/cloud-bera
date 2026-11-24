'use strict'

// Phase 4 — tenant allocation (spec §20).
//
// "The system must support more than five bots and should scale to more
// than one hundred customers without manually creating environment variables
// for each one. Tenant allocation, session naming, and storage paths should
// be generated automatically."
//
// Before this module the only tenant source was manual env vars
// (BERA_TENANT_ID || BERA_AUTH_SESSION_ID || 'default'), so every extra
// customer needed a hand-made variable and a deployment without one silently
// shared the literal tenant 'default'.
//
// Rules implemented here:
//   * Tenant IDs are auto-generated as `bot-<16 hex chars>` — the same shape
//     as the tenant IDs already in production (e.g. bot-841d09ae650aed44).
//   * A generated ID is persisted once (marker file) and re-used on every
//     later start, so a restart never orphans a tenant's state.
//   * An explicit BERA_TENANT_ID still wins; BERA_AUTH_SESSION_ID is kept
//     as a backwards-compatible fallback for existing deployments.
//   * Each WhatsApp number gets a deterministic session ID derived from the
//     tenant ID + phone number, so sessions for different numbers are never
//     shared and no manual session naming is needed.
//   * Storage paths are derived from the tenant ID, never hand-configured.

const crypto = require('crypto')
const path = require('path')

const TENANT_ID_RE = /^bot-[0-9a-f]{16}$/

const generateTenantId = () => `bot-${crypto.randomBytes(8).toString('hex')}`

const isValidTenantId = value => TENANT_ID_RE.test(String(value || '').trim())

const digitsOf = value => String(value || '').replace(/[^0-9]/g, '')

// Deterministic session ID for one (tenant, phone number) pair. The phone
// number itself is never embedded in the ID — only a hash of it — so session
// IDs can appear in logs without leaking numbers.
const sessionIdFor = ({ tenantId, phone } = {}) => {
    const tenant = String(tenantId || '').trim()
    if (!tenant) throw new Error('A tenant ID is required to derive a session ID.')
    const digits = digitsOf(phone)
    if (digits.length < 7 || digits.length > 15) {
        throw new Error('A WhatsApp number with 7–15 digits is required to derive a session ID.')
    }
    const hash = crypto.createHash('sha256').update(`${tenant}:${digits}`, 'utf8').digest('hex').slice(0, 16)
    return `wa-${hash}`
}

// Session ID for a tenant with no phone number yet (pre-pairing). Pairing
// replaces it with sessionIdFor({ tenantId, phone }) once a number is known.
const sessionIdForTenant = tenantId => {
    const tenant = String(tenantId || '').trim()
    if (!tenant) throw new Error('A tenant ID is required to derive a session ID.')
    return `wa-${tenant.replace(/^bot-/, '')}`
}

const storagePathsFor = (tenantId, { baseDir = 'sessions', dbDir = 'Database', backupDir = 'backups' } = {}) => {
    const tenant = String(tenantId || '').trim()
    if (!tenant) throw new Error('A tenant ID is required to derive storage paths.')
    return {
        tenantId: tenant,
        sessionDir: path.join(baseDir, tenant),
        dbFile: path.join(dbDir, `${tenant}.db.json`),
        backupDir: path.join(backupDir, tenant)
    }
}

// Resolve the tenant for this process. Precedence:
//   1. BERA_TENANT_ID (explicit)
//   2. BERA_AUTH_SESSION_ID (backwards-compatible fallback; existing
//      deployments already use it as their tenant)
//   3. marker file written by a previous auto-generation
//   4. generate once and persist via writeMarker
// readMarker/writeMarker are injectable so tests never touch the disk.
// Returns { tenantId, source, generated }.
const resolveTenantId = ({ env = process.env, readMarker = null, writeMarker = null } = {}) => {
    const fromEnv = String(env?.BERA_TENANT_ID || '').trim()
    if (fromEnv) return { tenantId: fromEnv, source: 'env:BERA_TENANT_ID', generated: false }
    const fromSession = String(env?.BERA_AUTH_SESSION_ID || '').trim()
    if (fromSession) return { tenantId: fromSession, source: 'env:BERA_AUTH_SESSION_ID', generated: false }
    let marked = ''
    try { marked = String(readMarker ? readMarker() : '').trim() } catch {}
    if (marked) return { tenantId: marked, source: 'marker', generated: false }
    const tenantId = generateTenantId()
    try { writeMarker && writeMarker(tenantId) } catch {}
    return { tenantId, source: 'generated', generated: true }
}

// Provision a new customer tenant. `store` is injectable ({ save, get, list })
// so the core logic is testable without a database; the WhatsApp command
// passes a store backed by global.db. Throws on duplicates and bad input —
// provisioning must never silently overwrite an existing tenant.
const provisionTenant = ({ tenantId, phone, owner, store } = {}) => {
    if (!store || typeof store.save !== 'function') throw new Error('A tenant store is required to provision a tenant.')
    const id = tenantId ? String(tenantId).trim() : generateTenantId()
    if (tenantId && !isValidTenantId(id)) {
        throw new Error('Tenant IDs must look like bot-<16 lowercase hex characters>. Omit the ID to auto-generate one.')
    }
    if (typeof store.get === 'function' && store.get(id)) {
        throw new Error(`Tenant ${id} already exists. Provisioning refuses to overwrite it.`)
    }
    const digits = phone ? digitsOf(phone) : ''
    if (phone && (digits.length < 7 || digits.length > 15)) {
        throw new Error('Provisioning needs a WhatsApp number with 7–15 digits, or no number at all.')
    }
    const ownerDigits = owner ? digitsOf(owner) : ''
    const record = {
        tenantId: id,
        sessionId: digits ? sessionIdFor({ tenantId: id, phone: digits }) : sessionIdForTenant(id),
        phone: digits || null,
        owner: ownerDigits || null,
        storagePaths: storagePathsFor(id),
        createdAt: new Date().toISOString()
    }
    store.save(record)
    return record
}

const listTenants = (store = {}) => {
    if (typeof store.list === 'function') return store.list()
    if (store && typeof store === 'object') return Object.values(store).filter(v => v && v.tenantId)
    return []
}

module.exports = {
    TENANT_ID_RE,
    generateTenantId,
    isValidTenantId,
    digitsOf,
    sessionIdFor,
    sessionIdForTenant,
    storagePathsFor,
    resolveTenantId,
    provisionTenant,
    listTenants
}
