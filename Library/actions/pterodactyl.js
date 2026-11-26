const axios = require('axios')
const config = require('../../Config')

const PANEL      = () => (config.pterodactylUrl || process.env.PTERODACTYL_URL || '').replace(/\/$/, '')
const CLIENT_KEY = () => config.pterodactylKey    || process.env.PTERODACTYL_KEY     || ''
const APP_KEY    = () => config.pterodactylAppKey || process.env.PTERODACTYL_APP_KEY || ''

const NODE_ID      = 1
const EGG_ID       = 15
const EMAIL_DOMAIN = 'lordeagle.tech'

const PLANS = {
    '1gb': { memory: 1024,  disk: 10240,  cpu: 100, label: '1 GB RAM' },
    '2gb': { memory: 2048,  disk: 20480,  cpu: 200, label: '2 GB RAM' },
    '4gb': { memory: 4096,  disk: 40960,  cpu: 300, label: '4 GB RAM' },
    '6gb': { memory: 6144,  disk: 61440,  cpu: 400, label: '6 GB RAM' },
    '8gb': { memory: 8192,  disk: 81920,  cpu: 500, label: '8 GB RAM' },
    '10gb':{ memory: 10240, disk: 102400, cpu: 600, label: '10 GB RAM' },
    unli:  { memory: 0,     disk: 0,      cpu: 0,   label: 'Unlimited' },
    admin: { memory: 0,     disk: 0,      cpu: 0,   label: 'Admin (Unlimited + Panel Admin)' },
}

const appHeaders    = () => ({ Authorization: `Bearer ${APP_KEY()}`,    Accept: 'application/json', 'Content-Type': 'application/json' })
const clientHeaders = () => ({ Authorization: `Bearer ${CLIENT_KEY()}`, Accept: 'application/json', 'Content-Type': 'application/json' })

const fmtErr = (err) =>
    err?.response?.data?.errors?.[0]?.detail ||
    err?.response?.data?.error ||
    err?.message ||
    'Unknown error'

const genPassword = (username) => {
    const base   = username.slice(0, 4).replace(/[^a-zA-Z]/g, 'x')
    const capped = base.charAt(0).toUpperCase() + base.slice(1).toLowerCase()
    const digits = String(Math.floor(1000 + Math.random() * 9000))
    const syms   = ['!', '@', '#', '$']
    const sym    = syms[Math.floor(Math.random() * syms.length)]
    return capped + digits + sym
}

const getAllPages = async (url) => {
    let results = [], page = 1
    while (true) {
        const sep = url.includes('?') ? '&' : '?'
        const { data } = await axios.get(`${url}${sep}per_page=100&page=${page}`, { headers: appHeaders() })
        results.push(...data.data)
        if (data.meta.pagination.current_page >= data.meta.pagination.total_pages) break
        page++
    }
    return results
}

const findFreeAllocation = async () => {
    const allocs = await getAllPages(`${PANEL()}/api/application/nodes/${NODE_ID}/allocations`)
    const free   = allocs.find(a => !a.attributes.assigned)
    if (!free) throw new Error('No free allocations on the node. Add more ports in the panel.')
    return free.attributes.id
}

const findServerByName = async (name) => {
    const servers = await getAllPages(`${PANEL()}/api/application/servers`)
    return servers.find(s => s.attributes.name.toLowerCase() === name.toLowerCase()) || null
}

const findUserByUsername = async (username) => {
    const { data } = await axios.get(
        `${PANEL()}/api/application/users?filter[username]=${encodeURIComponent(username)}&per_page=50`,
        { headers: appHeaders() }
    )
    return data.data.find(u => u.attributes.username.toLowerCase() === username.toLowerCase()) || null
}

const createPanelServer = async ({ name, userId, planKey }) => {
    const plan = PLANS[planKey.toLowerCase()]
    if (!plan) throw new Error(`Unknown plan: ${planKey}. Available: ${Object.keys(PLANS).join(', ')}`)
    const allocationId = await findFreeAllocation()
    const res = await axios.post(`${PANEL()}/api/application/servers`, {
        name,
        user:         userId,
        egg:          EGG_ID,
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_23',
        startup:      'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN};',
        environment: { GIT_ADDRESS: '', BRANCH: 'main', USERNAME: '', ACCESS_TOKEN: '', CMD_RUN: 'npm start' },
        limits: { memory: plan.memory, swap: 0, disk: plan.disk, io: 500, cpu: plan.cpu },
        feature_limits: { databases: 5, backups: 3, allocations: 1 },
        allocation: { default: allocationId }
    }, { headers: appHeaders() })
    return res.data?.attributes
}

const getClientByIdentifier = () => axios.create({
    baseURL: `${PANEL()}/api/client`,
    headers: clientHeaders(),
    timeout: 20000
})

const getAppAxios = () => axios.create({
    baseURL: `${PANEL()}/api/application`,
    headers: appHeaders(),
    timeout: 20000
})

