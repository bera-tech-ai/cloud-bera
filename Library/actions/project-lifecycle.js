'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFile } = require('child_process')
const { promisify } = require('util')
const { getUserWorkspace } = require('../lib/workspace')
const github = require('./github')
const berahost = require('./berahost')
const { takeScreenshot } = require('./browser')

const execFileAsync = promisify(execFile)
const STATE_FILE = path.join(__dirname, '../../Database/project_lifecycle.json')
const safeId = value => String(value || 'project').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'project'
const now = () => new Date().toISOString()

const loadState = () => {
    try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) } catch { return { projects: {} } }
}
const saveState = state => {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}
const updateRecord = (record, patch) => {
    Object.assign(record, patch, { updatedAt: now() })
    const state = loadState(); state.projects[record.id] = record; saveState(state)
    try {
        if (global.db?.data) {
            global.db.data.projects = global.db.data.projects || {}
            const safeRecord = JSON.parse(JSON.stringify(record))
            global.db.data.projects[record.id] = safeRecord
            global.db.write?.()
        }
    } catch {}
    return record
}

const pathWithPackageManagers = () => {
    // Same PATH hardening as agent-os: a service manager can start the bot
    // with a minimal PATH that lacks npm, which broke publish-time installs.
    const parts = String(process.env.PATH || '').split(':').filter(Boolean)
    const candidates = [path.dirname(process.execPath), '/opt/hatch-image/bin', '/usr/local/bin', '/opt/homebrew/bin']
    for (const dir of candidates) {
        if (parts.includes(dir)) continue
        try { if (fs.existsSync(path.join(dir, 'npm'))) parts.unshift(dir) } catch {}
    }
    return parts.join(':')
}

// BeraHost sometimes fails a brand-new deployment while an earlier
// deployment of the same project keeps running — and already serves the
// updated repository. Find such a deployment (verified live over HTTP) so
// a publish can fall back to its URL instead of handing out a dead one.
const findRunningDeploymentForProject = async (name, excludeId) => {
    try {
        const listed = await berahost.listWebDeployments()
        if (!listed.success) return null
        const runningIds = new Set((listed.deployments || [])
            .filter(d => String(d.id) !== String(excludeId) && /^running$/i.test(String(d.status || '')))
            .map(d => String(d.id)))
        if (!runningIds.size) return null
        const state = loadState()
        const candidates = Object.values(state.projects || {})
            .filter(p => p.name === name && p.deployment && p.deployment.url && runningIds.has(String(p.deployment.id)))
            .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
        for (const candidate of candidates) {
            try {
                const controller = new AbortController()
                const timer = setTimeout(() => controller.abort(), 10000)
                const response = await fetch(candidate.deployment.url, { signal: controller.signal })
                clearTimeout(timer)
                if (response.ok) return { id: candidate.deployment.id, status: 'running', url: candidate.deployment.url }
            } catch {}
        }
        return null
    } catch { return null }
}

const run = async (command, cwd, timeout = 120000) => {
    try {
        const r = await execFileAsync('/bin/sh', ['-lc', command], { cwd, timeout, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, PATH: pathWithPackageManagers() } })
        return { success: true, output: `${r.stdout || ''}${r.stderr ? `\n${r.stderr}` : ''}`.trim().slice(-12000) }
    } catch (e) {
        return { success: false, output: `${e.stdout || ''}${e.stderr ? `\n${e.stderr}` : ''}`.trim().slice(-12000), error: e.message }
    }
}

const extractDeploymentUrl = (value, depth = 0) => {
    if (depth > 4 || value == null) return null
    if (typeof value === 'string') {
        const candidate = value.trim()
        if (/^https?:\/\//i.test(candidate)) return candidate
        if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s]*)?$/i.test(candidate)) return `https://${candidate}`
        return null
    }
    if (typeof value !== 'object' || Array.isArray(value)) return null
    for (const key of ['url', 'liveUrl', 'live_url', 'deploymentUrl', 'deployment_url', 'publicUrl', 'public_url', 'websiteUrl', 'website_url', 'domain']) {
        const url = extractDeploymentUrl(value[key], depth + 1)
        if (url) return url
    }
    for (const key of ['deployment', 'data', 'result', 'site', 'web']) {
        const url = extractDeploymentUrl(value[key], depth + 1)
        if (url) return url
    }
    return null
}

const copyDirectory = (source, target) => {
    fs.mkdirSync(target, { recursive: true })
    for (const item of fs.readdirSync(source)) {
        if (['node_modules', '.git', '.bera-revisions', '.bera-preview.log'].includes(item) || item === '.env' || item.startsWith('.env.')) continue
        const from = path.join(source, item), to = path.join(target, item)
        const stat = fs.lstatSync(from)
        if (stat.isSymbolicLink()) continue
        if (stat.isDirectory()) copyDirectory(from, to)
        else fs.copyFileSync(from, to)
    }
}

