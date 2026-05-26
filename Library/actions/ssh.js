'use strict'
/**
 * SSH action library — execute remote shell commands over SSH
 * Uses the ssh2 package.
 */
const { Client } = require('ssh2')

/**
 * Run a single command over SSH.
 * @param {object} cfg  { host, port, username, password?, privateKey? }
 * @param {string} cmd  Shell command to run remotely
 * @param {number} timeoutMs  Max ms to wait (default 15000)
 * @returns {Promise<{ success: boolean, stdout: string, stderr: string, code: number }>}
 */
const sshExec = (cfg, cmd, timeoutMs = 15000) => new Promise((resolve) => {
    const conn = new Client()
    let stdout = ''
    let stderr = ''
    let settled = false

    const done = (success, code = 0) => {
        if (settled) return
        settled = true
        conn.end()
        resolve({ success, stdout: stdout.slice(0, 4000), stderr: stderr.slice(0, 2000), code })
    }

    const timer = setTimeout(() => done(false, -1), timeoutMs)

    conn.on('ready', () => {
        conn.exec(cmd, (err, stream) => {
            if (err) {
                clearTimeout(timer)
                return done(false, -1)
            }
            stream.on('data', d => { stdout += d.toString() })
            stream.stderr.on('data', d => { stderr += d.toString() })
            stream.on('close', (code) => {
                clearTimeout(timer)
                done(code === 0, code)
            })
        })
    })

    conn.on('error', (e) => {
        clearTimeout(timer)
        stderr = e.message
        done(false, -1)
    })

    const connectOpts = {
        host: cfg.host,
        port: cfg.port || 22,
        username: cfg.username || 'root',
        readyTimeout: Math.min(timeoutMs, 10000)
    }
    if (cfg.privateKey) connectOpts.privateKey = cfg.privateKey
    else if (cfg.password) connectOpts.password = cfg.password

    try { conn.connect(connectOpts) } catch (e) {
        clearTimeout(timer)
        stderr = e.message
        done(false, -1)
    }
})

/**
 * Format SSH result for WhatsApp reply.
 */
const formatSshResult = (res) => {
    const lines = []
    if (res.stdout) lines.push(`📤 *Output:*\n\`\`\`\n${res.stdout.trim()}\n\`\`\``)
    if (res.stderr) lines.push(`⚠️ *Stderr:*\n\`\`\`\n${res.stderr.trim()}\n\`\`\``)
    lines.push(res.success ? `✅ *Exit code:* 0` : `❌ *Exit code:* ${res.code}`)
    return lines.join('\n')
}

/**
 * Stored SSH profiles (in-memory, keyed by chat JID).
 * Profile: { host, port, username, password?, privateKey? }
 */
const _profiles = {}

const saveProfile = (chatId, profile) => { _profiles[chatId] = profile }
const getProfile = (chatId) => _profiles[chatId] || null
const deleteProfile = (chatId) => { delete _profiles[chatId] }

module.exports = { sshExec, formatSshResult, saveProfile, getProfile, deleteProfile }
