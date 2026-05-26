// Plugins/tools_extra.js — Extra tools: weather, define, base64, binary, domain, npm, uploader
const axios = require('axios')
const https = require('https')

const BASE = 'https://apiskeith.top'

const kget = async (endpoint, params = {}, timeout = 20000) => {
    const res = await axios.get(BASE + endpoint, { params, timeout })
    return res.data

    // ── GITGET — download any file or full repo zip from GitHub ──────────────
    if (['gitget', 'gitdown', 'ghget', 'gitfile'].includes(command)) {
        await react('⏳')
        const url = args[0] || text.trim()
        if (!url || !url.includes('github.com')) {
            await react('❌')
            return reply(
                `╭══〘 *📦 GITGET* 〙═⊷\n` +
                `┃ Download any file from GitHub\n` +
                `┃\n` +
                `┃ *Single file:*\n` +
                `┃ ${prefix}gitget https://github.com/user/repo/blob/main/file.js\n` +
                `┃\n` +
                `┃ *Whole repo zip:*\n` +
                `┃ ${prefix}gitclone https://github.com/user/repo\n` +
                `╰══════════════════⊷`
            )
        }
        try {
            // Detect if it's a file URL (contains /blob/) or repo URL
            const isFileUrl = url.includes('/blob/')
            if (isFileUrl) {
                // Convert GitHub blob URL → raw URL
                // https://github.com/owner/repo/blob/main/path/file.js
                // → https://raw.githubusercontent.com/owner/repo/main/path/file.js
                const rawUrl = url
                    .replace('github.com', 'raw.githubusercontent.com')
                    .replace('/blob/', '/')
                const fileName = rawUrl.split('/').pop()
                reply(`⏬ Downloading *${fileName}*...`)
                const fileBuffer = await new Promise((resolve, reject) => {
                    const makeReq = (urlStr) => {
                        const u = new URL(urlStr)
                        const req = require('https').request({ hostname: u.hostname, path: u.pathname + u.search, headers: { 'User-Agent': 'Bera-AI' } }, res => {
                            if (res.statusCode === 301 || res.statusCode === 302) return makeReq(res.headers.location)
                            if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode))
                            const chunks = []
                            res.on('data', c => chunks.push(c))
                            res.on('end', () => resolve(Buffer.concat(chunks)))
                        })
                        req.on('error', reject)
                        req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')) })
                        req.end()
                    }
                    makeReq(rawUrl)
                })
                await react('✅')
                return conn.sendMessage(chat, {
                    document: fileBuffer,
                    fileName: fileName,
                    mimetype: 'application/octet-stream',
                    caption: `📄 *${fileName}*\n📦 From: ${url}`
                }, { quoted: m })
            } else {
                // Treat as repo — download zip
                // Extract owner/repo from URL
                const parts = url.replace('https://github.com/', '').split('/')
                const owner = parts[0]
                const repo  = parts[1]?.replace('.git', '')
                if (!owner || !repo) throw new Error('Invalid GitHub repo URL')
                const branch = parts[3] || 'main' // handle /tree/branch
                const zipUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`
                const fileName = `${repo}-${branch}.zip`
                reply(`⏬ Downloading *${repo}* repo as zip...`)
                const zipBuffer = await new Promise((resolve, reject) => {
                    const makeReq = (urlStr) => {
                        const u = new URL(urlStr)
                        const req = require('https').request({ hostname: u.hostname, path: u.pathname + u.search, headers: { 'User-Agent': 'Bera-AI' } }, res => {
                            if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) return makeReq(res.headers.location)
                            if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode))
                            const chunks = []
                            res.on('data', c => chunks.push(c))
                            res.on('end', () => resolve(Buffer.concat(chunks)))
                        })
                        req.on('error', reject)
                        req.setTimeout(60000, () => { req.destroy(); reject(new Error('timeout')) })
                        req.end()
                    }
                    makeReq(zipUrl)
                })
                await react('✅')
                return conn.sendMessage(chat, {
                    document: zipBuffer,
                    fileName: fileName,
                    mimetype: 'application/zip',
                    caption: `📦 *${repo}* (${branch} branch)\n🔗 ${url}\n📏 ${(zipBuffer.length / 1024).toFixed(1)} KB`
                }, { quoted: m })
            }
        } catch (e) {
            await react('❌')
            return reply(`❌ Download failed: ${e.message}\n\nMake sure the URL is correct and the repo/file is public.`)
        }
    }

    // ── GITCLONE — download full repo as zip ─────────────────────────────────
    if (['gitclone', 'repozip', 'gitzip'].includes(command)) {
        await react('⏳')
        const url = args[0] || text.trim()
        if (!url || !url.includes('github.com')) {
            await react('❌')
            return reply(`❌ Usage: *${prefix}gitclone https://github.com/username/reponame*`)
        }
        try {
            const parts = url.replace('https://github.com/', '').replace(/\/$/, '').split('/')
            const owner = parts[0]
            const repo  = parts[1]?.replace('.git', '')
            if (!owner || !repo) throw new Error('Invalid GitHub URL')
            const branch = 'main'
            const zipUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`
            reply(`⏬ Cloning *${owner}/${repo}* as zip...`)
            const zipBuffer = await new Promise((resolve, reject) => {
                const makeReq = (urlStr) => {
                    const u = new URL(urlStr)
                    const req = require('https').request({ hostname: u.hostname, path: u.pathname + u.search, headers: { 'User-Agent': 'Bera-AI' } }, res => {
                        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) return makeReq(res.headers.location)
                        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ' — check if repo is public and branch is "main"'))
                        const chunks = []
                        res.on('data', c => chunks.push(c))
                        res.on('end', () => resolve(Buffer.concat(chunks)))
                    })
                    req.on('error', reject)
                    req.setTimeout(60000, () => { req.destroy(); reject(new Error('timeout — repo may be too large')) })
                    req.end()
                }
                makeReq(zipUrl)
            })
            await react('✅')
            return conn.sendMessage(chat, {
                document: zipBuffer,
                fileName: `${repo}.zip`,
                mimetype: 'application/zip',
                caption: `📦 *${owner}/${repo}*\n🌿 Branch: ${branch}\n📏 Size: ${(zipBuffer.length / 1024).toFixed(1)} KB\n🔗 ${url}`
            }, { quoted: m })
        } catch (e) {
            await react('❌')
            return reply(`❌ Failed: ${e.message}`)
        }
    }


}