const scaffold = (dir, name, type, description) => {
    const template = github.PROJECT_TEMPLATES[type] || github.PROJECT_TEMPLATES.node
    for (const file of template.files(name)) {
        const target = path.join(dir, file.path)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, file.content)
    }
    const readme = path.join(dir, 'README.md')
    if (fs.existsSync(readme) && description) fs.appendFileSync(readme, `\n\n## Description\n\n${description}\n`)
}

const inspectProject = dir => {
    const pkgPath = path.join(dir, 'package.json')
    let pkg = null
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) } catch {}
    const hasPython = fs.existsSync(path.join(dir, 'requirements.txt')) || fs.existsSync(path.join(dir, 'pyproject.toml'))
    const isStatic = fs.existsSync(path.join(dir, 'index.html')) && !pkg
    const scripts = pkg?.scripts || {}
    return {
        packageManager: pkg ? (fs.existsSync(path.join(dir, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(dir, 'yarn.lock')) ? 'yarn' : 'npm') : null,
        packageName: pkg?.name || null,
        scripts,
        hasPython,
        isStatic,
        buildCommand: pkg && scripts.build ? `${pkg ? (fs.existsSync(path.join(dir, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(dir, 'yarn.lock')) ? 'yarn' : 'npm') : 'npm'} run build` : null,
        startCommand: pkg && scripts.start ? `${pkg ? (fs.existsSync(path.join(dir, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(dir, 'yarn.lock')) ? 'yarn' : 'npm') : 'npm'} start` : null
    }
}

const git = (args, cwd, env = {}) => execFileAsync('git', args, {
    cwd, timeout: 120000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, ...env }
})

const pushToGitHub = async (dir, owner, repo, branch = 'main', message = 'feat: initial project generated by Bera AI') => {
    const token = github.getToken()
    if (!token) return { success: false, error: 'GitHub token is not configured.' }
    const askpass = path.join(require('os').tmpdir(), `bera-git-askpass-${process.pid}-${Date.now()}`)
    fs.writeFileSync(askpass, '#!/bin/sh\nprintf "%s" "$GITHUB_TOKEN"\n', { mode: 0o700 })
    const env = { GIT_ASKPASS: askpass, GIT_TERMINAL_PROMPT: '0', GITHUB_TOKEN: token }
    try {
        await git(['init'], dir, env)
        await git(['config', 'user.name', 'Bera AI'], dir, env)
        await git(['config', 'user.email', 'bera-ai@users.noreply.github.com'], dir, env)
        await git(['add', '-A', '--', '.', ':!.env', ':!.env.*', ':!**/.env', ':!**/.env.*', ':!node_modules/**', ':!**/node_modules/**', ':!.bera-preview.log', ':!.bera-revisions', ':!.bera-revisions/**'], dir, env)
        const commit = await run(`git diff --cached --quiet || git commit -m ${JSON.stringify(message)}`, dir, 120000)
        if (!commit.success) return { success: false, error: commit.output || commit.error }
        await run(`git remote remove origin 2>/dev/null || true; git remote add origin https://github.com/${owner}/${repo}.git`, dir, 30000)
        await git(['branch', '-M', branch], dir, env)
        try {
            const pushed = await git(['push', '-u', 'origin', branch], dir, env)
            return { success: true, output: String(pushed.stdout || '').slice(-2000) }
        } catch (pushError) {
            // A rebuilt project has fresh local history, so a plain push is
            // rejected as non-fast-forward. These repositories are generated
            // and written only by Bera, and a rebuild supersedes the previous
            // generation, so retry once with force.
            const forced = await git(['push', '-u', 'origin', branch, '--force'], dir, env)
            return { success: true, output: String(forced.stdout || '').slice(-2000) }
        }
    } catch (e) {
        return { success: false, error: e.stderr || e.message }
    } finally { try { fs.unlinkSync(askpass) } catch {} }
}

const describeGitHubError = (operation, result) => {
    const status = result?.status ? ` (HTTP ${result.status})` : ''
    const rawDetails = result?.details
    const details = Array.isArray(rawDetails)
        ? rawDetails.map(item => typeof item === 'string' ? item : [item?.resource, item?.field, item?.code, item?.message].filter(Boolean).join(' ')).filter(Boolean).join('; ')
        : typeof rawDetails === 'string' ? rawDetails : ''
    return `${operation}${status}: ${result?.error || result?.message || 'unknown error'}${details ? ` — ${details}` : ''}`
}

