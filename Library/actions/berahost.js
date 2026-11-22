/**
 * BeraHost Native API client
 * Auth: x-api-key header
 * Scopes: read | write | payments
 */
const axios = require('axios')

// Current customer API base from the BeraHost developer documentation.
const BH_DEFAULT_URL = 'https://berahost-cywge4uc.manus.space'
const BH_FALLBACK_URLS = [BH_DEFAULT_URL]
const getBhBaseUrl = () => {
    const fromDb  = global.db?.data?.settings?.bhApiUrl
    const fromEnv = process.env.BERAHOST_API_URL
    const valid = value => value && !/\.replit\.app\/?$/i.test(String(value))
    return String((valid(fromDb) && fromDb) || (valid(fromEnv) && fromEnv) || BH_DEFAULT_URL)
        .replace(/\/api\/?$/, '').replace(/\/$/, '')
}
const BH_API  = () => getBhBaseUrl() + '/api'
const getKey  = () => global.db?.data?.settings?.bhApiKey || process.env.BH_API_KEY || process.env.BERAHOST_API_KEY || null

const bh = (options = {}) => {
    const k = getKey()
    if (!k && !options.public) throw new Error('NO_BH_KEY — set BERAHOST_API_KEY or save a scoped key with .setbhkey in a private chat')
    return axios.create({
        baseURL: BH_API(),
        headers: { ...(k && !options.public ? { 'x-api-key': k } : {}), 'Content-Type': 'application/json' },
        timeout: 30000
    })
}

// Auto-discover the working BeraHost URL by probing known candidates
const discoverBhUrl = async () => {
    const key = getKey()
    if (!key) return null
    for (const base of BH_FALLBACK_URLS) {
        try {
            const r = await axios.get(base + '/api/deployments', {
                headers: { 'x-api-key': key },
                timeout: 8000
            })
            if (r.status < 400) {
                if (global.db?.data?.settings) global.db.data.settings.bhApiUrl = base
                await global.db?.write?.()
                return base
            }
        } catch {}
    }
    return null
}

const bhErr = (e) => {
    const status = e.response?.status
    const detail = e.response?.data?.error || e.response?.data?.message || e.message || 'Unknown error'
    if (status === 401) return `BeraHost rejected the API key (401): ${detail}`
    if (status === 403) return `BeraHost denied this request (403). The key may lack the required read, write, or payments scope, or the plan may not include this feature: ${detail}`
    return status ? `BeraHost API HTTP ${status}: ${detail}` : detail
}

