'use strict'
/**
 * Code runner action library.
 * Executes JavaScript (Node.js) and optionally Python/Bash
 * inside the workspace/sandbox directory with strict safety limits.
 */
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const WORKSPACE = path.resolve('./workspace')
const TMP_DIR = os.tmpdir()
const TIMEOUT_MS = 10000
const MAX_OUTPUT = 3000

if (!fs.existsSync(WORKSPACE)) fs.mkdirSync(WORKSPACE, { recursive: true })

/**
 * Run code in a sandboxed subprocess.
 * @param {string} code  Source code to execute
 * @param {string} lang  'js' | 'javascript' | 'python' | 'python3' | 'bash' | 'sh'
 * @param {number} timeoutMs  Max execution time (default 10s)
 * @returns {Promise<{ success: boolean, stdout: string, stderr: string, exitCode: number, lang: string }>}
 */
const runCode = (code, lang = 'js', timeoutMs = TIMEOUT_MS) => new Promise((resolve) => {
    const langNorm = lang.toLowerCase().trim()
    let ext, cmd, args

    if (['js', 'javascript', 'node'].includes(langNorm)) {
        ext = 'js'; cmd = 'node'; args = []
    } else if (['python', 'python3', 'py'].includes(langNorm)) {
        ext = 'py'; cmd = 'python3'; args = []
    } else if (['bash', 'sh', 'shell'].includes(langNorm)) {
        ext = 'sh'; cmd = 'bash'; args = []
    } else {
        return resolve({ success: false, stdout: '', stderr: `Unsupported language: ${lang}. Supported: js, python, bash`, exitCode: -1, lang })
    }

    const tmpFile = path.join(TMP_DIR, `bera_run_${Date.now()}.${ext}`)
    try { fs.writeFileSync(tmpFile, code) } catch (e) {
        return resolve({ success: false, stdout: '', stderr: `Failed to write temp file: ${e.message}`, exitCode: -1, lang })
    }

    let stdout = ''
    let stderr = ''
    let settled = false

    const proc = spawn(cmd, [...args, tmpFile], {
        cwd: WORKSPACE,
        timeout: timeoutMs,
        env: {
            ...process.env,
            // Strip sensitive env vars from child process
            GH_TOKEN: undefined,
            GITHUB_PERSONAL_ACCESS_TOKEN: undefined,
            SKY_API_KEY: undefined,
            SESSION_SECRET: undefined
        }
    })

    const cleanup = () => { try { fs.unlinkSync(tmpFile) } catch {} }

    const done = (code) => {
        if (settled) return
        settled = true
        cleanup()
        proc.kill('SIGTERM')
        resolve({
            success: code === 0,
            stdout: stdout.slice(0, MAX_OUTPUT),
            stderr: stderr.slice(0, 1000),
            exitCode: code,
            lang: langNorm
        })
    }

    proc.stdout.on('data', d => { stdout += d.toString() })
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('close', (code) => done(code ?? 0))
    proc.on('error', (e) => { stderr = e.message; done(-1) })

    setTimeout(() => {
        if (!settled) {
            stderr = `⏱️ Execution timed out after ${timeoutMs / 1000}s`
            done(-1)
        }
    }, timeoutMs + 500)
})

/**
 * Format code run result for WhatsApp.
 */
const formatRunResult = (res) => {
    const langLabel = res.lang || 'code'
    const icon = res.success ? '✅' : '❌'
    const lines = [`${icon} *Code ran (${langLabel})* | exit: ${res.exitCode}`]
    if (res.stdout) lines.push(`\n📤 *Output:*\n\`\`\`\n${res.stdout.trim()}\n\`\`\``)
    if (res.stderr) lines.push(`\n⚠️ *Stderr:*\n\`\`\`\n${res.stderr.trim()}\n\`\`\``)
    if (!res.stdout && !res.stderr) lines.push(`\n_(no output)_`)
    return lines.join('\n')
}

/**
 * Extract code block from a message (removes ``\`js ... ``\` fences).
 */
const extractCode = (text) => {
    if (!text) return ''
    const m = text.match(/```(?:\w+)?\n?([\s\S]+?)```/)
    if (m) return m[1].trim()
    return text.trim()
}

/**
 * Detect language from code block fence or content heuristics.
 */
const detectLang = (text) => {
    const m = text.match(/```(\w+)/)
    if (m) {
        const l = m[1].toLowerCase()
        if (['js', 'javascript', 'node'].includes(l)) return 'js'
        if (['py', 'python', 'python3'].includes(l)) return 'python'
        if (['bash', 'sh', 'shell'].includes(l)) return 'bash'
    }
    if (/^#!/.test(text.trim()) && /bash|sh/.test(text.split('\n')[0])) return 'bash'
    if (/^def |^import |^from |print\s*\(/.test(text)) return 'python'
    return 'js'
}

module.exports = { runCode, formatRunResult, extractCode, detectLang }
