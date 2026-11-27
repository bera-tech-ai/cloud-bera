'use strict'

// ── Bot self-update ──────────────────────────────────────────────────────────
// The core behind .update / .checkupdate / .restart and the agent's
// bot_update / bot_restart intents (Library/lib/agent-dispatch.js).
// Plugins/updater.js is a thin command adapter over this module.
//
// The previous updater pointed at the WRONG repository
// (bera-tech-ai/bera-ai) — .update could never have worked against the
// real codebase, bera-tech-ai/cloud-bera. Fixed here, with the rest of
// the flow kept deliberately conservative:
// - Update = download the main-branch ZIP from GitHub and overlay it
//   onto the working tree, skipping session/, Database/db.json, .env
//   and node_modules. Files removed upstream are NOT deleted locally,
//   and git-untracked local assets (e.g. the Piper voices under
//   Library/assets/) are untouched because the overlay only writes
//   files the ZIP contains.
// - If package.json changed, `npm install` runs before the restart so
//   new dependencies exist; the result is reported either way.
// - checkUpdate also reports how many tracked files differ locally
//   (git status), because the overlay will overwrite them.
// - Restart = process.exit(0) after a short delay; the systemd unit
//   (Restart=always) brings the bot back. The caller's "restarting"
//   message is sent before the exit is scheduled.

const axios = require('axios')
const fs = require('fs')
const fse = require('fs-extra')
const path = require('path')
const AdmZip = require('adm-zip')
const { promisify } = require('util')
const execFileAsync = promisify(require('child_process').execFile)

const ROOT = path.resolve(__dirname, '..', '..')
const REPO = 'bera-tech-ai/cloud-bera'
const BRANCH = 'main'
const ZIP_URL = `https://github.com/${REPO}/archive/${BRANCH}.zip`
const API_URL = `https://api.github.com/repos/${REPO}/commits/${BRANCH}`
const HASH_FILE = path.join(ROOT, '.last_commit')

const EXCLUDE = ['session', 'Database/db.json', '.env', 'node_modules', '.last_commit', '_update_tmp', 'bera-ai-update.zip']

const getGithubHeaders = () => {
    const token = global.db?.data?.settings?.githubToken
    const headers = { 'User-Agent': 'BeraBot/2.0', Accept: 'application/vnd.github+json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    return headers
}

const getStoredHash = () => {
    try { return fs.readFileSync(HASH_FILE, 'utf8').trim() } catch { return null }
}
const saveHash = (hash) => { try { fs.writeFileSync(HASH_FILE, hash, 'utf8') } catch {} }

const isExcluded = (relPath) =>
    EXCLUDE.some(ex => relPath === ex || relPath.startsWith(ex + path.sep) || relPath.startsWith(ex + '/'))

const copyUpdate = (src, dest, baseRel = '') => {
    for (const item of fs.readdirSync(src)) {
        const relPath = baseRel ? baseRel + path.sep + item : item
        if (isExcluded(relPath)) continue
        const srcItem = path.join(src, item)
        const destItem = path.join(dest, item)
        if (fs.statSync(srcItem).isDirectory()) {
            fse.ensureDirSync(destItem)
            copyUpdate(srcItem, destItem, relPath)
        } else {
            fse.copySync(srcItem, destItem, { overwrite: true })
        }
    }
}

// The archive extracts to a single top folder named after the repo and
// branch ("cloud-bera-main"). Find it instead of hardcoding the name —
// the old updater hardcoded "bera-ai-main" from the wrong repo.
const findTopFolder = (extractPath) => {
    const entries = fs.readdirSync(extractPath)
        .map(name => path.join(extractPath, name))
        .filter(p => { try { return fs.statSync(p).isDirectory() } catch { return false } })
    return entries[0] || null
}

const countDirtyFiles = async () => {
    try {
        const { stdout } = await execFileAsync('git', ['-C', ROOT, 'status', '--porcelain'], { timeout: 10000 })
        return stdout.split('\n').filter(l => l.trim()).length
    } catch { return null }
}

const checkUpdate = async () => {
    try {
        const { data } = await axios.get(API_URL, { timeout: 20000, headers: getGithubHeaders() })
        const current = getStoredHash()
        return {
            ok: true,
            latest: data.sha,
            current,
            updateAvailable: data.sha !== current,
            author: data.commit?.author?.name || 'Unknown',
            date: data.commit?.author?.date || null,
            message: data.commit?.message || 'No message',
            dirtyCount: await countDirtyFiles()
        }
    } catch (e) {
        return { ok: false, error: e.message }
    }
}

const applyUpdate = async ({ notify } = {}) => {
    const say = typeof notify === 'function' ? notify : async () => {}
    const zipPath = path.join(ROOT, 'bera-ai-update.zip')
    const extractPath = path.join(ROOT, '_update_tmp')
    try {
        const check = await checkUpdate()
        if (!check.ok) return { ok: false, error: check.error }
        if (!check.updateAvailable) return { ok: true, updateAvailable: false, latest: check.latest }

        await say('⬇️ *Downloading Update...*\n\n' +
            '👤 *Author:* ' + check.author + '\n' +
            '📅 *Date:* ' + (check.date ? new Date(check.date).toLocaleString() : '—') + '\n' +
            '💬 *Commit:* ' + check.message + '\n' +
            '🔖 *Hash:* `' + check.latest.slice(0, 7) + '`')

        const { data: zipData } = await axios.get(ZIP_URL, {
            responseType: 'arraybuffer',
            timeout: 60000,
            headers: { 'User-Agent': 'BeraBot/2.0' }
        })
        fs.writeFileSync(zipPath, zipData)
        await say('📦 Download complete. Extracting...')

        fse.ensureDirSync(extractPath)
        new AdmZip(zipPath).extractAllTo(extractPath, true)
        const srcFolder = findTopFolder(extractPath)
        if (!srcFolder) throw new Error('Extracted folder not found in the update archive.')

        await say('🔄 Applying update (skipping session, database & .env)...')
        const pkgBefore = (() => { try { return fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8') } catch { return null } })()
        copyUpdate(srcFolder, ROOT)
        const pkgAfter = (() => { try { return fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8') } catch { return null } })()

        let npm = null
        if (pkgBefore !== pkgAfter) {
            await say('📦 package.json changed — installing dependencies...')
            try {
                await execFileAsync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: ROOT, timeout: 240000, maxBuffer: 4 * 1024 * 1024 })
                npm = true
            } catch { npm = false }
        }

        saveHash(check.latest)
        return { ok: true, updateAvailable: true, latest: check.latest, npm }
    } catch (e) {
        return { ok: false, error: e.message }
    } finally {
        try { if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath) } catch {}
        try { fse.removeSync(extractPath) } catch {}
    }
}

// Restart via exit: systemd (Restart=always) revives the process.
// The delay lets the caller's farewell message flush first.
const restartBot = (delayMs = 1500) => {
    setTimeout(() => process.exit(0), delayMs)
}

module.exports = { checkUpdate, applyUpdate, restartBot, REPO, BRANCH, isExcluded, findTopFolder, getStoredHash }