// Route allowlist mirrors the documented customer API. No arbitrary URL/path
// is accepted, and all IDs are encoded before interpolation.
const CUSTOMER_ROUTES = {
    deployments: ['GET', '/deployments', 'private'],
    'deployment.create': ['POST', '/deployments', 'private'],
    'deployment.get': ['GET', '/deployments/:id', 'private'],
    'deployment.delete': ['DELETE', '/deployments/:id', 'private'],
    'deployment.start': ['POST', '/deployments/:id/start', 'private'],
    'deployment.stop': ['POST', '/deployments/:id/stop', 'private'],
    'deployment.env': ['PUT', '/deployments/:id/env', 'private'],
    'deployment.clone': ['POST', '/deployments/:id/clone', 'private'],
    'deployment.phone': ['POST', '/deployments/:id/phone', 'private'],
    'deployment.webhook': ['PUT', '/deployments/:id/webhook', 'private'],
    'deployment.webhookTest': ['POST', '/deployments/:id/webhook/test', 'private'],
    'deployment.logs': ['GET', '/deployments/:id/logs', 'private'],
    'deployment.logsSearch': ['GET', '/deployments/:id/logs/search', 'private'],
    'deployment.logsExport': ['GET', '/deployments/:id/logs/export', 'private'],
    'deployment.logsStream': ['GET', '/deployments/:id/logs/stream', 'private'],
    'deployment.metrics': ['GET', '/deployments/:id/metrics', 'private'],
    'deployment.schedule': ['GET', '/deployments/:id/schedule', 'private'],
    'deployment.scheduleUpdate': ['PUT', '/deployments/:id/schedule', 'private'],
    'deployment.scheduleDelete': ['DELETE', '/deployments/:id/schedule', 'private'],
    'webDeployments': ['GET', '/web-deployments', 'private'],
    'webDeployment.get': ['GET', '/web-deployments/:id', 'private'],
    'webDeployment.scan': ['POST', '/web-deployments/scan', 'private'],
    'webDeployment.create': ['POST', '/web-deployments', 'private'],
    'webDeployment.update': ['PATCH', '/web-deployments/:id', 'private'],
    'webDeployment.start': ['POST', '/web-deployments/:id/start', 'private'],
    'webDeployment.stop': ['POST', '/web-deployments/:id/stop', 'private'],
    'webDeployment.delete': ['DELETE', '/web-deployments/:id', 'private'],
    'webDeployment.addDomain': ['POST', '/web-deployments/:id/domains', 'private'],
    'webDeployment.verifyDomain': ['POST', '/web-deployments/domains/:domainId/verify', 'private'],
    'subscriptions.plans': ['GET', '/subscriptions/plans', 'public'],
    'payments.plans': ['GET', '/payments/plans', 'public'],
    'subscriptions.status': ['GET', '/subscriptions/status', 'private'],
    'payments.subscribe': ['POST', '/payments/subscribe', 'private'],
    'payments.domain': ['POST', '/payments/domain', 'private'],
    'payments.status': ['GET', '/payments/status/:id', 'private'],
    'payments.history': ['GET', '/payments/history', 'private'],
    'marketplace.submissions': ['GET', '/marketplace/submissions', 'private'],
    'marketplace.submit': ['POST', '/marketplace/submit', 'private'],
    'support.tickets': ['GET', '/support/tickets', 'private'],
    'support.ticketCreate': ['POST', '/support/tickets', 'private'],
    'support.messages': ['GET', '/support/tickets/:id/messages', 'private'],
    'support.messageCreate': ['POST', '/support/tickets/:id/messages', 'private'],
    notifications: ['GET', '/notifications', 'private'],
    'notifications.read': ['POST', '/notifications/:id/read', 'private'],
    teams: ['GET', '/teams', 'private'],
    'teams.create': ['POST', '/teams', 'private'],
    'teams.join': ['POST', '/teams/join', 'private'],
    'teams.removeMember': ['DELETE', '/teams/:id/members/:memberId', 'private'],
    'teams.regenerateInvite': ['POST', '/teams/:id/regenerate-invite', 'private'],
    'referrals.my': ['GET', '/referrals/my', 'private'],
    'referrals.apply': ['POST', '/referrals/apply', 'private'],
    'github.status': ['GET', '/github/status', 'private'],
    'github.repos': ['GET', '/github/repos', 'private'],
    'github.branches': ['GET', '/github/repos/branches', 'private'],
    'apiKeys': ['GET', '/api-keys', 'private'],
    'apiKeys.create': ['POST', '/api-keys', 'private'],
    'apiKeys.delete': ['DELETE', '/api-keys/:id', 'private'],
}

const requestCustomerApi = async (action, args = {}) => {
    const route = CUSTOMER_ROUTES[action]
    if (!route) return { success: false, error: `Unsupported BeraHost customer API action: ${action}` }
    const [method, template, access] = route
    try {
        const path = template.replace(/:([A-Za-z]+)/g, (_, key) => {
            if (args[key] === undefined || args[key] === null || args[key] === '') throw new Error(`Missing required BeraHost parameter: ${key}`)
            return encodeURIComponent(String(args[key]))
        })
        const client = bh({ public: access === 'public' })
        const response = await client.request({ method, url: path, params: args.params, data: args.body })
        return { success: true, action, data: response.data }
    } catch (e) { return { success: false, error: bhErr(e) } }
}

// ── DEPLOYMENTS ───────────────────────────────────────────────────────────────

const listDeployments = async () => {
    try {
        const r = await bh().get('/deployments')
        const deploys = r.data?.deployments || r.data || []
        return { success: true, deployments: deploys }
    } catch (e) { return { success: false, error: bhErr(e) } }
}

const deployBot = async (botId, sessionId, extraEnv = {}) => {
    try {
        const r = await bh().post('/deployments', {
            botId: Number(botId),
            envVars: { ...(sessionId != null ? { SESSION_ID: sessionId } : {}), ...extraEnv }
        })
        const d = r.data
        return { success: true, id: d.id, status: d.status, botId: d.botId, data: d }
    } catch (e) { return { success: false, error: bhErr(e) } }
}

const getDeployment = async (id) => {
    try {
        const r = await bh().get(`/deployments/${id}`)
        return { success: true, deployment: r.data }
    } catch (e) { return { success: false, error: bhErr(e) } }
}

const deleteDeployment = async (id) => {
    try {
        await bh().delete(`/deployments/${id}`)
        return { success: true, output: `Deployment ${id} deleted` }
    } catch (e) { return { success: false, error: bhErr(e) } }
}

const startDeployment = async (id) => {
    try {
        const r = await bh().post(`/deployments/${id}/start`)
        return { success: true, output: `Deployment ${id} started`, data: r.data }
    } catch (e) { return { success: false, error: bhErr(e) } }
}

const stopDeployment = async (id) => {
    try {
        const r = await bh().post(`/deployments/${id}/stop`)
        return { success: true, output: `Deployment ${id} stopped`, data: r.data }
    } catch (e) { return { success: false, error: bhErr(e) } }
}

