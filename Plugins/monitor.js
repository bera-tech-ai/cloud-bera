'use strict'
/**
 * Monitor Plugin — persistent server resource monitoring with alerts.
 * Monitors CPU, RAM, disk usage and sends WhatsApp alerts when thresholds are exceeded.
 * Commands: .monitor on|off|status, .monset <thresholds>
 */
const os = require('os')
const { exec } = require('child_process')

// Monitor state
let _monitorInterval = null
let _monitorConn = null
let _monitorChat = null
let _monitorEnabled = false

const DEFAULT_THRESHOLDS = {
    cpu: 85,    // % CPU load
    ram: 85,    // % RAM used
    disk: 90    // % disk used
}
let _thresholds = { ...DEFAULT_THRESHOLDS }

// Track last alert to avoid spam (per metric)
const _lastAlert = {}
const ALERT_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Get current system metrics.
 */
const getMetrics = () => new Promise((resolve) => {
    const totalMem = os.totalmem()
    const freeMem  = os.freemem()
    const usedMem  = totalMem - freeMem
    const ramPct   = Math.round(usedMem * 100 / totalMem)
    const loadAvg  = (os.loadavg ? os.loadavg() : os.loadaverage())[0]
    const cpuCount = os.cpus().length
    const cpuPct   = Math.min(100, Math.round((loadAvg / cpuCount) * 100))

    exec("df / | awk 'NR==2{print $5}' | tr -d '%'", { timeout: 3000 }, (err, stdout) => {
        const diskPct = parseInt((stdout || '0').trim()) || 0
        resolve({ cpuPct, ramPct, diskPct, loadAvg: loadAvg.toFixed(2), cpuCount })
    })
})

/**
 * Check metrics and fire alerts if thresholds exceeded.
 */
