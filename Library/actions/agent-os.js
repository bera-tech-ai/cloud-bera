'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawn, execFile } = require('child_process')
const { promisify } = require('util')
const { jsonrepair } = require('jsonrepair')
const { getUserWorkspace } = require('../lib/workspace')
const xcasper = require('./xcasper')
const github = require('./github')
const { takeScreenshot } = require('./browser')

const execFileAsync = promisify(execFile)
const NPM_REGISTRY = 'https://registry.npmjs.org/'
const packageManagerEnv = () => ({
    ...process.env,
    npm_config_registry: NPM_REGISTRY,
    NPM_CONFIG_REGISTRY: NPM_REGISTRY,
    YARN_NPM_REGISTRY_SERVER: NPM_REGISTRY
})
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

const safePackageManagerCommand = raw => {
    const tokens = String(raw || '').trim().split(/\s+/).filter(Boolean)
    const [manager, subcommand, ...args] = tokens
    if (!['npm', 'pnpm', 'yarn'].includes(manager) || !subcommand) return null
    if ((manager === 'npm' || manager === 'pnpm') && subcommand === 'run' && args.length === 1 && ['build', 'test'].includes(args[0])) {
        return { manager, args: ['run', args[0]], script: args[0] }
    }
    if ((manager === 'npm' || manager === 'pnpm') && subcommand === 'test' && args.length === 0) return { manager, args: ['test'], script: 'test' }
    if (manager === 'yarn' && ['build', 'test'].includes(subcommand) && args.length === 0) return { manager, args: [subcommand], script: subcommand }

    const isNpmInstall = manager === 'npm' && ['install', 'i'].includes(subcommand)
    const isPnpmInstall = manager === 'pnpm' && subcommand === 'install'
    const isAdd = (manager === 'pnpm' || manager === 'yarn') && subcommand === 'add'
    if (!isNpmInstall && !isPnpmInstall && !isAdd) return null

    const safeFlags = new Set(['--save-dev', '-D', '--save-prod', '-P', '--save-exact', '-E', '--no-audit', '--no-fund', '--legacy-peer-deps'])
    const packageSpec = /^(@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*(?:@[a-z0-9*][a-z0-9._~^*+-]*)?$/i
    let packages = 0
    for (const arg of args) {
        if (safeFlags.has(arg)) continue
        if (!packageSpec.test(arg)) return null
        packages++
    }
    if (isPnpmInstall && packages > 0) return null
    if (isAdd && packages === 0) return null
    return { manager, args: [subcommand, ...args] }
}

const runSafePackageManagerCommand = async (commandInfo, cwd, timeout = 120000) => {
    try {
        const args = commandInfo.args.slice()
        const installCommand = ['install', 'i', 'add'].includes(args[0])
        if (installCommand && commandInfo.manager !== 'yarn' && !args.some(arg => arg.startsWith('--registry='))) {
            args.push(`--registry=${NPM_REGISTRY}`)
        }
        const result = await execFileAsync(commandInfo.manager, args, {
            cwd,
            timeout,
            maxBuffer: 8 * 1024 * 1024,
            env: packageManagerEnv()
        })
        return { success: true, output: `${result.stdout || ''}${result.stderr ? `\n${result.stderr}` : ''}`.trim().slice(-12000) }
    } catch (error) {
        return { success: false, output: `${error.stdout || ''}${error.stderr ? `\n${error.stderr}` : ''}`.trim().slice(-12000), error: error.message }
    }
}

const installProjectDependencies = (manager, cwd, timeout = 180000) => runSafePackageManagerCommand({
    manager,
    args: manager === 'yarn' ? ['install'] : ['install', '--no-audit', '--no-fund']
}, cwd, timeout)

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

const checkProjectEntrypoint = (dir, info) => {
    let staticSite = false
    try {
        const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
        const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] || ''
        staticSite = /<html\b[\s\S]*<\/html\s*>/i.test(html) &&
            /<(?:main|header|nav|section|article|form|button|h[1-6]|p|div|canvas|script)\b/i.test(body)
    } catch {}
    const rootScript = ['index.js', 'server.js', 'app.js'].find(file => {
        try { const stat = fs.statSync(path.join(dir, file)); return stat.isFile() && stat.size > 0 } catch { return false }
    })
    const pythonEntrypoint = ['main.py', 'app.py'].find(file => {
        try { const stat = fs.statSync(path.join(dir, file)); return stat.isFile() && stat.size > 0 } catch { return false }
    })
    const packageApp = Boolean(info.manager && (info.startCommand || info.buildCommand))
    const success = staticSite || packageApp || Boolean(rootScript) || Boolean(pythonEntrypoint)
    return {
        name: 'project-entrypoint',
        success,
        output: success
            ? 'Found a non-empty application entrypoint at the project root.'
            : 'No runnable application entrypoint found at the project root. Add a real root index.html, a package.json with a start/build script, or a root index.js/server.js/app.js/main.py/app.py file; do not hide the application inside an extra project/ or project_root/ folder.',
        rootScript: rootScript || null,
        pythonEntrypoint: pythonEntrypoint || null
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

const parsePlannerJson = (raw, repairMalformed = false) => {
    const text = String(raw || '').replace(/```(?:json)?/gi, '').trim()
    let inString = false
    let escaped = false
    let depth = 0
    let start = -1
    let lastError = new Error('No JSON object found.')
    const parseCandidate = candidate => {
        let value
        try { value = JSON.parse(candidate) } catch (error) {
            lastError = error
            if (!repairMalformed) return null
            try { value = JSON.parse(jsonrepair(candidate)) } catch (repairError) { lastError = repairError; return null }
        }
        if (value && typeof value === 'object' && !Array.isArray(value)) return { success: true, value }
        lastError = new Error('Planner JSON must be an object.')
        return null
    }
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
                const parsed = parseCandidate(text.slice(start, i + 1))
                if (parsed) return parsed
            }
        }
    }
    if (repairMalformed) {
        const first = text.indexOf('{')
        const last = text.lastIndexOf('}')
        if (first >= 0 && last > first) {
            const parsed = parseCandidate(text.slice(first, last + 1))
            if (parsed) return parsed
        }
    }
    return { success: false, error: lastError }
}

const makePlan = async (record, task, options = {}) => {
    const prompt = `You are the planning layer of Bera AI. Create a safe, executable software-project plan.\nReturn JSON only with this shape: {"summary":"...","steps":[{"action":"mkdir","path":"relative path","contentBase64":"base64 file content with no line breaks","command":"...","reason":"..."}]}. The action value shown is an example, not a literal for every step.\nRules: each action must be exactly one of write_file, mkdir, install, build, test, shell; never put a list, pipe, or path in action. Put every relative path only in path. All application files must be relative to the project directory below; do not create an extra project/project_root wrapper folder. Use conventional paths such as src/ only beneath that root. Create a real runnable app, not placeholder text. A website must include a root index.html or a package.json with a working start/build script and its application entrypoint. Do not use secrets or delete files; prefer write_file for source changes; encode every file body as contentBase64, never use a literal content field; use shell only for one standalone npm/pnpm/yarn install/add or build/test command, never chain commands or use node, python, or git. Do not create Git repositories, run git init/add/commit/push, configure remotes, or deploy; Bera handles its local checkpoint after validation and requires separate approval for GitHub/deployment.\nProject directory: ${record.dir}\nExisting inspection: ${JSON.stringify(inspect(record.dir))}\nTask: ${String(task || record.task).slice(0, 12000)}`
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
            { role: 'system', content: 'Repair the malformed planner response into exactly one valid JSON object. Each steps[].action must be exactly one of write_file, mkdir, install, build, test, or shell; choose one value, never copy an alternatives list into the field. Use separate path, contentBase64, and command fields. Preserve the original plan and every value; do not invent or omit steps. Return JSON only, with all strings correctly escaped, no comments, no trailing commas, and no Markdown fences.' },
            { role: 'user', content: `Original project task: ${String(task || record.task).slice(0, 4000)}\nMalformed planner response:\n${String(result.text || '').slice(-18000)}` }
        ], {
            timeout: 45000,
            maxChars: 22000,
            onProviderProgress: progress => notifyProgress(options, { phase: 'planner_json_recovery_provider', ...progress })
        })
        if (!recovery.success) return { success: false, error: `Planner returned malformed JSON; format recovery failed: ${recovery.error}` }
        parsed = parsePlannerJson(recovery.text)
        if (!parsed.success) {
            await notifyProgress(options, { phase: 'planner_json_local_repair' })
            parsed = parsePlannerJson(recovery.text, true)
        }
        if (!parsed.success) {
            await notifyProgress(options, { phase: 'planner_json_regeneration' })
            const regeneration = await xcasper.chat([
                { role: 'system', content: `${prompt}\nThe previous response could not be parsed. Discard it and create a fresh plan from scratch. Return one compact, valid JSON object only, with no Markdown or explanations. Include only the steps needed to complete the task.` },
                { role: 'user', content: `Generate a fresh valid plan for this task. Previous local JSON repair error: ${parsed.error.message}\nTask: ${String(task || record.task).slice(0, 4000)}\nCurrent project inspection: ${JSON.stringify(inspect(record.dir))}` }
            ], {
                timeout: 45000,
                maxChars: 24000,
                onProviderProgress: progress => notifyProgress(options, { phase: 'planner_json_regeneration_provider', ...progress })
            })
            if (!regeneration.success) return { success: false, error: `Planner JSON remained invalid after local recovery; fresh plan generation failed: ${regeneration.error}` }
            parsed = parsePlannerJson(regeneration.text)
            if (!parsed.success) parsed = parsePlannerJson(regeneration.text, true)
            if (!parsed.success) return { success: false, error: `Planner JSON remained invalid after fresh plan generation: ${parsed.error.message}` }
        }
    }
    const plan = parsed.value
    if (!Array.isArray(plan.steps) || !plan.steps.length) return { success: false, error: 'Planner returned no steps.' }
    await notifyProgress(options, { phase: 'planning_complete', provider: result.provider })
    plan.steps = plan.steps.slice(0, 40).map(step => {
        const rawAction = String(step.action || '').trim().toLowerCase()
        const combinedPath = rawAction.match(/^(mkdir|write_file)\s*,\s*(.+)$/)
        const actionAlternatives = rawAction.split('|').map(value => value.trim())
        const contentProvided = Boolean(step.contentBase64 || (typeof step.content === 'string' && step.content.length))
        const chosenFileAction = actionAlternatives.length === 2 && actionAlternatives.includes('write_file') && actionAlternatives.includes('mkdir')
            ? contentProvided ? 'write_file' : 'mkdir'
            : null
        const pathValue = typeof step.path === 'string' && step.path.trim() ? step.path.trim() : combinedPath?.[2]?.trim()
        return {
            ...step,
            action: rawAction === 'git init' ? 'git_init' : combinedPath?.[1] || chosenFileAction || rawAction,
            ...(pathValue ? { path: pathValue } : {}),
            content: step.contentBase64 && !step.content
                ? Buffer.from(String(step.contentBase64).replace(/\s+/g, ''), 'base64').toString('utf8')
                : step.content
        }
    })
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
        return installProjectDependencies(info.manager, root, options.timeout || 180000)
    }
    if (action === 'build' || action === 'test') {
        const info = inspect(root)
        const cmd = action === 'build' ? info.buildCommand : info.testCommand
        if (!cmd) return { success: true, output: `${action} script not defined; skipped.` }
        return command(cmd, root, options.timeout || 180000)
    }
    if (action === 'shell') {
        const raw = String(step.command || '')
        const packageCommand = safePackageManagerCommand(raw)
        if (packageCommand?.script && !inspect(root).scripts[packageCommand.script]) {
            return { success: true, output: `${packageCommand.script} script not defined; skipped.` }
        }
        if (packageCommand) return runSafePackageManagerCommand(packageCommand, root, options.timeout || 120000)
        if (!options.allowShell && options.skipUnapprovedShell) {
            await notifyProgress(options, { phase: 'shell_skipped' })
            return { success: true, output: 'Skipped an unapproved planner shell command; managed install/build/test checks will run during validation.' }
        }
        if (!options.allowShell) return { success: false, output: 'Shell execution requires allowShell=true; only allowlisted package-manager commands run without it.' }
        if (!/^(npm|pnpm|yarn|node|python3|pytest|git)\b/.test(raw)) return { success: false, output: 'Only approved development commands are allowed.' }
        return command(raw, root, options.timeout || 120000)
    }
    if (action === 'git_init') return { success: true, output: 'Deferred git init to Bera’s local checkpoint after validation.' }
    return { success: false, output: `Unknown plan action: ${action}` }
}

const repair = async (record, failure, options) => {
    if ((record.repairs || []).length >= (options.maxRepairs ?? 2)) return { success: false, error: 'Repair limit reached.' }
    const context = `Project task: ${record.task}\nFailure output:\n${String(failure).slice(-10000)}\nProject inspection:\n${JSON.stringify(inspect(record.dir))}`
    const repairPrompt = 'You are a senior software repair planner. Return one valid JSON object only: {"steps":[{"action":"write_file","path":"relative path from the project root","contentBase64":"base64 file content with no line breaks"}],"reason":"..."}. Every step action MUST be exactly one of "write_file", "build", "test", or "install"; choose one value and never put alternatives, pipes, or lists in action. When validation says there is no runnable application entrypoint, the repair MUST write a complete root-level index.html with <!doctype html>, <html>, <body>, and a meaningful <main> section, or a root package.json with a working start/build script and its root application entrypoint. Do not write only src/index.html, a bare doctype, or placeholder content. Do not create an extra project/project_root wrapper directory. Use contentBase64 for source files, never a literal content field. Never delete files or use secrets.'
    const result = await xcasper.chat([{ role: 'system', content: repairPrompt }, { role: 'user', content: context }], {
        timeout: 45000,
        maxChars: 20000,
        onProviderProgress: progress => notifyProgress(options, { phase: 'repair_provider', ...progress })
    })
    if (!result.success) return { success: false, error: result.error }
    let parsed = parsePlannerJson(result.text)
    if (!parsed.success) {
        await notifyProgress(options, { phase: 'repair_json_recovery' })
        const recovery = await xcasper.chat([
            { role: 'system', content: 'Convert the malformed repair-planner response into exactly one valid JSON object with a non-empty steps array. Preserve the proposed repair steps and values. Each steps[].action must be exactly one of write_file, build, test, or install. Do not invent additional work, add explanations, or use Markdown fences. Return JSON only.' },
            { role: 'user', content: `Repair context:\n${context}\nMalformed repair response:\n${String(result.text || '').slice(-18000)}` }
        ], {
            timeout: 45000,
            maxChars: 20000,
            onProviderProgress: progress => notifyProgress(options, { phase: 'repair_json_recovery_provider', ...progress })
        })
        if (recovery.success) {
            parsed = parsePlannerJson(recovery.text)
            if (!parsed.success) {
                await notifyProgress(options, { phase: 'repair_json_local_repair' })
                parsed = parsePlannerJson(recovery.text, true)
            }
        } else {
            parsed = parsePlannerJson(result.text, true)
        }
    }
    if (!parsed.success) {
        await notifyProgress(options, { phase: 'repair_json_regeneration' })
        const regeneration = await xcasper.chat([
            { role: 'system', content: `${repairPrompt}\nThe previous repair response could not be parsed. Discard it and generate a fresh repair plan from the current failure and project inspection. Return one compact valid JSON object only.` },
            { role: 'user', content: `${context}\nPrevious repair JSON error: ${parsed.error.message}` }
        ], {
            timeout: 45000,
            maxChars: 20000,
            onProviderProgress: progress => notifyProgress(options, { phase: 'repair_json_regeneration_provider', ...progress })
        })
        if (regeneration.success) {
            parsed = parsePlannerJson(regeneration.text)
            if (!parsed.success) parsed = parsePlannerJson(regeneration.text, true)
        } else {
            return { success: false, error: `Repair planner returned invalid JSON and fresh repair generation failed: ${regeneration.error}` }
        }
    }
    if (!parsed.success) return { success: false, error: `Repair planner returned invalid JSON after recovery: ${parsed.error.message}` }
    const plan = parsed.value
    if (!Array.isArray(plan.steps) || !plan.steps.length) return { success: false, error: 'Repair planner returned no actionable steps.' }
    const normalizedSteps = []
    for (const [index, rawStep] of plan.steps.slice(0, 10).entries()) {
        const rawAction = String(rawStep.action || '').trim().toLowerCase()
        const actionOptions = rawAction.split('|').map(value => value.trim())
        const hasContent = Boolean(rawStep.contentBase64 || (typeof rawStep.content === 'string' && rawStep.content.length))
        const action = actionOptions.length === 1
            ? actionOptions[0]
            : hasContent && actionOptions.includes('write_file') ? 'write_file' : ''
        if (!['write_file', 'build', 'test', 'install'].includes(action)) {
            return { success: false, error: `Repair planner returned an unsupported or ambiguous action at step ${index + 1}.` }
        }
        const step = {
            ...rawStep,
            action,
            content: rawStep.contentBase64 && !rawStep.content
                ? Buffer.from(String(rawStep.contentBase64).replace(/\s+/g, ''), 'base64').toString('utf8')
                : rawStep.content
        }
        if (action === 'write_file' && (!String(step.path || '').trim() || typeof step.content !== 'string' || !step.content.length)) {
            return { success: false, error: `Repair planner returned an incomplete write_file step at step ${index + 1}.` }
        }
        if (action === 'write_file' && !inside(record.dir, path.resolve(record.dir, step.path))) {
            return { success: false, error: `Repair planner requested a path outside the project workspace at step ${index + 1}.` }
        }
        normalizedSteps.push(step)
    }
    record.repairs.push({ at: now(), reason: plan.reason || 'automatic repair', failure: String(failure).slice(-3000) })
    update(record, { stage: 'repairing', status: 'repairing' })
    for (const step of normalizedSteps) {
        const result = await executeStep(record, step, options)
        if (!result.success) return { success: false, error: result.output }
    }
    if (/No runnable application entrypoint found at the project root/i.test(String(failure))) {
        const rootEntrypoints = new Set(['index.html', 'package.json', 'index.js', 'server.js', 'app.js', 'main.py', 'app.py'])
        const writesRootEntrypoint = normalizedSteps.some(step => {
            if (step.action !== 'write_file') return false
            const relative = path.relative(record.dir, path.resolve(record.dir, step.path))
            return rootEntrypoints.has(relative)
        })
        if (!writesRootEntrypoint) return { success: false, error: 'Repair plan did not include a root-level runnable entrypoint.' }
    }
    update(record, { stage: 'repairing', status: 'repairing' })
    return { success: true }
}

const validate = async (record, options = {}) => {
    const info = inspect(record.dir)
    const entrypoint = checkProjectEntrypoint(record.dir, info)
    const checks = [entrypoint]
    if (entrypoint.success) {
        if (entrypoint.rootScript) checks.push({ name: 'javascript-syntax', ...(await command(`node --check ${JSON.stringify(entrypoint.rootScript)}`, record.dir, options.syntaxTimeout || 30000)) })
        if (entrypoint.pythonEntrypoint) checks.push({ name: 'python-syntax', ...(await command(`python3 -m py_compile ${JSON.stringify(entrypoint.pythonEntrypoint)}`, record.dir, options.syntaxTimeout || 30000)) })
        if (info.manager) checks.push({ name: 'install', ...(await installProjectDependencies(info.manager, record.dir, options.installTimeout || 180000)) })
        if (info.buildCommand) checks.push({ name: 'build', ...(await command(info.buildCommand, record.dir, options.buildTimeout || 180000)) })
        if (info.testCommand) checks.push({ name: 'test', ...(await command(info.testCommand, record.dir, options.testTimeout || 120000)) })
    }
    record.checks = checks
    const success = checks.length > 0 && checks.every(c => c.success)
    update(record, { stage: success ? 'validated' : 'validation_failed', status: success ? 'validated' : 'validation_failed' })
    return { success, checks }
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
    let repairError = null
    for (let attempt = 0; !validation.success && attempt < (options.maxRepairs ?? 2); attempt++) {
        await notifyProgress(options, { phase: 'repair', attempt: attempt + 1, total: options.maxRepairs ?? 2 })
        const fixed = await repair(record, validation.checks.filter(c => !c.success).map(c => c.output).join('\n'), options)
        if (!fixed.success) { repairError = fixed.error || 'Automatic repair failed.'; continue }
        validation = await validate(record, options)
        repairError = validation.success ? null : `Repair steps ran but validation still fails: ${validation.checks.filter(check => !check.success).map(check => check.output).join('\n')}`
    }
    if (!validation.success) {
        update(record, { status: 'failed', stage: 'validation_failed' })
        return { success: false, ...(repairError ? { error: `Automatic repair failed: ${repairError}` } : {}), validation, record }
    }
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

module.exports = { run, create, get, list: userId => Object.values(load().projects).filter(p => !userId || p.userId === userId), inspect, makePlan, executeStep, safePackageManagerCommand, validate, checkpoint, previewStart, previewStop, screenshot }