const listServers = async () => {
    try {
        const res = await getClientByIdentifier().get('/')
        const servers = res.data?.data || []
        return {
            success: true,
            servers: servers.map(s => ({
                id: s.attributes.identifier,
                name: s.attributes.name,
                status: s.attributes.status,
                node: s.attributes.node,
                description: s.attributes.description || '',
                limits: s.attributes.limits
            }))
        }
    } catch (e) { return { success: false, error: fmtErr(e) } }
}

const getServerStatus = async (serverId) => {
    try {
        const res = await getClientByIdentifier().get(`/servers/${serverId}/resources`)
        const attr = res.data?.attributes || {}
        return {
            success: true,
            status: attr.current_state,
            cpu: attr.resources?.cpu_absolute?.toFixed(1) || '0',
            ram: Math.round((attr.resources?.memory_bytes || 0) / 1024 / 1024),
            ramLimit: Math.round((attr.resources?.memory_limit_bytes || 0) / 1024 / 1024),
            disk: Math.round((attr.resources?.disk_bytes || 0) / 1024 / 1024),
            network_rx: Math.round((attr.resources?.network_rx_bytes || 0) / 1024),
            network_tx: Math.round((attr.resources?.network_tx_bytes || 0) / 1024),
            uptime: attr.resources?.uptime || 0
        }
    } catch (e) { return { success: false, error: fmtErr(e) } }
}

const powerAction = async (serverId, action) => {
    try {
        await getClientByIdentifier().post(`/servers/${serverId}/power`, { signal: action })
        return { success: true, action }
    } catch (e) { return { success: false, error: fmtErr(e) } }
}

const sendCommand = async (serverId, command) => {
    try {
        await getClientByIdentifier().post(`/servers/${serverId}/command`, { command })
        return { success: true }
    } catch (e) { return { success: false, error: fmtErr(e) } }
}

const getServerLogs = async (serverId) => {
    try {
        const res = await getClientByIdentifier().get(`/servers/${serverId}/logs`)
        const output = res.data?.data?.attributes?.output || []
        return { success: true, logs: output.slice(-20) }
    } catch (e) { return { success: false, error: fmtErr(e) } }
}

const listFiles = async (serverId, dir = '/') => {
    try {
        const res = await getClientByIdentifier().get(`/servers/${serverId}/files/list`, { params: { directory: dir } })
        const files = res.data?.data || []
        return {
            success: true,
            files: files.map(f => ({
                name: f.attributes.name,
                size: f.attributes.size,
                is_file: f.attributes.is_file,
                modified: f.attributes.modified_at
            }))
        }
    } catch (e) { return { success: false, error: fmtErr(e) } }
}

const readFile = async (serverId, filePath) => {
    try {
        const res = await getClientByIdentifier().get(`/servers/${serverId}/files/contents`, { params: { file: filePath } })
        return { success: true, content: typeof res.data === 'string' ? res.data : JSON.stringify(res.data) }
    } catch (e) { return { success: false, error: fmtErr(e) } }
}

const writeFile = async (serverId, filePath, content) => {
    try {
        await axios.post(`${PANEL()}/api/client/servers/${serverId}/files/write`, content, {
            params: { file: filePath },
            headers: { ...clientHeaders(), 'Content-Type': 'text/plain' },
            timeout: 20000
        })
        return { success: true }
    } catch (e) { return { success: false, error: fmtErr(e) } }
}

const listUsers = async () => {
    try {
        const users = await getAllPages(`${PANEL()}/api/application/users`)
        return {
            success: true,
            users: users.map(u => ({
                id: u.attributes.id,
                username: u.attributes.username,
                email: u.attributes.email,
                firstName: u.attributes.first_name,
                lastName: u.attributes.last_name,
                isAdmin: u.attributes.root_admin,
                createdAt: u.attributes.created_at
            }))
        }
    } catch (e) { return { success: false, error: fmtErr(e) } }
}

const getUser = async (userId) => {
    try {
        const res = await getAppAxios().get(`/users/${userId}`)
        const u = res.data?.attributes
        return { success: true, user: { id: u.id, username: u.username, email: u.email, firstName: u.first_name, lastName: u.last_name, isAdmin: u.root_admin, language: u.language } }
    } catch (e) { return { success: false, error: fmtErr(e) } }
}

const createUser = async ({ username, email, firstName, lastName, password, isAdmin = false }) => {
    try {
        const res = await getAppAxios().post('/users', { username, email, first_name: firstName || username, last_name: lastName || 'User', password, root_admin: isAdmin, language: 'en' })
        const u = res.data?.attributes
        return { success: true, user: { id: u.id, username: u.username, email: u.email, isAdmin: u.root_admin } }
    } catch (e) {
        const errs = e.response?.data?.errors
        return { success: false, error: errs ? errs.map(er => er.detail || er.code).join(', ') : fmtErr(e) }
    }
}