const updateEnv = async (id, envVars) => {
    try {
        const r = await bh().put(`/deployments/${id}/env`, { envVars })
        return { success: true, output: `Env vars updated for deployment ${id}`, data: r.data }
    } catch (e) { return { success: false, error: bhErr(e) } }
}

const getDeploymentLogs = async (id) => {
    try {
        const r = await bh().get(`/deployments/${id}/logs`)
        const raw = r.data?.logs || r.data || []
        let logs = ''
        if (Array.isArray(raw)) {
            logs = raw.map(l => `[${l.logType||'out'}] ${l.logLine||''}`).join('\n')
        } else {
            logs = typeof raw === 'string' ? raw : JSON.stringify(raw)
        }
        return { success: true, logs }
    } catch (e) { return { success: false, error: bhErr(e) } }
}

const exportLogs = async (id) => {
    try {
        const r = await bh().get('/deployments/' + id + '/logs/export')
        const raw = r.data?.logs || r.data || []
        let logs = ''
        if (Array.isArray(raw)) {
            logs = raw.map(l => `[${l.logType||'out'}] ${l.logLine||''}`).join('\n')
        } else {
            logs = typeof raw === 'string' ? raw : JSON.stringify(raw)
        }
        return { success: true, logs }
    } catch (e) { return { success: false, error: bhErr(e) } }
}

const getDeploymentMetrics = async (id) => {
    try {
        const r = await bh().get(`/deployments/${id}/metrics`)
        const m = r.data?.metrics || r.data || {}
        return {
            success: true,
            cpu:    m.cpu    != null ? m.cpu + '%' : 'N/A',
            ram:    m.memMb  != null ? m.memMb + ' MB' : (m.memory ? ((m.memory/1024/1024).toFixed(0)+' MB') : 'N/A'),
            uptime: m.uptime != null ? (m.uptime >= 3600 ? (m.uptime/3600).toFixed(1)+'h' : Math.floor(m.uptime/60)+' min') : 'N/A',
            status: m.status || 'unknown',
            pid:    m.pid || null,
            threads: m.threads || null,
            logsLastHour: m.logsLastHour || 0,
            data:   m
        }
    } catch (e) { return { success: false, error: bhErr(e) } }
}

// ── POLL until running or failed ──────────────────────────────────────────────
const pollDeployment = async (id, maxWait = 120000, interval = 5000) => {
    const deadline = Date.now() + maxWait
    const pending = new Set(['queued', 'building', 'deploying', 'starting', 'installing'])
    let current = await getDeployment(id)
    while (current.success && pending.has(current.deployment?.status) && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, interval))
        current = await getDeployment(id)
    }
    return current
}

// ── WEB DEPLOYMENTS ──────────────────────────────────────────────────────────
// These endpoints deploy a GitHub website/app rather than a native WhatsApp bot.
const createWebDeployment = async (payload) => {
    try {
        const r = await bh().post('/web-deployments', payload)
        const d = r.data || {}
        return { success: true, id: d.id, status: d.status, url: d.url || d.liveUrl, data: d }
    } catch (e) { return { success: false, error: bhErr(e) } }
}

const listWebDeployments = async () => {
    try {
        const r = await bh().get('/web-deployments')
        return { success: true, deployments: r.data?.deployments || r.data || [] }
    } catch (e) { return { success: false, error: bhErr(e) } }
}

const getWebDeployment = async (id) => {
    try {
        const r = await bh().get(`/web-deployments/${encodeURIComponent(id)}`)
        return { success: true, deployment: r.data }
    } catch (e) { return { success: false, error: bhErr(e) } }
}

const deleteWebDeployment = async (id) => {
    try {
        await bh().delete(`/web-deployments/${encodeURIComponent(id)}`)
        return { success: true, output: `Web deployment ${id} deleted` }
    } catch (e) { return { success: false, error: bhErr(e) } }
}

const pollWebDeployment = async (id, maxWait = 120000, interval = 5000) => {
    const deadline = Date.now() + maxWait
    let current = await getWebDeployment(id)
    while (current.success && Date.now() < deadline) {
        const status = current.deployment?.status
        if (!['queued', 'building', 'deploying', 'starting', 'installing'].includes(status)) break
        await new Promise(resolve => setTimeout(resolve, interval))
        current = await getWebDeployment(id)
    }
    return current
}

// ── COINS ─────────────────────────────────────────────────────────────────────

const getCoins = async () => {
    return { success: false, error: 'Coin balance is not available in the current documented BeraHost API.' }
}

const getTransactions = async () => {
    return { success: false, error: 'Coin transactions are not available in the current documented BeraHost API.' }
}

