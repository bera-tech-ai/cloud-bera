const fs   = require('fs')
const path = require('path')

const WORKSPACE_ROOT = process.env.BERA_WORKSPACE || '/workspace'

try { fs.mkdirSync(WORKSPACE_ROOT, { recursive: true }) } catch {}

const sanitizeId = (str) =>
    String(str || 'shared').replace(/@.+/, '').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 40)

// ── Per-user workspace directory ───────────────────────────────────────────────
const getUserWorkspace = (userId) => {
    const uid = sanitizeId(userId || 'shared')
    const dir = path.join(WORKSPACE_ROOT, uid)
    try { fs.mkdirSync(dir, { recursive: true }) } catch {}
    return dir
}

// ── Resolve path: relative → inside user workspace; absolute → as-is ──────────
const resolvePath = (userId, relOrAbsPath) => {
    if (!relOrAbsPath) return getUserWorkspace(userId)
    const p = String(relOrAbsPath).trim()
    if (path.isAbsolute(p)) return p
    return path.join(getUserWorkspace(userId), p)
}

// ── List workspace directory ───────────────────────────────────────────────────
const listWorkspace = (userId, subPath) => {
    const dir = subPath ? resolvePath(userId, subPath) : getUserWorkspace(userId)
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
    const full = resolvePath(userId, relPath)
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
    const full = resolvePath(userId, relPath)
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
    const full = resolvePath(userId, relPath)
    try {
        fs.mkdirSync(full, { recursive: true })
        return { success: true, output: `✅ Directory created: ${full}`, path: full }
    } catch (e) {
        return { success: false, output: `mkdir failed: ${e.message}`, path: full }
    }
}

// ── Delete a file or folder from workspace ────────────────────────────────────
const deleteWorkspaceItem = (userId, relPath) => {
    const full = resolvePath(userId, relPath)
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
    listWorkspace,
    readWorkspaceFile,
    writeWorkspaceFile,
    mkdirWorkspace,
    deleteWorkspaceItem,
    workspaceInfo
}
