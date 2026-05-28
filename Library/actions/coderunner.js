'use strict'
/**
 * Code runner — local (JS/Python/Bash) + Piston API (50+ languages)
 * Piston: https://emkc.org — free, no auth needed
 */
const { spawn } = require('child_process')
const axios = require('axios')
const fs    = require('fs')
const path  = require('path')
const os    = require('os')

const WORKSPACE  = path.resolve('./workspace')
const TMP_DIR    = os.tmpdir()
const TIMEOUT_MS = 15000
const MAX_OUTPUT = 4000

if (!fs.existsSync(WORKSPACE)) fs.mkdirSync(WORKSPACE, { recursive: true })

// ── Piston API (remote, 50+ languages) ───────────────────────────────────────
const PISTON_APIS = [
    'https://emkc.org/api/v2/piston/execute',
    'https://piston.beratech.io/api/v2/piston/execute',  // fallback
]

// Maps common aliases → Piston runtime names
const PISTON_LANGS = {
    python: 'python', python3: 'python', py: 'python',
    javascript: 'javascript', js: 'javascript', node: 'javascript', nodejs: 'javascript',
    typescript: 'typescript', ts: 'typescript',
    bash: 'bash', sh: 'bash', shell: 'bash',
    php: 'php',
    ruby: 'ruby', rb: 'ruby',
    go: 'go', golang: 'go',
    rust: 'rust', rs: 'rust',
    c: 'c',
    cpp: 'c++', 'c++': 'c++', cxx: 'c++',
    java: 'java',
    kotlin: 'kotlin', kt: 'kotlin',
    swift: 'swift',
    csharp: 'csharp', cs: 'csharp', 'c#': 'csharp',
    lua: 'lua',
    perl: 'perl', pl: 'perl',
    r: 'r',
    haskell: 'haskell', hs: 'haskell',
    elixir: 'elixir', ex: 'elixir',
    dart: 'dart',
    scala: 'scala',
    groovy: 'groovy',
    julia: 'julia', jl: 'julia',
    nim: 'nim',
    zig: 'zig',
    crystal: 'crystal', cr: 'crystal',
    brainfuck: 'brainfuck', bf: 'brainfuck',
    powershell: 'powershell', ps1: 'powershell',
    prolog: 'prolog', pl2: 'prolog',
    fsharp: 'fsharp', fs: 'fsharp', 'f#': 'fsharp',
    clojure: 'clojure', clj: 'clojure',
    coffeescript: 'coffeescript', coffee: 'coffeescript',
    sqlite3: 'sqlite3', sql: 'sqlite3',
}

const FILE_EXT = {
    python: 'py', javascript: 'js', typescript: 'ts', bash: 'sh', php: 'php',
    ruby: 'rb', go: 'go', rust: 'rs', c: 'c', 'c++': 'cpp', java: 'java',
    kotlin: 'kt', swift: 'swift', csharp: 'cs', lua: 'lua', perl: 'pl',
    r: 'r', haskell: 'hs', elixir: 'ex', dart: 'dart', scala: 'scala',
    groovy: 'groovy', julia: 'jl', nim: 'nim', zig: 'zig', crystal: 'cr',
    brainfuck: 'bf', powershell: 'ps1', prolog: 'pl', fsharp: 'fs',
    clojure: 'clj', coffeescript: 'coffee', sqlite3: 'sql',
}

const LOCAL_LANGS = ['javascript', 'python', 'bash']

// ── Local execution (JS/Python/Bash) ─────────────────────────────────────────
const runLocal = (code, lang, timeoutMs = TIMEOUT_MS) => new Promise((resolve) => {
    const langNorm = lang.toLowerCase().trim()
    let ext, cmd
    if (['javascript', 'js', 'node'].includes(langNorm)) { ext = 'js'; cmd = 'node' }
    else if (['python', 'python3', 'py'].includes(langNorm)) { ext = 'py'; cmd = 'python3' }
    else if (['bash', 'sh', 'shell'].includes(langNorm)) { ext = 'sh'; cmd = 'bash' }
    else return resolve({ success: false, stdout: '', stderr: `Local unsupported: ${lang}`, exitCode: -1, lang })

    const tmpFile = path.join(TMP_DIR, `bera_run_${Date.now()}.${ext}`)
    try { fs.writeFileSync(tmpFile, code) }
    catch (e) { return resolve({ success: false, stdout: '', stderr: e.message, exitCode: -1, lang }) }

    let stdout = '', stderr = '', settled = false
    const proc = spawn(cmd, [tmpFile], {
        cwd: WORKSPACE, timeout: timeoutMs,
        env: { ...process.env, GH_TOKEN: undefined, GITHUB_PERSONAL_ACCESS_TOKEN: undefined, SESSION_SECRET: undefined }
    })
    const cleanup = () => { try { fs.unlinkSync(tmpFile) } catch {} }
    const done = (code) => {
        if (settled) return; settled = true; cleanup(); proc.kill('SIGTERM')
        resolve({ success: code === 0, stdout: stdout.slice(0, MAX_OUTPUT), stderr: stderr.slice(0, 1000), exitCode: code, lang: langNorm })
    }
    proc.stdout.on('data', d => { stdout += d })
    proc.stderr.on('data', d => { stderr += d })
    proc.on('close', code => done(code ?? 0))
    proc.on('error', e => { stderr = e.message; done(-1) })
    setTimeout(() => { if (!settled) { stderr = `⏱️ Timed out after ${timeoutMs / 1000}s`; done(-1) } }, timeoutMs + 500)
})