const checkAlerts = async () => {
    if (!_monitorConn || !_monitorChat) return

    const metrics = await getMetrics()
    const now = Date.now()
    const alerts = []

    const check = (key, value, threshold, label, unit = '%') => {
        if (value >= threshold) {
            const lastAlertTime = _lastAlert[key] || 0
            if (now - lastAlertTime >= ALERT_COOLDOWN_MS) {
                _lastAlert[key] = now
                alerts.push(`⚠️ *${label}* at *${value}${unit}* (threshold: ${threshold}${unit})`)
            }
        }
    }

    check('cpu', metrics.cpuPct, _thresholds.cpu, 'CPU load', '%')
    check('ram', metrics.ramPct, _thresholds.ram, 'RAM usage', '%')
    check('disk', metrics.diskPct, _thresholds.disk, 'Disk usage', '%')

    if (alerts.length) {
        const msg =
            `🚨 *BERA MONITOR ALERT*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━\n` +
            alerts.join('\n') + '\n' +
            `━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `CPU: ${metrics.cpuPct}% | RAM: ${metrics.ramPct}% | Disk: ${metrics.diskPct}%`

        try {
            await _monitorConn.sendMessage(_monitorChat, { text: msg })
        } catch {}
    }
}

/**
 * Start the background monitor.
 */
const startMonitor = (conn, chatId, intervalSecs = 60) => {
    if (_monitorInterval) clearInterval(_monitorInterval)
    _monitorConn = conn
    _monitorChat = chatId
    _monitorEnabled = true
    _monitorInterval = setInterval(checkAlerts, intervalSecs * 1000)
}

/**
 * Stop the monitor.
 */
const stopMonitor = () => {
    if (_monitorInterval) { clearInterval(_monitorInterval); _monitorInterval = null }
    _monitorEnabled = false
}

/**
 * Get monitor status.
 */
const getMonitorStatus = () => ({
    enabled: _monitorEnabled,
    thresholds: _thresholds,
    chat: _monitorChat
})

const handle = async (m, { conn, text, reply, prefix, command, sender, chat, isOwner }) => {

    if (command === 'monitor') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const arg = (text || '').trim().toLowerCase()

        if (arg === 'on' || arg === 'start') {
            startMonitor(conn, chat)
            return reply(
                `╭══〘 *📊 MONITOR STARTED* 〙═⊷\n` +
                `┃ ✅ Server monitoring is now ACTIVE\n` +
                `┃ 📍 Alerts sent to this chat\n` +
                `┃ ⏱️ Check interval: 60 seconds\n` +
                `┃\n` +
                `┃ 🚨 Alert thresholds:\n` +
                `┃ • CPU: >${_thresholds.cpu}%\n` +
                `┃ • RAM: >${_thresholds.ram}%\n` +
                `┃ • Disk: >${_thresholds.disk}%\n` +
                `┃\n` +
                `┃ Use ${prefix}monitor off to stop\n` +
                `╰══════════════════⊷`
            )
        }

        if (arg === 'off' || arg === 'stop') {
            stopMonitor()
            return reply(`✅ Server monitoring stopped.`)
        }

        if (arg === 'status' || !arg) {
            const metrics = await getMetrics()
            const status = getMonitorStatus()
            return reply(
                `╭══〘 *📊 SERVER MONITOR* 〙═⊷\n` +
                `┃ Status: ${status.enabled ? '🟢 Active' : '🔴 Stopped'}\n` +
                `┃\n` +
                `┃ *Current Metrics:*\n` +
                `┃ 💻 CPU Load: ${metrics.cpuPct}% (${metrics.loadAvg} avg)\n` +
                `┃ 🧠 RAM Used: ${metrics.ramPct}%\n` +
                `┃ 💾 Disk Used: ${metrics.diskPct}%\n` +
                `┃ 🖥️ CPU Cores: ${metrics.cpuCount}\n` +
                `┃\n` +
                `┃ *Alert Thresholds:*\n` +
                `┃ CPU >${status.thresholds.cpu}% | RAM >${status.thresholds.ram}% | Disk >${status.thresholds.disk}%\n` +
                `┃\n` +
                `┃ ${prefix}monitor on/off — toggle monitoring\n` +
                `┃ ${prefix}monset cpu=80 ram=90 disk=85 — adjust thresholds\n` +
                `╰══════════════════⊷`
            )
        }
    }

    // ── .monset cpu=80 ram=85 disk=90 ────────────────────────────────────────
    if (command === 'monset') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (!text) return reply(`❌ Usage: ${prefix}monset cpu=85 ram=85 disk=90`)

        const cpuM = text.match(/cpu\s*=\s*(\d+)/i)
        const ramM = text.match(/ram\s*=\s*(\d+)/i)
        const dskM = text.match(/disk\s*=\s*(\d+)/i)

        if (cpuM) _thresholds.cpu = Math.min(100, parseInt(cpuM[1]))
        if (ramM) _thresholds.ram = Math.min(100, parseInt(ramM[1]))
        if (dskM) _thresholds.disk = Math.min(100, parseInt(dskM[1]))

        return reply(
            `✅ *Monitor thresholds updated:*\n` +
            `• CPU alert: >${_thresholds.cpu}%\n` +
            `• RAM alert: >${_thresholds.ram}%\n` +
            `• Disk alert: >${_thresholds.disk}%`
        )
    }

    // ── .serverlive — real-time single check ──────────────────────────────────
    if (command === 'serverlive') {
        const metrics = await getMetrics()
        const barOf = (pct) => '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10)) + ` ${pct}%`
        return reply(
            `╭══〘 *🖥️ SERVER LIVE STATS* 〙═⊷\n` +
            `┃\n` +
            `┃ 💻 CPU  ${barOf(metrics.cpuPct)}\n` +
            `┃ 🧠 RAM  ${barOf(metrics.ramPct)}\n` +
            `┃ 💾 Disk ${barOf(metrics.diskPct)}\n` +
            `┃\n` +
            `┃ Load avg (1m): ${metrics.loadAvg}\n` +
            `┃ CPU cores: ${metrics.cpuCount}\n` +
            `╰══════════════════⊷`
        )
    }
}

handle.command = ['monitor', 'monset', 'serverlive']
handle.tags = ['admin']
module.exports = handle
module.exports.startMonitor = startMonitor
module.exports.stopMonitor = stopMonitor
module.exports.getMonitorStatus = getMonitorStatus
