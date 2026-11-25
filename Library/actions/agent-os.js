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
const load = () => { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) } catch { return { projects: {}, events: [] } } }
const save = state => { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)) }
const update = (record, patch) => { Object.assign(record, patch, { updatedAt: now() }); const s = load(); s.projects[record.id] = record; save(s); return record }
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
    const prompt = `You are the planning layer of Bera AI. Create a safe, executable software-project plan.\nReturn JSON only with this shape: {"summary":"...","steps":[{"action":"write_file","path":"relative path","brief":"detailed description of exactly what the file must contain","command":"...","reason":"..."}]}. The action value shown is an example, not a literal for every step.\nRules: each action must be exactly one of write_file, mkdir, install, build, test, shell; never put a list, pipe, or path in action. Put every relative path only in path. All application files must be relative to the project directory below; do not create an extra project/project_root wrapper folder. Use conventional paths such as src/ only beneath that root. Create a real runnable app, not placeholder text. For write_file steps, never include file content or contentBase64; instead give a detailed, self-contained brief describing exactly what that file must contain (every section, with the real names, prices and text to use) — each file is generated separately from its brief. Prefer few files: for a website, one complete root index.html with inline CSS and JS is best. Write real content for every section the task asks for (real names, real prices, real text) — never placeholder, lorem ipsum, or "add your own content" text, and never copy the task/request text into the page. A website must include a root index.html or a package.json with a working start/build script and its application entrypoint. Do not use secrets or delete files; prefer write_file for source changes; use shell only for one standalone npm/pnpm/yarn install/add or build/test command, never chain commands or use node, python, or git. Do not create Git repositories, run git init/add/commit/push, configure remotes, or deploy; Bera handles its local checkpoint after validation and requires separate approval for GitHub/deployment.\nProject directory: ${record.dir}\nExisting inspection: ${JSON.stringify(inspect(record.dir))}\nTask: ${String(task || record.task).slice(0, 12000)}`
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
    const first = await ask([
        `Write the complete file "${step.path}" for this project.`,
        `Project task: ${String(record.task || '').slice(0, 2000)}`,
        brief ? `File brief: ${brief}` : 'The file must fully serve the project task.',
        'Write real content (real names, prices and text) — never placeholder or lorem ipsum, and never copy the task text into the file.',
        'Return ONLY the complete file content: no explanations, no Markdown fences.'
    ].join('\n'))
    if (!first.success) return { success: false, error: `File generation failed for ${step.path}: ${first.error}` }
    let text = cleanGeneratedFile(first.text, step.path)
    if (!text) return { success: false, error: `File generation returned empty content for ${step.path}.` }
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
const normalizePackageJsonStart = content => {
    let pkg
    try { pkg = JSON.parse(String(content || '')) } catch { return content }
    const start = pkg?.scripts?.start
    if (typeof start !== 'string' || !start) return content
    let next = start.replace(/(^|\s)(--port|-p|--listen|-l)(=|\s+)(\d+)\b/g, (m, pre, flag, sep, port) => `${pre}${flag}${sep}\${PORT:-${port}}`)
    if (/\bhttp-server\b/.test(next) && !/(--port|-p)(=|\s)/.test(next)) next = `${next} -p \${PORT:-3000}`
    if (next === start) return content
    pkg.scripts.start = next
    return JSON.stringify(pkg, null, 2)
}

const executeStep = async (record, step, options = {}) => {
    const root = record.dir
    const action = step.action
    if (['write_file', 'mkdir'].includes(action)) {
        const target = path.resolve(root, step.path || '')
        if (!inside(root, target)) return { success: false, output: 'Blocked path outside project workspace.' }
        if (action === 'mkdir') { fs.mkdirSync(target, { recursive: true }); return { success: true, output: `Created ${step.path}` } }
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
        fs.mkdirSync(path.dirname(target), { recursive: true })
        // Hosts like BeraHost assign the port (PORT env) and share it across
        // tenants: a generated start script that hardcodes a port
        // (http-server . -p 3000) dies with EADDRINUSE and the deployment
        // fails. Normalise package.json start scripts to honour $PORT.
        if (path.basename(target) === 'package.json') content = normalizePackageJsonStart(content)
        fs.writeFileSync(target, content)
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
    const repairPrompt = 'You are a senior software repair planner. Return one valid JSON object only: {"steps":[{"action":"write_file","path":"relative path from the project root","contentBase64":"base64 file content with no line breaks"}],"reason":"..."}. Every step action MUST be exactly one of "write_file", "mkdir", "build", "test", or "install"; choose one value and never put alternatives, pipes, or lists in action. The repair phase is local-only: never return deploy, publish, push, git, repository creation, or other external side-effect actions. Use mkdir only for a needed directory with a relative path. When validation says there is no runnable application entrypoint, the repair MUST write a complete root-level index.html with <!doctype html>, <html>, <body>, and a meaningful <main> section, or a root package.json with a working start/build script and its root application entrypoint. Do not write only src/index.html, a bare doctype, or placeholder content. Do not create an extra project/project_root wrapper directory. Use contentBase64 for source files, never a literal content field. Never delete files or use secrets.'
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
        const action = actionOptions.length === 1
            ? actionOptions[0]
            : hasContent && actionOptions.includes('write_file') ? 'write_file'
                : !hasContent && actionOptions.includes('mkdir') && actionOptions.includes('write_file') ? 'mkdir' : ''
        if (!['write_file', 'mkdir', 'build', 'test', 'install'].includes(action)) {
            return { success: false, error: `Repair planner returned an unsupported or ambiguous action at step ${index + 1} (${JSON.stringify(rawAction.slice(0, 100))}).` }
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
        if (action === 'mkdir' && !String(step.path || '').trim()) {
            return { success: false, error: `Repair planner returned an incomplete mkdir step at step ${index + 1}.` }
        }
        if (['write_file', 'mkdir'].includes(action) && !inside(record.dir, path.resolve(record.dir, step.path))) {
            return { success: false, error: `Repair planner requested a path outside the project workspace at step ${index + 1}.` }
        }
        normalizedSteps.push(step)
    }
    if (!normalizedSteps.length) return { success: false, error: 'Repair plan contained no safe local actions; external deployment/publishing actions are never executed during repair.' }
    record.repairs.push({ at: now(), reason: plan.reason || 'automatic repair', failure: String(failure).slice(-3000) })
    update(record, { stage: 'repairing', status: 'repairing' })
    for (const step of normalizedSteps) {
        const result = await executeStep(record, step, options)
        if (!result.success) return { success: false, error: result.output }
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

module.exports = { run, create, get, list: userId => Object.values(load().projects).filter(p => !userId || p.userId === userId), inspect, makePlan, executeStep, safePackageManagerCommand, validate, checkpoint, previewStart, previewStop, screenshot, validateRevisionEdits, normalizePackageJsonStart }
