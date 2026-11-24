'use strict'

const crypto = require('crypto')
const { resolveDbSchema, qualified } = require('./db-schema')

// Phase 4: the auth table is schema-qualified like bera_state (see
// Library/lib/db-schema.js). Under the default search_path the old
// unqualified name resolved to public.bera_whatsapp_auth while the
// tenant-isolated auth rows live in berahost.bera_whatsapp_auth.
const tableSql = schema => `
CREATE TABLE IF NOT EXISTS ${qualified(schema, 'bera_whatsapp_auth')} (
    session_id TEXT NOT NULL,
    auth_type TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (session_id, auth_type, auth_key)
)`

const makeEncryptionKey = value => {
    const secret = String(value || '')
    if (secret.trim().length < 32) {
        throw new Error('BERA_SESSION_ENCRYPTION_KEY must contain at least 32 characters. Generate one with: openssl rand -base64 32')
    }
    return crypto.createHash('sha256').update(secret, 'utf8').digest()
}

const contextFor = (sessionId, authType, authKey) => Buffer.from(`${sessionId}\u0000${authType}\u0000${authKey}`, 'utf8')

const encryptValue = (value, encryptionKey, context, BufferJSON) => {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv)
    cipher.setAAD(context)
    const plaintext = Buffer.from(JSON.stringify(value, BufferJSON.replacer), 'utf8')
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
    return {
        version: 1,
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        data: ciphertext.toString('base64')
    }
}

const decryptValue = (payload, encryptionKey, context, BufferJSON) => {
    if (!payload || payload.version !== 1 || !payload.iv || !payload.tag || !payload.data) {
        throw new Error('Stored WhatsApp auth record is malformed or uses an unsupported format.')
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(payload.iv, 'base64'))
    decipher.setAAD(context)
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(payload.data, 'base64')),
        decipher.final()
    ]).toString('utf8')
    return JSON.parse(plaintext, BufferJSON.reviver)
}

const createPostgresAuthState = async ({ pool, sessionId = 'whatsapp', encryptionKey, legacyState, baileys, schema = null } = {}) => {
    if (!pool || typeof pool.query !== 'function') throw new Error('PostgreSQL pool is unavailable for WhatsApp auth storage.')
    if (!legacyState?.creds || !legacyState?.keys || typeof legacyState.saveCreds !== 'function') {
        throw new Error('A valid Baileys legacy auth state is required for startup and migration.')
    }
    const baileysApi = baileys || require('@whiskeysockets/baileys')
    if (!baileysApi.BufferJSON || typeof baileysApi.initAuthCreds !== 'function') {
        throw new Error('The installed Baileys package does not expose the required auth-state serializers.')
    }
    const { BufferJSON } = baileysApi
    const key = makeEncryptionKey(encryptionKey)
    const sid = String(sessionId)
    // Phase 4: explicit schema (defaults to the same schema as bera_state).
    const dbSchema = schema || resolveDbSchema()
    const authTable = qualified(dbSchema, 'bera_whatsapp_auth')

    await pool.query(tableSql(dbSchema))

    const context = (authType, authKey) => contextFor(sid, authType, authKey)
    const readRecord = async (authType, authKey) => {
        const result = await pool.query(
            `SELECT payload FROM ${authTable} WHERE session_id = $1 AND auth_type = $2 AND auth_key = $3`,
            [sid, authType, authKey]
        )
        return result.rows[0] ? decryptValue(result.rows[0].payload, key, context(authType, authKey), BufferJSON) : null
    }
    const writeRecord = async (authType, authKey, value) => {
        const payload = encryptValue(value, key, context(authType, authKey), BufferJSON)
        await pool.query(
            `INSERT INTO ${authTable} (session_id, auth_type, auth_key, payload, updated_at)
             VALUES ($1, $2, $3, $4::jsonb, NOW())
             ON CONFLICT (session_id, auth_type, auth_key)
             DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
            [sid, authType, authKey, JSON.stringify(payload)]
        )
    }

    // Prefer the database, but use the existing file-backed credentials on the
    // first migration. This lets deployments keep their linked device session.
    const creds = (await readRecord('creds', '')) || legacyState.creds
    const mirrorCreds = async () => {
        for (const name of Object.keys(legacyState.creds)) {
            if (!Object.prototype.hasOwnProperty.call(creds, name)) delete legacyState.creds[name]
        }
        Object.assign(legacyState.creds, creds)
        await legacyState.saveCreds()
    }
    await writeRecord('creds', '', creds)
    await mirrorCreds()

    const keys = {
        get: async (type, ids) => {
            const wanted = [...new Set((ids || []).map(String))]
            if (!wanted.length) return {}
            const result = await pool.query(
                `SELECT auth_key, payload FROM ${authTable}
                 WHERE session_id = $1 AND auth_type = $2 AND auth_key = ANY($3::text[])`,
                [sid, String(type), wanted]
            )
            const values = new Map(result.rows.map(row => [row.auth_key, decryptValue(row.payload, key, context(String(type), row.auth_key), BufferJSON)]))
            const missing = wanted.filter(id => !values.has(id))
            if (missing.length) {
                const legacyValues = await legacyState.keys.get(type, missing)
                for (const id of missing) {
                    const value = legacyValues?.[id]
                    if (value !== undefined && value !== null) {
                        values.set(id, value)
                        await writeRecord(String(type), id, value)
                    }
                }
            }
            const out = {}
            for (const id of wanted) {
                let value = values.has(id) ? values.get(id) : null
                if (String(type) === 'app-state-sync-key' && value && baileysApi.proto?.Message?.AppStateSyncKeyData) {
                    value = baileysApi.proto.Message.AppStateSyncKeyData.fromObject(value)
                }
                out[id] = value
            }
            return out
        },
        set: async data => {
            const client = typeof pool.connect === 'function' ? await pool.connect() : null
            const query = client ? client.query.bind(client) : pool.query.bind(pool)
            try {
                if (client) await query('BEGIN')
                for (const [type, entries] of Object.entries(data || {})) {
                    for (const [id, value] of Object.entries(entries || {})) {
                        if (value === null || value === undefined) {
                            await query(
                                `DELETE FROM ${authTable} WHERE session_id = $1 AND auth_type = $2 AND auth_key = $3`,
                                [sid, type, id]
                            )
                        } else {
                            const payload = encryptValue(value, key, context(type, id), BufferJSON)
                            await query(
                                `INSERT INTO ${authTable} (session_id, auth_type, auth_key, payload, updated_at)
                                 VALUES ($1, $2, $3, $4::jsonb, NOW())
                                 ON CONFLICT (session_id, auth_type, auth_key)
                                 DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
                                [sid, type, id, JSON.stringify(payload)]
                            )
                        }
                    }
                }
                if (client) await query('COMMIT')
            } catch (error) {
                if (client) await query('ROLLBACK').catch(() => {})
                throw error
            } finally {
                client?.release()
            }
            // Keep the old private-volume store current for recovery if the DB
            // is temporarily unavailable and the application falls back to JSON.
            await legacyState.keys.set(data)
        },
        clear: async () => {
            await pool.query(`DELETE FROM ${authTable} WHERE session_id = $1 AND auth_type <> $2`, [sid, 'creds'])
        }
    }

    const saveCreds = async () => {
        await writeRecord('creds', '', creds)
        await mirrorCreds()
    }
    const clear = async () => {
        await pool.query(`DELETE FROM ${authTable} WHERE session_id = $1`, [sid])
    }

    return { state: { creds, keys }, saveCreds, clear, sessionId: sid }
}

module.exports = { createPostgresAuthState, encryptValue, decryptValue, makeEncryptionKey }
