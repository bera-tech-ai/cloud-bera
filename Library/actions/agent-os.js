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
const pathWithPackageManagers = () => {
    // A service manager can start the bot with a minimal PATH that lacks
    // the package managers (npm lives beside node, or in a tool bin dir),
    // which made validation fail with "npm: not found" for good projects.
    // Prepend any candidate dir that actually contains npm.
    const parts = String(process.env.PATH || '').split(':').filter(Boolean)
    const candidates = [path.dirname(process.execPath), '/opt/hatch-image/bin', '/usr/local/bin', '/opt/homebrew/bin']
    for (const dir of candidates) {
        if (parts.includes(dir)) continue
        try { if (fs.existsSync(path.join(dir, 'npm'))) parts.unshift(dir) } catch {}
    }
    return parts.join(':')
}
const packageManagerEnv = () => ({
    ...process.env,
    PATH: pathWithPackageManagers(),
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
// ── Database mirror (the database is the global store) ──────────────────────
// The JSON file stays as a local cache/fallback, but every save also mirrors
// the state into global.db.data.agentOsState (db.write() throttled — builds
// save often). On load the DB copy WINS when present; when it is absent the
// file is loaded and becomes the migration source the first save uploads.
// Without global.db (tests, child processes) this degrades to file-only.
const DB_STATE_KEY = 'agentOsState'
let _dbWriteTimer = null
const _mirrorToDb = state => {
    try {
        if (!global.db?.data || typeof global.db.write !== 'function') return
        global.db.data[DB_STATE_KEY] = JSON.parse(JSON.stringify(state))
        if (_dbWriteTimer) return
        _dbWriteTimer = setTimeout(() => {
            _dbWriteTimer = null
            try { Promise.resolve(global.db.write()).catch(() => {}) } catch {}
        }, 1500)
        _dbWriteTimer.unref?.()
    } catch {}
}
const _stateFromDb = () => {
    try {
        const s = global.db?.data?.[DB_STATE_KEY]
        if (s && typeof s === 'object' && s.projects && typeof s.projects === 'object') {
            return JSON.parse(JSON.stringify(s))
        }
    } catch {}
    return null
}
const load = () => {
    const fromDb = _stateFromDb()
    if (fromDb) return fromDb
    try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) } catch { return { projects: {}, events: [] } }
}
const save = state => { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); _mirrorToDb(state) }
const update = (record, patch) => { Object.assign(record, patch, { updatedAt: now() }); if (!record?.id) return record; const s = load(); s.projects[record.id] = record; save(s); return record }
const projectRoot = (userId, name) => path.join(getUserWorkspace(userId), 'projects', safe(name))
const inside = (root, target) => { const r = path.resolve(root), t = path.resolve(target); return t === r || t.startsWith(`${r}${path.sep}`) }

const command = async (cmd, cwd, timeout = 120000) => {
    try {
        const r = await execFileAsync('/bin/sh', ['-lc', cmd], { cwd, timeout, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, PATH: pathWithPackageManagers() } })
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
    // A package.json start script only counts as an entrypoint when the
    // file it names actually exists. EduTrack rebuild #11 "passed" with a
    // two-step plan (package.json + mkdir data) because the declaration
    // alone was trusted — the app was an empty shell that then deployed.
    const startTarget = (() => {
        // info.startCommand is normalised to "npm start" — the file the
        // script actually runs lives in package.json's own script text.
        let scriptText = ''
        try {
            const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
            scriptText = String(pkg?.scripts?.start || pkg?.scripts?.dev || '')
        } catch {}
        const m = scriptText.match(/(?:^|\s)node\s+(?:--\S+\s+)*([^\s&;|]+\.js)\b/) || scriptText.match(/([^\s&;|]+\.js)\b/)
        return m ? m[1] : null
    })()
    const startTargetExists = !startTarget || (() => { try { const s = fs.statSync(path.join(dir, startTarget)); return s.isFile() && s.size > 0 } catch { return false } })()
    const packageApp = Boolean(info.manager && (info.startCommand || info.buildCommand)) && startTargetExists
    const success = staticSite || packageApp || Boolean(rootScript) || Boolean(pythonEntrypoint)
    return {
        name: 'project-entrypoint',
        success,
        output: success
            ? 'Found a non-empty application entrypoint at the project root.'
            : startTarget && !startTargetExists
                ? `package.json starts ${startTarget} but that file does not exist in the project — the plan never wrote it. Write the complete ${startTarget} file with the full application.`
                : 'No runnable application entrypoint found at the project root. Add a real root index.html, a package.json with a start/build script, or a root index.js/server.js/app.js/main.py/app.py file; do not hide the application inside an extra project/ or project_root/ folder.',
        rootScript: rootScript || (startTargetExists ? startTarget : null),
        pythonEntrypoint: pythonEntrypoint || null
    }
}