const validateExistingRepository = (repo, owner, repoName, isPrivate) => {
    if (!repo || repo.error || !repo.html_url) throw new Error(describeGitHubError('GitHub repository lookup failed', repo))
    const actualOwner = String(repo.owner?.login || '')
    if (!actualOwner || actualOwner.toLowerCase() !== String(owner || '').toLowerCase()) {
        throw new Error(`Repository ${repoName} could not be verified as belonging to the authenticated GitHub owner.`)
    }
    if (typeof repo.private === 'boolean' && repo.private !== Boolean(isPrivate)) {
        throw new Error(`Repository ${owner}/${repoName} already exists with different visibility. Bera did not change its visibility; choose another name or update the repository settings explicitly.`)
    }
    return repo
}

const getOrCreateRepository = async (owner, repoName, { isPrivate = false, description = '' } = {}) => {
    const existing = await github.getRepo(owner, repoName)
    if (!existing?.error) return validateExistingRepository(existing, owner, repoName, isPrivate)
    if (existing.status !== 404) throw new Error(describeGitHubError('GitHub repository lookup failed', existing))

    const created = await github.createRepo(repoName, isPrivate, description, { autoInit: false })
    if (!created?.error && created?.html_url) return validateExistingRepository(created, owner, repoName, isPrivate)

    // A prior approval attempt may have created the repository before a later push step failed.
    // Re-check after a conflict so retries can safely continue against that exact owner's repo.
    if (created?.status === 422) {
        const afterConflict = await github.getRepo(owner, repoName)
        if (!afterConflict?.error && afterConflict?.html_url) {
            return validateExistingRepository(afterConflict, owner, repoName, isPrivate)
        }
    }
    throw new Error(describeGitHubError('GitHub repository creation failed', created))
}

