const axios = require('axios')

const BASE = 'https://sky-hosting.replit.app/api'
const DEFAULT_KEY = 'sk_master_skyhosting'

const getKey = () => process.env.SKY_HOSTING_API_KEY || DEFAULT_KEY

const headers = () => ({
    Authorization: 'Bearer ' + getKey(),
    'Content-Type': 'application/json'
})

const createProject = async (name, repoUrl, description = '') => {
    try {
        const r = await axios.post(BASE + '/v1/projects', {
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
        const r = await axios.post(BASE + '/v1/deploy', body, { headers: headers(), timeout: 25000 })
        return { success: true, deployment: r.data }
    } catch (e) {
        const msg = e.response?.data?.error || e.message
        return { success: false, error: msg }
    }
}

const getDeployment = async (deploymentId) => {
    try {
        const r = await axios.get(BASE + '/v1/deployments/' + deploymentId, {
            headers: headers(), timeout: 20000
        })
        return { success: true, deployment: r.data }
    } catch (e) {
        return { success: false, error: e.response?.data?.error || e.message }
    }
}

const getLogs = async (deploymentId) => {
    try {
        const r = await axios.get(BASE + '/v1/logs/' + deploymentId, {
            headers: headers(), timeout: 20000
        })
        return { success: true, logs: r.data?.logs || [] }
    } catch (e) {
        return { success: false, error: e.response?.data?.error || e.message }
    }
}

// Wait for deployment to reach live or failed (max ~3 min)
const waitForLive = async (deploymentId, { maxMs = 180000, intervalMs = 5000, onTick } = {}) => {
    const start = Date.now()
    while (Date.now() - start < maxMs) {
        const r = await getDeployment(deploymentId)
        if (r.success) {
            const status = r.deployment.status
            if (typeof onTick === 'function') { try { onTick(status, r.deployment) } catch {} }
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
const deployRepo = async ({ name, repoUrl, branch = 'main', envVars = {}, onTick } = {}) => {
    if (!repoUrl) return { success: false, error: 'repoUrl is required' }
    const projName = name || ('bera-' + Date.now())
    const cp = await createProject(projName, repoUrl, 'Auto-deployed via Bera AI')
    if (!cp.success) return { success: false, error: 'Project create failed: ' + cp.error }
    const projectId = cp.project.id
    const td = await triggerDeploy(projectId, repoUrl, branch, envVars)
    if (!td.success) return { success: false, error: 'Deploy trigger failed: ' + td.error, projectId }
    const depId = td.deployment.id
    const wait = await waitForLive(depId, { onTick })
    if (!wait.success) {
        return {
            success: false,
            error: wait.error,
            logs: wait.logs,
            projectId,
            deploymentId: depId
        }
    }
    return {
        success: true,
        liveUrl: wait.deployment.liveUrl,
        projectId,
        deploymentId: depId,
        runtime: wait.deployment.runtime,
        commitHash: wait.deployment.commitHash
    }
}

module.exports = {
    createProject,
    triggerDeploy,
    getDeployment,
    getLogs,
    waitForLive,
    deployRepo
}
