/**
 * Bera AI — Auto Updater Plugin
 * Downloads latest code from GitHub and hot-reloads the bot.
 * Owner only.
 */

const axios  = require('axios')
const fs     = require('fs')
const fse    = require('fs-extra')
const path   = require('path')
const AdmZip = require('adm-zip')
const config = require('../Config')

const ROOT       = path.resolve(__dirname, '..')
const REPO       = 'bera-tech-ai/bera-ai'
const BRANCH     = 'main'
const ZIP_URL    = `https://github.com/${REPO}/archive/${BRANCH}.zip`
const API_URL    = `https://api.github.com/repos/${REPO}/commits/${BRANCH}`
const HASH_FILE  = path.join(ROOT, '.last_commit')

const getGithubHeaders = () => {
    const token = global.db?.data?.settings?.githubToken
    const headers = { 'User-Agent': 'BeraBot/2.0', Accept: 'application/vnd.github+json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    return headers
}

// Files/folders to never overwrite during update
const EXCLUDE = [
    'session',
    'Database/db.json',
    '.env',
    'node_modules',
    '.last_commit',
]

const getStoredHash = () => {
    try { return fs.readFileSync(HASH_FILE, 'utf8').trim() } catch { return null }
}

const saveHash = (hash) => {
    try { fs.writeFileSync(HASH_FILE, hash, 'utf8') } catch {}
}

const isExcluded = (relPath) =>
    EXCLUDE.some(ex => relPath === ex || relPath.startsWith(ex + path.sep) || relPath.startsWith(ex + '/'))

const copyUpdate = (src, dest) => {
    const items = fs.readdirSync(src)
    for (const item of items) {
        const relPath = item
        if (isExcluded(relPath)) continue
        const srcItem  = path.join(src, item)
        const destItem = path.join(dest, item)
        const stat     = fs.statSync(srcItem)
        if (stat.isDirectory()) {
            fse.ensureDirSync(destItem)
            copyUpdateDeep(srcItem, destItem, relPath)
        } else {
            fse.copySync(srcItem, destItem, { overwrite: true })
        }
    }
}

const copyUpdateDeep = (src, dest, baseRel) => {
    const items = fs.readdirSync(src)
    for (const item of items) {
        const relPath = baseRel + path.sep + item
        if (isExcluded(relPath)) continue
        const srcItem  = path.join(src, item)
        const destItem = path.join(dest, item)
        const stat     = fs.statSync(srcItem)
        if (stat.isDirectory()) {
            fse.ensureDirSync(destItem)
            copyUpdateDeep(srcItem, destItem, relPath)
        } else {
            fse.copySync(srcItem, destItem, { overwrite: true })
        }
    }
}

const handle = async (m, { conn, reply, command, isOwner, chat }) => {
    const react = (e) => conn.sendMessage(chat, { react: { text: e, key: m.key } }).catch(() => {})

    if (!isOwner) {
        await react('❌')
        return reply('❌ Owner only command!')
    }

    if (command === 'checkupdate' || command === 'updatecheck') {
        try {
            await react('🔍')
            await reply('🔍 Checking for updates...')
            const { data } = await axios.get(API_URL, {
                timeout: 20000,
                headers: getGithubHeaders()
            })
            const latest  = data.sha
            const current = getStoredHash()
            const author  = data.commit?.author?.name || 'Unknown'
            const date    = new Date(data.commit?.author?.date).toLocaleString()
            const message = data.commit?.message || 'No message'

            if (latest === current) {
                await react('✅')
                return reply('✅ *Bera AI is already on the latest version!*\n\n🔖 *Commit:* `' + latest.slice(0, 7) + '`\n📅 *Date:* ' + date + '\n💬 *Msg:* ' + message)
            }

            await react('🆕')
            return reply(
                '🆕 *Update Available!*\n\n' +
                '👤 *Author:* ' + author + '\n' +
                '📅 *Date:* ' + date + '\n' +
                '💬 *Message:* ' + message + '\n' +
                '🔖 *Hash:* `' + latest.slice(0, 7) + '`\n\n' +
                'Type *.update* to install it now.'
            )
        } catch (e) {
            await react('❌')
            return reply('❌ Could not check for updates: ' + e.message)
        }
    }

    if (command === 'update' || command === 'updatenow' || command === 'updt' || command === 'sync') {
        const zipPath     = path.join(ROOT, 'bera-ai-update.zip')
        const extractPath = path.join(ROOT, '_update_tmp')

        try {
            await react('🔍')
            await reply('🔍 Checking for updates...')

            const { data: commitData } = await axios.get(API_URL, {
                timeout: 20000,
                headers: getGithubHeaders()
            })
            const latestHash  = commitData.sha
            const currentHash = getStoredHash()

            if (latestHash === currentHash) {
                await react('✅')
                return reply('✅ Already on the latest version! No update needed.')
            }

            const author  = commitData.commit?.author?.name || 'Unknown'
            const date    = new Date(commitData.commit?.author?.date).toLocaleString()
            const message = commitData.commit?.message || 'No message'

            await reply(
                '⬇️ *Downloading Update...*\n\n' +
                '👤 *Author:* ' + author + '\n' +
                '📅 *Date:* ' + date + '\n' +
                '💬 *Commit:* ' + message + '\n' +
                '🔖 *Hash:* `' + latestHash.slice(0, 7) + '`'
            )

            // Download ZIP
            const { data: zipData } = await axios.get(ZIP_URL, {
                responseType: 'arraybuffer',
                timeout: 60000,
                headers: { 'User-Agent': 'BeraBot/2.0' }
            })
            fs.writeFileSync(zipPath, zipData)
            await reply('📦 Download complete. Extracting...')

            // Extract ZIP
            fse.ensureDirSync(extractPath)
            const zip = new AdmZip(zipPath)
            zip.extractAllTo(extractPath, true)

            // The ZIP extracts to a folder named "bera-ai-main"
            const srcFolder = path.join(extractPath, 'bera-ai-' + BRANCH)
            if (!fs.existsSync(srcFolder)) {
                throw new Error('Extracted folder not found: ' + srcFolder)
            }

            await reply('🔄 Applying update (skipping session, database & .env)...')

            // Copy files, skipping excluded paths
            copyUpdate(srcFolder, ROOT)
            saveHash(latestHash)

            // Cleanup
            fs.unlinkSync(zipPath)
            fse.removeSync(extractPath)

            await react('✅')
            await reply('✅ *Update Complete!*\n\n🔖 Now on: `' + latestHash.slice(0, 7) + '`\n\n🔁 Bot is restarting...')

            setTimeout(() => process.exit(0), 2000)

        } catch (e) {
            // Cleanup on failure
            try { if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath) } catch {}
            try { fse.removeSync(extractPath) } catch {}
            console.error('[UPDATER]', e)
            await react('❌')
            return reply('❌ Update failed: ' + e.message + '\n\nPlease redeploy manually from GitHub.')
        }
    }
}

handle.command = ['update', 'updatenow', 'updt', 'sync', 'checkupdate', 'updatecheck']
handle.tags    = ['owner', 'system']
handle.help    = ['update — Update bot to latest GitHub version', 'checkupdate — Check if update is available']

module.exports = handle