const lifecycle = async (options = {}) => {
    const userId = options.userId || 'shared'
    const requestedName = options.name || options.projectName || 'bera-project'
    const name = safeId(requestedName)
    const id = options.projectId || `${name}-${crypto.randomBytes(4).toString('hex')}`
    const userRoot = getUserWorkspace(userId)
    const dir = path.resolve(options.projectDir || path.join(userRoot, name))
    const record = updateRecord({
        id, name, userId, dir, type: options.type || 'node', description: options.description || '',
        status: 'started', stage: 'workspace', createdAt: now(), updatedAt: now(),
        github: null, deployment: null, checks: [], errors: []
    }, {})
    let deploymentScreenshot = null
    try {
        fs.mkdirSync(dir, { recursive: true })
        if (options.sourceDir && path.resolve(options.sourceDir) !== dir) copyDirectory(path.resolve(options.sourceDir), dir)
        else if (!fs.readdirSync(dir).length) scaffold(dir, name, options.type || 'node', options.description || '')
        updateRecord(record, { stage: 'inspect', status: 'running' })

        const project = inspectProject(dir)
        record.project = project
        updateRecord(record, { stage: 'install' })
        if (project.packageManager) {
            const install = await run(`${project.packageManager} install --no-audit --no-fund`, dir, options.installTimeout || 180000)
            record.checks.push({ name: 'install', ...install })
            if (!install.success) throw new Error(`Dependency installation failed: ${install.output}`)
        }
        if (project.hasPython && fs.existsSync(path.join(dir, 'main.py'))) {
            const py = await run('python3 -m py_compile main.py', dir, 30000)
            record.checks.push({ name: 'python-compile', ...py })
            if (!py.success) throw new Error(`Python validation failed: ${py.output}`)
        }
        if (project.buildCommand) {
            updateRecord(record, { stage: 'build' })
            const build = await run(project.buildCommand, dir, options.buildTimeout || 180000)
            record.checks.push({ name: 'build', ...build })
            if (!build.success) throw new Error(`Build failed: ${build.output}`)
        }
        if (project.scripts.test) {
            const test = await run(`${project.packageManager} test -- --runInBand`, dir, options.testTimeout || 120000)
            record.checks.push({ name: 'test', ...test })
            if (!test.success && options.requireTests) throw new Error(`Tests failed: ${test.output}`)
        }
        updateRecord(record, { stage: 'github' })
        const owner = options.owner || await github.getOwner()
        if (!owner) throw new Error('GitHub account is not connected.')
        const repoName = safeId(options.repoName || name)
        let repo = options.repoUrl ? { html_url: options.repoUrl, clone_url: options.repoUrl } : null
        if (!repo) {
            repo = await getOrCreateRepository(owner, repoName, {
                // Public by default: BeraHost has no GitHub account connected
                // (GET /github/status → connected: false), so it can only clone
                // public repositories. Pass private: true explicitly to keep a
                // repo private (it then cannot deploy on BeraHost).
                isPrivate: options.private === true,
                description: options.description || `Project ${name} created by Bera AI`
            })
        }
        const pushed = await pushToGitHub(dir, owner, repo.name || repoName, options.branch || 'main', options.commitMessage)
        if (!pushed.success) throw new Error(`GitHub push failed: ${pushed.error}`)
        record.github = { owner, repo: repo.name || repoName, url: repo.html_url || `https://github.com/${owner}/${repo.name || repoName}`, branch: options.branch || 'main' }
        updateRecord(record, { stage: 'deployed' })

        if (options.deploy !== false) {
            const production = options.environment === 'production'
            if (production && !options.approveProduction) {
                record.deployment = { status: 'approval_required', production: true }
                updateRecord(record, { status: 'awaiting_approval', stage: 'deployment_approval' })
            } else {
                const deployment = await berahost.createWebDeployment({
                    repoUrl: `https://github.com/${owner}/${repo.name || repoName}`,
                    branch: options.branch || 'main',
                    customName: name,
                    buildCommand: project.buildCommand || options.buildCommand || '',
                    startCommand: project.startCommand || options.startCommand || '',
                    envVars: options.envVars || {},
                    autoDeploy: Boolean(options.autoDeploy && production)
                })
                if (!deployment.success) {
                    const deploymentError = String(deployment.error || 'unknown error')
                    const repoIsPrivate = typeof repo.private === 'boolean' ? repo.private : options.private === true
                    const privateCloneHint = repoIsPrivate && /404|not found|download failed/i.test(deploymentError)
                        ? ' The GitHub repository is private, and Bera’s BeraHost request does not configure a dedicated GitHub clone credential. This 404 is consistent with BeraHost lacking access. Bera kept the repository private; configure BeraHost’s supported private-repository access or explicitly approve making the source public.'
                        : ''
                    throw new Error(`BeraHost deployment failed: ${deploymentError}${privateCloneHint}`)
                }
                record.deployment = { id: deployment.id, status: deployment.status, url: extractDeploymentUrl(deployment.data) || extractDeploymentUrl(deployment) || null, production }
                updateRecord(record, { stage: 'deployment_poll' })
                const final = await berahost.pollWebDeployment(deployment.id, options.deployTimeout || 120000, 5000)
                if (final.success) {
                    const d = final.deployment || {}
                    record.deployment = { ...record.deployment, ...d, id: deployment.id, url: extractDeploymentUrl(d) || record.deployment.url }
                }
                if (!/^running$/i.test(String(record.deployment.status || ''))) {
                    // The fresh deployment did not reach "running": it failed
                    // on BeraHost's side, or their builder is stuck and the
                    // poll window elapsed (deployments have hung in
                    // "building" there). If an earlier deployment of this
                    // project is live (verified over HTTP), hand out its URL
                    // instead — it already serves the updated repository.
                    // With no live fallback, a failed deployment is an honest
                    // error; a still-building one keeps its URL as before.
                    const fallback = await findRunningDeploymentForProject(name, deployment.id)
                    if (fallback) {
                        record.deployment = { ...fallback, production, replacedFailedDeployment: deployment.id }
                    } else if (/fail|error|suspend/i.test(String(record.deployment.status || ''))) {
                        throw new Error(`BeraHost deployment failed (status: ${record.deployment.status}). The code was pushed to GitHub, but the site is not live.`)
                    }
                }
                if (record.deployment.url) {
                    const shot = await takeScreenshot(record.deployment.url)
                    record.preview = shot.success
                        ? { captured: true, mimetype: shot.mimetype || 'image/png', size: shot.buffer?.length || 0 }
                        : { captured: false, error: shot.error }
                    if (shot.success && Buffer.isBuffer(shot.buffer)) {
                        deploymentScreenshot = { buffer: shot.buffer, mimetype: shot.mimetype || 'image/png' }
                    }
                }
                updateRecord(record, { status: record.deployment.status || 'deployed', stage: 'complete' })
            }
        } else updateRecord(record, { status: 'ready_for_deployment', stage: 'complete' })
        return { success: true, record, report: formatReport(record), screenshot: deploymentScreenshot }
    } catch (e) {
        record.errors.push({ stage: record.stage, error: e.message, at: now() })
        updateRecord(record, { status: 'failed', stage: 'failed' })
        return { success: false, record, error: e.message, report: formatReport(record) }
    }
}

const formatReport = record => [
    `Project: ${record.name}`,
    `Status: ${record.status}`,
    `Stage: ${record.stage}`,
    `Workspace: ${record.dir}`,
    record.github ? `GitHub: ${record.github.url}` : null,
    record.deployment?.url ? `BeraHost: ${record.deployment.url}` : record.deployment?.status === 'approval_required' ? 'BeraHost: production approval required' : null,
    record.errors?.length ? `Error: ${record.errors.at(-1).error}` : null
].filter(Boolean).join('\n')

const getProject = id => loadState().projects[id] || null
const listProjects = userId => Object.values(loadState().projects).filter(p => !userId || p.userId === userId)

module.exports = { lifecycle, getProject, listProjects, inspectProject, formatReport, getOrCreateRepository, extractDeploymentUrl }
