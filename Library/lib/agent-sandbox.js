'use strict'

/**
 * agent-sandbox.js — Phase 1 sandbox for the generic agent executor.
 *
 * Closes audit P0 #1 (unsandboxed generic-agent shell, spec §19 "Safe
 * allowlisted shell operations" + §22 permissions):
 *
 *  1. Shell allowlist — the generic planner's `shell` / `multi_shell` steps
 *     may only run a single allowlisted development command (npm / pnpm /
 *     yarn / node / python / pytest / git), with no shell at all: the command
 *     is tokenised and executed with execFile(argv), so chaining (`&&`, `;`,
 *     `|`), redirection, substitution and glob tricks cannot run.
 *     Package-manager commands follow the same rules as Agent OS
 *     (`Library/actions/agent-os.js` safePackageManagerCommand): install/add
 *     with valid package specs, `run build` / `run test`, or `test`.
 *  2. Workspace containment — file paths resolve through
 *     `Library/lib/workspace.js` resolveContainedPath (canonical path +
 *     symlink check); anything outside the per-user workspace is rejected.
 *  3. Credential-free child env — children get a small allowlisted env
 *     only; any key matching a secret pattern is stripped, never passed on.
 *
 * This module has no npm dependencies so it can be unit-tested with plain
 * node. It deliberately does NOT load Agent OS: the package-manager rules
 * below mirror agent-os.js safePackageManagerCommand (same flags, same
 * package-spec regex) — if the two drift, the tests in
 * test/agent-sandbox.test.js and test/agent-os-safe-shell.test.js disagree.
 */

const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { getUserWorkspace, resolveContainedPath } = require('./workspace')

const NPM_REGISTRY = 'https://registry.npmjs.org/'

// ── 1. Secret env keys ───────────────────────────────────────────────────────

const SECRET_ENV_KEY = /(KEY|TOKEN|SECRET|PASSW|AUTH|CREDENTIAL|PRIVATE|DATABASE_URL|SESSION|COOKIE|BEARER)/i

const isSecretEnvKey = key => SECRET_ENV_KEY.test(String(key || ''))

// Small allowlist of env vars a child process legitimately needs. Everything
// else — in particular every bot credential — is dropped.
const SAFE_ENV_KEYS = new Set([
    'PATH', 'HOME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'TMPDIR', 'TEMP', 'TMP',
    'NODE_ENV', 'PYTHONUNBUFFERED', 'PYTHONDONTWRITEBYTECODE',
    'npm_config_registry', 'NPM_CONFIG_REGISTRY', 'YARN_NPM_REGISTRY_SERVER',
    'NO_COLOR', 'FORCE_COLOR', 'TERM'
])

const safeChildEnv = (extra = {}) => {
    const env = {}
    for (const key of SAFE_ENV_KEYS) {
        if (process.env[key] !== undefined) env[key] = process.env[key]
    }
    // Package installs always resolve against the public registry.
    env.npm_config_registry = NPM_REGISTRY
    env.NPM_CONFIG_REGISTRY = NPM_REGISTRY
    for (const [key, value] of Object.entries(extra || {})) {
        if (typeof value !== 'string') continue
        if (isSecretEnvKey(key)) continue
        if (!SAFE_ENV_KEYS.has(key)) continue
        env[key] = value
    }
    return env
}

// ── 2. Shell allowlist ───────────────────────────────────────────────────────

const SHELL_ALLOWLIST = ['npm', 'pnpm', 'yarn', 'node', 'python', 'python3', 'pytest', 'git']

