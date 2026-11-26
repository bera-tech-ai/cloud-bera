const fs = require('fs')
const path = require('path')

const WORK_DIR = path.resolve('./workspace')
if (!fs.existsSync(WORK_DIR)) fs.mkdirSync(WORK_DIR, { recursive: true })

const resolvePath = (filePath) => {
    const clean = String(filePath || '').replace(/^['"`]+|['"`]+$/g, '').trim()
    // Confined to the bot's own tree and the agent project area (/workspace);
    // absolute paths and ../ escapes anywhere else are refused.
    const roots = [path.resolve(process.cwd()), '/workspace']
    const resolved = path.isAbsolute(clean) ? path.resolve(clean) : path.resolve(WORK_DIR, clean)
    const inside = roots.some(r => resolved === r || resolved.startsWith(r + path.sep))
    if (!inside) throw new Error(`Path outside allowed workspace: ${filePath}`)
    return resolved
}

const readFile = (filePath) => {
    try {
        const full = resolvePath(filePath)
        if (!fs.existsSync(full)) return { success: false, error: `File not found: ${filePath}` }
        const stat = fs.statSync(full)
        if (stat.size > 500000) return { success: false, error: `File too large (${Math.round(stat.size / 1024)}KB)` }
        const content = fs.readFileSync(full, 'utf8')
        return { success: true, content, path: full }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

const writeFile = (filePath, content) => {
    try {
        const full = resolvePath(filePath)
        fs.mkdirSync(path.dirname(full), { recursive: true })
        fs.writeFileSync(full, content, 'utf8')
        return { success: true, path: full, size: Buffer.byteLength(content, 'utf8') }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

const appendToFile = (filePath, content) => {
    try {
        const full = resolvePath(filePath)
        fs.mkdirSync(path.dirname(full), { recursive: true })
        fs.appendFileSync(full, content, 'utf8')
        return { success: true, path: full }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

const deleteFile = (filePath) => {
    try {
        const full = resolvePath(filePath)
        if (!fs.existsSync(full)) return { success: false, error: `Not found: ${filePath}` }
        fs.rmSync(full, { recursive: true, force: true })
        return { success: true, path: full }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

const listFiles = (dirPath = '') => {
    try {
        const full = dirPath ? resolvePath(dirPath) : WORK_DIR
        if (!fs.existsSync(full)) return { success: false, error: `Directory not found: ${dirPath || 'workspace'}` }
        const items = fs.readdirSync(full).map(name => {
            const p = path.join(full, name)
            const stat = fs.statSync(p)
            return { name, type: stat.isDirectory() ? 'dir' : 'file', size: stat.size }
        })
        return { success: true, items, path: full }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

module.exports = { readFile, writeFile, appendToFile, deleteFile, listFiles, resolvePath, WORK_DIR }
