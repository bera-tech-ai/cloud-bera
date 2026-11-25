const fs   = require('fs')
const path = require('path')
const os   = require('os')

const requestedRoot = path.resolve(process.env.BERA_WORKSPACE || '/workspace')

const ensureWritable = (root) => {
    fs.mkdirSync(root, { recursive: true })
    const probe = path.join(root, `.bera-write-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    try {
        fs.writeFileSync(probe, 'ok', { flag: 'wx', mode: 0o600 })
    } finally {
        try { fs.unlinkSync(probe) } catch {}
    }
    return root
}

const candidates = [...new Set([
    requestedRoot,
    path.resolve(process.cwd(), 'workspace'),
    path.join(os.homedir(), '.bera', 'workspace')
])]
const rootErrors = []
let WORKSPACE_ROOT = null

for (const candidate of candidates) {
    try {
        WORKSPACE_ROOT = ensureWritable(candidate)
        break
    } catch (error) {
        rootErrors.push(`${candidate}: ${error.code || error.message}`)
    }
}

if (!WORKSPACE_ROOT) {
    throw new Error(`[WORKSPACE] No writable workspace directory. Set BERA_WORKSPACE to a writable persistent path. Tried: ${rootErrors.join('; ')}`)
}

if (WORKSPACE_ROOT !== requestedRoot) {
    console.warn(`[WORKSPACE] ${requestedRoot} is not writable; using fallback ${WORKSPACE_ROOT}. Set BERA_WORKSPACE to a writable persistent path to choose the storage location.`)
} else {
    console.log(`[WORKSPACE] Using ${WORKSPACE_ROOT}`)
}

const sanitizeId = (str) =>
    String(str || 'shared').replace(/@.+/, '').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 40)

// ── Per-user workspace directory ───────────────────────────────────────────────
const getUserWorkspace = (userId) => {
    const uid = sanitizeId(userId || 'shared')
    const dir = path.join(WORKSPACE_ROOT, uid)
    try {
        fs.mkdirSync(dir, { recursive: true })
    } catch (error) {
        throw new Error(`[WORKSPACE] Unable to create user directory ${dir}: ${error.code || error.message}. Check BERA_WORKSPACE permissions.`)
    }
    return dir
}

// ── Contained path resolution ────────────────────────────────────────────────
// Every agent-supplied path must stay inside the caller's per-user workspace.
// Absolute paths are NOT taken as-is: they are canonicalised (symlinks resolved)
// and rejected when they escape the workspace. This fixes the absolute-path
// escape noted in XADON-vs-Bera-Comparison.md, where workspace helpers
// permitted absolute paths outside the per-user workspace.
const resolveContainedPath = (userId, inputPath) => {
    const root = fs.realpathSync(getUserWorkspace(userId || 'shared'))
    if (inputPath === undefined || inputPath === null || String(inputPath).trim() === '') return root
    const raw = String(inputPath)
    if (raw.includes('\0')) throw new Error(`⛔ Path is outside your workspace: NUL byte in path.`)
    const candidate = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(root, raw)
    // Canonicalise the nearest existing ancestor so symlinks cannot smuggle
    // a path outside the workspace (e.g. workspace/link -> /etc).
    let current = candidate
    const rest = []
    while (!fs.existsSync(current)) {
        rest.unshift(path.basename(current))
        const parent = path.dirname(current)
        if (parent === current) break
        current = parent
    }
    let base = current
    try { base = fs.realpathSync(current) } catch {}
    const canonical = path.join(base, ...rest)
    if (canonical !== root && !canonical.startsWith(root + path.sep)) {
        throw new Error(`⛔ Path is outside your workspace (${root}): ${raw}`)
    }
    return canonical
}

// ── Resolve path: relative → inside user workspace; absolute → contained ────
// Throws on escape; callers that surface the error to a user should catch it
// and return { success: false, output: err.message }.
const resolvePath = (userId, relOrAbsPath) => {
    if (!relOrAbsPath) return getUserWorkspace(userId)
    return resolveContainedPath(userId, relOrAbsPath)
}

// ── List workspace directory ───────────────────────────────────────────────────
const listWorkspace = (userId, subPath) => {
    let dir
    try {
        dir = subPath ? resolvePath(userId, subPath) : getUserWorkspace(userId)
    } catch (e) {
        return { success: false, output: e.message, dir: null }
    }
    try {
        if (!fs.existsSync(dir)) return { success: false, output: `Directory not found: ${dir}`, dir }
        const items = fs.readdirSync(dir)
        if (!items.length) return { success: true, output: `📁 *${dir}*\n(empty — no files yet)`, dir }
        const rows = items.map(item => {
            try {
                const stat = fs.statSync(path.join(dir, item))
                const isDir  = stat.isDirectory()
                const size   = isDir ? '' : `  (${(stat.size / 1024).toFixed(1)} KB)`
                const mtime  = stat.mtime.toISOString().slice(0, 16).replace('T', ' ')
                return `${isDir ? '📁' : '📄'} ${item}${size}  [${mtime}]`
            } catch { return `  ${item}` }
        })
        return {
            success: true,
            output:  `📁 *${dir}*\n\n${rows.join('\n')}`,
            dir,
            items
        }
    } catch (e) {
        return { success: false, output: `ls failed: ${e.message}`, dir }
    }
}

// ── Read a file from workspace ────────────────────────────────────────────────
const readWorkspaceFile = (userId, relPath) => {
    let full
    try {
        full = resolvePath(userId, relPath)
    } catch (e) {
        return { success: false, output: e.message, path: null }
    }
    try {
        if (!fs.existsSync(full)) return { success: false, output: `File not found: ${full}`, path: full }
        const content = fs.readFileSync(full, 'utf8')
        return { success: true, output: content.slice(0, 4000), path: full }
    } catch (e) {
        return { success: false, output: `Read failed: ${e.message}`, path: full }
    }
}

// ── Write a file to workspace ─────────────────────────────────────────────────
const writeWorkspaceFile = (userId, relPath, content) => {
    let full
    try {
        full = resolvePath(userId, relPath)
    } catch (e) {
        return { success: false, output: e.message, path: null }
    }
    try {
        fs.mkdirSync(path.dirname(full), { recursive: true })
        fs.writeFileSync(full, content || '')
        return { success: true, output: `✅ Saved to: ${full}  (${(content || '').length} chars)`, path: full }
    } catch (e) {
        return { success: false, output: `Write failed: ${e.message}`, path: full }
    }
}

// ── Create directory in workspace ─────────────────────────────────────────────
const mkdirWorkspace = (userId, relPath) => {
    let full
    try {
        full = resolvePath(userId, relPath)
    } catch (e) {
        return { success: false, output: e.message, path: null }
    }
    try {
        fs.mkdirSync(full, { recursive: true })
        return { success: true, output: `✅ Directory created: ${full}`, path: full }
    } catch (e) {
        return { success: false, output: `mkdir failed: ${e.message}`, path: full }
    }
}

// ── Delete a file or folder from workspace ────────────────────────────────────
const deleteWorkspaceItem = (userId, relPath) => {
    let full
    try {
        full = resolvePath(userId, relPath)
    } catch (e) {
        return { success: false, output: e.message }
    }
    try {
        if (!fs.existsSync(full)) return { success: false, output: `Not found: ${full}` }
        const stat = fs.statSync(full)
        if (stat.isDirectory()) {
            fs.rmSync(full, { recursive: true, force: true })
        } else {
            fs.unlinkSync(full)
        }
        return { success: true, output: `✅ Deleted: ${full}` }
    } catch (e) {
        return { success: false, output: `Delete failed: ${e.message}` }
    }
}

// ── Get info about the workspace ──────────────────────────────────────────────
const workspaceInfo = (userId) => {
    const dir = getUserWorkspace(userId)
    try {
        const size = require('child_process').execSync(`du -sh "${dir}" 2>/dev/null | cut -f1`).toString().trim()
        return { success: true, dir, size, output: `📁 Workspace: ${dir}\n💾 Size: ${size}` }
    } catch {
        return { success: true, dir, size: 'unknown', output: `📁 Workspace: ${dir}` }
    }
}

module.exports = {
    WORKSPACE_ROOT,
    getUserWorkspace,
    resolvePath,
    resolveContainedPath,
    listWorkspace,
    readWorkspaceFile,
    writeWorkspaceFile,
    mkdirWorkspace,
    deleteWorkspaceItem,
    workspaceInfo
}