// Any of these means "this is not one simple command" — chaining, piping,
// redirection, substitution, backgrounding or a multi-line script.
const SHELL_META = /[;&|`$<>\n\r]/
const SHELL_REJECTION = 'Only one allowlisted development command may run (npm, pnpm, yarn, node, python, pytest, git) — no chaining, pipes, redirection, substitution or extra shell features.'

// Minimal shell-word tokenizer (single/double quotes, backslash escapes).
// Returns null on unbalanced quotes.
const tokenize = raw => {
    const tokens = []
    let current = ''
    let quote = null
    let hasToken = false
    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i]
        if (quote) {
            if (ch === quote) { quote = null; continue }
            if (ch === '\\' && quote === '"' && i + 1 < raw.length) { current += raw[++i]; continue }
            current += ch
            continue
        }
        if (ch === "'" || ch === '"') { quote = ch; hasToken = true; continue }
        if (ch === '\\' && i + 1 < raw.length) { current += raw[++i]; hasToken = true; continue }
        if (/\s/.test(ch)) {
            if (hasToken || current !== '') { tokens.push(current); current = ''; hasToken = false }
            continue
        }
        current += ch
        hasToken = true
    }
    if (quote) return null
    if (hasToken || current !== '') tokens.push(current)
    return tokens
}

// Package-manager validation, mirroring agent-os.js safePackageManagerCommand.
const validatePackageManagerCommand = tokens => {
    const [manager, subcommand, ...args] = tokens
    if ((manager === 'npm' || manager === 'pnpm') && subcommand === 'run' && args.length === 1 && ['build', 'test'].includes(args[0])) {
        return { manager, args: ['run', args[0]] }
    }
    if ((manager === 'npm' || manager === 'pnpm') && subcommand === 'test' && args.length === 0) {
        return { manager, args: ['test'] }
    }
    if (manager === 'yarn' && ['build', 'test'].includes(subcommand) && args.length === 0) {
        return { manager, args: [subcommand] }
    }
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

const GIT_SUBCOMMANDS = new Set(['status', 'log', 'diff', 'branch', 'show', 'rev-parse', 'ls-files', 'fetch', 'clone'])
const GIT_SAFE_FLAGS = new Set(['--oneline', '--stat', '--short', '--name-only', '--cached', '--staged', '--quiet', '-q', '--no-pager', '--single-branch', '--depth', '-b', '--branch'])
const GIT_FLAG_WITH_VALUE = new Set(['-b', '--branch', '--depth'])

const validateGitCommand = (tokens, userId) => {
    const [, subcommand, ...args] = tokens
    if (subcommand === '--version' && args.length === 0) return { manager: 'git', args: ['--version'] }
    if (!GIT_SUBCOMMANDS.has(subcommand)) {
        return { error: `git subcommand "${subcommand || ''}" is not allowlisted. Allowed: ${[...GIT_SUBCOMMANDS].join(', ')} (read-only inspection, fetch and clone). Pushes go through the owner-gated git_push action, not shell.` }
    }
    let positional = 0
    for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        if (GIT_FLAG_WITH_VALUE.has(arg)) {
            const value = args[++i]
            if (value === undefined || value.startsWith('-')) return { error: `git flag "${arg}" needs a value.` }
            continue
        }
        if (arg.startsWith('-')) {
            if (!GIT_SAFE_FLAGS.has(arg) && !/^--max-count=\d+$/.test(arg)) return { error: `git flag "${arg}" is not allowlisted.` }
            continue
        }
        if (subcommand === 'clone') {
            if (positional === 0 && !arg.startsWith('https://')) return { error: 'git clone only accepts https:// URLs.' }
            if (positional > 0) {
                try { resolveContainedPath(userId, arg) } catch (e) { return { error: e.message } }
            }
            positional++
            continue
        }
        // Positional args (paths, refs, revisions): reject escapes and
        // absolute paths outside the workspace; plain refs pass through.
        if (arg.split('/').includes('..')) return { error: `git argument "${arg}" escapes the workspace.` }
        if (path.isAbsolute(arg)) {
            try { resolveContainedPath(userId, arg) } catch (e) { return { error: e.message } }
        }
    }
    return { manager: 'git', args: [subcommand, ...args] }
}

const validateScriptRunnerCommand = (tokens, userId, extensions) => {
    const [runner, first, ...rest] = tokens
    if ((first === '--version' || first === '-v') && rest.length === 0) return { manager: runner, args: [first] }
    if (!first || first.startsWith('-')) {
        return { error: `${runner} may only run a script file inside your workspace (e.g. "${runner} app.js"). Inline code (-e / -c) is not allowed through shell; use the owner-gated js_eval / run_code actions instead.` }
    }
    if (!extensions.some(ext => first.endsWith(ext))) {
        return { error: `${runner} may only run *${extensions.join(' / *')} files inside your workspace: "${first}".` }
    }
    try { resolveContainedPath(userId, first) } catch (e) { return { error: e.message } }
    for (const arg of rest) {
        if (arg.startsWith('-')) return { error: `${runner} script flags are not allowed through shell: "${arg}".` }
    }
    return { manager: runner, args: [first, ...rest] }
}

const validatePytestCommand = (tokens, userId) => {
    const args = tokens.slice(1)
    const allowedFlags = new Set(['-q', '-v', '-x', '--collect-only', '-k'])
    for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        if (arg === '-k') {
            const value = args[++i]
            if (value === undefined || value.startsWith('-')) return { error: 'pytest -k needs a test expression.' }
            continue
        }
        if (arg.startsWith('-')) {
            if (!allowedFlags.has(arg) && !/^--tb=(short|line|no)$/.test(arg)) return { error: `pytest flag "${arg}" is not allowlisted.` }
            continue
        }
        if (arg.split('/').includes('..')) return { error: `pytest path "${arg}" escapes the workspace.` }
        if (path.isAbsolute(arg)) {
            try { resolveContainedPath(userId, arg) } catch (e) { return { error: e.message } }
        }
    }
    return { manager: 'pytest', args }
}

/**
 * Validate one planner shell command. Returns { manager, args } on success
 * or { error } when the command must not run. Never executes anything.
 */
const validateShellCommand = (raw, userId) => {
    const command = String(raw || '').trim()
    if (!command) return { error: 'No shell command was provided.' }
    if (SHELL_META.test(command)) return { error: SHELL_REJECTION }
    const tokens = tokenize(command)
    if (!tokens || tokens.length === 0) return { error: 'Could not parse the shell command (unbalanced quotes?).' }
    const [first] = tokens
    if (first.includes('/')) return { error: `Only bare allowlisted command names may run, not paths: "${first}". ${SHELL_REJECTION}` }
    if (!SHELL_ALLOWLIST.includes(first)) {
        return { error: `Command "${first}" is not allowlisted. ${SHELL_REJECTION}` }
    }
    if (['npm', 'pnpm', 'yarn'].includes(first)) {
        const parsed = validatePackageManagerCommand(tokens)
        if (!parsed) return { error: `That ${first} command is not allowlisted. Allowed: install/add of valid package specs, "run build", "run test", or "test". ${SHELL_REJECTION}` }
        return parsed
    }
    if (first === 'git') return validateGitCommand(tokens, userId)
    if (first === 'node') return validateScriptRunnerCommand(tokens, userId, ['.js', '.mjs', '.cjs'])
    if (first === 'python' || first === 'python3') {
        if (tokens[1] === '-m' && tokens[2] === 'pytest') return validatePytestCommand(['pytest', ...tokens.slice(3)], userId)
        if (tokens[1] === '-m') return { error: 'python -m is only allowed for pytest. Inline code (-c) is not allowed through shell.' }
        return validateScriptRunnerCommand(tokens, userId, ['.py'])
    }
    if (first === 'pytest') return validatePytestCommand(tokens, userId)
    return { error: SHELL_REJECTION }
}

// ── 3. Sandboxed execution (no shell, contained cwd, clean env) ─────────────

/**
 * Run one planner shell command after allowlist validation, without a shell
 * (execFile + argv), inside the caller's workspace, with a credential-free
 * env. Returns { success, output }. Never throws for a rejected command.
 */
const runSandboxedShell = (raw, opts = {}) => new Promise(resolve => {
    const userId = opts.userId || 'shared'
    const validation = validateShellCommand(raw, userId)
    if (validation.error || !validation.manager) {
        return resolve({ success: false, output: `⛔ Shell command rejected: ${validation.error || SHELL_REJECTION}` })
    }
    let cwd = opts.cwd || getUserWorkspace(userId)
    try { cwd = resolveContainedPath(userId, cwd) } catch (e) {
        return resolve({ success: false, output: `⛔ Shell command rejected: ${e.message}` })
    }
    const args = validation.args.slice()
    const isInstall = ['npm', 'pnpm', 'yarn'].includes(validation.manager) &&
        ['install', 'i', 'add'].includes(args[0]) &&
        !args.some(arg => arg.startsWith('--registry='))
    if (isInstall) args.push(`--registry=${NPM_REGISTRY}`)
    execFile(validation.manager, args, {
        cwd,
        timeout: opts.timeout || 30000,
        maxBuffer: 1024 * 1024 * 5,
        env: safeChildEnv()
    }, (err, stdout, stderr) => {
        const out = `${stdout || ''}${stderr ? `\n[stderr]: ${stderr.trim()}` : ''}`.trim()
        if (err) return resolve({ success: false, output: (out || err.message).slice(0, 5000) })
        resolve({ success: true, output: out.slice(0, 5000) || 'done' })
    })
})

module.exports = {
    SHELL_ALLOWLIST,
    SHELL_REJECTION,
    NPM_REGISTRY,
    isSecretEnvKey,
    safeChildEnv,
    tokenize,
    validateShellCommand,
    validatePackageManagerCommand,
    runSandboxedShell,
    resolveContainedPath
}
