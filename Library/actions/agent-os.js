'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawn, execFile } = require('child_process')
const { promisify } = require('util')
const { getUserWorkspace } = require('../lib/workspace')
const xcasper = require('./xcasper')
const github = require('./github')
const { takeScreenshot } = require('./browser')

const execFileAsync = promisify(execFile)
const STATE_FILE = process.env.BERA_AGENT_STATE_FILE || path.join(__dirname, '../../Database/agent_os.json')
const now = () => new Date().toISOString()
const notifyProgress = async (options, progress) => {
    try { await options?.onProgress?.(progress) } catch {}
}
const safe = value => String(value || 'project').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'project'
const load = () => { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) } catch { return { projects: {}, events: [] } } }
const save = state => { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)) }
const update = (record, patch) => { Object.assign(record, patch, { updatedAt: now() }); const s = load(); s.projects[record.id] = record; save(s); return record }
const projectRoot = (userId, name) => path.join(getUserWorkspace(userId), 'projects', safe(name))
const inside = (root, target) => { const r = path.resolve(root), t = path.resolve(target); return t === r || t.startsWith(`${r}${path.sep}`) }

const command = async (cmd, cwd, timeout = 120000) => {
    try {
        const r = await execFileAsync('/bin/sh', ['-lc', cmd], { cwd, timeout, maxBuffer: 8 * 1024 * 1024, env: process.env })
        return { success: true, output: `${r.stdout || ''}${r.stderr ? `\n${r.stderr}` : ''}`.trim().slice(-12000) }
    } catch (e) {
        return { success: false, output: `${e.stdout || ''}${e.stderr ? `\n${e.stderr}` : ''}`.trim().slice(-12000), error: e.message }
    }
}

const inspect = dir => {
    let pkg = null
    try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) } catch {}
    const scripts = pkg?.scripts || {}
    const manager = fs.existsSync(path.join(dir, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(dir, 'yarn.lock')) ? 'yarn' : 'npm'
    return {
        packageName: pkg?.name || null,
        manager: pkg ? manager : null,
        scripts,
        buildCommand: scripts.build ? `${manager} run build` : null,
        testCommand: scripts.test ? `${manager} test -- --runInBand` : null,
        startCommand: scripts.start ? `${manager} start` : scripts.dev ? `${manager} run dev -- --host 0.0.0.0` : null,
        files: fs.existsSync(dir) ? fs.readdirSync(dir).slice(0, 100) : []
    }
}

const create = async options => {
    const userId = options.userId || 'shared'
    const name = safe(options.name || 'bera-project')
    const id = options.projectId || `${name}-${crypto.randomBytes(4).toString('hex')}`
    const dir = path.resolve(options.projectDir || projectRoot(userId, name))
    const root = getUserWorkspace(userId)
    if (!inside(root, dir)) return { success: false, error: 'Project path must remain inside the user workspace.' }
    fs.mkdirSync(dir, { recursive: true })
    const record = { id, name, userId, dir, status: 'created', stage: 'workspace', createdAt: now(), updatedAt: now(), task: options.task || options.description || '', plan: null, checks: [], repairs: [], preview: null, github: null, events: [] }
    update(record, {})
    return { success: true, record }
}

const get = id => load().projects[id] || null
const event = (record, type, data = {}) => { record.events = (record.events || []).slice(-99); record.events.push({ type, at: now(), ...data }); update(record, {}) }