const updateUser = async (userId, data) => {
    try {
        const curr = await getUser(userId)
        if (!curr.success) return { success: false, error: curr.error }
        const u = curr.user
        const res = await getAppAxios().patch(`/users/${userId}`, {
            username:   data.username   || u.username,
            email:      data.email      || u.email,
            first_name: data.firstName  || u.firstName,
            last_name:  data.lastName   || u.lastName,
            root_admin: data.isAdmin    !== undefined ? data.isAdmin : u.isAdmin,
            language:   data.language   || u.language || 'en',
            password:   data.password   || undefined
        })
        return { success: true, user: res.data?.attributes }
    } catch (e) { return { success: false, error: fmtErr(e) } }
}

const deleteUser = async (userId) => {
    try {
        await getAppAxios().delete(`/users/${userId}`)
        return { success: true }
    } catch (e) { return { success: false, error: fmtErr(e) } }
}

const deleteUserWithServers = async (username) => {
    try {
        const userRaw = await findUserByUsername(username)
        if (!userRaw) return { success: false, error: `User "${username}" not found.` }
        const userId = userRaw.attributes.id
        if (userId === 1) return { success: false, error: 'Cannot delete user ID 1 (owner account).' }
        const allServers = await getAllPages(`${PANEL()}/api/application/servers`)
        const userServers = allServers.filter(s => s.attributes.user === userId)
        const failed = []
        for (const s of userServers) {
            try { await getAppAxios().delete(`/servers/${s.attributes.id}`) }
            catch { failed.push(s.attributes.name) }
            await new Promise(r => setTimeout(r, 200))
        }
        await getAppAxios().delete(`/users/${userId}`)
        return { success: true, username, serversDeleted: userServers.length, failed }
    } catch (e) { return { success: false, error: fmtErr(e) } }
}

const deleteAllUsersExceptOwner = async (ownerId = 1) => {
    try {
        const res = await listUsers()
        if (!res.success) return res
        const toDelete = res.users.filter(u => u.id !== ownerId)
        let deleted = 0, failed = 0, failedList = []
        for (const u of toDelete) {
            const r = await deleteUser(u.id)
            if (r.success) deleted++
            else { failed++; failedList.push(u.username) }
            await new Promise(r => setTimeout(r, 300))
        }
        return { success: true, deleted, failed, failedList, total: toDelete.length }
    } catch (e) { return { success: false, error: fmtErr(e) } }
}

const listAllServers = async () => {
    try {
        const servers = await getAllPages(`${PANEL()}/api/application/servers`)
        return {
            success: true,
            servers: servers.map(s => ({
                id: s.attributes.id,
                identifier: s.attributes.identifier,
                name: s.attributes.name,
                suspended: s.attributes.suspended,
                node: s.attributes.node,
                user: s.attributes.user,
                limits: s.attributes.limits,
                status: s.attributes.status
            }))
        }
    } catch (e) { return { success: false, error: fmtErr(e) } }
}

const deleteServer = async (serverId, force = false) => {
    try {
        await getAppAxios().delete(`/servers/${serverId}${force ? '/force' : ''}`)
        return { success: true }
    } catch (e) { return { success: false, error: fmtErr(e) } }
}

const suspendServer = async (serverId) => {
    try { await getAppAxios().post(`/servers/${serverId}/suspend`); return { success: true } }
    catch (e) { return { success: false, error: fmtErr(e) } }
}

const unsuspendServer = async (serverId) => {
    try { await getAppAxios().post(`/servers/${serverId}/unsuspend`); return { success: true } }
    catch (e) { return { success: false, error: fmtErr(e) } }
}

const listNodes = async () => {
    try {
        const res = await getAppAxios().get('/nodes?per_page=100')
        const nodes = res.data?.data || []
        return {
            success: true,
            nodes: nodes.map(n => ({
                id: n.attributes.id,
                name: n.attributes.name,
                fqdn: n.attributes.fqdn,
                memory: n.attributes.memory,
                disk: n.attributes.disk
            }))
        }
    } catch (e) { return { success: false, error: fmtErr(e) } }
}

const formatUptime = (ms) => {
    if (!ms) return '0s'
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24)
    if (d > 0) return `${d}d ${h % 24}h`
    if (h > 0) return `${h}h ${m % 60}m`
    if (m > 0) return `${m}m ${s % 60}s`
    return `${s}s`
}

const statusEmoji = (state) => ({ running: '🟢', starting: '🟡', stopping: '🟠', offline: '🔴', crashed: '💥' }[state] || '⚫')

module.exports = {
    PLANS, EMAIL_DOMAIN,
    genPassword, fmtErr, getAllPages, findFreeAllocation, findServerByName, findUserByUsername,
    createPanelServer,
    listServers, getServerStatus, powerAction, sendCommand, getServerLogs,
    listFiles, readFile, writeFile,
    listUsers, getUser, createUser, updateUser, deleteUser,
    deleteUserWithServers, deleteAllUsersExceptOwner,
    listAllServers, deleteServer, suspendServer, unsuspendServer, listNodes,
    formatUptime, statusEmoji
}