// ── Piston execution (remote, any language) ───────────────────────────────────
const runPiston = async (code, lang, stdin = '', timeoutMs = 20000) => {
    const runtime = PISTON_LANGS[lang.toLowerCase()] || lang.toLowerCase()
    const ext = FILE_EXT[runtime] || 'txt'

    for (const apiUrl of PISTON_APIS) {
        try {
            const res = await axios.post(apiUrl, {
                language: runtime,
                version: '*',
                files: [{ name: `main.${ext}`, content: code }],
                stdin,
                run_timeout: Math.min(timeoutMs, 20000),
                compile_timeout: 15000,
            }, { timeout: timeoutMs + 5000, headers: { 'Content-Type': 'application/json' } })

            const run = res.data?.run || res.data
            const compile = res.data?.compile

            const stdout = (run?.stdout || '').slice(0, MAX_OUTPUT)
            const stderr = ((compile?.stderr || '') + (run?.stderr || '')).slice(0, 1000)
            const exitCode = run?.code ?? 0
            const success = exitCode === 0 && !stderr.includes('error') && !stderr.includes('Error')

            return { success: exitCode === 0, stdout, stderr, exitCode, lang: runtime, source: 'piston' }
        } catch (e) {
            if (PISTON_APIS.indexOf(apiUrl) < PISTON_APIS.length - 1) continue
            return { success: false, stdout: '', stderr: `Piston API error: ${e.message}`, exitCode: -1, lang, source: 'piston' }
        }
    }
}

// ── List available Piston runtimes ────────────────────────────────────────────
const listRuntimes = async () => {
    try {
        const res = await axios.get('https://emkc.org/api/v2/piston/runtimes', { timeout: 10000 })
        const rts = res.data || []
        return { success: true, runtimes: rts.map(r => `${r.language} (${r.version})`).slice(0, 60) }
    } catch (e) { return { success: false, error: e.message } }
}

// ── Main entry point ──────────────────────────────────────────────────────────
const runCode = async (code, lang = 'js', stdin = '', timeoutMs = TIMEOUT_MS) => {
    const normalized = (PISTON_LANGS[lang.toLowerCase()] || lang.toLowerCase())
    if (LOCAL_LANGS.includes(normalized)) {
        // Prefer local execution for speed
        const result = await runLocal(code, lang, timeoutMs)
        if (result.exitCode !== -1 || !result.stderr.includes('Unsupported')) return result
    }
    // Use Piston for everything else (or if local fails)
    return runPiston(code, lang, stdin, timeoutMs)
}

// ── Format result for WhatsApp ────────────────────────────────────────────────
const formatRunResult = (res) => {
    const icon = res.success ? '✅' : '❌'
    const src = res.source ? ` [${res.source}]` : ''
    const lines = [`${icon} *${(res.lang || 'code').toUpperCase()}${src}* | exit: ${res.exitCode}`]
    if (res.stdout) lines.push(`\n📤 *Output:*\n\`\`\`\n${res.stdout.trim()}\n\`\`\``)
    if (res.stderr) lines.push(`\n⚠️ *Stderr:*\n\`\`\`\n${res.stderr.trim()}\n\`\`\``)
    if (!res.stdout && !res.stderr) lines.push('\n_(no output)_')
    return lines.join('\n')
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const extractCode = (text) => {
    if (!text) return ''
    const m = text.match(/```(?:\w+)?\n?([\s\S]+?)```/)
    return m ? m[1].trim() : text.trim()
}

const detectLang = (text) => {
    const m = text.match(/```(\w+)/)
    if (m) {
        const l = m[1].toLowerCase()
        if (PISTON_LANGS[l]) return l
    }
    if (/^#!/.test(text.trim()) && /bash|sh/.test(text.split('\n')[0])) return 'bash'
    if (/^def |^import |^from |^class |print\s*\(/.test(text)) return 'python'
    if (/^package |^func |^import\s+"/.test(text)) return 'go'
    if (/^fn\s+main|^use\s+std/.test(text)) return 'rust'
    if (/^public\s+class|System\.out\.print/.test(text)) return 'java'
    if (/^<\?php/.test(text)) return 'php'
    if (/^def\s+\w+.*\n\s+end|puts\s+/.test(text)) return 'ruby'
    return 'javascript'
}

const getSupportedLanguages = () => Object.keys(PISTON_LANGS).sort()

module.exports = { runCode, runLocal, runPiston, formatRunResult, extractCode, detectLang, listRuntimes, getSupportedLanguages }