const parsePlannerJson = raw => {
    const text = String(raw || '').replace(/```(?:json)?/gi, '').trim()
    let inString = false
    let escaped = false
    let depth = 0
    let start = -1
    let lastError = new Error('No JSON object found.')
    for (let i = 0; i < text.length; i++) {
        const char = text[i]
        if (inString) {
            if (escaped) escaped = false
            else if (char === '\\') escaped = true
            else if (char === '"') inString = false
            continue
        }
        if (char === '"') inString = true
        else if (char === '{') {
            if (depth === 0) start = i
            depth++
        } else if (char === '}' && depth > 0) {
            depth--
            if (depth === 0) {
                try {
                    const value = JSON.parse(text.slice(start, i + 1))
                    if (value && typeof value === 'object' && !Array.isArray(value)) return { success: true, value }
                    lastError = new Error('Planner JSON must be an object.')
                } catch (error) { lastError = error }
            }
        }
    }
    return { success: false, error: lastError }
}

const makePlan = async (record, task, options = {}) => {
    const prompt = `You are the planning layer of Bera AI. Create a safe, executable software-project plan.\nReturn JSON only: {"summary":"...","steps":[{"action":"write_file|mkdir|install|build|test|shell","path":"relative path","contentBase64":"base64 file content with no line breaks","command":"...","reason":"..."}]}\nRules: paths must be relative to the project; do not use secrets; do not delete files; prefer write_file for source changes; encode every file body as contentBase64, never use a literal content field; use shell only for package-manager commands. Do not create Git repositories, run git init/add/commit/push, configure remotes, or deploy; Bera handles its local checkpoint after validation and requires separate approval for GitHub/deployment.\nProject directory: ${record.dir}\nExisting inspection: ${JSON.stringify(inspect(record.dir))}\nTask: ${String(task || record.task).slice(0, 12000)}`
    await notifyProgress(options, { phase: 'planning' })
    const result = await xcasper.chat([{ role: 'system', content: prompt }, { role: 'user', content: String(task || record.task) }], {
        timeout: 45000,
        maxChars: 24000,
        onProviderProgress: progress => notifyProgress(options, { phase: 'ai_provider', ...progress })
    })
    if (!result.success) return { success: false, error: result.error }
    let parsed = parsePlannerJson(result.text)
    if (!parsed.success) {
        await notifyProgress(options, { phase: 'planner_json_recovery' })
        const recovery = await xcasper.chat([
            { role: 'system', content: 'Repair the malformed planner response into exactly one valid JSON object with the schema {"summary":"...","steps":[{"action":"write_file|mkdir|install|build|test|shell","path":"relative path","contentBase64":"...","command":"...","reason":"..."}]}. Preserve the original plan and every value; do not invent or omit steps. Return JSON only, with all strings correctly escaped, no comments, no trailing commas, and no Markdown fences.' },
            { role: 'user', content: `Original project task: ${String(task || record.task).slice(0, 4000)}\nMalformed planner response:\n${String(result.text || '').slice(-18000)}` }
        ], {
            timeout: 45000,
            maxChars: 22000,
            onProviderProgress: progress => notifyProgress(options, { phase: 'planner_json_recovery_provider', ...progress })
        })
        if (!recovery.success) return { success: false, error: `Planner returned malformed JSON; format recovery failed: ${recovery.error}` }
        parsed = parsePlannerJson(recovery.text)
        if (!parsed.success) return { success: false, error: `Planner JSON error after format recovery: ${parsed.error.message}` }
    }
    const plan = parsed.value
    if (!Array.isArray(plan.steps) || !plan.steps.length) return { success: false, error: 'Planner returned no steps.' }
    await notifyProgress(options, { phase: 'planning_complete', provider: result.provider })
    plan.steps = plan.steps.slice(0, 40).map(step => ({
        ...step,
        action: String(step.action || '').trim().toLowerCase() === 'git init' ? 'git_init' : String(step.action || '').trim().toLowerCase(),
        content: step.contentBase64 && !step.content
            ? Buffer.from(String(step.contentBase64).replace(/\s+/g, ''), 'base64').toString('utf8')
            : step.content
    }))
    record.plan = plan
    record.task = task || record.task
    update(record, { stage: 'planned', status: 'planned' })
    event(record, 'plan_created', { count: plan.steps.length })
    return { success: true, plan }
}

const executeStep = async (record, step, options = {}) => {
    const root = record.dir
    const action = step.action
    if (['write_file', 'mkdir'].includes(action)) {
        const target = path.resolve(root, step.path || '')
        if (!inside(root, target)) return { success: false, output: 'Blocked path outside project workspace.' }
        if (action === 'mkdir') { fs.mkdirSync(target, { recursive: true }); return { success: true, output: `Created ${step.path}` } }
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, String(step.content || ''))
        return { success: true, output: `Wrote ${step.path}` }
    }
    if (action === 'install') {
        const info = inspect(root)
        if (!info.manager) return { success: true, output: 'No package manifest; install skipped.' }
        return command(`${info.manager} install --no-audit --no-fund`, root, options.timeout || 180000)
    }
    if (action === 'build' || action === 'test') {
        const info = inspect(root)
        const cmd = action === 'build' ? info.buildCommand : info.testCommand
        if (!cmd) return { success: true, output: `${action} script not defined; skipped.` }
        return command(cmd, root, options.timeout || 180000)
    }
    if (action === 'shell') {
        if (!options.allowShell) return { success: false, output: 'Shell execution requires allowShell=true.' }
        const raw = String(step.command || '')
        if (!/^(npm|pnpm|yarn|node|python3|pytest|git)\b/.test(raw)) return { success: false, output: 'Only approved development commands are allowed.' }
        return command(raw, root, options.timeout || 120000)
    }
    if (action === 'git_init') return { success: true, output: 'Deferred git init to Bera’s local checkpoint after validation.' }
    return { success: false, output: `Unknown plan action: ${action}` }
}

const repair = async (record, failure, options) => {
    if ((record.repairs || []).length >= (options.maxRepairs ?? 2)) return { success: false, error: 'Repair limit reached.' }
    const context = `Project task: ${record.task}\nFailure output:\n${String(failure).slice(-10000)}\nProject inspection:\n${JSON.stringify(inspect(record.dir))}`
    const result = await xcasper.chat([{ role: 'system', content: 'You are a senior repair planner. Return JSON only: {"steps":[{"action":"write_file|build|test|install","path":"relative path","contentBase64":"base64 file content with no line breaks"}],"reason":"..."}. For source files always use contentBase64, never a literal content field. Never delete files or use secrets.' }, { role: 'user', content: context }], {
        timeout: 45000,
        maxChars: 20000,
        onProviderProgress: progress => notifyProgress(options, { phase: 'repair_provider', ...progress })
    })
    if (!result.success) return { success: false, error: result.error }
    const match = result.text.match(/\{[\s\S]*\}/)
    if (!match) return { success: false, error: 'Repair planner returned invalid JSON.' }
    let plan
    try { plan = JSON.parse(match[0]) } catch (e) { return { success: false, error: e.message } }
    record.repairs.push({ at: now(), reason: plan.reason || 'automatic repair', failure: String(failure).slice(-3000) })
    for (const rawStep of (plan.steps || []).slice(0, 10)) {
        const step = {
            ...rawStep,
            content: rawStep.contentBase64 && !rawStep.content
                ? Buffer.from(String(rawStep.contentBase64).replace(/\s+/g, ''), 'base64').toString('utf8')
                : rawStep.content
        }
        const result = await executeStep(record, step, options)
        if (!result.success) return { success: false, error: result.output }
    }
    update(record, { stage: 'repairing', status: 'repairing' })
    return { success: true }
}

const validate = async (record, options = {}) => {
    const info = inspect(record.dir)
    const checks = []
    if (info.manager) checks.push({ name: 'install', ...(await command(`${info.manager} install --no-audit --no-fund`, record.dir, options.installTimeout || 180000)) })
    if (info.buildCommand) checks.push({ name: 'build', ...(await command(info.buildCommand, record.dir, options.buildTimeout || 180000)) })
    if (info.testCommand) checks.push({ name: 'test', ...(await command(info.testCommand, record.dir, options.testTimeout || 120000)) })
    record.checks = checks
    update(record, { stage: 'validated', status: checks.every(c => c.success) ? 'validated' : 'validation_failed' })
    return { success: checks.every(c => c.success), checks }
}

const checkpoint = async (record, message = 'checkpoint: Bera AI') => {
    const result = await command(`git init && git config user.name "Bera AI" && git config user.email "bera-ai@users.noreply.github.com" && git add -A -- . ':!.env' ':!.env.*' ':!**/.env' ':!**/.env.*' ':!node_modules/**' ':!**/node_modules/**' ':!.bera-preview.log' ':!.bera-revisions/**' && (git diff --cached --quiet || git commit -m ${JSON.stringify(message)})`, record.dir, 120000)
    if (result.success) { record.checkpoint = { at: now(), message }; update(record, { stage: 'checkpointed', status: 'checkpointed' }); event(record, 'checkpoint', { message }) }
    return result
}

const previewStart = async (record, options = {}) => {
    const info = inspect(record.dir)
    if (!info.startCommand) return { success: false, error: 'No start or dev script found.' }
    if (record.preview?.pid) await previewStop(record)
    const port = Number(options.port || 3000)
    const log = path.join(record.dir, '.bera-preview.log')
    const out = fs.openSync(log, 'a')
    const child = spawn('/bin/sh', ['-lc', `${info.startCommand} -- --port ${port}`], { cwd: record.dir, detached: true, stdio: ['ignore', out, out], env: { ...process.env, PORT: String(port) } })
    child.unref()
    const base = process.env.BERA_PREVIEW_BASE_URL || `http://127.0.0.1:${port}`
    record.preview = { pid: child.pid, port, url: `${base.replace(/\/$/, '')}`, log, startedAt: now(), status: 'starting' }
    update(record, { stage: 'preview', status: 'preview_starting' })
    await new Promise(resolve => setTimeout(resolve, Number(options.waitMs || 2500)))
    const probe = await command(`curl -L -sS --max-time 8 -o /dev/null -w '%{http_code}' http://127.0.0.1:${port}`, record.dir, 15000)
    record.preview.status = probe.success && /^2|^3/.test(probe.output) ? 'running' : 'unknown'
    update(record, {})
    return { success: record.preview.status === 'running', preview: record.preview, probe: probe.output }
}

const previewStop = async record => {
    if (record.preview?.pid) { try { process.kill(-record.preview.pid, 'SIGTERM') } catch { try { process.kill(record.preview.pid, 'SIGTERM') } catch {} } }
    record.preview = { ...(record.preview || {}), status: 'stopped', stoppedAt: now() }
    update(record, { status: 'ready' })
    return { success: true, preview: record.preview }
}

const screenshot = async record => {
    if (!record.preview?.url) return { success: false, error: 'Preview is not running.' }
    const result = await takeScreenshot(record.preview.url)
    if (result.success) { record.preview.lastScreenshotAt = now(); record.preview.screenshot = { mimetype: result.mimetype, size: result.buffer?.length || 0 }; update(record, {}) }
    return result
}

const run = async options => {
    const requestedAction = options.action || 'run'
    if ((requestedAction === 'publish' || (requestedAction === 'run' && (options.publish || options.deploy))) && options.ownerAuthorized !== true) {
        return { success: false, error: 'Publishing and deployment require a trusted owner-approved action.' }
    }
    let record = options.projectId ? get(options.projectId) : null
    if (record && record.userId !== (options.userId || 'shared') && options.ownerAuthorized !== true) {
        return { success: false, error: 'Project not found or access denied.' }
    }
    if (!record) { const created = await create(options); if (!created.success) return created; record = created.record }
    const action = requestedAction
    if (action === 'status') return { success: true, record }
    if (action === 'create') return { success: true, record }
    if (action === 'plan') return makePlan(record, options.task || record.task, options)
    if (action === 'preview_start') return previewStart(record, options)
    if (action === 'preview_stop') return previewStop(record)
    if (action === 'screenshot') return screenshot(record)
    if (action === 'checkpoint') return checkpoint(record, options.message)
    if (action === 'publish') {
        const lifecycle = require('./project-lifecycle')
        const published = await lifecycle.lifecycle({
            userId: record.userId,
            name: record.name,
            projectId: record.id,
            projectDir: record.dir,
            sourceDir: record.dir,
            type: options.type || 'node',
            description: record.task,
            private: options.private !== false,
            deploy: options.deploy !== false,
            environment: options.environment,
            approveProduction: options.approveProduction,
            autoDeploy: options.autoDeploy,
            envVars: options.envVars,
            repoName: options.repoName,
            branch: options.branch
        })
        record.github = published.record?.github || record.github
        record.deployment = published.record?.deployment || record.deployment
        update(record, { status: published.success ? 'published' : 'publish_failed', stage: published.success ? 'published' : 'publish_failed' })
        return { ...published, record }
    }
    if (action !== 'run') return { success: false, error: `Unknown agent_os action: ${action}` }

    update(record, { status: 'planning', stage: 'planning' })
    const planned = record.plan && !options.replan ? { success: true, plan: record.plan } : await makePlan(record, options.task || record.task, options)
    if (!planned.success) {
        update(record, { status: 'failed', stage: 'planning_failed' })
        return { ...planned, record }
    }
    for (const [index, step] of planned.plan.steps.entries()) {
        update(record, { stage: `execute:${index + 1}/${planned.plan.steps.length}`, status: 'executing' })
        if (typeof options.onProgress === 'function') {
            try { await options.onProgress({ phase: 'execute', index, total: planned.plan.steps.length, action: step.action }) } catch {}
        }
        const result = await executeStep(record, step, options)
        event(record, 'step', { index, action: step.action, success: result.success, output: String(result.output || '').slice(-1200) })
        if (!result.success) {
            await notifyProgress(options, { phase: 'repair', attempt: (record.repairs || []).length + 1, total: options.maxRepairs ?? 2 })
            const fixed = await repair(record, result.output || result.error, options)
            if (!fixed.success) { update(record, { status: 'failed', stage: 'failed' }); return { success: false, error: result.output || result.error, record } }
        }
    }
    await notifyProgress(options, { phase: 'validation' })
    let validation = await validate(record, options)
    for (let attempt = 0; !validation.success && attempt < (options.maxRepairs ?? 2); attempt++) {
        await notifyProgress(options, { phase: 'repair', attempt: attempt + 1, total: options.maxRepairs ?? 2 })
        const fixed = await repair(record, validation.checks.filter(c => !c.success).map(c => c.output).join('\n'), options)
        if (!fixed.success) break
        validation = await validate(record, options)
    }
    if (!validation.success) { update(record, { status: 'failed', stage: 'validation_failed' }); return { success: false, validation, record } }
    await notifyProgress(options, { phase: 'checkpoint' })
    const saved = await checkpoint(record, options.message || `feat: ${record.name} generated by Bera AI`)
    if (!saved.success) return { success: false, error: saved.output, record }
    let previewScreenshot = null
    if (options.preview) {
        await notifyProgress(options, { phase: 'preview' })
        await previewStart(record, options)
    }
    if (options.screenshot && record.preview?.status === 'running') {
        const shot = await screenshot(record)
        if (shot.success && Buffer.isBuffer(shot.buffer)) previewScreenshot = shot
    }
    if (options.publish) {
        const published = await run({ ...options, action: 'publish', projectId: record.id })
        if (!published.success) return published
        previewScreenshot = published.screenshot || previewScreenshot
    }
    update(record, { status: 'complete', stage: 'complete' })
    return { success: true, record, validation, screenshot: previewScreenshot }
}

module.exports = { run, create, get, list: userId => Object.values(load().projects).filter(p => !userId || p.userId === userId), inspect, makePlan, executeStep, validate, checkpoint, previewStart, previewStop, screenshot }
