const axios = require('axios')

const BASE_URLS = [
    'https://sky-host-live--isaacbarasa835.replit.app/api',
    'https://sky-hosting.replit.app/api'
]
const getBase = () => {
    return global.db?.data?.settings?.skyHostUrl || BASE_URLS[0]
}

const getKey = () =>
    process.env.SKY_HOSTING_API_KEY ||
    process.env.SKY_API_KEY ||
    ''

const setKey = async (key) => {
    return Boolean(key && getKey())
}

const headers = () => ({
    Authorization: 'Bearer ' + getKey(),
    'Content-Type': 'application/json'
})

const createProject = async (name, repoUrl, description = '') => {
    try {
        const r = await axios.post(getBase() + '/v1/projects', {
            name, repoUrl, description
        }, { headers: headers(), timeout: 25000 })
        return { success: true, project: r.data }
    } catch (e) {
        const msg = e.response?.data?.error || e.message
        return { success: false, error: msg }
    }
}

const triggerDeploy = async (projectId, repoUrl, branch = 'main', envVars = {}) => {
    try {
        const body = { projectId, branch }
        if (repoUrl) body.repoUrl = repoUrl
        if (envVars && Object.keys(envVars).length) body.envVars = envVars
        const r = await axios.post(getBase() + '/v1/deploy', body, { headers: headers(), timeout: 25000 })
        return { success: true, deployment: r.data }
    } catch (e) {
        const msg = e.response?.data?.error || e.message
        return { success: false, error: msg }
    }
}

const getDeployment = async (deploymentId) => {
    try {
        const r = await axios.get(getBase() + '/v1/deployments/' + deploymentId, {
            headers: headers(), timeout: 20000
        })
        return { success: true, deployment: r.data }
    } catch (e) {
        return { success: false, error: e.response?.data?.error || e.message }
    }
}

const getLogs = async (deploymentId) => {
    try {
        const r = await axios.get(getBase() + '/v1/logs/' + deploymentId, {
            headers: headers(), timeout: 20000
        })
        return { success: true, logs: r.data?.logs || [] }
    } catch (e) {
        return { success: false, error: e.response?.data?.error || e.message }
    }
}

const listProjects = async () => {
    try {
        const r = await axios.get(getBase() + '/v1/projects', { headers: headers(), timeout: 15000 })
        return { success: true, projects: r.data }
    } catch (e) {
        return { success: false, error: e.response?.data?.error || e.message }
    }
}

const deleteDeployment = async (deploymentId) => {
    try {
        await axios.delete(getBase() + '/v1/deployments/' + deploymentId, { headers: headers(), timeout: 15000 })
        return { success: true }
    } catch (e) {
        return { success: false, error: e.response?.data?.error || e.message }
    }
}

const deleteProject = async (projectId) => {
    try {
        await axios.delete(getBase() + '/v1/projects/' + projectId, { headers: headers(), timeout: 15000 })
        return { success: true }
    } catch (e) {
        return { success: false, error: e.response?.data?.error || e.message }
    }
}

const checkHealth = async () => {
    try {
        const r = await axios.get(getBase() + '/healthz', { timeout: 8000 })
        return r.data?.status === 'ok'
    } catch { return false }
}

// Wait for deployment to reach live or failed (max ~3 min)
// conn + chat optional — sends progress messages to WhatsApp while waiting
const waitForLive = async (deploymentId, { maxMs = 180000, intervalMs = 5000, onTick, conn, chat } = {}) => {
    const start = Date.now()
    let lastStatus = ''
    while (Date.now() - start < maxMs) {
        const r = await getDeployment(deploymentId)
        if (r.success) {
            const status = r.deployment.status
            if (typeof onTick === 'function') { try { onTick(status, r.deployment) } catch {} }
            if (status !== lastStatus && conn && chat) {
                const emoji = { queued: '⏳', cloning: '📥', building: '🔨', live: '✅', failed: '❌' }[status] || '🔄'
                conn.sendMessage(chat, { text: `${emoji} *Sky Hosting:* ${status.toUpperCase()}...` }).catch(() => {})
                lastStatus = status
            }
            if (status === 'live') return { success: true, deployment: r.deployment }
            if (status === 'failed' || status === 'error') {
                const logs = await getLogs(deploymentId)
                const tail = (logs.logs || []).slice(-8).map(l => `[${l.level}] ${l.message}`).join('\n')
                return { success: false, error: 'Deployment failed', logs: tail, deployment: r.deployment }
            }
        }
        await new Promise(res => setTimeout(res, intervalMs))
    }
    return { success: false, error: 'Timed out waiting for deployment to go live (3 min).' }
}

// One-shot helper: create project + deploy + wait → liveUrl
const deployRepo = async ({ name, repoUrl, branch = 'main', envVars = {}, onTick, conn, chat } = {}) => {
    if (!repoUrl) return { success: false, error: 'repoUrl is required' }
    const projName = name || ('bera-' + Date.now())

    if (conn && chat) conn.sendMessage(chat, { text: '📦 *Sky Hosting:* Creating project...' }).catch(() => {})

    const cp = await createProject(projName, repoUrl, 'Auto-deployed via Bera AI')
    if (!cp.success) return { success: false, error: 'Project create failed: ' + cp.error }
    const projectId = cp.project.id

    if (conn && chat) conn.sendMessage(chat, { text: '🚀 *Sky Hosting:* Triggering deployment...' }).catch(() => {})

    const td = await triggerDeploy(projectId, repoUrl, branch, envVars)
    if (!td.success) return { success: false, error: 'Deploy trigger failed: ' + td.error, projectId }
    const depId = td.deployment.id

    const wait = await waitForLive(depId, { onTick, conn, chat })
    if (!wait.success) {
        return { success: false, error: wait.error, logs: wait.logs, projectId, deploymentId: depId }
    }
    return {
        success: true,
        liveUrl: wait.deployment.liveUrl,
        projectId,
        deploymentId: depId,
        runtime: wait.deployment.runtime
    }
}

module.exports = {
    setKey,
    createProject,
    triggerDeploy,
    getDeployment,
    getLogs,
    listProjects,
    deleteDeployment,
    deleteProject,
    checkHealth,
    waitForLive,
    deployRepo
}