const claimDailyCoins = async () => {
    return { success: false, error: 'Daily coin claims are not available in the current documented BeraHost API.' }
}

const redeemVoucher = async (code) => {
    return { success: false, error: 'Coin vouchers are not available in the current documented BeraHost API.' }
}

// ── PAYMENTS (M-Pesa) ─────────────────────────────────────────────────────────

const getPlans = async () => {
    try {
        const [paymentRes, subscriptionRes] = await Promise.all([
            bh({ public: true }).get('/payments/plans'),
            bh({ public: true }).get('/subscriptions/plans')
        ])
        const coinPackages = paymentRes.data?.coinPackages || paymentRes.data?.packages || []
        const subscriptionPlans = Array.isArray(subscriptionRes.data)
            ? subscriptionRes.data
            : (subscriptionRes.data?.subscriptionPlans || subscriptionRes.data?.plans || [])
        return { success: true, coinPackages, subscriptionPlans }
    } catch (e) { return { success: false, error: bhErr(e) } }
}

const initiateMpesa = async (phone, planId, amount) => {
    return { success: false, error: 'The legacy M-Pesa initiation endpoint is not part of the current documented BeraHost API. Use the PayHero subscription or domain checkout route.' }
}

const getPaymentStatus = async (id) => {
    try {
        const r = await bh().get(`/payments/status/${id}`)
        return { success: true, status: r.data?.status, data: r.data }
    } catch (e) { return { success: false, error: bhErr(e) } }
}

const getPaymentHistory = async () => {
    try {
        const r = await bh().get('/payments/history')
        return { success: true, history: r.data?.history || r.data || [] }
    } catch (e) { return { success: false, error: bhErr(e) } }
}

// ── BOTS (public list) ────────────────────────────────────────────────────────

const listBots = async () => {
    try {
        const r = await bh({ public: true }).get('/bots')
        return { success: true, bots: r.data?.bots || r.data || [] }
    } catch (e) { return { success: false, error: bhErr(e) } }
}

const getBot = async (id) => {
    try {
        const r = await bh({ public: true }).get(`/bots/${encodeURIComponent(id)}`)
        return { success: true, bot: r.data?.bot || r.data }
    } catch (e) { return { success: false, error: bhErr(e) } }
}

// ── FORMAT HELPERS ────────────────────────────────────────────────────────────

const statusEmoji = (s) => {
    const m = { running: '🟢', starting: '🟡', installing: '🔵', stopped: '🔴', failed: '❌', unknown: '⚪' }
    return (m[s] || '⚪') + ' ' + (s || 'unknown')
}

const fmtDeploy = (d) => {
    if (!d) return 'No data'
    return [
        '🆔 ID: ' + d.id,
        '🤖 Bot: ' + (d.botId || d.bot_id || 'N/A'),
        '📊 Status: ' + statusEmoji(d.status),
        d.url  ? '🌐 URL: '  + d.url  : null,
        d.port ? '🔌 Port: ' + d.port : null
    ].filter(Boolean).join('\n')
}

// ── Poll deployment logs for WhatsApp pair code ───────────────────────────────
const pollForPairCode = async (id, maxWait = 180000, interval = 6000) => {
    // Require hyphen so "BERAHOST", "BERATECH" etc won't match
    const pairRegex  = /\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/
    // Look for the box-bordered label that BeraAI prints
    const labelRegex = /PAIRING\s*CODE[:\s]+([A-Z0-9]{4}-[A-Z0-9]{4})/i
    const deadline = Date.now() + maxWait
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, interval))
        const logsRes = await getDeploymentLogs(id)
        if (logsRes.success && logsRes.logs) {
            // Try labelled match first ("pairing code: XXXX-XXXX")
            const labelled = logsRes.logs.match(labelRegex)
            if (labelled) return { success: true, code: labelled[1].trim() }
            // Fallback: any standalone 8-char code on its own line
            const lines = logsRes.logs.split('\n')
            for (const line of lines.reverse()) {
                const m = line.match(pairRegex)
                if (m) return { success: true, code: m[1] }
            }
        }
    }
    return { success: false, error: 'Pair code not found in logs within timeout. Check .botlogs ' + id }
}

module.exports = {
    BH_API,
    requestCustomerApi,
    listDeployments, deployBot, getDeployment, deleteDeployment,
    startDeployment, stopDeployment, updateEnv,
    getDeploymentLogs, exportLogs, getDeploymentMetrics, pollDeployment,
    getCoins, getTransactions, claimDailyCoins, redeemVoucher,
    getPlans, initiateMpesa, getPaymentStatus, getPaymentHistory,
    listBots, getBot,
    createWebDeployment, listWebDeployments, getWebDeployment,
    deleteWebDeployment, pollWebDeployment,
    statusEmoji, fmtDeploy, pollForPairCode
}