const escapeHtml = value => String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
const fallbackStaticSite = record => {
    const displayName = String(record.name || 'Bera Project').replace(/[-_]+/g, ' ').replace(/\b[a-z]/g, letter => letter.toUpperCase())
    const task = String(record.task || '')
    const safeName = escapeHtml(displayName)
    if (/portfolio/i.test(`${record.name || ''} ${task}`)) {
        const owner = escapeHtml(displayName.replace(/\s+portfolio$/i, '').replace(/\s+s$/i, '').trim() || 'Your Name')
        return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Personal portfolio for ${owner}"><title>${safeName}</title>
  <style>
    :root{color-scheme:light;--ink:#18231f;--muted:#62716a;--green:#176b52;--paper:#f5f7f2;--line:#dce5de}*{box-sizing:border-box}body{margin:0;font:16px/1.6 system-ui,sans-serif;color:var(--ink);background:var(--paper)}header,main,footer{width:min(1040px,calc(100% - 40px));margin:auto}header{display:flex;justify-content:space-between;align-items:center;padding:24px 0}header strong{font-size:1.1rem}nav{display:flex;gap:20px}a{color:var(--green);text-decoration:none}.hero{padding:90px 0 76px}.eyebrow{color:var(--green);font-weight:700;letter-spacing:.1em;text-transform:uppercase}.hero h1{max-width:760px;font-size:clamp(2.6rem,8vw,5.5rem);line-height:1.02;letter-spacing:-.05em;margin:14px 0}.hero p,.about p{max-width:650px;color:var(--muted);font-size:1.1rem}.button{display:inline-block;margin-top:16px;padding:12px 20px;border-radius:999px;background:var(--green);color:white}.section{padding:44px 0;border-top:1px solid var(--line)}.section h2{font-size:2rem;margin:0 0 18px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card{padding:22px;border:1px solid var(--line);border-radius:18px;background:white}.card h3{margin-top:0}.contact{padding-bottom:80px}@media(max-width:650px){header{align-items:flex-start;gap:12px;flex-direction:column}nav{gap:14px;flex-wrap:wrap}.hero{padding:58px 0}.grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <header><strong>${safeName}</strong><nav aria-label="Main navigation"><a href="#about">About</a><a href="#projects">Projects</a><a href="#contact">Contact</a></nav></header>
  <main>
    <section class="hero"><div class="eyebrow">Portfolio</div><h1>Hi, I’m ${owner}. I make thoughtful things for the web.</h1><p>A little about me, a few projects I’m proud of, and an easy way to get in touch.</p><a class="button" href="#projects">Explore my work</a></section>
    <section class="section about" id="about"><h2>About Me</h2><p>I’m ${owner}, a curious and creative builder who enjoys turning ideas into useful, welcoming experiences. This portfolio is a starting point—replace this text with your own story, skills, and interests.</p></section>
    <section class="section" id="projects"><h2>Selected Projects</h2><div class="grid"><article class="card"><h3>Project One</h3><p>A short description of a project, what it does, and the tools used to build it.</p></article><article class="card"><h3>Project Two</h3><p>A second example highlighting a problem solved or an idea brought to life.</p></article><article class="card"><h3>Project Three</h3><p>A third project. Add a screenshot, a link, or a few details about your contribution.</p></article></div></section>
    <section class="section contact" id="contact"><h2>Let’s connect</h2><p>Have a project or opportunity in mind? I’d be happy to hear from you.</p><a class="button" href="mailto:hello@example.com">hello@example.com</a></section>
  </main><footer><p>© ${new Date().getFullYear()} ${owner}. Built with care.</p></footer>
</body>
</html>`
    }
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safeName}</title><style>body{margin:0;font:16px/1.6 system-ui,sans-serif;background:#f5f7f2;color:#18231f}main{max-width:900px;margin:12vh auto;padding:32px}h1{font-size:clamp(2.5rem,8vw,5rem);line-height:1.05}p{max-width:650px;color:#52615a;font-size:1.15rem}section{padding:24px 0;border-top:1px solid #dce5de}</style></head><body><main><section><p>Welcome</p><h1>${safeName}</h1><p>A starting point for your project. Add your own details and content to make it yours.</p></section><section><h2>About</h2><p>This is a starter template. The design you asked for could not be generated this time — ask Bera AI to rebuild it with the details you want.</p></section><section><h2>Contact</h2><p>Replace this with your preferred contact details.</p></section></main></body></html>`
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
    const prompt = `You are the planning layer of Bera AI. Create a safe, executable software-project plan.\nReturn JSON only with this shape: {"summary":"...","steps":[{"action":"write_file","path":"relative path","brief":"detailed description of exactly what the file must contain","command":"...","reason":"..."}]}. The action value shown is an example, not a literal for every step.\nRules: each action must be exactly one of write_file, mkdir, install, build, test, shell; never put a list, pipe, or path in action. Put every relative path only in path. All application files must be relative to the project directory below; do not create an extra project/project_root wrapper folder. Use conventional paths such as src/ only beneath that root. Create a real runnable app, not placeholder text. For write_file steps, never include file content or contentBase64; instead give a detailed, self-contained brief describing exactly what that file must contain (every section, with the real names, prices and text to use) — each file is generated separately from its brief. Prefer few files: for a website, one complete root index.html with inline CSS and JS is best. Write real content for every section the task asks for (real names, real prices, real text) — never placeholder, lorem ipsum, or "add your own content" text, and never copy the task/request text into the page. A website must include a root index.html or a package.json with a working start/build script and its application entrypoint. Stack contract for ANY server app or system: the plan MUST include a package.json at the project ROOT whose start script runs a server entrypoint file that is ALSO at the project ROOT (server.js) — never put the only entrypoint inside src/. SINGLE-FILE BACKEND RULE: put ALL backend code in that one root server.js — every route, middleware, helper and the data access live in that file; store data in a JSON file under data/ (or in memory). Never split the backend into src/, routes/, models/, controllers/ or middleware/ files, and never require a relative path that is not a file the plan itself creates at exactly that path — multi-file backends generated file-by-file disagree about paths and crash on boot (Cannot find module). Static frontend files (public/*.html/css/js) may be separate. Use ONLY plain Node.js (built-in http or Express) with static HTML/CSS/JS; never use Vue, React, Angular, Svelte, TypeScript, .vue/.jsx/.tsx files, SQL schema files, bundlers, or any build/compilation step — the app is deployed exactly as written. Never invent deployment tools or commands (no surf, vercel, netlify, or firebase CLIs). Dependency versions: only use real, well-known versions (express ^4.19.2, dotenv ^16.4.5, cors ^2.8.5); never invent a version number — if unsure, use "*" as the version. Only list dependencies the code actually imports, and only packages that really exist on npm (express, dotenv, cors, morgan, bcrypt, jsonwebtoken and similar well-known ones); never invent package names. All .js files use CommonJS (require/module.exports) — never ESM import/export syntax. Do not plan test files or a test script unless the task explicitly asks for tests. Do not use secrets or delete files; prefer write_file for source changes; use shell only for one standalone npm/pnpm/yarn install/add or build/test command, never chain commands or use node, python, or git. Do not create Git repositories, run git init/add/commit/push, configure remotes, or deploy; Bera handles its local checkpoint after validation and requires separate approval for GitHub/deployment.\nProject directory: ${record.dir}\nExisting inspection: ${JSON.stringify(inspect(record.dir))}\nTask: ${String(task || record.task).slice(0, 12000)}`
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
            { role: 'system', content: 'Repair the malformed planner response into exactly one valid JSON object. Each steps[].action must be exactly one of write_file, mkdir, install, build, test, or shell; choose one value, never copy an alternatives list into the field. Use separate path, brief, and command fields. Preserve the original plan and every value; do not invent or omit steps. Return JSON only, with all strings correctly escaped, no comments, no trailing commas, and no Markdown fences.' },
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
    // A syntactically valid plan with ZERO steps used to fail the build
    // outright ("Planner returned no steps" — seen live, Kings Kutz,
    // 2026-11-26). Give it the same fresh-generation recovery that
    // malformed JSON gets before giving up.
    if (parsed.success && (!Array.isArray(parsed.value?.steps) || !parsed.value.steps.length)) {
        await notifyProgress(options, { phase: 'planner_empty_regeneration' })
        const regeneration = await xcasper.chat([
            { role: 'system', content: `${prompt}\nThe previous plan contained no steps at all. Create a fresh plan with concrete steps: for a website, at minimum one write_file step for a complete root index.html (with a detailed brief carrying the real content). Return one compact, valid JSON object only.` },
            { role: 'user', content: `Generate a fresh plan with real steps for this task: ${String(task || record.task).slice(0, 4000)}\nCurrent project inspection: ${JSON.stringify(inspect(record.dir))}` }
        ], {
            timeout: 45000,
            maxChars: 24000,
            onProviderProgress: progress => notifyProgress(options, { phase: 'planner_empty_regeneration_provider', ...progress })
        })
        if (regeneration.success) {
            let reparsed = parsePlannerJson(regeneration.text)
            if (!reparsed.success) reparsed = parsePlannerJson(regeneration.text, true)
            if (reparsed.success && Array.isArray(reparsed.value?.steps) && reparsed.value.steps.length) parsed = reparsed
        }
    }
    // Planners sometimes return the step list under a different key
    // (plan/actions/tasks) — accept those shapes instead of reading
    // them as an empty plan.
    if (parsed.success && parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value.steps)) {
        for (const key of ['plan', 'actions', 'tasks', 'items', 'files']) {
            const arr = parsed.value[key]
            if (Array.isArray(arr) && arr.length && arr.some(x => x && typeof x === 'object' && ('action' in x || 'path' in x || 'brief' in x))) {
                parsed = { ...parsed, value: { ...parsed.value, steps: arr } }
                break
            }
        }
    }
    // Last resort (seen live 2026-11-26: Kitee Coffee returned an empty
    // plan twice in a row, regeneration included): synthesize the
    // standard minimal plan deterministically. The per-file generator
    // still writes real content from the task + these briefs, so the
    // build proceeds instead of dying at the planning stage.
    if (parsed.success && (!Array.isArray(parsed.value?.steps) || !parsed.value.steps.length)) {
        await notifyProgress(options, { phase: 'planner_fallback_plan' })
        const taskText = String(task || record.task || '')
        const wantsServer = /\b(api|server|backend|express|node\.?js|dashboard|login|sign[ -]?in|database|booking system|crud)\b/i.test(taskText)
        const steps = wantsServer
            ? [
                { action: 'write_file', path: 'package.json', brief: 'Root package.json for the app described in the project task: name, main server.js, start script "node server.js", and only the well-known dependencies the server code imports (express if needed).' },
                { action: 'write_file', path: 'server.js', brief: 'The complete single-file backend for the app described in the project task: plain CommonJS Node (Express if the task implies it), every route the task needs, data stored in a JSON file under data/ or in memory, serves the static frontend from public/, listens on process.env.PORT.' },
                { action: 'write_file', path: 'public/index.html', brief: 'The complete frontend page for the app described in the project task: one self-contained HTML file with inline CSS and JS implementing every section and feature the task asks for, with the real names, prices and text from the task.' }
            ]
            : [
                { action: 'write_file', path: 'index.html', brief: 'A complete, responsive one-page website for exactly what the project task describes: one self-contained HTML file with inline CSS and JS, every section the task asks for, with the real names, prices and text from the task. No placeholder content.' }
            ]
        parsed = { success: true, value: { summary: 'Deterministic fallback plan (planner returned no steps).', steps, planFallback: true } }
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

const cleanGeneratedFile = (text, filePath, forContinuation = false) => {
    let value = String(text || '').trim()
    const fence = value.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n?```$/)
    if (fence) value = fence[1].trim()
    // Xcasper sometimes rewrites URLs as Markdown links: [https://x](https://x)
    value = value.replace(/\[((?:https?:\/\/)[^\]\s]+)\]\(\1\)/g, '$1')
    if (!forContinuation && /\.html?$/i.test(String(filePath || '')) && value && !value.startsWith('<')) {
        const firstTag = value.indexOf('<')
        if (firstTag > 0) value = value.slice(firstTag).trim()
    }
    return value
}

const trimOverlap = (existing, chunk) => {
    const max = Math.min(240, existing.length, chunk.length)
    for (let len = max; len >= 24; len--) {
        if (existing.slice(-len) === chunk.slice(0, len)) return chunk.slice(len)
    }
    return chunk
}

const generateFileContent = async (record, step, options = {}) => {
    const brief = String(step.brief || step.reason || '').trim()
    const isHtml = /\.html?$/i.test(String(step.path || ''))
    const ask = prompt => xcasper.chat([{ role: 'user', content: prompt }], {
        timeout: 90000,
        providerTimeout: 90000,
        maxChars: 8000,
        onProviderProgress: progress => notifyProgress(options, { phase: 'file_provider', ...progress })
    })
    const finishHtml = value => {
        const idx = value.search(/<\/html>/i)
        return idx >= 0 ? value.slice(0, idx + 7) : null
    }
    const promptLines = [
        `Write the complete file "${step.path}" for this project.`,
        `Project task: ${String(record.task || '').slice(0, 2000)}`,
        brief ? `File brief: ${brief}` : 'The file must fully serve the project task.',
        'Write real content (real names, prices and text) — never placeholder or lorem ipsum, and never copy the task text into the file.',
        isHtml ? null : 'Use plain CommonJS (require/module.exports) — never ESM import/export syntax.',
        'Return ONLY the complete file content: no explanations, no Markdown fences.'
    ].filter(Boolean)
    const first = await ask(promptLines.join('\n'))
    if (!first.success) return { success: false, error: `File generation failed for ${step.path}: ${first.error}` }
    let text = cleanGeneratedFile(first.text, step.path)
    if (!text) return { success: false, error: `File generation returned empty content for ${step.path}.` }
    if (text.includes('\uFFFD')) {
        // Providers occasionally return encoding-damaged text (a file that
        // starts with a replacement character can never parse). One clean
        // retry; after that, fail the step so the repair loop rewrites it.
        const retry = await ask([...promptLines, 'Important: output clean UTF-8 text only, with no corrupted or replacement characters.'].join('\n'))
        if (retry.success) {
            const retryText = cleanGeneratedFile(retry.text, step.path)
            if (retryText && !retryText.includes('\uFFFD')) text = retryText
        }
        if (text.includes('\uFFFD')) return { success: false, error: `File generation for ${step.path} returned corrupted text (invalid characters) twice.` }
    }
    if (!isHtml) return { success: true, text }
    const finished = finishHtml(text)
    if (finished) return { success: true, text: finished }
    // Providers cut long files off mid-stream. Ask for continuations and
    // append them until the file actually reaches </html>, instead of
    // writing a page that stops halfway through its own stylesheet.
    for (let attempt = 0; attempt < 4; attempt++) {
        const next = await ask([
            `Continue writing the file "${step.path}" for this project. It was cut off mid-stream.`,
            `Project task: ${String(record.task || '').slice(0, 2000)}`,
            brief ? `File brief: ${brief}` : null,
            'The file so far ends with these exact characters:',
            '---',
            text.slice(-600),
            '---',
            'Continue EXACTLY from those characters. Do not repeat anything already written, do not explain, and do not use Markdown fences. Output only the continuation, and finish the file completely (end with </html>).'
        ].filter(Boolean).join('\n'))
        if (!next.success) return { success: false, error: `File generation for ${step.path} was cut off and the continuation failed: ${next.error}` }
        const chunk = cleanGeneratedFile(next.text, step.path, true)
        if (!chunk) return { success: false, error: `File generation for ${step.path} returned an empty continuation.` }
        text += trimOverlap(text, chunk)
        const done = finishHtml(text)
        if (done) return { success: true, text: done }
    }
    return { success: false, error: `File generation for ${step.path} stayed incomplete after several continuations (no closing </html> tag).` }
}

// Make a generated package.json start script honour the host-assigned PORT
// env var instead of a hardcoded port. http-server ignores PORT unless -p is
// passed, so a missing flag is added for it; serve reads PORT natively and is
// left alone. Returns the original text when nothing needs changing.
// Generators routinely invent dependency versions that do not exist
// (express@^17 was written for EduTrack — npm answered ETARGET and the
// whole build died). Two defences: cap absurd majors for packages whose
// real version line is well known, and — for anything else — rewrite the
// exact package npm rejected to "*" and re-validate (fixUnresolvableDependencies).
const DEPENDENCY_MAJOR_CAPS = { express: [5, '^4.19.2'], 'socket.io': [4, '^4.7.5'], dotenv: [16, '^16.4.5'], cors: [2, '^2.8.5'], morgan: [1, '^1.10.0'], nodemon: [3, '^3.1.0'], 'passport-jwt': [4, '^4.0.1'] }
const sanitizeDependencyVersions = pkg => {
    let changed = false
    for (const field of ['dependencies', 'devDependencies']) {
        for (const [name, range] of Object.entries(pkg?.[field] || {})) {
            const cap = DEPENDENCY_MAJOR_CAPS[name]
            if (!cap || typeof range !== 'string') continue
            const major = Number(range.replace(/^[^0-9]*/, '').split('.')[0])
            if (Number.isFinite(major) && major > cap[0]) { pkg[field][name] = cap[1]; changed = true }
        }
    }
    return changed
}
const fixUnresolvableDependencies = (record, failureText) => {
    const text = String(failureText || '')
    // ETARGET: the package exists, the version does not → relax to "*".
    const versionMisses = [...text.matchAll(/No matching version found for ([^@\s]+)@/g)].map(match => match[1])
    // E404: the package does not exist on npm at all (invented names like
    // "minimalistic-serverless-php-sdk-lambda") → "*" cannot help; the only
    // heal is removing it. If the code truly imports it, the app could not
    // run anyway — the package does not exist in the world.
    const missing = [...text.matchAll(/'([^'@\s]+)@[^']*' is not in this registry/g)].map(match => match[1])
    if ((!versionMisses.length && !missing.length) || !record?.dir) return 0
    const pkgPath = path.join(record.dir, 'package.json')
    if (!fs.existsSync(pkgPath)) return 0
    let pkg
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) } catch { return 0 }
    let fixed = 0
    for (const field of ['dependencies', 'devDependencies']) {
        for (const name of versionMisses) {
            if (pkg?.[field]?.[name] && pkg[field][name] !== '*') { pkg[field][name] = '*'; fixed++ }
        }
        for (const name of missing) {
            if (pkg?.[field]?.[name]) { delete pkg[field][name]; fixed++ }
        }
    }
    if (fixed) {
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
        event(record, 'unresolvable_dependency_fixed', { versionMisses, missing })
    }
    return fixed
}

// Generated package.json files often arrive with no start script, or a
// main that points at a file the plan never wrote — the app then cannot be
// run or deployed even though its code is fine. Guarantee a start script
// that points at a real entrypoint file before validation.
const ensureStartScript = record => {
    try {
        const root = record.dir
        const pkgPath = path.join(root, 'package.json')
        if (!root || !fs.existsSync(pkgPath)) return null
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
        if (pkg?.scripts?.start) return null
        const candidates = [pkg?.main, 'server.js', 'index.js', 'app.js', 'main.js', 'src/server.js', 'src/index.js', 'src/app.js'].filter(Boolean)
        const entry = candidates.find(candidate => fs.existsSync(path.join(root, candidate)))
        if (!entry) return null
        pkg.main = entry
        pkg.scripts = { ...(pkg.scripts || {}), start: `node ${entry}` }
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
        event(record, 'start_script_synthesised', { entry })
        return entry
    } catch { return null }
}

// Deterministic entrypoint reconciliation: planners regularly write
// the entrypoint somewhere other than where package.json points
// (start says "node app.js", the file landed in src/app.js — seen live
// 2026-11-26, Kings Kutz run 3; the LLM repair kept missing it too).
// If the stated target is missing and exactly one plausible file
// exists, repoint package.json at the file that is actually there.
const reconcileEntrypoint = record => {
    try {
        const root = record.dir
        const pkgPath = path.join(root, 'package.json')
        if (!root || !fs.existsSync(pkgPath)) return null
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
        const start = String(pkg?.scripts?.start || '')
        const m = start.match(/(?:^|\s)node\s+(?:--\S+\s+)*([^\s&;|]+\.js)\b/) || (pkg?.main ? [null, pkg.main] : null)
        const target = m ? m[1] : null
        if (!target) return null
        if (fs.existsSync(path.join(root, target))) return null
        const wanted = path.basename(target)
        const found = []
        const walk = (dir, depth) => {
            if (depth > 3) return
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entry.name === 'node_modules' || entry.name === '.git') continue
                const full = path.join(dir, entry.name)
                if (entry.isDirectory()) walk(full, depth + 1)
                else if (entry.name === wanted) found.push(path.relative(root, full))
            }
        }
        walk(root, 0)
        // public/ holds static assets — a file there is never the server
        // entrypoint, even when it shares the name (a plan wrote both
        // public/js/app.js and src/app.js in one live build).
        const serverCandidates = found.filter(rel => !rel.startsWith('public/'))
        let candidate = serverCandidates.length === 1 ? serverCandidates[0] : null
        if (!candidate && serverCandidates.length > 1) {
            // Several same-named server files: the entrypoint is the one
            // that actually starts a server.
            candidate = serverCandidates.find(rel => {
                try { return /\.listen\(|createServer/.test(fs.readFileSync(path.join(root, rel), 'utf8')) } catch { return false }
            }) || null
        }
        if (!candidate) {
            const plausible = ['server.js', 'index.js', 'app.js', 'main.js', 'src/server.js', 'src/index.js', 'src/app.js', 'src/main.js']
                .filter(c => fs.existsSync(path.join(root, c)))
            if (plausible.length === 1) candidate = plausible[0]
        }
        if (!candidate) return null
        pkg.main = candidate
        pkg.scripts = { ...(pkg.scripts || {}), start: start ? start.replace(/[^\s&;|]+\.js/, candidate) : `node ${candidate}` }
        if (!/node\s/.test(pkg.scripts.start)) pkg.scripts.start = `node ${candidate}`
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
        event(record, 'entrypoint_reconciled', { from: target, to: candidate })
        return candidate
    } catch { return null }
}

const normalizePackageJsonStart = content => {
    let pkg
    try { pkg = JSON.parse(String(content || '')) } catch { return content }
    const depsChanged = sanitizeDependencyVersions(pkg)
    const start = pkg?.scripts?.start
    if (typeof start !== 'string' || !start) return depsChanged ? JSON.stringify(pkg, null, 2) : content
    let next = start
    let changed = false
    if (/\bhttp-server\b/.test(next)) {
        // http-server binds exactly the port it is told (3000 by default)
        // and dies with EADDRINUSE when that port is taken — on BeraHost's
        // shared host, 3000 is effectively always taken. serve reads the
        // PORT env var and switches to a free port when its default is
        // busy, which is the behaviour that survives there (proven live by
        // the tembea-safaris deployment). Swap the server, keep the path.
        const usesNpx = /(^|\s)npx\s+/.test(next)
        const afterServer = next.split(/\bhttp-server\b/)[1] || ''
        const pathArg = afterServer.trim().split(/\s+/).find(tok => tok && !tok.startsWith('-') && !/^\d+$/.test(tok)) || '.'
        next = usesNpx ? `npx serve ${pathArg}` : `serve ${pathArg}`
        changed = next !== start
        if (!usesNpx) {
            // The binary must come from the project's own dependencies.
            for (const field of ['dependencies', 'devDependencies']) {
                if (pkg[field]?.['http-server']) { delete pkg[field]['http-server']; pkg[field].serve = '^14.2.4'; changed = true }
            }
            if (!pkg.dependencies?.serve && !pkg.devDependencies?.serve) {
                pkg.dependencies = { ...(pkg.dependencies || {}), serve: '^14.2.4' }
                changed = true
            }
        }
    } else {
        next = start.replace(/(^|\s)(--port|-p|--listen|-l)(=|\s+)(\d+)\b/g, (m, pre, flag, sep, port) => `${pre}${flag}${sep}\${PORT:-${port}}`)
        changed = next !== start
    }
    if (!changed && !depsChanged) return content
    pkg.scripts.start = next
    return JSON.stringify(pkg, null, 2)
}

const executeStep = async (record, step, options = {}) => {
    const root = record.dir
    const action = step.action
    if (['write_file', 'mkdir'].includes(action)) {
        let target = path.resolve(root, step.path || '')
        if (!inside(root, target)) return { success: false, output: 'Blocked path outside project workspace.' }
        // Planners regularly emit extensionless module paths
        // ("src/database/models" for the models file). Left alone, that
        // either writes an extensionless blob or collides with a directory
        // of the same name and kills the step. Normalise to the file Node
        // would resolve anyway: models.js, or models/index.js when a
        // directory already sits there.
        if (action === 'write_file' && step.path) {
            const base = path.basename(step.path)
            if (!base.includes('.') && !/^(dockerfile|makefile|procfile|license)$/i.test(base)) {
                const asDir = fs.existsSync(target) && fs.statSync(target).isDirectory()
                step = { ...step, path: asDir ? `${step.path}/index.js` : `${step.path}.js` }
                target = path.resolve(root, step.path)
                if (!inside(root, target)) return { success: false, output: 'Blocked path outside project workspace.' }
            }
        }
        // Models sometimes copy the prompt's own placeholder ("relative
        // path from the project root") as the literal path — that created a
        // junk directory and then crashed the build with EISDIR when a
        // later step tried to write a file over it.
        if (!step.path || step.path.trim() === '.' || /relative[ _]path/i.test(step.path)) {
            return { success: false, output: `Invalid file path from the planner: "${step.path || ''}" is a placeholder, not a real path.` }
        }
        if (action === 'mkdir') {
            // Planners sometimes emit mkdir for a FILE path (mkdir
            // src/public/style.css — seen live 2026-11-26), creating a
            // directory that then blocks the real file write. File
            // writes create their parent directories anyway.
            if (/\.(html?|css|m?js|json|txt|md|svg|png|jpe?g|ico|xml|csv)$/i.test(step.path)) {
                return { success: true, output: `Skipped mkdir for file-like path ${step.path}; directories are created by file writes.` }
            }
            fs.mkdirSync(target, { recursive: true }); return { success: true, output: `Created ${step.path}` }
        }
        let content = typeof step.content === 'string' ? step.content : ''
        if (!content.trim()) {
            // Brief-based plans carry no file body: generate this one file
            // in its own AI call. (A single planner response holding every
            // file as base64 JSON is beyond what the providers return —
            // plans came back with empty or trivial steps.)
            const generated = await generateFileContent(record, step, options)
            if (!generated.success) return { success: false, output: generated.error }
            content = generated.text
        }
        if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
            // An empty directory squatting on a file path (left by a
            // stray mkdir step) is removed so the write can proceed; a
            // non-empty one is a real conflict and still fails.
            if (fs.readdirSync(target).length === 0) fs.rmdirSync(target)
            else return { success: false, output: `Cannot write a file over the directory ${step.path}; choose a file path inside it instead.` }
        }
        // Never let corrupted content overwrite a good file: providers and
        // repair steps occasionally return encoding-damaged or binary junk
        // (one repair wrote raw garbage over a valid package.json, which
        // then failed every later check with a package_json_reader error).
        if (content.includes('\uFFFD')) {
            // Provided content (usually a repair step's base64) arrived
            // encoding-damaged. Refusing outright used to spend the whole
            // repair round and fail the build (seen live 2026-11-26,
            // Kings Kutz: the repair for a syntax error was itself
            // corrupted). Regenerate this one file from a brief instead —
            // the generation path has its own clean-text retry, and
            // validation still judges the result.
            const regen = await generateFileContent(record, { ...step, brief: `Rewrite this file completely as clean UTF-8 text — the previous version was corrupted and contained errors. Produce the full, working file for the project task; any .js file must be valid plain CommonJS Node with no syntax errors.` }, options)
            if (!regen.success) return { success: false, output: `Refused to write ${step.path}: the content is corrupted (invalid characters), and regeneration failed: ${regen.error}` }
            content = regen.text
        }
        if (path.basename(target) === 'package.json') {
            try { JSON.parse(content) } catch (error) {
                // Providers sometimes append commentary or a second object
                // after the JSON. If the content's first balanced object
                // parses cleanly, write that instead of refusing the file
                // (rebuild #13 died on exactly this trailing junk).
                const start = content.indexOf('{')
                let extracted = null
                if (start >= 0) {
                    let depth = 0, inString = false, escaped = false
                    for (let i = start; i < content.length; i++) {
                        const ch = content[i]
                        if (inString) {
                            if (escaped) escaped = false
                            else if (ch === '\\') escaped = true
                            else if (ch === '"') inString = false
                            continue
                        }
                        if (ch === '"') inString = true
                        else if (ch === '{') depth++
                        else if (ch === '}') { depth--; if (depth === 0) { extracted = content.slice(start, i + 1); break } }
                    }
                }
                let recovered = false
                if (extracted) { try { JSON.parse(extracted); content = extracted; recovered = true } catch {} }
                if (!recovered) {
                    return { success: false, output: `Refused to write ${step.path}: not valid JSON (${error.message}).` }
                }
            }
        }
        try {
            fs.mkdirSync(path.dirname(target), { recursive: true })
            // Hosts like BeraHost assign the port (PORT env) and share it across
            // tenants: a generated start script that hardcodes a port
            // (http-server . -p 3000) dies with EADDRINUSE and the deployment
            // fails. Normalise package.json start scripts to honour $PORT.
            if (path.basename(target) === 'package.json') content = normalizePackageJsonStart(content)
            fs.writeFileSync(target, content)
        } catch (error) {
            return { success: false, output: `Writing ${step.path} failed: ${error.message}` }
        }
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
    // Unknown actions are SKIPPED, never fatal: planners mirror the
    // user's wording with invented actions (seen live 2026-11-26: a
    // request to "capture and send me a screenshot" produced a
    // download_screenshot step that failed the whole Kitee Coffee
    // build). Screenshots, publishing and deployment are handled by
    // the pipeline outside the plan; anything else unknown is not a
    // local build step. Validation still judges the real result.
    return { success: true, output: `Skipped unknown planner action: ${action} (not a local build step).` }
}

const repair = async (record, failure, options) => {
    if ((record.repairs || []).length >= (options.maxRepairs ?? 2)) return { success: false, error: 'Repair limit reached.' }
    const context = `Project task: ${record.task}\nFailure output:\n${String(failure).slice(-10000)}\nProject inspection:\n${JSON.stringify(inspect(record.dir))}`
    const repairPrompt = 'You are a senior software repair planner. Return one valid JSON object only: {"steps":[{"action":"write_file","path":"relative path from the project root","contentBase64":"base64 file content with no line breaks"}],"reason":"..."}. Every step action MUST be exactly one of "write_file", "mkdir", "build", "test", or "install"; choose one value and never put alternatives, pipes, or lists in action. The repair phase is local-only: never return deploy, publish, push, git, repository creation, or other external side-effect actions. Use mkdir only for a needed directory with a relative path. When validation says there is no runnable application entrypoint, the repair MUST write a complete root-level index.html with <!doctype html>, <html>, <body>, and a meaningful <main> section, or a root package.json with a working start/build script and its root application entrypoint. Do not write only src/index.html, a bare doctype, or placeholder content. Do not create an extra project/project_root wrapper directory. Use contentBase64 for source files, never a literal content field. Never delete files or use secrets. The project is plain CommonJS Node: never use ESM import syntax in .js files — use require/module.exports.'
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
            { role: 'system', content: 'Convert the malformed repair-planner response into exactly one valid JSON object with a non-empty steps array. Preserve the proposed repair steps and values. Each steps[].action must be exactly one of write_file, mkdir, build, test, or install. Do not invent additional work, add explanations, or use Markdown fences. Return JSON only.' },
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
    const externalActions = new Set(['deploy', 'publish', 'push', 'git', 'git_init', 'git_push', 'create_repo', 'create_repository', 'create_github_repo', 'github_push', 'deploy_to_berahost'])
    for (const [index, rawStep] of plan.steps.slice(0, 10).entries()) {
        const rawAction = String(rawStep.action || '').trim().toLowerCase()
        const normalizeAction = value => {
            const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
            if (['create_file', 'write', 'save_file'].includes(normalized)) return 'write_file'
            if (['npm_install', 'npm_i', 'install_dependencies'].includes(normalized)) return 'install'
            if (['npm_run_build', 'build_project', 'run_build'].includes(normalized)) return 'build'
            if (['npm_test', 'run_test', 'run_tests'].includes(normalized)) return 'test'
            return normalized
        }
        const allActionOptions = [...new Set(rawAction.split(/[|,]/).map(normalizeAction).filter(Boolean))]
        const blockedActions = allActionOptions.filter(action => externalActions.has(action))
        if (blockedActions.length) {
            await notifyProgress(options, { phase: 'repair_external_action_skipped', action: blockedActions.join(','), index: index + 1 })
        }
        const actionOptions = allActionOptions.filter(action => !externalActions.has(action))
        if (!actionOptions.length && blockedActions.length) continue
        const hasContent = Boolean(rawStep.contentBase64 || (typeof rawStep.content === 'string' && rawStep.content.length))
        let action = actionOptions.length === 1
            ? actionOptions[0]
            : hasContent && actionOptions.includes('write_file') ? 'write_file'
                : !hasContent && actionOptions.includes('mkdir') && actionOptions.includes('write_file') ? 'mkdir' : ''
        // Planners sometimes glue the target into the action itself
        // ("mkdir db" — the repair that died for EduTrack build #9).
        // Split a leading known verb off and use the rest as the path
        // when the step carries none of its own.
        let gluedPath = ''
        if (!action && allActionOptions.length === 1) {
            const glued = allActionOptions[0]
            for (const verb of ['write_file', 'mkdir', 'install', 'build', 'test']) {
                if (glued.startsWith(verb + '_')) { action = verb; gluedPath = glued.slice(verb.length + 1).replace(/_/g, '/'); break }
            }
        }
        // An unusable step is skipped, never fatal: one bad step must not
        // kill a repair whose other steps are the actual fix. Validation
        // after the repair judges whether enough was done.
        if (!['write_file', 'mkdir', 'build', 'test', 'install'].includes(action)) {
            await notifyProgress(options, { phase: 'repair_step_skipped', index: index + 1, action: rawAction.slice(0, 60), reason: 'unsupported or ambiguous action' })
            continue
        }
        const step = {
            ...rawStep,
            action,
            path: rawStep.path || gluedPath || rawStep.path,
            content: rawStep.contentBase64 && !rawStep.content
                ? Buffer.from(String(rawStep.contentBase64).replace(/\s+/g, ''), 'base64').toString('utf8')
                : rawStep.content
        }
        if (action === 'write_file' && (!String(step.path || '').trim() || typeof step.content !== 'string' || !step.content.length)) {
            await notifyProgress(options, { phase: 'repair_step_skipped', index: index + 1, action, reason: 'incomplete write_file step' })
            continue
        }
        if (action === 'mkdir' && !String(step.path || '').trim()) {
            await notifyProgress(options, { phase: 'repair_step_skipped', index: index + 1, action, reason: 'mkdir step without a path' })
            continue
        }
        if (['write_file', 'mkdir'].includes(action) && !inside(record.dir, path.resolve(record.dir, step.path))) {
            await notifyProgress(options, { phase: 'repair_step_skipped', index: index + 1, action, reason: 'path outside the project workspace' })
            continue
        }
        normalizedSteps.push(step)
    }
    if (!normalizedSteps.length) return { success: false, error: 'Repair plan contained no safe local actions; external deployment/publishing actions are never executed during repair.' }
    record.repairs.push({ at: now(), reason: plan.reason || 'automatic repair', failure: String(failure).slice(-3000) })
    update(record, { stage: 'repairing', status: 'repairing' })
    // One bad step must not kill the whole repair: planners re-emit the
    // same broken path alongside good steps. Run them all; the repair only
    // fails when every step failed — validation afterwards judges whether
    // the problem is actually fixed.
    const stepFailures = []
    for (const step of normalizedSteps) {
        const result = await executeStep(record, step, options)
        if (!result.success) stepFailures.push(result.output)
    }
    if (stepFailures.length && stepFailures.length === normalizedSteps.length) {
        return { success: false, error: stepFailures.join('\n') }
    }
    if (/No runnable application entrypoint found at the project root/i.test(String(failure))) {
        const entrypoint = checkProjectEntrypoint(record.dir, inspect(record.dir))
        if (!entrypoint.success) {
            fs.writeFileSync(path.join(record.dir, 'index.html'), fallbackStaticSite(record))
            record.usedFallback = true
            update(record, {})
            await notifyProgress(options, { phase: 'repair_root_entrypoint_fallback', path: 'index.html' })
            event(record, 'repair_root_entrypoint_fallback', { path: 'index.html', reason: 'Repair planner did not create a runnable project-root entrypoint.' })
        }
    }
    update(record, { stage: 'repairing', status: 'repairing' })
    return { success: true }
}

// Deterministic safety net: planners sometimes put every file under src/
// (server included) and forget the root package.json entirely, which makes
// the project-entrypoint check fail and the whole build fall back to the
// starter template. If the project has a JS entrypoint but no root
// package.json and no root index.html, synthesise the package.json from the
// entrypoint's own requires so the app is runnable and deployable as-is.
const NODE_BUILTINS = new Set(['fs', 'path', 'http', 'https', 'url', 'os', 'crypto', 'util', 'events', 'stream', 'querystring', 'child_process', 'net', 'tls', 'zlib', 'buffer', 'assert'])
const ensureRootPackageJson = record => {
    try {
        const root = record.dir
        if (!root || fs.existsSync(path.join(root, 'package.json')) || fs.existsSync(path.join(root, 'index.html'))) return null
        const candidates = ['server.js', 'index.js', 'app.js', 'main.js', 'src/server.js', 'src/index.js', 'src/app.js', 'src/main.js']
        let entry = candidates.find(candidate => fs.existsSync(path.join(root, candidate)))
        if (!entry) {
            for (const sub of ['src', '.']) {
                const dir = path.join(root, sub)
                if (!fs.existsSync(dir)) continue
                const hit = fs.readdirSync(dir).find(name => name.endsWith('.js') && /listen\(|createServer/.test(fs.readFileSync(path.join(dir, name), 'utf8')))
                if (hit) { entry = sub === '.' ? hit : `${sub}/${hit}`; break }
            }
        }
        if (!entry) return null
        const source = fs.readFileSync(path.join(root, entry), 'utf8')
        const dependencies = {}
        for (const match of source.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
            const name = match[1]
            if (name.startsWith('.') || name.startsWith('/')) continue
            const pkgName = name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0]
            if (!NODE_BUILTINS.has(pkgName)) dependencies[pkgName] = '*'
        }
        const pkg = {
            name: record.name || 'bera-app',
            version: '1.0.0',
            private: true,
            main: entry,
            scripts: { start: `node ${entry}` },
            ...(Object.keys(dependencies).length ? { dependencies } : {}),
        }
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg, null, 2))
        event(record, 'root_package_json_synthesised', { entry, dependencies: Object.keys(dependencies) })
        return pkg
    } catch { return null }
}

// Generated package.json files invent toolchain scripts the project
// cannot run: a webpack "build" with no webpack config anywhere, or a
// script whose binary is not even a dependency (guaranteed "not found").
// Those scripts make validation fail for reasons that have nothing to do
// with the app itself, so they are removed before validation. Scripts
// backed by a real dependency or a real config file are kept.
const BUNDLER_BINARIES = new Set(['webpack', 'rollup', 'vite', 'parcel', 'esbuild', 'tsc', 'browserify', 'gulp', 'grunt'])
const BUNDLER_CONFIGS = ['webpack.config.js', 'webpack.config.cjs', 'rollup.config.js', 'vite.config.js', 'vite.config.ts', 'tsconfig.json', 'babel.config.js']
const scriptBinary = raw => {
    const tokens = String(raw || '').trim().split(/\s+/)
    let i = 0
    while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=[^\s]*$/.test(tokens[i])) i++
    if (tokens[i] === 'npx') i++
    return (tokens[i] || '').replace(/^.*\//, '')
}
const TEST_RUNNER_BINARIES = new Set(['jest', 'vitest', 'mocha', 'ava', 'tap'])
const projectHasTestFiles = root => {
    const stack = [root]
    let visited = 0
    while (stack.length && visited < 400) {
        const dir = stack.pop()
        let entries = []
        try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { continue }
        for (const entry of entries) {
            visited += 1
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
                if (entry.name === '__tests__') return true
                stack.push(path.join(dir, entry.name))
            } else if (/\.(test|spec)\.[cm]?[jt]s$/.test(entry.name)) return true
        }
    }
    return false
}

const sanitizeGeneratedScripts = record => {
    try {
        const root = record.dir
        const pkgPath = path.join(root, 'package.json')
        if (!root || !fs.existsSync(pkgPath)) return []
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
        const deps = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})])
        const hasBundlerConfig = BUNDLER_CONFIGS.some(file => fs.existsSync(path.join(root, file)))
        const removed = []
        for (const key of ['build', 'test']) {
            const raw = pkg?.scripts?.[key]
            if (typeof raw !== 'string' || !raw.trim()) continue
            const binary = scriptBinary(raw)
            if (!binary || ['node', 'npm', 'npx', 'echo', 'true'].includes(binary)) continue
            if (BUNDLER_BINARIES.has(binary) && !hasBundlerConfig) { delete pkg.scripts[key]; removed.push(key); continue }
            if (!deps.has(binary)) { delete pkg.scripts[key]; removed.push(key); continue }
            // A test runner with no test files exits 1 ("No tests found")
            // and fails validation for an app that never asked for tests
            // (EduTrack rebuild #10). The script is decorative — drop it.
            if (key === 'test' && TEST_RUNNER_BINARIES.has(binary) && !projectHasTestFiles(root)) { delete pkg.scripts[key]; removed.push(key) }
        }
        if (removed.length) {
            fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
            event(record, 'generated_scripts_sanitised', { removed })
        }
        return removed
    } catch { return [] }
}

// Boot check: actually start the app and probe it over HTTP. Syntax and
// install checks cannot see cross-file mistakes (server.js requiring
// './db' when the file lives at src/db.js, a route importing a models
// layer that was never written) — those apps "passed" validation and then
// died on BeraHost with "web process exited before opening its port".
// A failed boot gives the repair loop the real runtime error to fix.
const bootCheck = async (record, rootScript, options = {}) => {
    const port = 4300 + Math.floor(Math.random() * 400)
    const timeoutMs = options.bootTimeout || 9000
    let child = null
    let output = ''
    let exited = false
    let exitCode = null
    try {
        child = spawn('node', [rootScript], {
            cwd: record.dir,
            env: { PATH: pathWithPackageManagers(), HOME: process.env.HOME || '/home/hatch', PORT: String(port), NODE_ENV: 'test' },
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        child.stdout.on('data', d => { output = (output + d).slice(-4000) })
        child.stderr.on('data', d => { output = (output + d).slice(-4000) })
        child.on('exit', code => { exited = true; exitCode = code })
        const deadline = Date.now() + timeoutMs
        while (Date.now() < deadline) {
            if (exited) break
            try {
                const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1200) })
                if (res && res.status) return { success: true, output: `Server booted and answered HTTP ${res.status} on its assigned port.` }
            } catch {}
            await new Promise(resolve => setTimeout(resolve, 400))
        }
        if (exited) return { success: false, output: `Server exited during boot (code ${exitCode}): ${output.slice(-1200) || '(no output)'}` }
        return { success: false, output: `Server did not answer HTTP within ${Math.round(timeoutMs / 1000)}s of booting: ${output.slice(-1200) || '(no output)'}` }
    } catch (error) {
        return { success: false, output: `Boot check could not start the server: ${error.message}` }
    } finally {
        try { child?.kill('SIGKILL') } catch {}
    }
}

const validate = async (record, options = {}) => {
    const info = inspect(record.dir)
    const entrypoint = checkProjectEntrypoint(record.dir, info)
    const checks = [entrypoint]
    if (entrypoint.success) {
        if (entrypoint.rootScript) checks.push({ name: 'javascript-syntax', ...(await command(`node --check ${JSON.stringify(entrypoint.rootScript)}`, record.dir, options.syntaxTimeout || 30000)) })
        if (entrypoint.pythonEntrypoint) checks.push({ name: 'python-syntax', ...(await command(`python3 -m py_compile ${JSON.stringify(entrypoint.pythonEntrypoint)}`, record.dir, options.syntaxTimeout || 30000)) })
        if (info.manager) checks.push({ name: 'install', ...(await installProjectDependencies(info.manager, record.dir, options.installTimeout || 180000)) })
        if (entrypoint.rootScript) checks.push({ name: 'boot', ...(await bootCheck(record, entrypoint.rootScript, options)) })
        if (info.buildCommand) checks.push({ name: 'build', ...(await command(info.buildCommand, record.dir, options.buildTimeout || 180000)) })
        if (info.testCommand) checks.push({ name: 'test', ...(await command(info.testCommand, record.dir, options.testTimeout || 120000)) })
    }
    record.checks = checks
    const success = checks.length > 0 && checks.every(c => c.success)
    update(record, { stage: success ? 'validated' : 'validation_failed', status: success ? 'validated' : 'validation_failed' })
    return { success, checks }
}

const checkpoint = async (record, message = 'checkpoint: Bera AI') => {
    const result = await command(`git init && git config user.name "Bera AI" && git config user.email "bera-ai@users.noreply.github.com" && git add -A -- . ':!.env' ':!.env.*' ':!**/.env' ':!**/.env.*' ':!node_modules/**' ':!**/node_modules/**' ':!.bera-preview.log' ':!.bera-revisions' ':!.bera-revisions/**' && (git diff --cached --quiet || git commit -m ${JSON.stringify(message)})`, record.dir, 120000)
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
    const child = spawn('/bin/sh', ['-lc', `${info.startCommand} -- --port ${port}`], { cwd: record.dir, detached: true, stdio: ['ignore', out, out], env: { ...process.env, PATH: pathWithPackageManagers(), PORT: String(port) } })
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

// ── Revisions: surgical edits to an existing project ─────────────────────
// The model never rewrites a file. It returns exact find/replace patches
// against the current content; the patches are verified (each "find" must
// occur exactly once) and applied deterministically, the project is
// re-validated, and any failure restores the backup untouched.
const REVISION_TEXT_EXTENSIONS = new Set(['.html', '.htm', '.css', '.js', '.mjs', '.cjs', '.json', '.md', '.txt', '.svg', '.xml'])

const listRevisionFiles = root => {
    const files = []
    const walk = dir => {
        let entries = []
        try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
        for (const entry of entries) {
            if (files.length >= 40) return
            if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.bera-revisions') continue
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) { walk(full); continue }
            if (!entry.isFile() || !REVISION_TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue
            try {
                const stat = fs.statSync(full)
                if (stat.size > 150000) continue
                files.push({ path: path.relative(root, full).split(path.sep).join('/'), size: stat.size })
            } catch {}
        }
    }
    walk(root)
    return files
}

const revisionWindows = (content, instruction, maxChars = 3600) => {
    const stopwords = new Set(['the', 'and', 'for', 'with', 'change', 'update', 'edit', 'make', 'please', 'agent', 'that', 'this', 'from', 'into', 'your', 'then', 'than', 'them', 'they', 'what', 'when', 'should', 'would', 'could', 'about', 'there', 'their', 'have', 'been', 'will', 'just', 'like', 'want', 'need', 'site', 'website', 'page', 'project'])
    const tokens = [...new Set(String(instruction || '').toLowerCase().match(/[a-z0-9$#][a-z0-9$#.'-]*/g) || [])].filter(t => t.length >= 3 && !stopwords.has(t))
    const lower = content.toLowerCase()
    const hits = []
    for (const token of tokens) {
        let idx = lower.indexOf(token)
        while (idx >= 0 && hits.length < 60) { hits.push(idx); idx = lower.indexOf(token, idx + token.length) }
    }
    if (!hits.length) return []
    hits.sort((a, b) => a - b)
    const windows = []
    let used = 0
    for (const hit of hits) {
        const start = Math.max(0, hit - 420)
        const end = Math.min(content.length, hit + 420)
        if (windows.some(w => start <= w.end)) continue
        const text = content.slice(start, end)
        if (used + text.length > maxChars) break
        windows.push({ start, end, text })
        used += text.length
    }
    return windows
}

const htmlOutline = content => {
    const parts = []
    for (const m of content.matchAll(/<title>([^<]{3,80})<\/title>/gi)) parts.push(`title: ${m[1].trim()}`)
    for (const m of content.matchAll(/<(?:section|div|header|footer|nav|main)\b[^>]*\bid="([^"]+)"/gi)) parts.push(`section #${m[1]}`)
    for (const m of content.matchAll(/<h([12])[^>]*>([^<]{3,80})<\/h\1>/gi)) parts.push(`heading: ${m[2].trim()}`)
    return [...new Set(parts)].slice(0, 30)
}

// Pure check used before any file is touched: every edit must name a known
// file and its "find" text must occur exactly once in that file's content.
const validateRevisionEdits = (contentsByFile, edits) => {
    if (!Array.isArray(edits) || !edits.length) return 'The editing model did not produce any usable edit.'
    for (const edit of edits) {
        if (!edit || typeof edit.find !== 'string' || typeof edit.replace !== 'string' || !edit.find) return 'The editing model returned a malformed edit.'
        if (!Object.prototype.hasOwnProperty.call(contentsByFile, edit.file)) return `The editing model named an unknown file (${edit.file}).`
        const occurrences = contentsByFile[edit.file].split(edit.find).length - 1
        if (occurrences !== 1) return `The text to change was found ${occurrences} times in ${edit.file} (it must appear exactly once to edit it safely).`
    }
    return null
}

const reviseProject = async (record, options = {}) => {
    const instruction = String(options.instruction || '').trim()
    if (!instruction) return { success: false, error: 'No change was described.', record }
    if (!record.dir || !fs.existsSync(record.dir)) return { success: false, error: 'The project files are missing.', record }
    const files = listRevisionFiles(record.dir)
    if (!files.length) return { success: false, error: 'No editable files were found in this project.', record }
    await notifyProgress(options, { phase: 'revision_plan', projectId: record.id })
    // Provider prompts travel in a GET query string, so the context must
    // stay small: whole files only when they fit, otherwise exact keyword
    // windows around the parts of the file the change likely touches.
    const contexts = []
    let budget = 4800
    for (const file of files) {
        if (budget <= 0) break
        let content = ''
        try { content = fs.readFileSync(path.join(record.dir, file.path), 'utf8') } catch { continue }
        if (content.length <= Math.min(2200, budget)) {
            contexts.push({ file: file.path, text: content })
            budget -= content.length
            continue
        }
        const windows = revisionWindows(content, instruction, Math.min(3400, budget))
        if (windows.length) {
            const text = windows.map(w => w.text).join('\n…[snip]…\n')
            contexts.push({ file: file.path, text })
            budget -= text.length
            continue
        }
        if (/\.html?$/i.test(file.path)) {
            const outline = htmlOutline(content)
            if (outline.length) contexts.push({ file: file.path, text: outline.join('\n') })
        }
    }
    if (!contexts.length) return { success: false, error: 'I could not find the part of the project that change refers to. Try naming the exact text or section to change.', record }
    const prompt = [
        `A user wants to change their existing project "${record.name}".`,
        `Requested change: ${instruction.slice(0, 700)}`,
        'Below are the current project files (whole files, or the exact regions the change likely touches).',
        ...contexts.map(c => `\n=== FILE: ${c.file} ===\n${c.text}`),
        '\nReturn ONLY a JSON object, no explanations: {"summary": "short description of the change", "edits": [{"file": "index.html", "find": "exact text copied from the file above", "replace": "the new text"}]}',
        'Rules: "find" must be copied EXACTLY from the content above, character for character, and must appear exactly once in that file. Keep every edit as small as possible — change only what was asked, never rewrite unrelated content. To add new content, set "find" to a short unique anchor next to where it belongs and "replace" to the anchor plus the new content (or the new content plus the anchor). Use the file paths exactly as shown; do not invent files.'
    ].join('\n')
    const result = await xcasper.chat([{ role: 'user', content: prompt }], {
        timeout: 90000,
        providerTimeout: 90000,
        maxChars: 16000,
        onProviderProgress: progress => notifyProgress(options, { phase: 'revision_provider', ...progress })
    })
    if (!result.success) return { success: false, error: `The editing model failed: ${result.error}`, record }
    const parsed = parsePlannerJson(result.text, true)
    const edits = parsed?.success && Array.isArray(parsed.value.edits) ? parsed.value.edits : []
    if (!edits.length) return { success: false, error: 'The editing model did not produce any usable edit. Try describing the change with the exact wording or section name.', record }
    const contentsByFile = {}
    for (const edit of edits) {
        if (edit && typeof edit.file === 'string' && !Object.prototype.hasOwnProperty.call(contentsByFile, edit.file)) {
            try { contentsByFile[edit.file] = fs.readFileSync(path.join(record.dir, edit.file), 'utf8') } catch { contentsByFile[edit.file] = '' }
        }
    }
    // A named file outside the editable set (or outside the project dir)
    // must never be touched.
    for (const edit of edits) {
        if (!edit || !files.some(f => f.path === edit.file)) return { success: false, error: `The editing model named a file that is not editable (${edit?.file}); nothing was changed.`, record }
    }
    const editError = validateRevisionEdits(contentsByFile, edits)
    if (editError) return { success: false, error: `${editError} Nothing was changed.`, record }
    const touched = [...new Set(edits.map(e => e.file))]
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    // Backups live OUTSIDE the project directory: an ignored backups folder
    // inside the project makes `git add` fail at publish time, and editing
    // must never add files (like a .gitignore) the user did not ask for.
    const backupDir = path.join(getUserWorkspace(record.userId), '.bera-revisions', record.name, stamp)
    try {
        for (const rel of touched) {
            const dest = path.join(backupDir, rel)
            fs.mkdirSync(path.dirname(dest), { recursive: true })
            fs.copyFileSync(path.join(record.dir, rel), dest)
        }
    } catch (error) {
        return { success: false, error: `Could not back up the project before editing: ${error.message}`, record }
    }
    const restore = () => { for (const rel of touched) { try { fs.copyFileSync(path.join(backupDir, rel), path.join(record.dir, rel)) } catch {} } }
    for (const edit of edits) {
        const full = path.join(record.dir, edit.file)
        const content = fs.readFileSync(full, 'utf8')
        if (!content.includes(edit.find)) { restore(); return { success: false, error: 'Part of the change no longer matched the file, so the edit was reverted and nothing was changed.', record } }
        // A function replacer keeps $-sequences in prices literal.
        fs.writeFileSync(full, content.replace(edit.find, () => edit.replace))
    }
    await notifyProgress(options, { phase: 'validation', projectId: record.id })
    const validation = await validate(record, options)
    if (!validation.success) {
        restore()
        update(record, { status: 'validated', stage: 'revision_reverted' })
        return { success: false, error: 'The change broke a project check, so it was reverted — the project is unchanged.', validation, record }
    }
    const summary = String(parsed.value.summary || 'Requested change applied.').slice(0, 300)
    record.lastRevision = { at: now(), instruction: instruction.slice(0, 300), summary, files: touched, edits: edits.length }
    event(record, 'revision', { summary, files: touched, edits: edits.length })
    update(record, { status: 'revised', stage: 'revised' })
    await checkpoint(record, `revision: ${summary}`.slice(0, 120))
    const fresh = get(record.id) || record
    return { success: true, record: fresh, revision: { summary, files: touched, edits: edits.length }, validation }
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
    if (action === 'revise') return reviseProject(record, options)
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
            private: options.private === true,
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
    ensureRootPackageJson(record)
    ensureStartScript(record)
    reconcileEntrypoint(record)
    sanitizeGeneratedScripts(record)
    await notifyProgress(options, { phase: 'validation' })
    let validation = await validate(record, options)
    // Deterministic dependency heals get their own rounds before any LLM
    // repair is spent: npm reports only one bad package per install
    // attempt, so a manifest with several invented versions/packages
    // needs several heal-and-recheck cycles.
    for (let heal = 0; !validation.success && heal < 4; heal++) {
        const failureText = validation.checks.filter(c => !c.success).map(c => c.output).join('\n')
        if (!fixUnresolvableDependencies(record, failureText) && !reconcileEntrypoint(record)) break
        validation = await validate(record, options)
    }
    let repairError = null
    for (let attempt = 0; !validation.success && attempt < (options.maxRepairs ?? 2); attempt++) {
        await notifyProgress(options, { phase: 'repair', attempt: attempt + 1, total: options.maxRepairs ?? 2 })
        const failureText = validation.checks.filter(c => !c.success).map(c => c.output).join('\n')
        if (fixUnresolvableDependencies(record, failureText)) {
            validation = await validate(record, options)
            repairError = validation.success ? null : `Dependency versions were corrected but validation still fails: ${validation.checks.filter(check => !check.success).map(check => check.output).join('\\n')}`
            continue
        }
        const fixed = await repair(record, failureText, options)
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

module.exports = { run, create, get, list: userId => Object.values(load().projects).filter(p => !userId || p.userId === userId), inspect, makePlan, executeStep, safePackageManagerCommand, validate, bootCheck, checkpoint, previewStart, previewStop, screenshot, validateRevisionEdits, normalizePackageJsonStart, ensureRootPackageJson, sanitizeDependencyVersions, fixUnresolvableDependencies, ensureStartScript, sanitizeGeneratedScripts, reconcileEntrypoint }
