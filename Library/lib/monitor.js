'use strict'
const https = require('https')
const http  = require('http')

const DEFAULT_INTERVAL = 5 * 60 * 1000

const _intervals = {}
const _statusMap  = {}

const getMonitors = () => {
    const db = global.db?.data
    if (!db) return []
    if (!db.monitors) db.monitors = []
    return db.monitors
}

const saveDB = async () => {
    try { await global.db.write() } catch {}
}

const pingURL = (url, timeoutMs = 8000) => new Promise(resolve => {
    try {
        const mod = url.startsWith('https') ? https : http
        const u = new URL(url)
        const req = mod.request(
            { hostname: u.hostname, port: u.port || undefined, path: (u.pathname || '/') + u.search, method: 'HEAD', timeout: timeoutMs },
            res => resolve(res.statusCode < 500)
        )
        req.on('error', () => resolve(false))
        req.on('timeout', () => { req.destroy(); resolve(false) })
        req.end()
    } catch { resolve(false) }
})

const sendAlert = async (msg) => {
    try {
        const conn = global._conn
        if (!conn) return
        const ownerNum = (
            global.db?.data?.settings?.owner ||
            process.env.OWNER_NUMBER ||
            '254787527753'
        ).replace(/[^0-9]/g, '')
        const jid = ownerNum + '@s.whatsapp.net'
        await conn.sendMessage(jid, { text: msg })
    } catch {}
}

const stopMonitor = (id) => {
    if (_intervals[id]) { clearInterval(_intervals[id]); delete _intervals[id] }
    if (global._monitors) delete global._monitors[id]
    delete _statusMap[id]
}

const startMonitor = (id, url, notifyJid, intervalMs = DEFAULT_INTERVAL) => {
    stopMonitor(id)
    _statusMap[id] = null

    if (!global._monitors) global._monitors = {}
    global._monitors[id] = { url, notifyJid, getStatus: () => _statusMap[id] }

    const check = async () => {
        const up = await pingURL(url)
        const prev = _statusMap[id]
        _statusMap[id] = up
        if (prev !== null && prev !== up) {
            const msg = up
                ? `✅ *Monitor Alert*\n🟢 *${url}* is back *ONLINE*\n⏰ ${new Date().toLocaleString()}`
                : `🔴 *Monitor Alert*\n⚠️ *${url}* is *DOWN*\n⏰ ${new Date().toLocaleString()}`
            if (notifyJid) {
                try {
                    const conn = global._conn
                    if (conn) await conn.sendMessage(notifyJid, { text: msg })
                } catch {}
            }
            await sendAlert(msg)
        }
    }

    check()
    _intervals[id] = setInterval(check, intervalMs)
}

const checkHealth = async () => {
    try {
        const os = require('os')
        const db = global.db?.data
        const alerts = db?.settings?.alerts || {}

        if (alerts.cpu) {
            const loads = os.loadavg()
            const cpuCount = os.cpus().length
            const pct = Math.round((loads[0] / cpuCount) * 100)
            if (pct > alerts.cpu) {
                await sendAlert(`⚠️ *CPU Alert*\n📊 Usage: *${pct}%* (threshold: ${alerts.cpu}%)\n⏰ ${new Date().toLocaleString()}`)
            }
        }

        if (alerts.ram) {
            const total = os.totalmem()
            const free  = os.freemem()
            const pct   = Math.round(((total - free) / total) * 100)
            if (pct > alerts.ram) {
                const used  = Math.round((total - free) / 1024 / 1024)
                const totalM = Math.round(total / 1024 / 1024)
                await sendAlert(`⚠️ *RAM Alert*\n💾 Usage: *${pct}%* (${used}/${totalM} MB) (threshold: ${alerts.ram}%)\n⏰ ${new Date().toLocaleString()}`)
            }
        }

        if (alerts.disk) {
            try {
                const { execSync } = require('child_process')
                const raw = execSync("df / --output=pcent 2>/dev/null | tail -1").toString().trim().replace('%', '')
                const pct = parseInt(raw)
                if (!isNaN(pct) && pct > alerts.disk) {
                    await sendAlert(`⚠️ *Disk Alert*\n💽 Usage: *${pct}%* (threshold: ${alerts.disk}%)\n⏰ ${new Date().toLocaleString()}`)
                }
            } catch {}
        }
    } catch {}
}

const init = (conn) => {
    if (conn) global._conn = conn
    const monitors = getMonitors()
    for (const mon of monitors) {
        if (mon.active !== false) {
            startMonitor(mon.id, mon.url, mon.notifyJid, mon.intervalMs || DEFAULT_INTERVAL)
        }
    }
    setInterval(checkHealth, 10 * 60 * 1000)
}

module.exports = { init, startMonitor, stopMonitor, pingURL, getMonitors, saveDB, sendAlert }
