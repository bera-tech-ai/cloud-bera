const { nickAi, MAX_HISTORY } = require('../Library/lib/bera')
const config = require('../Config')
const { detectIntent } = require('../Library/router')
const { cloneRepo, setupRepoRemote, gitPush, gitStatus, gitLog, listWorkspace, runShell } = require('../Library/actions/shell')
const {
    getUser: ghUser, getOwner, listRepos, createRepo, deleteRepo, getRepo,
    listFiles: ghListFiles, getFile: ghGetFile, upsertFile, pushMultipleFiles,
    createIssue, listIssues, forkRepo, createBranch, getCommits, listBranches,
    searchRepos, PROJECT_TEMPLATES, detectProjectType
} = require('../Library/actions/github')
const { generateImage } = require('../Library/actions/imagegen')
const { searchAndDownload } = require('../Library/actions/music')
const { webSearch } = require('../Library/actions/search')
const { analyzeImageFromBuffer } = require('../Library/actions/vision')
const { readFile, writeFile, listFiles, deleteFile } = require('../Library/actions/files')
const { evalJS } = require('../Library/actions/jseval')
const { validateAndFixCode } = require('../Library/actions/beraai')
const { planTask, summarizeResults } = require('../Library/actions/agent')
const { translate } = require('../Library/actions/translate')
const { download, detectPlatform } = require('../Library/actions/downloader')
const { listServers, getServerStatus, powerAction, sendCommand, formatUptime, statusEmoji } = require('../Library/actions/pterodactyl')
const {
    gtLyrics, gtDefine, gtDictionary, gtGoogle, gtWiki, gtWeather,
    gtYtMp3, gtYtMp4, gtTikTok, gtInstagram, gtTwitter, gtSpotifyDl,
    gtSpotifySearch, gtRemoveBg, gtCreateQr, gtScreenshot, gtOcr, gtUpscale,
    gtLiveScore, gtPredictions, gtStandings, gtImage, gtBible, gtWallpaper,
    gtClassifyIntent
} = require('../Library/actions/giftedapi')

const getUserHistory = (sender) => {
    if (!global.db.data.users[sender]) global.db.data.users[sender] = {}
    if (!Array.isArray(global.db.data.users[sender].nickHistory))
        global.db.data.users[sender].nickHistory = []
    return global.db.data.users[sender].nickHistory
}

const saveHistory = async (sender, history) => {
    global.db.data.users[sender].nickHistory = history.slice(-MAX_HISTORY)
    await global.db.write()
}

const hasImage = (msg) => msg && /image/.test(msg.mimetype || '')

const getImageBuffer = async (conn, msg) => {
    try {
        if (msg && msg.key && msg.message) {
            return await conn.downloadMediaMessage({ key: msg.key, message: msg.message })
        }
        return await conn.downloadMediaMessage(msg)
    } catch { return null }
}

const react = (conn, m, emoji) =>
    conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } }).catch(() => {})

const askNick = async (m, conn, reply, sender, userText, imageBuffer = null) => {
    await react(conn, m, imageBuffer ? '📷' : '🤖')

    const history = getUserHistory(sender)

    let answer
    try {
        answer = await nickAi(userText, history, null, imageBuffer)
    } catch (e) {
        await react(conn, m, '❌')
        return reply(`❌ *Bera AI is unavailable right now.*\n\n_${e.message}_`)
    }

    history.push({ role: 'user', content: imageBuffer ? `[image] ${userText}` : userText })
    history.push({ role: 'assistant', content: answer })

    const sent = await conn.sendMessage(m.chat, { text: answer, linkPreview: false }, { quoted: m })
    const msgId = sent?.key?.id

    const userData = global.db.data.users[sender]
    if (!Array.isArray(userData.nickMsgIds)) userData.nickMsgIds = []
    if (msgId) userData.nickMsgIds = [...userData.nickMsgIds, msgId].slice(-30)

    await saveHistory(sender, history)
    await react(conn, m, '✅')
    return sent
}

const handleAction = async (m, conn, reply, text, sender, imageBuffer) => {
    const intent = detectIntent(text)

    const ownerNum = (config.owner || config.ownerNumber || '254116763755').replace(/[^0-9]/g, '')
    const senderNum = (sender || '').replace(/[^0-9]/g, '')
    const isOwner = senderNum === ownerNum || (Array.isArray(global.db?.data?.settings?.sudo) && global.db.data.settings.sudo.includes(senderNum))
    let isAdmin = false
    try {
        if (m.isGroup) {
            const meta = await conn.groupMetadata(m.chat).catch(() => null)
            isAdmin = meta?.participants?.find(p => p.id.split('@')[0] === senderNum)?.admin != null
        }
    } catch {}

    if (imageBuffer) {
        const wantsCreate = /\b(create|generate|make|draw|similar|like this|same style)\b/i.test(text)
        if (wantsCreate) {
            await react(conn, m, '🎨')
            const desc = await analyzeImageFromBuffer(imageBuffer, 'Describe this image in precise detail suitable for recreating it with an image generator.')
            if (!desc.success) {
                await react(conn, m, '❌')
                return reply(`❌ Couldn't read the image: ${desc.error}`)
            }
            const prompt = text.replace(/\b(create|generate|make|draw|similar|like this|same style|image|picture)\b/gi, '').trim()
            const fullPrompt = prompt ? `${prompt}, ${desc.result}` : desc.result
            const gen = await generateImage(fullPrompt.slice(0, 500))
            await react(conn, m, gen.success ? '✅' : '❌')
            if (!gen.success) return reply(`❌ Image generation failed: ${gen.error}`)
            const caption = `🎨 Generated from your image`
            if (gen.buffer) return conn.sendMessage(m.chat, { image: gen.buffer, caption }, { quoted: m })
            if (gen.url) return conn.sendMessage(m.chat, { image: { url: gen.url }, caption }, { quoted: m })
        }
        await react(conn, m, '🔍')
        const q = text || 'Describe and analyse this image in detail. Be specific and direct.'
        const res = await analyzeImageFromBuffer(imageBuffer, q)
        await react(conn, m, res.success ? '✅' : '❌')
        return reply(res.success ? res.result : `❌ Vision failed: ${res.error}`)
    }

    if (!imageBuffer && m.quoted && hasImage(m.quoted)) {
        const quotedBuf = await getImageBuffer(conn, m.quoted)
        if (quotedBuf) return handleAction(m, conn, reply, text, sender, quotedBuf)
    }

    if (intent === 'image_gen') {
        await react(conn, m, '🎨')
        const prompt = text.replace(/\b(create|generate|make|draw|produce|paint|render|an?|a|the|please)\b/gi, '').trim() || text
        const res = await generateImage(prompt)
        if (!res.success) {
            await react(conn, m, '❌')
            return reply(`❌ Image generation failed: ${res.error}`)
        }
        await react(conn, m, '✅')
        if (res.buffer && Buffer.isBuffer(res.buffer)) {
            return conn.sendMessage(m.chat, { image: res.buffer, caption: `🎨 *${prompt}*` }, { quoted: m })
        }
        if (res.url && typeof res.url === 'string' && res.url.startsWith('http')) {
            return conn.sendMessage(m.chat, { image: { url: res.url }, caption: `🎨 *${prompt}*` }, { quoted: m })
        }
        await react(conn, m, '❌')
        return reply(`❌ Image generation returned no usable result.`)
    }

    if (intent === 'music') {
        await react(conn, m, '🎵')
        const query = text.replace(/\b(play|send|find|search|get|download|song|music|audio|track|beat|mp3|by|from)\b/gi, '').trim() || text
        const res = await searchAndDownload(query)
        if (!res.success) {
            await react(conn, m, '❌')
            return reply(`❌ Couldn't find that: ${res.error}`)
        }
        await react(conn, m, '✅')
        const infoLine = `🎵 *${res.title}*${res.channel ? `\n${res.channel}` : ''}${res.duration ? ` · ${res.duration}` : ''}`
        if (typeof res.audioUrl !== 'string' || !res.audioUrl.startsWith('http')) {
            await react(conn, m, '❌')
            return reply(`❌ Got an invalid audio link. Try a different song name.`)
        }
        await conn.sendMessage(m.chat, {
            audio: { url: res.audioUrl },
            mimetype: 'audio/mp4',
            ptt: false,
            fileName: `${res.title}.mp3`
        }, { quoted: m })
        const thumbUrl = typeof res.thumbnail === 'string' && res.thumbnail.startsWith('http') ? res.thumbnail : ''
        if (thumbUrl) {
            return conn.sendMessage(m.chat, { image: { url: thumbUrl }, caption: infoLine })
        }
        return conn.sendMessage(m.chat, { text: infoLine })
    }

    if (intent === 'git_clone') {
        await react(conn, m, '📦')
        const urlMatch = text.match(/https?:\/\/[^\s]+|git@[^\s]+/)
        if (!urlMatch) return reply(`❌ No repo URL found. Example: clone https://github.com/user/repo`)

        const cloneUrl = urlMatch[0].replace(/\/$/, '')
        const cloneRes = await cloneRepo(cloneUrl)
        if (!cloneRes.success) {
            await react(conn, m, '❌')
            return reply(`❌ Clone failed: ${cloneRes.output}`)
        }
        const folderName = cloneRes.name

        const ghUsername = process.env.GITHUB_USERNAME || (await ghUser().then(u => u.login).catch(() => null))
        if (!ghUsername) {
            await react(conn, m, '⚠️')
            return reply(`✅ Cloned \`${folderName}\` — GitHub push setup skipped (no username configured).`)
        }

        const ghRes = await createRepo(folderName, false, `Cloned via Bera Bot`)
        if (ghRes.error) {
            await react(conn, m, '⚠️')
            return reply(`✅ Cloned \`${folderName}\` — GitHub repo creation failed: ${ghRes.error}`)
        }

        const token = process.env.GITHUB_TOKEN
        const remoteRes = await setupRepoRemote(folderName, ghUsername, folderName, token)

        global.db.data.settings = global.db.data.settings || {}
        global.db.data.settings.lastCloned = folderName
        if (!global.db.data.settings.clonedRepos) global.db.data.settings.clonedRepos = {}
        global.db.data.settings.clonedRepos[folderName] = { github: `${ghUsername}/${folderName}`, url: ghRes.html_url }
        await global.db.write()

        await react(conn, m, '✅')
        return reply(
            `📦 *Cloned & ready*\n` +
            `Folder: \`${folderName}\`\n` +
            `GitHub: ${ghRes.html_url}\n` +
            `Remote: ${remoteRes.success ? '✅' : '⚠️ ' + remoteRes.output}`
        )
    }

    if (intent === 'git_push') {
        await react(conn, m, '🚀')

        const msgMatch = text.match(/["']([^"']+)["']/)
        const commitMsg = msgMatch ? msgMatch[1] : 'Update via Bera Bot'

        const stopWords = ['git', 'push', 'to', 'github', 'my', 'the', 'repo', 'code', 'changes', 'this']
        const clonedRepos = global.db.data.settings?.clonedRepos || {}
        const workspace = listWorkspace()

        let folder = ''

        const knownFolders = Object.keys(clonedRepos)
        for (const kf of knownFolders) {
            if (text.toLowerCase().includes(kf.toLowerCase())) { folder = kf; break }
        }

        if (!folder) {
            for (const ws of workspace) {
                if (text.toLowerCase().includes(ws.toLowerCase())) { folder = ws; break }
            }
        }

        if (!folder && workspace.length === 1) folder = workspace[0]

        if (!folder && global.db.data.settings?.lastCloned) folder = global.db.data.settings.lastCloned

        if (!folder) {
            const list = workspace.length
                ? workspace.map(f => `┃❍ _push ${f}_`).join('\n')
                : '┃❍ (no repos in workspace — clone something first)'
            return reply(
                `❌ Which repo to push?\n\n` +
                `╭══〘 *📁 WORKSPACE* 〙═⊷\n${list}\n╰══════════════════⊷`
            )
        }

        const res = await gitPush(folder, commitMsg)
        await react(conn, m, res.success ? '✅' : '❌')

        if (res.success) {
            const ghInfo = clonedRepos[folder]
            const ghLine = ghInfo ? `\nhttps://github.com/${ghInfo.github}` : ''
            return reply(`🚀 *Pushed* \`${folder}\`\nCommit: _${commitMsg}_${ghLine}`)
        }
        return reply(`❌ Push failed:\n${res.output.slice(0, 400)}`)
    }

    // ── GitHub helper (shared across all github_* intents) ────────────────────
    const extractRepoName = (txt) => {
        const t2 = txt.trim()
        // IMPORTANT: "name it X" / "call it X" must come BEFORE "named?" / "called?"
        // otherwise the regex engine matches "name" alone and captures "it" as the repo name
        return (
            // "name it X" / "named it X" / "call it X"
            t2.match(/\b(?:name(?:d)?\s+it|call(?:ed)?\s+it|make\s+it|titled?)\s+["']?([\w.-]{2,})\b/i)?.[1] ||
            // "named X" / "called X" / "named 'X'"
            t2.match(/\b(?:named?|called?)\s+["']?([\w.-]{2,})["']?/i)?.[1] ||
            // "repo X" or "repository X" at the end
            t2.match(/\b(?:repo|repository|project)\s+(?:called?|named?)?\s*["']?([\w.-]{2,})["']?/i)?.[1] ||
            // quoted names
            t2.match(/["']([\w.-]{2,})["']/)?.[1] ||
            // "create repo X" — word after repo/project with no qualifier
            t2.match(/\b(?:repo|repository|project)\s+([\w.-]{2,})\s*$/i)?.[1] ||
            // last word as fallback (only if 3+ chars to avoid "it", "a", etc.)
            t2.match(/\b([a-z][\w.-]{2,40})\s*$/i)?.[1] ||
            null
        )
    }

    // ── GitHub: list repos ────────────────────────────────────────────────────
    if (intent === 'github_list_repos') {
        await react(conn, m, '🐙')
        const res = await listRepos()
        if (res.error) return reply(`❌ GitHub: ${res.error}`)
        if (!res.length) return reply(`You have no repositories yet. Say "create a repo named X" to make one.`)
        const lines = res.map((r, i) => `${i + 1}. ${r.private ? '🔒' : '🌐'} *${r.name}*${r.language ? ` _(${r.language})_` : ''}${r.description ? `\n   ${r.description}` : ''}\n   ${r.url}`).join('\n\n')
        await react(conn, m, '✅')
        return reply(`🐙 *Your GitHub Repositories (${res.length})*\n\n${lines}`)
    }

    // ── GitHub: create repo ───────────────────────────────────────────────────
    if (intent === 'github_create_repo') {
        await react(conn, m, '🐙')
        const name = extractRepoName(text)
        if (!name) return reply(`❌ Tell me the repo name. E.g: "create a repo called my-project" or "make a private repo named bera-tools"`)
        const isPrivate = /private/i.test(text)
        const descMatch = text.match(/desc(?:ription)?\s+["']?([^"'\n]+)["']?/i)
        const description = descMatch?.[1]?.trim() || ''
        await reply(`🔧 Creating ${isPrivate ? 'private' : 'public'} repo *${name}*...`)
        const res = await createRepo(name, isPrivate, description)
        if (res.error) return reply(`❌ GitHub: ${res.error}`)
        await react(conn, m, '✅')
        return reply(`✅ *Repo Created!*\n\n🐙 *${res.full_name}*\n${isPrivate ? '🔒 Private' : '🌐 Public'}\n🔗 ${res.html_url}\n\nTell me to add files, scaffold a project, or create a branch!`)
    }

    // ── GitHub: scaffold + push a full project ────────────────────────────────
    if (intent === 'github_create_project') {
        await react(conn, m, '⚙️')
        const name = extractRepoName(text)
        if (!name) return reply(`❌ Tell me the project name. E.g: "build an Express project called my-api on GitHub"`)
        const type = detectProjectType(text)
        const template = PROJECT_TEMPLATES[type]
        const isPrivate = /private/i.test(text)
        await reply(`⚙️ *Scaffolding ${template.label} project: ${name}*\n\nStep 1: Creating GitHub repo...`)
        const repo = await createRepo(name, isPrivate, `${template.label} project — created by Bera AI`)
        if (repo.error) return reply(`❌ Could not create repo: ${repo.error}`)
        const owner = repo.owner?.login || await getOwner()
        if (!owner) return reply(`❌ Could not determine GitHub username.`)
        await reply(`✅ Repo created. Step 2: Pushing ${template.files(name).length} files...`)
        const files = template.files(name)
        const results = await pushMultipleFiles(owner, name, files)
        const ok    = results.filter(r => r.ok)
        const errs  = results.filter(r => !r.ok)
        await react(conn, m, errs.length === 0 ? '✅' : '⚠️')
        const fileList = ok.map(r => `  ✅ \`${r.path}\``).join('\n') + (errs.length ? '\n' + errs.map(r => `  ❌ \`${r.path}\`: ${r.error}`).join('\n') : '')
        return reply(
            `🚀 *${name} is live on GitHub!*\n\n` +
            `📦 Type: ${template.label}\n` +
            `🔗 ${repo.html_url}\n` +
            `${isPrivate ? '🔒 Private' : '🌐 Public'}\n\n` +
            `📁 *Files pushed:*\n${fileList}\n\n` +
            `Clone with:\n\`git clone ${repo.clone_url}\``
        )
    }

    // ── GitHub: push / add a file ─────────────────────────────────────────────
    if (intent === 'github_push_file') {
        await react(conn, m, '📤')
        const quoted = m.quoted?.text || m.quoted?.body || ''
        const repoMatch = text.match(/\b(?:to|into|repo|repository)\s+["']?([\w.-]+)["']?/i)
        const pathMatch = text.match(/(?:as|named?|file\s+name|path)\s+["']?([\w./-]+)["']?/i)
        const msgMatch  = text.match(/(?:commit\s+message|message)\s+["']?([^"'\n]+)["']?/i)
        if (!repoMatch) return reply(`❌ Tell me which repo. E.g: "add this file to my-project" and quote the file content`)
        if (!quoted) return reply(`❌ Quote the file content you want to push, then say "push this to [repo-name]"`)
        const repoName  = repoMatch[1]
        const filePath  = pathMatch?.[1] || 'file.txt'
        const commitMsg = msgMatch?.[1] || `Add ${filePath} via Bera AI`
        const owner = await getOwner()
        if (!owner) return reply(`❌ Could not get GitHub username. Is your token set?`)
        await reply(`📤 Pushing \`${filePath}\` to *${owner}/${repoName}*...`)
        const res = await upsertFile(owner, repoName, filePath, quoted, commitMsg)
        if (res.error) return reply(`❌ Push failed: ${res.error}`)
        await react(conn, m, '✅')
        return reply(`✅ *Pushed!*\n\n📄 \`${filePath}\`\n🐙 *${owner}/${repoName}*\n🔗 ${res.content?.html_url || 'https://github.com/' + owner + '/' + repoName}`)
    }

    // ── GitHub: delete repo ───────────────────────────────────────────────────
    if (intent === 'github_delete_repo') {
        await react(conn, m, '🗑️')
        const name = extractRepoName(text)
        if (!name) return reply(`❌ Which repo? E.g: "delete the repo named old-project"`)
        const owner = await getOwner()
        if (!owner) return reply(`❌ Could not get GitHub username.`)
        await reply(`⚠️ Deleting *${owner}/${name}*... this cannot be undone.`)
        const res = await deleteRepo(owner, name)
        if (res.error) return reply(`❌ GitHub: ${res.error}`)
        await react(conn, m, '✅')
        return reply(`✅ Repo *${name}* has been permanently deleted.`)
    }

    // ── GitHub: repo info ─────────────────────────────────────────────────────
    if (intent === 'github_repo_info') {
        await react(conn, m, '🔍')
        const name = extractRepoName(text)
        if (!name) return reply(`❌ Which repo? E.g: "info on my bera-ai repo"`)
        const owner = await getOwner()
        if (!owner) return reply(`❌ Could not get GitHub username.`)
        const res = await getRepo(owner, name)
        if (res.error) return reply(`❌ GitHub: ${res.error}`)
        await react(conn, m, '✅')
        return reply(
            `🐙 *${res.full_name}*\n\n` +
            `📝 ${res.description || 'No description'}\n` +
            `${res.private ? '🔒 Private' : '🌐 Public'}\n` +
            `⭐ Stars: ${res.stargazers_count} | 🍴 Forks: ${res.forks_count}\n` +
            `💬 Issues: ${res.open_issues_count} open\n` +
            `🌿 Default branch: ${res.default_branch}\n` +
            `📦 Language: ${res.language || 'Unknown'}\n` +
            `📅 Created: ${new Date(res.created_at).toDateString()}\n` +
            `🔄 Updated: ${new Date(res.updated_at).toDateString()}\n` +
            `🔗 ${res.html_url}`
        )
    }

    // ── GitHub: list files in repo ────────────────────────────────────────────
    if (intent === 'github_list_files') {
        await react(conn, m, '📁')
        const name  = extractRepoName(text)
        const pathM = text.match(/(?:in|inside|folder|path)\s+["']?([\w/./-]+)["']?/i)
        const filePath = pathM?.[1] && !/^(repo|the|my|a)$/i.test(pathM[1]) ? pathM[1] : ''
        if (!name) return reply(`❌ Which repo? E.g: "list files in my-project"`)
        const owner = await getOwner()
        if (!owner) return reply(`❌ Could not get GitHub username.`)
        const res = await ghListFiles(owner, name, filePath)
        if (res.error) return reply(`❌ GitHub: ${res.error}`)
        if (!Array.isArray(res)) return reply(`❌ Unexpected response from GitHub.`)
        const dirs  = res.filter(f => f.type === 'dir').map(f => `📁 ${f.name}/`)
        const files = res.filter(f => f.type === 'file').map(f => `📄 ${f.name}`)
        const all   = [...dirs, ...files]
        await react(conn, m, '✅')
        return reply(`📁 *${owner}/${name}${filePath ? '/' + filePath : ''}* (${all.length} items)\n\n${all.join('\n')}`)
    }

    // ── GitHub: create issue ──────────────────────────────────────────────────
    if (intent === 'github_create_issue') {
        await react(conn, m, '🐛')
        const repoMatch = text.match(/\b(?:on|in|for|repo)\s+["']?([\w.-]+)["']?/i)
        const titleMatch = text.match(/(?:title|about|saying|issue)\s+["']?([^"'\n]{5,100})["']?/i) ||
                           text.match(/(?:create|open|add|raise)\s+(?:an?\s+)?(?:issue|bug|ticket)\s+(.+)/i)
        if (!repoMatch) return reply(`❌ Which repo? E.g: "create an issue on my-project titled Fix login bug"`)
        if (!titleMatch) return reply(`❌ What's the issue about? E.g: "create issue on my-api titled User login fails"`)
        const repoName = repoMatch[1]
        const title    = titleMatch[1]?.trim()
        const bodyM    = text.match(/body\s+["']?([^"'\n]{10,})["']?/i)
        const owner = await getOwner()
        if (!owner) return reply(`❌ Could not get GitHub username.`)
        const res = await createIssue(owner, repoName, title, bodyM?.[1] || '')
        if (res.error) return reply(`❌ GitHub: ${res.error}`)
        await react(conn, m, '✅')
        return reply(`✅ *Issue created!*\n\n🐛 #${res.number}: ${res.title}\n🐙 *${owner}/${repoName}*\n🔗 ${res.html_url}`)
    }

    // ── GitHub: fork repo ─────────────────────────────────────────────────────
    if (intent === 'github_fork') {
        await react(conn, m, '🍴')
        const urlMatch = text.match(/github\.com\/([\w.-]+)\/([\w.-]+)/i)
        const nameM    = urlMatch ? null : extractRepoName(text)
        const ownerM   = text.match(/(?:from|by|of|user)\s+["']?([\w.-]+)["']?/i)
        if (!urlMatch && !nameM) return reply(`❌ Which repo to fork? E.g: "fork github.com/expressjs/express" or "fork express from expressjs"`)
        const srcOwner = urlMatch?.[1] || ownerM?.[1] || (await getOwner())
        const srcRepo  = urlMatch?.[2] || nameM
        await reply(`🍴 Forking *${srcOwner}/${srcRepo}*...`)
        const res = await forkRepo(srcOwner, srcRepo)
        if (res.error) return reply(`❌ GitHub: ${res.error}`)
        await react(conn, m, '✅')
        return reply(`✅ *Forked!*\n\n🍴 *${res.full_name}*\n🔗 ${res.html_url}`)
    }

    // ── GitHub: list branches ─────────────────────────────────────────────────
    if (intent === 'github_branches') {
        await react(conn, m, '🌿')
        const name  = extractRepoName(text)
        if (!name) return reply(`❌ Which repo? E.g: "list branches of my-project"`)
        const owner = await getOwner()
        if (!owner) return reply(`❌ Could not get GitHub username.`)
        const res = await listBranches(owner, name)
        if (res.error) return reply(`❌ GitHub: ${res.error}`)
        const lines = res.map(b => `🌿 ${b.name}${b.protected ? ' 🔒' : ''}`).join('\n')
        await react(conn, m, '✅')
        return reply(`🌿 *Branches in ${owner}/${name}* (${res.length}):\n\n${lines}`)
    }

    // ── GitHub: create branch ─────────────────────────────────────────────────
    if (intent === 'github_create_branch') {
        await react(conn, m, '🌿')
        const repoM   = text.match(/\b(?:in|on|for|repo)\s+["']?([\w.-]+)["']?/i)
        const nameM   = text.match(/\b(?:branch\s+(?:named?|called?))\s+["']?([\w./-]+)["']?/i) ||
                        text.match(/\b(?:create|make|new)\s+(?:a\s+)?branch\s+["']?([\w./-]+)["']?/i)
        const fromM   = text.match(/\b(?:from|off)\s+["']?([\w./-]+)["']?/i)
        if (!repoM) return reply(`❌ Which repo? E.g: "create branch feature-login in my-project"`)
        if (!nameM) return reply(`❌ What should the branch be called? E.g: "create branch feature-auth in my-api"`)
        const repoName  = repoM[1]
        const branchName = nameM[1]
        const fromBranch = fromM?.[1] || 'main'
        const owner = await getOwner()
        if (!owner) return reply(`❌ Could not get GitHub username.`)
        await reply(`🌿 Creating branch *${branchName}* from *${fromBranch}* in *${owner}/${repoName}*...`)
        const res = await createBranch(owner, repoName, branchName, fromBranch)
        if (res.error) return reply(`❌ GitHub: ${res.error}`)
        await react(conn, m, '✅')
        return reply(`✅ *Branch created!*\n\n🌿 *${branchName}*\n📌 From: ${fromBranch}\n🐙 ${owner}/${repoName}`)
    }

    // ── GitHub: recent commits ────────────────────────────────────────────────
    if (intent === 'github_commits') {
        await react(conn, m, '📋')
        const name  = extractRepoName(text)
        if (!name) return reply(`❌ Which repo? E.g: "show commits on my-project"`)
        const owner = await getOwner()
        if (!owner) return reply(`❌ Could not get GitHub username.`)
        const res = await getCommits(owner, name, 5)
        if (res.error) return reply(`❌ GitHub: ${res.error}`)
        if (!Array.isArray(res)) return reply(`❌ Could not fetch commits.`)
        const lines = res.map((c, i) =>
            `${i + 1}. \`${c.sha.slice(0, 7)}\` — ${c.commit.message.split('\n')[0]}\n   👤 ${c.commit.author.name} · ${new Date(c.commit.author.date).toDateString()}`
        ).join('\n\n')
        await react(conn, m, '✅')
        return reply(`📋 *Recent commits in ${owner}/${name}:*\n\n${lines}`)
    }

    // ── GitHub: existing handler (catch-all) ──────────────────────────────────
    if (intent === 'github') {
        await react(conn, m, '🐙')
        const t = text.toLowerCase()
        if (/\b(list|show|my)\b.{0,10}\b(repo|repos)\b/.test(t)) {
            const res = await listRepos()
            if (res.error) return reply(`❌ GitHub: ${res.error}`)
            const lines = res.map(r => `${r.private ? '🔒' : '🌐'} *${r.name}* — ${r.url}`).join('\n')
            await react(conn, m, '✅')
            return reply(`*Your repos (${res.length}):*\n${lines}`)
        }
        if (/\b(create|make|new)\b.{0,10}\b(repo|repository)\b/.test(t)) {
            const name = extractRepoName(text)
            if (!name) return reply(`❌ Tell me the repo name. E.g: "create a repo name it my-project" or "create a repo named cloudtechs"`)
            const isPrivate = /private/.test(t)
            const res = await createRepo(name, isPrivate)
            if (res.error) return reply(`❌ GitHub: ${res.error}`)
            await react(conn, m, '✅')
            return reply(`✅ *Repo Created!*\n\n🐙 *${name}*\n${isPrivate ? '🔒 Private' : '🌐 Public'}\n🔗 ${res.html_url}`)
        }
        if (/\b(delete|remove)\b.{0,10}\b(repo|repository)\b/.test(t)) {
            const nameMatch = text.match(/(?:delete|remove|drop)\s+(?:a\s+)?(?:repo|repository|this)\s+["']?([a-zA-Z0-9_.-]+)["']?/i) ||
                text.match(/(?:name(?:d)?\s+it|named?|called?)\s+["']?([a-zA-Z0-9_.-]+)["']?/i)
            if (!nameMatch) return reply(`❌ Specify repo name.`)
            const ghUsername = process.env.GITHUB_USERNAME || (await ghUser().then(u => u.login).catch(() => null))
            if (!ghUsername) return reply(`❌ GitHub username not set.`)
            const res = await deleteRepo(ghUsername, nameMatch[1])
            if (res.error) return reply(`❌ ${res.error}`)
            await react(conn, m, '✅')
            return reply(`✅ Deleted \`${nameMatch[1]}\``)
        }
        if (/\b(access|reach|connect|have|got|can you|do you)\b/.test(t) ||
            /\b(github|repos?|repositories)\b/.test(t)) {
            const res = await listRepos().catch(() => null)
            const count = Array.isArray(res) ? res.length : '?'
            await react(conn, m, '✅')
            return reply(`Yes, I have full GitHub access as *bera-tech-ai* 🐙\n\nI can:\n• List your repos (${count} so far)\n• Create or delete repos\n• Clone any repo\n• Push code\n\nWhat do you need?`)
        }
        await react(conn, m, '❌')
        return reply(`❌ Try: "list repos", "create repo <name>", "delete repo <name>"`)
    }

    if (intent === 'shell') {
        await react(conn, m, '💻')
        const cmd = text.replace(/^(run|execute|exec|terminal|bash|shell|command|cmd)\s+/i, '').trim()
        const res = await runShell(cmd)
        await react(conn, m, res.success ? '✅' : '❌')
        const out = res.output.length > 2000 ? res.output.slice(0, 2000) + '\n...(truncated)' : res.output
        return reply(`\`\`\`\n${out || '(no output)'}\n\`\`\``)
    }

    if (intent === 'search') {
        await react(conn, m, '🔍')
        const res = await webSearch(text)
        await react(conn, m, res.success ? '✅' : '❌')
        return reply(res.success ? res.result : `❌ Search failed: ${res.error}`)
    }

    // ── Server / VPS stats ────────────────────────────────────────────────────
    if (intent === 'server_stats') {
        await react(conn, m, '🖥️')
        const { richServerStats } = require('../Library/actions/beraai')
        const s = await richServerStats()
        const pm2lines = s.pm2.length
            ? s.pm2.map(p =>
                `${p.status === 'online' ? '🟢' : '🔴'} *${p.name}* — CPU: ${p.cpu} | MEM: ${p.memory} | ↺ ${p.restarts}`
            ).join('\n')
            : '_(PM2 not running on this host)_'
        await react(conn, m, '✅')
        return reply(
            `╭══〘 *🖥️ SERVER STATS* 〙═⊷\n` +
            `┃\n` +
            `┃ 💾 *Memory*\n` +
            `┃❍ Used: ${s.memory.used} / ${s.memory.total} (${s.memory.pct})\n` +
            `┃❍ Free: ${s.memory.free}\n` +
            `┃\n` +
            `┃ 💿 *Disk*\n` +
            `┃❍ Used: ${s.disk.used} / ${s.disk.total} (${s.disk.pct})\n` +
            `┃❍ Free: ${s.disk.free}\n` +
            `┃\n` +
            `┃ ⚡ *Load Average:* ${s.load}\n` +
            `┃ ⏱️ *Uptime:* ${s.uptime}\n` +
            `┃ 🔧 *CPUs:* ${s.cpus} core(s)\n` +
            `┃\n` +
            `┃ ⚙️ *PM2 Processes*\n` +
            `┃ ${pm2lines.replace(/\n/g, '\n┃ ')}\n` +
            `╰══════════════════⊷`
        )
    }

    // ── PM2 list ──────────────────────────────────────────────────────────────
    if (intent === 'pm2_list') {
        await react(conn, m, '⚙️')
        const { pm2List } = require('../Library/actions/beraai')
        const r = await pm2List()
        await react(conn, m, '✅')
        if (r.output && r.output.includes('PM2_NOT_FOUND')) {
            return reply(`⚙️ PM2 is not installed or not running on this host.\n\n_This BeraHost environment may not have PM2._`)
        }
        return reply(`╭══〘 *⚙️ PM2 PROCESSES* 〙═⊷\n\`\`\`\n${r.output.slice(0, 3000)}\n\`\`\`\n╰══════════════════⊷`)
    }

    // ── PM2 logs ──────────────────────────────────────────────────────────────
    if (intent === 'pm2_logs') {
        await react(conn, m, '📋')
        const { pm2Logs } = require('../Library/actions/beraai')
        const processName = text.match(/\b(?:logs?\s+(?:of|for)|of|for)\s+([\w.-]+)/i)?.[1] ||
                            text.match(/\b([\w.-]+)\s+(?:logs?|process)\b/i)?.[1]
        const linesMatch  = text.match(/(?:last\s+)?(\d+)\s+(?:lines?|logs?)/i)
        const lines       = linesMatch ? parseInt(linesMatch[1]) : 15
        if (!processName) {
            return reply(`📋 Which process? E.g: _"get me the last 15 logs of bera-ai"_`)
        }
        await reply(`📋 _Fetching last ${lines} lines of *${processName}* logs..._`)
        const r = await pm2Logs(processName, lines)
        await react(conn, m, '✅')
        return reply(
            `╭══〘 *📋 PM2 LOGS: ${processName}* 〙═⊷\n\`\`\`\n${(r.output || 'No logs found').slice(0, 3000)}\n\`\`\`\n╰══════════════════⊷`
        )
    }

    // ── PM2 restart ───────────────────────────────────────────────────────────
    if (intent === 'pm2_restart') {
        await react(conn, m, '🔄')
        const { pm2Restart } = require('../Library/actions/beraai')
        const processName = text.match(/\b(?:restart\s+(?:the\s+)?)([\w.-]+)/i)?.[1]
        if (!processName) return reply(`🔄 Which process? E.g: _"pm2 restart bera-ai"_`)
        await reply(`🔄 _Restarting *${processName}*..._`)
        const r = await pm2Restart(processName)
        await react(conn, m, r.success ? '✅' : '❌')
        return reply(`╭══〘 *🔄 PM2 RESTART* 〙═⊷\n\`\`\`\n${(r.output || 'Done').slice(0, 2000)}\n\`\`\`\n╰══════════════════⊷`)
    }

    // ── PM2 stop ──────────────────────────────────────────────────────────────
    if (intent === 'pm2_stop') {
        await react(conn, m, '🛑')
        const { pm2Stop } = require('../Library/actions/beraai')
        const processName = text.match(/\b(?:stop\s+(?:the\s+)?)([\w.-]+)/i)?.[1]
        if (!processName) return reply(`🛑 Which process? E.g: _"pm2 stop old-bot"_`)
        await reply(`🛑 _Stopping *${processName}*..._`)
        const r = await pm2Stop(processName)
        await react(conn, m, r.success ? '✅' : '❌')
        return reply(`╭══〘 *🛑 PM2 STOP* 〙═⊷\n\`\`\`\n${(r.output || 'Done').slice(0, 2000)}\n\`\`\`\n╰══════════════════⊷`)
    }

    // ── Bot stats ─────────────────────────────────────────────────────────────
    if (intent === 'bot_stats') {
        await react(conn, m, '🤖')
        const upSecs  = Math.floor(process.uptime())
        const days    = Math.floor(upSecs / 86400)
        const hrs     = Math.floor((upSecs % 86400) / 3600)
        const mins    = Math.floor((upSecs % 3600) / 60)
        const memMb   = (process.memoryUsage().rss / 1048576).toFixed(1)
        const heapMb  = (process.memoryUsage().heapUsed / 1048576).toFixed(1)
        await react(conn, m, '✅')
        return reply(
            `╭══〘 *🤖 BERA AI — BOT STATS* 〙═⊷\n` +
            `┃\n` +
            `┃ 🏷️ *Name:* ${config.botName}\n` +
            `┃ 👤 *Owner:* ${config.owner}\n` +
            `┃ ⚡ *Prefix:* ${global.db?.data?.settings?.prefix || config.prefix || '.'}\n` +
            `┃\n` +
            `┃ ⏱️ *Uptime:* ${days}d ${hrs}h ${mins}m\n` +
            `┃ 💾 *Memory (RSS):* ${memMb} MB\n` +
            `┃ 🔥 *Heap Used:* ${heapMb} MB\n` +
            `┃ 🟢 *Node.js:* ${process.version}\n` +
            `┃ 🐙 *GitHub:* bera-tech-ai/bera-ai\n` +
            `┃\n` +
            `┃ 🧠 *AI Engine:* Pollinations AI\n` +
            `┃    (openai → mistral → deepseek → llama)\n` +
            `┃ 🌍 *Platform:* WhatsApp Multi-Device\n` +
            `╰══════════════════⊷`
        )
    }

    // ── GROUP MANAGEMENT — natural language ───────────────────────────────────
    // All group actions require Bera to be an admin. Owner can always trigger.
    const isGroup  = m.chat?.endsWith('@g.us')
    const getBotJid = () => (conn.user?.id || '').replace(/:[0-9]+@/, '@')
    const getGroupMeta = async () => { try { return await conn.groupMetadata(m.chat) } catch { return null } }
    const botIsAdmin = async () => {
        const meta = await getGroupMeta()
        if (!meta) return false
        const me = getBotJid()
        const p = meta.participants.find(x => x.id === me)
        return p?.admin === 'admin' || p?.admin === 'superadmin'
    }
    const senderIsAdmin = async () => {
        if (sender === `${config.owner.replace(/\D/g, '')}@s.whatsapp.net`) return true
        const meta = await getGroupMeta()
        if (!meta) return false
        const p = meta.participants.find(x => x.id === sender)
        return p?.admin === 'admin' || p?.admin === 'superadmin'
    }
    const getMentionedOrQuotedJid = () => {
        if (m.quoted?.sender) return m.quoted.sender
        const mentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
        if (mentions.length) return mentions[0]
        const numMatch = text.match(/\b(\d{7,15})\b/)
        if (numMatch) return numMatch[1] + '@s.whatsapp.net'
        return null
    }

    if (intent === 'group_kick') {
        if (!isGroup) return reply(`❌ This command only works in groups.`)
        if (!await senderIsAdmin()) return reply(`⛔ Only group admins can kick members.`)
        if (!await botIsAdmin()) return reply(`❌ Make me an admin first so I can kick members.`)
        const target = getMentionedOrQuotedJid()
        if (!target) return reply(`❌ Who should I kick? Mention or quote the person.`)
        await react(conn, m, '⏳')
        try {
            await conn.groupParticipantsUpdate(m.chat, [target], 'remove')
            await react(conn, m, '✅')
            return reply(`✅ Kicked @${target.split('@')[0]} from the group.`, { mentions: [target] })
        } catch (e) { await react(conn, m, '❌'); return reply(`❌ Failed: ${e.message}`) }
    }

    if (intent === 'group_add') {
        if (!isGroup) return reply(`❌ This command only works in groups.`)
        if (!await senderIsAdmin()) return reply(`⛔ Only group admins can add members.`)
        if (!await botIsAdmin()) return reply(`❌ Make me an admin first so I can add members.`)
        const numMatch = text.match(/\b(\d{7,15})\b/)
        if (!numMatch) return reply(`❌ Provide a phone number. E.g: _"Bera add 254712345678"_`)
        const jid = numMatch[1] + '@s.whatsapp.net'
        await react(conn, m, '⏳')
        try {
            await conn.groupParticipantsUpdate(m.chat, [jid], 'add')
            await react(conn, m, '✅')
            return reply(`✅ Added ${numMatch[1]} to the group.`)
        } catch (e) { await react(conn, m, '❌'); return reply(`❌ Failed: ${e.message}`) }
    }

    if (intent === 'group_promote') {
        if (!isGroup) return reply(`❌ Groups only.`)
        if (!await senderIsAdmin()) return reply(`⛔ Only admins can promote members.`)
        if (!await botIsAdmin()) return reply(`❌ Make me an admin first.`)
        const target = getMentionedOrQuotedJid()
        if (!target) return reply(`❌ Who should I promote? Mention or quote them.`)
        await react(conn, m, '⏳')
        try {
            await conn.groupParticipantsUpdate(m.chat, [target], 'promote')
            await react(conn, m, '✅')
            return reply(`✅ @${target.split('@')[0]} is now an admin 👑`, { mentions: [target] })
        } catch (e) { await react(conn, m, '❌'); return reply(`❌ Failed: ${e.message}`) }
    }

    if (intent === 'group_demote') {
        if (!isGroup) return reply(`❌ Groups only.`)
        if (!await senderIsAdmin()) return reply(`⛔ Only admins can demote members.`)
        if (!await botIsAdmin()) return reply(`❌ Make me an admin first.`)
        const target = getMentionedOrQuotedJid()
        if (!target) return reply(`❌ Who should I demote? Mention or quote them.`)
        await react(conn, m, '⏳')
        try {
            await conn.groupParticipantsUpdate(m.chat, [target], 'demote')
            await react(conn, m, '✅')
            return reply(`✅ @${target.split('@')[0]} has been removed from admin.`)
        } catch (e) { await react(conn, m, '❌'); return reply(`❌ Failed: ${e.message}`) }
    }

    if (intent === 'group_mute') {
        if (!isGroup) return reply(`❌ Groups only.`)
        if (!await senderIsAdmin()) return reply(`⛔ Only admins can mute the group.`)
        if (!await botIsAdmin()) return reply(`❌ Make me an admin first.`)
        try {
            await conn.groupSettingUpdate(m.chat, 'announcement')
            return reply(`🔇 Group muted — only admins can send messages now.`)
        } catch (e) { return reply(`❌ ${e.message}`) }
    }

    if (intent === 'group_unmute') {
        if (!isGroup) return reply(`❌ Groups only.`)
        if (!await senderIsAdmin()) return reply(`⛔ Only admins can unmute the group.`)
        if (!await botIsAdmin()) return reply(`❌ Make me an admin first.`)
        try {
            await conn.groupSettingUpdate(m.chat, 'not_announcement')
            return reply(`🔊 Group opened — everyone can send messages.`)
        } catch (e) { return reply(`❌ ${e.message}`) }
    }

    if (intent === 'group_link') {
        if (!isGroup) return reply(`❌ Groups only.`)
        if (!await senderIsAdmin()) return reply(`⛔ Only admins can get the group link.`)
        try {
            const code = await conn.groupInviteCode(m.chat)
            return reply(`🔗 *Group Invite Link:*\nhttps://chat.whatsapp.com/${code}`)
        } catch (e) { return reply(`❌ ${e.message}`) }
    }

    if (intent === 'group_tagall') {
        if (!isGroup) return reply(`❌ Groups only.`)
        if (!await senderIsAdmin()) return reply(`⛔ Only admins can tag all members.`)
        const meta = await getGroupMeta()
        if (!meta) return reply(`❌ Could not fetch group info.`)
        const members = meta.participants.map(p => p.id)
        const mentions = members
        const text2 = `📢 *Attention everyone!*\n${members.map(j => `@${j.split('@')[0]}`).join(' ')}`
        return conn.sendMessage(m.chat, { text: text2, mentions })
    }

    if (intent === 'group_admins') {
        if (!isGroup) return reply(`❌ Groups only.`)
        const meta = await getGroupMeta()
        if (!meta) return reply(`❌ Could not fetch group info.`)
        const admins = meta.participants.filter(p => p.admin)
        if (!admins.length) return reply(`ℹ️ No admins found in this group.`)
        const list = admins.map(p => `• @${p.id.split('@')[0]} (${p.admin})`).join('\n')
        return reply(`👑 *Group Admins (${admins.length}):*\n\n${list}`, { mentions: admins.map(p => p.id) })
    }

    if (intent === 'group_info') {
        if (!isGroup) return reply(`❌ Groups only.`)
        const meta = await getGroupMeta()
        if (!meta) return reply(`❌ Could not fetch group info.`)
        const admins  = meta.participants.filter(p => p.admin).length
        const members = meta.participants.length
        const created = meta.creation ? new Date(meta.creation * 1000).toDateString() : '?'
        return reply(
            `╭══〘 *👥 GROUP INFO* 〙═⊷\n` +
            `┃ 📛 *Name:* ${meta.subject}\n` +
            `┃ 👥 *Members:* ${members}\n` +
            `┃ 👑 *Admins:* ${admins}\n` +
            `┃ 📅 *Created:* ${created}\n` +
            `┃ 📝 *Desc:* ${(meta.desc || 'None').slice(0, 100)}\n` +
            `╰══════════════════⊷`
        )
    }

    if (intent === 'group_warn') {
        if (!isGroup) return reply(`❌ Groups only.`)
        if (!await senderIsAdmin()) return reply(`⛔ Only admins can warn members.`)
        const target = getMentionedOrQuotedJid()
        if (!target) return reply(`❌ Who should I warn? Mention or quote them.`)
        const reason = text.replace(/bera\s*(warn\s*)?/i, '').replace(/@\S+/g, '').trim() || 'No reason given'
        return reply(
            `⚠️ *WARNING*\n\n@${target.split('@')[0]} has been warned.\n📝 Reason: ${reason}\n\n_3 warnings = kick._`,
            { mentions: [target] }
        )
    }

    // ── Voice note transcription (explicit only) ──────────────────────────────
    // Triggered by: quoting a voice note and saying "bera transcribe this"
    //           or: .transcribe command while quoting a voice note
    if (intent === 'transcribe') {
        await react(conn, m, '🎙️')

        // Check for a quoted voice note
        const qType = m.quoted?.mtype || ''
        const isVoiceQuote = qType === 'audioMessage' || qType === 'pttMessage' ||
                             (m.quoted?.mimetype && /audio/.test(m.quoted.mimetype))

        if (!m.quoted || !isVoiceQuote) {
            return reply(
                `🎙️ *Voice Transcription*\n\n` +
                `To transcribe a voice note:\n` +
                `1. Find the voice note in the chat\n` +
                `2. Quote (reply to) it\n` +
                `3. Say: *bera transcribe this*\n` +
                `   or use: *.transcribe*\n\n` +
                `_I only transcribe when you specifically ask — I don't listen to every voice note automatically._`
            )
        }

        await reply(`🎙️ _Downloading and transcribing voice note..._`)

        let audioBuf
        try {
            const quotedMsg = {
                key: m.quoted.key,
                message: m.quoted.message
            }
            audioBuf = await conn.downloadMediaMessage(quotedMsg)
        } catch {
            audioBuf = null
        }

        if (!audioBuf || audioBuf.length < 100) {
            await react(conn, m, '❌')
            return reply(`❌ Couldn't download the voice note. Try again.`)
        }

        const { transcribeAudio } = require('../Library/actions/beraai')
        const result = await transcribeAudio(audioBuf)

        if (!result.success || !result.text) {
            await react(conn, m, '❌')
            return reply(
                `❌ *Transcription failed*\n\n` +
                `The voice transcription service is currently unavailable.\n` +
                `Try again in a moment.`
            )
        }

        await react(conn, m, '✅')
        const transcribed = result.text.trim()

        // Also ask AI if the user wants analysis
        const wantsAnalysis = /\b(analyze|analyse|summarize|respond|reply|answer|what|explain|tell me)\b/i.test(text)
        if (wantsAnalysis) {
            const { nickAi } = require('../Library/lib/bera')
            const history = getUserHistory(sender)
            let aiReply
            try {
                aiReply = await nickAi(`The user sent a voice note that said: "${transcribed}". Respond to what they said.`, history)
            } catch { aiReply = null }

            if (aiReply) {
                history.push({ role: 'user', content: `[voice] ${transcribed}` })
                history.push({ role: 'assistant', content: aiReply })
                await saveHistory(sender, history)
                return reply(`🎙️ *Transcribed:*\n_"${transcribed}"_\n\n${aiReply}`)
            }
        }

        return reply(`🎙️ *Transcribed:*\n\n_"${transcribed}"_`)
    }

    if (intent === 'translate') {
        await react(conn, m, '🌐')
        const langMatch = text.match(/\bto\s+(\w+)$/i) || text.match(/\bin\s+(\w+)$/i) || text.match(/\binto\s+(\w+)$/i)
        const lang = langMatch?.[1] || 'English'
        const quoted = m.quoted?.text || m.quoted?.body || ''
        const content = quoted || text.replace(/\b(translate|translation|to|into|in)\s+\w+\b/gi, '').trim()
        if (!content) return reply(`❌ Nothing to translate. Send text or quote a message and say "translate to French"`)
        const res = await translate(content, lang)
        await react(conn, m, res.success ? '✅' : '❌')
        if (!res.success) return reply(`❌ Translation failed: ${res.error}`)
        return reply(`🌐 *Translated to ${res.to}:*\n\n${res.result}`)
    }

    if (intent === 'download') {
        await react(conn, m, '⬇️')
        const urlMatch = text.match(/https?:\/\/\S+/)
        const url = urlMatch?.[0]
        if (!url) return reply(`❌ Include the video link in your message.\nExample: download this tiktok https://tiktok.com/...`)
        const res = await download(url)
        await react(conn, m, res.success ? '✅' : '❌')
        if (!res.success) return reply(`❌ ${res.error}`)
        const caption = `${res.platform} · ${res.title || ''}${res.author ? ` · @${res.author}` : ''}`.trim()
        return conn.sendMessage(m.chat, {
            video: { url: res.videoUrl },
            caption,
            mimetype: 'video/mp4'
        }, { quoted: m })
    }

    if (intent === 'file_read') {
        await react(conn, m, '📄')
        const pathMatch = text.match(/(?:read|cat|view|show|open|display)?\s*["']?([^\s"']+\.\w+)["']?/i)
        if (!pathMatch) return reply(`❌ Specify a file path. E.g: "read index.js"`)
        const res = readFile(pathMatch[1])
        await react(conn, m, res.success ? '✅' : '❌')
        if (!res.success) return reply(`❌ ${res.error}`)
        const lines = res.content.split('\n').length
        const preview = res.content.length > 3000 ? res.content.slice(0, 3000) + '\n...(truncated)' : res.content
        return reply(`📄 *${pathMatch[1]}* (${lines} lines)\n\`\`\`\n${preview}\n\`\`\``)
    }

    if (intent === 'file_write') {
        await react(conn, m, '✍️')
        const quoted = m.quoted?.text || m.quoted?.body || ''
        const pathMatch = text.match(/(?:create|write|make|save|edit|update|modify)\s+(?:file\s+)?["']?([^\s"']+\.\w+)["']?/i)
        if (!pathMatch) return reply(`❌ Specify filename. E.g: "create file hello.js"\n\nThen quote the content to write.`)
        const content = quoted || text.replace(/(?:create|write|make|save|edit|update|modify)\s+(?:file\s+)?["']?[^\s"']+\.\w+["']?\s*/i, '').trim()
        if (!content) return reply(`❌ No content provided. Quote a message with the content to write.`)
        const res = writeFile(pathMatch[1], content)
        await react(conn, m, res.success ? '✅' : '❌')
        if (!res.success) return reply(`❌ ${res.error}`)
        return reply(`✅ File written: \`${pathMatch[1]}\` (${res.size} bytes)`)
    }

    if (intent === 'file_list') {
        await react(conn, m, '📁')
        const dirMatch = text.match(/(?:in|inside|of|from|at)?\s+["']?([^\s"']+)["']?\s*$/)
        const dir = dirMatch && dirMatch[1] !== 'files' && dirMatch[1] !== 'workspace' ? dirMatch[1] : ''
        const res = listFiles(dir)
        await react(conn, m, res.success ? '✅' : '❌')
        if (!res.success) return reply(`❌ ${res.error}`)
        if (!res.items.length) return reply(`📁 Empty directory: \`${dir || 'workspace'}\``)
        const lines = res.items.map(i =>
            `${i.type === 'dir' ? '📁' : '📄'} ${i.name}${i.type === 'file' ? ` (${i.size}b)` : ''}`
        ).join('\n')
        return reply(`📁 *${dir || 'workspace'}/* (${res.items.length} items)\n\n${lines}`)
    }

    if (intent === 'js_eval') {
        await react(conn, m, '⚙️')
        const quoted = m.quoted?.text || m.quoted?.body || ''
        const code = quoted ||
            text.replace(/^(eval|evaluate|run|execute)\s+(this\s+)?(javascript|js|code|script|node|snippet)?\s*/i, '').trim()
        if (!code) return reply(`❌ No code provided. Quote a message containing JavaScript code.`)
        const res = await evalJS(code)
        await react(conn, m, res.success ? '✅' : '❌')
        const out = res.output.length > 2000 ? res.output.slice(0, 2000) + '\n...(truncated)' : res.output
        return reply(`${res.success ? '✅' : '❌'} *JS Result:*\n\`\`\`\n${out}\n\`\`\``)
    }

    // ── Run / execute quoted code ─────────────────────────────────────────────
    if (intent === 'code_run') {
        await react(conn, m, '▶️')
        const quoted = m.quoted?.text || m.quoted?.body || ''
        const inline = text.replace(/^(run|execute|exec)\s+(this|the|my|this\s+code|the\s+code|this\s+script|it)\b\s*/i, '').trim()
        const code = quoted || inline
        if (!code || code.length < 3) return reply(`❌ Quote the code you want me to run, then say "run this".`)

        // Detect language
        const langMatch = code.match(/^#!.*?(python|bash|sh)\b/i) || text.match(/\b(python|bash|shell)\b/i)
        const lang = langMatch?.[1]?.toLowerCase()

        if (lang === 'python' || lang === 'py') {
            const { writeFileSync, unlinkSync } = require('fs')
            const { exec } = require('child_process')
            const os = require('os'), path = require('path')
            const tmpFile = path.join(os.tmpdir(), `bera_run_${Date.now()}.py`)
            writeFileSync(tmpFile, code, 'utf8')
            await reply(`🐍 Running Python code...`)
            await new Promise(resolve => {
                exec(`python3 "${tmpFile}"`, { timeout: 15000, maxBuffer: 512 * 1024 }, async (err, stdout, stderr) => {
                    unlinkSync(tmpFile)
                    const out = (stdout || '').trim()
                    const errOut = (stderr || '').trim()
                    const success = !err && !errOut
                    await react(conn, m, success ? '✅' : '❌')
                    const result = out || errOut || '(no output)'
                    const truncated = result.length > 2000 ? result.slice(0, 2000) + '\n...(truncated)' : result
                    await reply(`${success ? '✅' : '❌'} *Python Output:*\n\`\`\`\n${truncated}\n\`\`\``)
                    resolve()
                })
            })
            return
        }

        // Default: JavaScript
        const res = await evalJS(code)
        await react(conn, m, res.success ? '✅' : '❌')
        const out = (res.output || '').length > 2000 ? res.output.slice(0, 2000) + '\n...(truncated)' : res.output
        return reply(`${res.success ? '✅' : '❌'} *Output:*\n\`\`\`\n${out || '(no output)'}\n\`\`\``)
    }

    // ── Validate / check code for errors ─────────────────────────────────────
    if (intent === 'code_validate') {
        await react(conn, m, '🔍')
        const quoted = m.quoted?.text || m.quoted?.body || ''
        const code = quoted || text.replace(/\b(check|validate|syntax\s+check|any\s+errors?\s+in|is\s+(this\s+)?code\s+(correct|valid|right|ok))\b/gi, '').trim()
        if (!code || code.length < 5) return reply(`❌ Quote the code you want me to check, then say "check this code".`)

        await reply(`🔍 Checking your code for errors...`)
        const fakeResponse = `\`\`\`javascript\n${code}\n\`\`\``
        const result = await validateAndFixCode(fakeResponse)

        if (result.errors.length === 0) {
            await react(conn, m, '✅')
            return reply(`✅ *Code looks clean!*\n\nNo syntax errors found. Your code is valid ${result.errors.length === 0 ? '🎉' : ''}`)
        }

        await react(conn, m, result.fixed ? '🔧' : '❌')
        const errList = result.errors.map(e => `• [${e.lang}] ${e.error}`).join('\n')
        if (result.fixed) {
            const fixedCode = result.response.match(/```[\w]*\n?([\s\S]+?)```/)?.[1]?.trim() || ''
            return reply(`🔧 *Found and auto-fixed errors:*\n\n${errList}\n\n*Fixed code:*\n\`\`\`\n${fixedCode}\n\`\`\``)
        }
        return reply(`❌ *Errors found:*\n\n${errList}\n\nSend me the error and I'll help fix it!`)
    }

    // ── Build a complete full project ─────────────────────────────────────────
    if (intent === 'code_build') {
        await react(conn, m, '🏗️')
        const task = text.replace(/\b(build|create|write|make|generate|a|an|the)\b/gi, '').trim() || text
        await reply(`🏗️ *Building your project...*\n\n_"${task}"_\n\nAnalyzing requirements and generating complete code...`)

        const buildPrompt = `You are a senior full-stack developer. Build a COMPLETE, PRODUCTION-READY ${task}.

Requirements:
- ALL files needed (entry point, config, routes, models, etc.)
- Every function fully implemented — NO placeholders
- Error handling in every async operation
- Clear comments
- Setup instructions at the end

Format: show each file as a separate code block with filename as a comment at the top.
Start immediately with the code — no lengthy intro.`

        try {
            const { generateAdvancedReply } = require('../Library/actions/beraai')
            const r = await generateAdvancedReply(buildPrompt, m.chat + '_build', null, null)
            if (r.success && r.reply) {
                const validated = await validateAndFixCode(r.reply, task)
                await react(conn, m, validated.errors.length ? '⚠️' : '✅')
                const prefix = validated.fixed
                    ? `🔧 _Auto-fixed ${validated.errors.length} syntax error(s) before sending_\n\n`
                    : (validated.errors.length ? `⚠️ _Note: ${validated.errors.map(e=>e.error.slice(0,60)).join('; ')}_\n\n` : '')
                return reply(`🏗️ *Project Built!*\n\n${prefix}${validated.response}`)
            }
        } catch {}
        await react(conn, m, '❌')
        return reply(`❌ Could not build the project. Try being more specific: "build a complete Express REST API with user auth"`)
    }

    // ── Explain / analyze code ────────────────────────────────────────────────
    if (intent === 'code_explain') {
        await react(conn, m, '🧠')
        const quoted = m.quoted?.text || m.quoted?.body || ''
        const code = quoted || text.replace(/\b(explain|analyze|analyse|what\s+does\s+this\s+(code|script|function)\s+do|walk\s+(me\s+)?through)\b/gi, '').trim()
        if (!code || code.length < 5) return reply(`❌ Quote the code you want explained, then say "explain this code".`)

        await reply(`🧠 Analyzing your code...`)
        const prompt = `You are a senior software engineer. Analyze and explain this code comprehensively:\n\n\`\`\`\n${code}\n\`\`\`\n\nProvide:\n1. *What it does* — 1-2 sentence summary\n2. *How it works* — step-by-step walkthrough\n3. *Key concepts* — patterns/algorithms/libraries used\n4. *Potential issues* — bugs, edge cases, performance concerns\n5. *Improvements* — how you'd make it better\n\nBe thorough but concise. Use WhatsApp formatting (*bold*, _italic_).`

        try {
            const { generateAdvancedReply } = require('../Library/actions/beraai')
            const r = await generateAdvancedReply(prompt, m.chat + '_explain', null, null)
            if (r.success && r.reply) {
                await react(conn, m, '✅')
                return reply(`🧠 *Code Analysis:*\n\n${r.reply}`)
            }
        } catch {}
        await react(conn, m, '❌')
        return reply(`❌ Could not analyze the code. Try quoting a message with code first.`)
    }

    if (intent === 'agent') {
        await react(conn, m, '🤖')
        const task = text.replace(/\b(agent|automate|plan and execute|do the following|step by step)\b/gi, '').trim() || text
        if (!task || task.length < 5) return reply(`❌ Describe what you want me to do. E.g: "agent: list all workspace files and push them to github"`)

        await reply(`🤖 *Planning task...*\n_"${task}"_`)
        const plan = await planTask(task)
        if (!plan.success) return reply(`❌ Couldn't plan this task: ${plan.error}`)

        const steps = plan.plan.steps
        await reply(`📋 *Plan:* ${plan.plan.plan}\n\n${steps.map((s, i) => `${i + 1}. ${s.desc}`).join('\n')}\n\n_Executing..._`)

        const results = []
        for (const step of steps) {
            let result = { success: false, output: 'Unknown action' }
            try {
                if (step.action === 'shell') {
                    result = await runShell(step.args?.cmd || '')
                } else if (step.action === 'file_read') {
                    const r = readFile(step.args?.path || '')
                    result = { success: r.success, output: r.content || r.error }
                } else if (step.action === 'file_write') {
                    const r = writeFile(step.args?.path || '', step.args?.content || '')
                    result = { success: r.success, output: r.success ? `Written: ${r.path}` : r.error }
                } else if (step.action === 'js_eval') {
                    result = await evalJS(step.args?.code || '')
                } else if (step.action === 'search') {
                    const r = await webSearch(step.args?.query || '')
                    result = { success: r.success, output: r.result || r.error }
                } else if (step.action === 'git_clone') {
                    result = await cloneRepo(step.args?.url || '')
                } else if (step.action === 'git_push') {
                    result = await gitPush(step.args?.folder || '')
                } else if (step.action === 'image_gen') {
                    const r = await generateImage(step.args?.prompt || '')
                    result = { success: r.success, output: r.success ? '[image generated]' : r.error }
                    if (r.success) {
                        if (r.buffer) await conn.sendMessage(m.chat, { image: r.buffer, caption: step.args?.prompt }, { quoted: m })
                        else if (r.url) await conn.sendMessage(m.chat, { image: { url: r.url }, caption: step.args?.prompt }, { quoted: m })
                    }
                } else if (step.action === 'music') {
                    const r = await searchAndDownload(step.args?.query || '')
                    result = { success: r.success, output: r.success ? r.title : r.error }
                    if (r.success && r.audioUrl) {
                        await conn.sendMessage(m.chat, { audio: { url: r.audioUrl }, mimetype: 'audio/mp4', ptt: false }, { quoted: m })
                    }
                }
            } catch (e) {
                result = { success: false, output: e.message }
            }
            results.push({ desc: step.desc, ...result })
        }

        const summary = await summarizeResults(task, results)
        await react(conn, m, '✅')
        return reply(`✅ *Done!*\n\n${summary}`)
    }

    if (intent === 'pterodactyl') {
        await react(conn, m, '🦅')
        const t = text.toLowerCase()

        if (/\blist\b.*(server|vps|panel)/.test(t) || /\b(my servers|all servers)\b/.test(t)) {
            const res = await listServers()
            await react(conn, m, res.success ? '✅' : '❌')
            if (!res.success) return reply(`❌ Panel: ${res.error}`)
            if (!res.servers.length) return reply(`No servers on the panel.`)
            const lines = res.servers.map((s, i) => `${i + 1}. ${statusEmoji(s.status)} *${s.name}* — ${s.status || 'unknown'}`)
            return reply(`🦅 *Your Servers:*\n\n${lines.join('\n')}\n\nSay "status of [server name]" for details.`)
        }

        const serverMatch = text.match(/(?:start|stop|restart|kill|status|resources?|cpu|ram|memory|console)\s+(?:of\s+|server\s+)?(.+)/i)
        const serverName = serverMatch?.[1]?.trim()

        if (/\b(status|resources?|cpu|ram|memory|uptime)\b/.test(t) && serverName) {
            const res = await listServers()
            if (!res.success) return reply(`❌ ${res.error}`)
            const server = res.servers.find(s => s.name.toLowerCase().includes(serverName.toLowerCase())) || res.servers[0]
            if (!server) return reply(`Couldn't find that server. Say "list my servers" to see them.`)
            const stat = await getServerStatus(server.id)
            await react(conn, m, stat.success ? '✅' : '❌')
            if (!stat.success) return reply(`❌ ${stat.error}`)
            return reply(
                `${statusEmoji(stat.status)} *${server.name}* — ${stat.status?.toUpperCase()}\n\n` +
                `CPU: ${stat.cpu}% | RAM: ${stat.ram}/${stat.ramLimit} MB\n` +
                `Disk: ${stat.disk} MB | Uptime: ${formatUptime(stat.uptime)}`
            )
        }

        for (const action of ['start', 'stop', 'restart', 'kill']) {
            if (new RegExp(`\\b${action}\\b`).test(t) && serverName) {
                const res = await listServers()
                if (!res.success) return reply(`❌ ${res.error}`)
                const server = res.servers.find(s => s.name.toLowerCase().includes(serverName.toLowerCase())) || res.servers[0]
                if (!server) return reply(`Couldn't find that server.`)
                const signal = action === 'kill' ? 'kill' : action
                const pw = await powerAction(server.id, signal)
                await react(conn, m, pw.success ? '✅' : '❌')
                const labels = { start: 'starting', stop: 'stopping', restart: 'restarting', kill: 'killed' }
                return reply(pw.success ? `${statusEmoji(signal)} *${server.name}* is ${labels[action]}...` : `❌ ${pw.error}`)
            }
        }

        return reply(`🦅 I can manage your Pterodactyl panel. Try:\n• "list my servers"\n• "status of [server name]"\n• "restart [server name]"\n• "start/stop [server name]"\n\nOr use ${config.prefix}ptall for the full command list.`)
    }


    if (intent === 'menu') {
        return reply(
            '╭══〘 *🤖 BERA AI — CAPABILITIES* 〙═⊷\n' +
            '┃\n' +
            '┃ I\'m Bera AI — your intelligent WhatsApp assistant.\n' +
            '┃ Here\'s a quick overview of what I can do:\n' +
            '┃\n' +
            '┃ 🎵 *Music* — play/find any song, lyrics, Spotify\n' +
            '┃ 🎨 *AI Images* — generate images from descriptions\n' +
            '┃ 👁️ *Vision* — analyze & describe images you send\n' +
            '┃ 🌐 *Search* — Google, Wikipedia, weather, define words\n' +
            '┃ 🌍 *Translate* — translate to/from any language\n' +
            '┃ 📥 *Download* — YouTube, TikTok, Instagram, Twitter, Spotify\n' +
            '┃ ⚽ *Sports* — live scores, predictions, league tables\n' +
            '┃ 🛠️ *Tools* — remove BG, QR codes, screenshots, OCR\n' +
            '┃ 📦 *Git/GitHub* — clone, push, create/delete repos\n' +
            '┃ 💻 *Shell* — run terminal commands directly\n' +
            '┃ 📁 *Files* — read, create, edit workspace files\n' +
            '┃ 🖥️ *Panel* — control your Pterodactyl servers\n' +
            '┃ 🤖 *AI Chat* — code, writing, math, anything\n' +
            '┃\n' +
            '┃ 📋 *Full command list:* Type *.menu*\n' +
            '╰══════════════════⊷'
        )
    }

    // ── BOT MODE (private / public) ────────────────────────────────────────────
    if (['admin_mode', 'bot_private', 'bot_public'].includes(intent) ||
        (intent === 'chat' && /\b(set|switch|change|put|make)\b.{0,20}\b(bot|bera)\b.{0,20}\b(mode|to)\b.{0,15}\b(private|public)\b/i.test(text))) {
        if (!isOwner) return reply(`❌ Only the bot owner can change bot mode.`)
        const wantsPrivate = /private/i.test(text)
        const wantsPublic  = /public/i.test(text)
        if (!wantsPrivate && !wantsPublic) {
            const cur = global.db?.data?.settings?.mode || 'public'
            return reply(`⚙️ *Bot Mode*\n\nCurrent: *${cur}*\n\nSay:\n• _"Bera set mode to private"_ — only you can use the bot\n• _"Bera set mode to public"_ — everyone can use the bot`)
        }
        if (!global.db.data.settings) global.db.data.settings = {}
        const newMode = wantsPrivate ? 'private' : 'public'
        global.db.data.settings.mode = newMode
        await global.db.write()
        const icon = newMode === 'private' ? '🔒' : '🌐'
        return reply(`${icon} *Bot mode set to ${newMode}!*\n\n${newMode === 'private' ? '🔒 Only you (owner) can now use the bot.' : '🌐 Everyone can now use the bot.'}`)
    }

    // ── AUTO STATUS VIEW ──────────────────────────────────────────────────────
    if (['auto_status_view_on', 'auto_status_view_off', 'auto_status_view', 'auto_status_info', 'statuspanel'].includes(intent) ||
        (intent === 'chat' && /\b(enable|turn on|activate|disable|turn off|deactivate|toggle)\b.{0,20}\b(auto\s*status\s*view|status\s*view|auto\s*view)\b/i.test(text))) {
        if (!isOwner) return reply(`❌ Owner only.`)
        if (!global.db.data.settings) global.db.data.settings = {}
        const s = global.db.data.settings
        if (intent === 'auto_status_info' || intent === 'statuspanel') {
            return reply(
                '╭══〘 *📊 STATUS SETTINGS* 〙═⊷\n' +
                '┃\n' +
                '┃ 👁️ Auto View: *' + (s.autoStatusView ? 'ON ✅' : 'OFF ❌') + '*\n' +
                '┃ ❤️  Auto Like: *' + (s.autoStatusLike ? 'ON ✅' : 'OFF ❌') + '*\n' +
                '┃\n' +
                '┃ Say:\n' +
                '┃ • _"Bera enable auto status view"_\n' +
                '┃ • _"Bera disable auto status view"_\n' +
                '┃ • _"Bera enable auto status like"_\n' +
                '╰══════════════════⊷'
            )
        }
        const wantsOn  = /on|enable|activate/i.test(text) || intent === 'auto_status_view_on'
        const wantsOff = /off|disable|deactivate/i.test(text) || intent === 'auto_status_view_off'
        s.autoStatusView = wantsOff ? false : (wantsOn ? true : !s.autoStatusView)
        await global.db.write()
        return reply(`👁️ *Auto Status View: ${s.autoStatusView ? 'ON ✅' : 'OFF ❌'}*\n\nBera will ${s.autoStatusView ? 'now automatically view' : 'no longer view'} all status updates.`)
    }

    // ── AUTO STATUS LIKE ──────────────────────────────────────────────────────
    if (['auto_status_like_on', 'auto_status_like_off', 'auto_status_like'].includes(intent) ||
        (intent === 'chat' && /\b(enable|turn on|activate|disable|turn off|deactivate)\b.{0,20}\b(auto\s*status\s*like|status\s*like|auto\s*like)\b/i.test(text))) {
        if (!isOwner) return reply(`❌ Owner only.`)
        if (!global.db.data.settings) global.db.data.settings = {}
        const s = global.db.data.settings
        const wantsOn  = /on|enable|activate/i.test(text) || intent === 'auto_status_like_on'
        const wantsOff = /off|disable|deactivate/i.test(text) || intent === 'auto_status_like_off'
        s.autoStatusLike = wantsOff ? false : (wantsOn ? true : !s.autoStatusLike)
        await global.db.write()
        return reply(`❤️ *Auto Status Like: ${s.autoStatusLike ? 'ON ✅' : 'OFF ❌'}*\n\nBera will ${s.autoStatusLike ? 'now automatically react to' : 'no longer react to'} status updates.`)
    }

    // ── ANTI-LINK ──────────────────────────────────────────────────────────────
    if (['antilink_on', 'antilink_off', 'antilink'].includes(intent)) {
        if (!isOwner && !isAdmin) return reply(`❌ Admins only.`)
        if (!global.db.data[m.chat]) global.db.data[m.chat] = {}
        const wantsOn  = intent === 'antilink_on'  || /on|enable|activate/i.test(text)
        const wantsOff = intent === 'antilink_off' || /off|disable|deactivate/i.test(text)
        const cur = global.db.data[m.chat]?.antilink || false
        const newState = wantsOff ? false : (wantsOn ? true : !cur)
        global.db.data[m.chat].antilink = newState
        await global.db.write()
        return reply(`🔗 *Anti-Link: ${newState ? 'ON ✅' : 'OFF ❌'}*\n\n${newState ? 'Group links will now be blocked and deleted.' : 'Group links are now allowed.'}`)
    }

    // ── ANTI-SPAM ──────────────────────────────────────────────────────────────
    if (['antispam_on', 'antispam_off', 'antispam'].includes(intent)) {
        if (!isOwner && !isAdmin) return reply(`❌ Admins only.`)
        if (!global.db.data[m.chat]) global.db.data[m.chat] = {}
        const wantsOn  = intent === 'antispam_on'  || /on|enable|activate/i.test(text)
        const wantsOff = intent === 'antispam_off' || /off|disable|deactivate/i.test(text)
        const cur = global.db.data[m.chat]?.antispam || false
        const newState = wantsOff ? false : (wantsOn ? true : !cur)
        global.db.data[m.chat].antispam = newState
        await global.db.write()
        return reply(`🚫 *Anti-Spam: ${newState ? 'ON ✅' : 'OFF ❌'}*\n\n${newState ? 'Spam messages will now be blocked.' : 'Spam protection is now off.'}`)
    }

    // ── ANTI-DELETE ────────────────────────────────────────────────────────────
    if (['antidelete_on', 'antidelete_off', 'antidelete'].includes(intent)) {
        if (!isOwner && !isAdmin) return reply(`❌ Admins only.`)
        if (!global.db.data[m.chat]) global.db.data[m.chat] = {}
        const wantsOn  = intent === 'antidelete_on'  || /on|enable|activate/i.test(text)
        const wantsOff = intent === 'antidelete_off' || /off|disable|deactivate/i.test(text)
        const cur = global.db.data[m.chat]?.antidelete || false
        const newState = wantsOff ? false : (wantsOn ? true : !cur)
        global.db.data[m.chat].antidelete = newState
        await global.db.write()
        return reply(`🛡️ *Anti-Delete: ${newState ? 'ON ✅' : 'OFF ❌'}*\n\n${newState ? 'Deleted messages will now be recovered and re-sent.' : 'Anti-delete protection is now off.'}`)
    }

    // ── AI / CHATBOT TOGGLE ────────────────────────────────────────────────────
    if (['ai_on', 'ai_off', 'ai_status'].includes(intent)) {
        if (!isOwner) return reply(`❌ Owner only.`)
        if (!global.db.data.settings) global.db.data.settings = {}
        if (intent === 'ai_status') {
            const on = global.db.data.settings.chatbot || false
            return reply(`🤖 *AI Chatbot Status: ${on ? 'ON ✅' : 'OFF ❌'}*\n\nSay _"Bera turn on AI"_ or _"Bera turn off AI"_ to toggle.`)
        }
        const newState = intent === 'ai_on'
        global.db.data.settings.chatbot = newState
        await global.db.write()
        return reply(`🤖 *AI Chatbot: ${newState ? 'ON ✅' : 'OFF ❌'}*\n\n${newState ? 'Bera will now respond to all messages with AI.' : 'Bera will only respond to commands now.'}`)
    }

    // ── FULL COMMAND LIST (when user asks for actual .menu) ───────────────────
    if (intent === 'menu' && /\b(full|all|complete|entire|actual|real|list|commands?)\b/i.test(text)) {
        return reply(
            '╭══〘 *📋 FULL COMMAND LIST* 〙═⊷\n' +
            '┃ Type these with prefix *.*\n' +
            '┃\n' +
            '┃ *🤖 AI*\n' +
            '┃ .chat .ai .bera .gpt .ask\n' +
            '┃ .imagine .aiimg .dalle .flux\n' +
            '┃ .vision .see .analyze\n' +
            '┃ .transcript .ytscript\n' +
            '┃\n' +
            '┃ *🎵 Music & Download*\n' +
            '┃ .play .song .music\n' +
            '┃ .lyrics .lyric .words\n' +
            '┃ .ytmp3 .ytmp4 .yta .ytv\n' +
            '┃ .tiktok .igdl .twitter\n' +
            '┃ .spotify .spotifydl .spdl\n' +
            '┃ .shazam .identify\n' +
            '┃\n' +
            '┃ *🌐 Search & Info*\n' +
            '┃ .google .wiki .weather\n' +
            '┃ .define .dict .bible\n' +
            '┃ .wallpaper .wp\n' +
            '┃\n' +
            '┃ *⚽ Sports*\n' +
            '┃ .livescore .live .score\n' +
            '┃ .predictions .tips\n' +
            '┃ .epl .laliga .ucl\n' +
            '┃ .bundesliga .seriea .ligue1\n' +
            '┃\n' +
            '┃ *🛠️ Tools*\n' +
            '┃ .removebg .rmbg .nobg\n' +
            '┃ .qr .createqr .readqr\n' +
            '┃ .ssweb .screenshot .ocr\n' +
            '┃ .upscale .enhance .hd\n' +
            '┃ .translate .tl\n' +
            '┃\n' +
            '┃ *👥 Group*\n' +
            '┃ .kick .add .promote .demote\n' +
            '┃ .mute .unmute .tagall\n' +
            '┃ .antilink .antispam .antidel\n' +
            '┃ .welcome .bye .grouplink\n' +
            '┃\n' +
            '┃ *⚙️ Settings*\n' +
            '┃ .mode public/private\n' +
            '┃ .sv on/off  (status view)\n' +
            '┃ .sl on/off  (status like)\n' +
            '┃ .chatbot on/off\n' +
            '┃\n' +
            '┃ *💻 Dev*\n' +
            '┃ .git .github .shell .eval\n' +
            '┃ .file .pm2 .deploy\n' +
            '╰══════════════════⊷'
        )
    }

    // ── NLP: YouTube download ───────────────────────────────────────────────────
    if (intent === 'yt_audio' || intent === 'yt_video') {
        const urlMatch = text.match(/https?:\/\/[^\s]+youtu[^\s]+/)
        if (!urlMatch) return reply(`Send me the YouTube URL too!\nExample: _download this as mp3 https://youtu.be/..._`)
        const ytUrl = urlMatch[0]
        await react(conn, m, '⏳')
        if (intent === 'yt_audio') {
            const d = await gtYtMp3(ytUrl)
            if (!d || (!d.download_url && !d.url && !d.audio)) {
                await react(conn, m, '❌')
                return reply(`❌ Could not download audio from that YouTube link.`)
            }
            const audioUrl = d.download_url || d.url || d.audio
            await react(conn, m, '✅')
            await conn.sendMessage(m.chat, { audio: { url: audioUrl }, mimetype: 'audio/mp4', ptt: false, fileName: `${d.title || 'audio'}.mp3` }, { quoted: m })
            return reply(`🎵 *${d.title || 'Audio'}*${d.channel ? `\n👤 ${d.channel}` : ''}`)
        } else {
            const d = await gtYtMp4(ytUrl)
            if (!d || (!d.download_url && !d.url && !d.video)) {
                await react(conn, m, '❌')
                return reply(`❌ Could not download video from that YouTube link.`)
            }
            const videoUrl = d.download_url || d.url || d.video
            await react(conn, m, '✅')
            return conn.sendMessage(m.chat, { video: { url: videoUrl }, caption: `🎬 *${d.title || 'Video'}*${d.channel ? `\n👤 ${d.channel}` : ''}` }, { quoted: m })
        }
    }

    // ── NLP: Social media download ─────────────────────────────────────────────
    if (intent === 'download') {
        const urlMatch = text.match(/https?:\/\/[^\s]+/)
        if (!urlMatch) {
            const legacyResult = await download(text)
            if (legacyResult?.success) return reply(JSON.stringify(legacyResult).slice(0, 200))
            return reply(`Please include the video URL!\nExample: _download this tiktok https://tiktok.com/..._`)
        }
        const dlUrl = urlMatch[0]
        await react(conn, m, '⏳')
        let d = null
        if (/tiktok/.test(dlUrl)) d = await gtTikTok(dlUrl)
        else if (/instagram|instagr\.am/.test(dlUrl)) d = await gtInstagram(dlUrl)
        else if (/twitter|x\.com/.test(dlUrl)) d = await gtTwitter(dlUrl)
        else { const legacy = await download(dlUrl); if (legacy?.success) d = legacy }
        if (!d) {
            await react(conn, m, '❌')
            return reply(`❌ Could not download from that link.`)
        }
        await react(conn, m, '✅')
        const videoUrl = d.video?.[0] || d.nowm || d.url || d.download_url || d.media?.[0]?.url
        if (videoUrl) {
            return conn.sendMessage(m.chat, { video: { url: videoUrl }, caption: `📥 *${d.title || d.desc || d.text?.slice(0, 80) || 'Video'}*` }, { quoted: m })
        }
        return reply(`Downloaded: ${JSON.stringify(d).slice(0, 300)}`)
    }

    // ── NLP: Lyrics ───────────────────────────────────────────────────────────
    if (intent === 'lyrics') {
        const query = text.replace(/\b(show|get|find|search|lyrics?|words?|of|for|to|song)\b/gi, '').trim() || text
        await react(conn, m, '🎵')
        const d = await gtLyrics(query)
        if (!d) return reply(`❌ Couldn't find lyrics for: *${query}*\n_Try: lyrics Bohemian Rhapsody by Queen_`)
        await react(conn, m, '✅')
        const lyr = d.lyrics || d.lyric || d.result || ''
        return reply(`🎵 *${d.title || query}*${d.artist ? ` — ${d.artist}` : ''}\n${'─'.repeat(28)}\n\n${lyr.slice(0, 3500)}`)
    }

    // ── NLP: Define / Dictionary ──────────────────────────────────────────────
    if (intent === 'define') {
        const word = text.replace(/\b(define|definition|meaning|what does|what'?s? the meaning|of|the|word|dictionary)\b/gi, '').trim() || text
        await react(conn, m, '📖')
        const d = await gtDictionary(word)
        if (!d) return reply(`❌ No definition found for: *${word}*`)
        await react(conn, m, '✅')
        const phonetic = d.phonetic ? `  /${d.phonetic}/` : ''
        const meanings = d.meanings || []
        let out = `📚 *${d.word || word}*${phonetic}\n\n`
        if (Array.isArray(meanings)) {
            meanings.slice(0, 2).forEach(mg => {
                if (mg.partOfSpeech) out += `_${mg.partOfSpeech}_\n`
                ;(mg.definitions || []).slice(0, 2).forEach((df, i) => {
                    out += `${i + 1}. ${df.definition || df}\n`
                    if (df.example) out += `   _"${df.example}"_\n`
                })
                out += '\n'
            })
        }
        return reply(out.trim())
    }

    // ── NLP: Weather ──────────────────────────────────────────────────────────
    if (intent === 'weather') {
        const loc = text.replace(/\b(weather|temperature|forecast|what'?s?|how'?s?|the|today|in|at|for|clima)\b/gi, '').trim() || 'Nairobi'
        await react(conn, m, '🌤')
        const w = await gtWeather(loc)
        if (!w) return reply(`❌ Could not get weather for: *${loc}*`)
        await react(conn, m, '✅')
        const temp = w.temperature || w.temp || w.current?.temp_c || w.main?.temp || '?'
        const desc = w.condition || w.description || w.weather?.[0]?.description || w.current?.condition?.text || ''
        const humidity = w.humidity || w.current?.humidity || ''
        return reply(`⛅ *Weather — ${w.location || w.city || loc}*\n${'─'.repeat(28)}\n🌡 *${temp}°C*${desc ? ` — ${desc}` : ''}${humidity ? `\n💧 Humidity: ${humidity}%` : ''}`)
    }

    // ── NLP: Wikipedia ────────────────────────────────────────────────────────
    if (intent === 'wiki') {
        const topic = text.replace(/\b(wiki|wikipedia|who is|what is|tell me about|about)\b/gi, '').trim() || text
        await react(conn, m, '🌐')
        const d = await gtWiki(topic)
        if (!d) return reply(`❌ No Wikipedia article found for: *${topic}*`)
        await react(conn, m, '✅')
        const extract = (d.extract || d.description || '').slice(0, 1000)
        return reply(`🌐 *${d.title || topic}*\n${'─'.repeat(28)}\n\n${extract}\n\n🔗 ${d.url || `https://en.wikipedia.org/wiki/${encodeURIComponent(topic)}`}`)
    }

    // ── NLP: Football live scores ──────────────────────────────────────────────
    if (intent === 'football_scores') {
        await react(conn, m, '⚽')
        const matches = await gtLiveScore()
        if (!matches) return reply(`❌ No live match data right now.`)
        await react(conn, m, '✅')
        const list = Array.isArray(matches) ? matches.slice(0, 8) : Object.values(matches).flat().slice(0, 8)
        if (!list.length) return reply(`⚽ No live matches at the moment.`)
        const lines = list.map(g => `⚽ *${g.homeTeam}* ${g.score || `${g.homeScore||0}-${g.awayScore||0}`} *${g.awayTeam}*${g.status ? ` _(${g.status})_` : ''}\n   ${g.league || ''}`)
        return reply(`⚽ *Live Scores*\n${'─'.repeat(28)}\n\n${lines.join('\n\n')}`)
    }

    // ── NLP: Football predictions ──────────────────────────────────────────────
    if (intent === 'football_predictions') {
        await react(conn, m, '🔮')
        const games = await gtPredictions()
        if (!games || !Array.isArray(games)) return reply(`❌ No predictions available right now.`)
        await react(conn, m, '✅')
        const lines = games.slice(0, 6).map(g => {
            const ft = g.predictions?.fulltime || {}
            const best = ft.home > ft.away ? `${g.match?.split(' vs ')[0]} win (${Math.round(ft.home)}%)` :
                         ft.away > ft.home ? `${g.match?.split(' vs ')[1]} win (${Math.round(ft.away)}%)` :
                         `Draw (${Math.round(ft.draw || 33)}%)`
            return `🔮 *${g.match}*\n   _${g.league}_ · 💡 ${best}`
        })
        return reply(`🔮 *Today's Predictions*\n${'─'.repeat(28)}\n\n${lines.join('\n\n')}`)
    }

    // ── NLP: League standings ─────────────────────────────────────────────────
    if (intent === 'football_standings') {
        const leagueKey = /epl|premier league/.test(text) ? 'epl' :
                          /laliga|la liga/.test(text) ? 'laliga' :
                          /ucl|champions league/.test(text) ? 'ucl' :
                          /bundesliga/.test(text) ? 'bundesliga' :
                          /serie a|seriea/.test(text) ? 'seriea' :
                          /ligue 1|ligue1/.test(text) ? 'ligue1' : 'epl'
        await react(conn, m, '⚽')
        const teams = await gtStandings(leagueKey)
        if (!teams || !teams.length) return reply(`❌ Standings not available.`)
        await react(conn, m, '✅')
        const leagueNames = { epl: 'EPL', laliga: 'La Liga', ucl: 'UCL', bundesliga: 'Bundesliga', seriea: 'Serie A', ligue1: 'Ligue 1' }
        const rows = teams.slice(0, 10).map((t, i) => {
            const pos = String(t.position || t.rank || i + 1).padStart(2)
            const name = (t.team || t.name || t.club || '?').padEnd(14).slice(0, 14)
            const pts = String(t.points || t.pts || 0).padStart(3)
            const w = String(t.won || t.w || 0).padStart(2)
            const d = String(t.draw || t.d || 0).padStart(2)
            const l = String(t.lost || t.l || 0).padStart(2)
            return `${pos} ${name} ${pts} ${w} ${d} ${l}`
        })
        return reply('```\n' + `*${leagueNames[leagueKey] || 'League'} Top 10*\n#  Team           Pts W  D  L\n` + rows.join('\n') + '\n```')
    }

    // ── NLP: Remove background ─────────────────────────────────────────────────
    if (intent === 'remove_bg') {
        const urlMatch = text.match(/https?:\/\/[^\s]+/)
        let imgUrl = urlMatch?.[0]
        if (!imgUrl && imageBuffer) imgUrl = 'data:image/jpeg;base64,' + imageBuffer.toString('base64')
        if (!imgUrl) return reply(`Please send an image or include its URL!\nExample: _remove background https://example.com/photo.jpg_`)
        await react(conn, m, '⏳')
        const outUrl = await gtRemoveBg(imgUrl)
        if (!outUrl) {
            await react(conn, m, '❌')
            return reply(`❌ Background removal failed.`)
        }
        await react(conn, m, '✅')
        if (outUrl.startsWith('http')) return conn.sendMessage(m.chat, { image: { url: outUrl }, caption: '✅ Background removed!' }, { quoted: m })
        return conn.sendMessage(m.chat, { image: Buffer.from(outUrl.split(',')[1] || outUrl, 'base64'), caption: '✅ Background removed!' }, { quoted: m })
    }

    // ── NLP: Create QR ────────────────────────────────────────────────────────
    if (intent === 'create_qr') {
        const content = text.replace(/\b(create|make|generate|build|qr|qrcode|qr code|for|of|with|from)\b/gi, '').trim() || text
        await react(conn, m, '⏳')
        const qrUrl = await gtCreateQr(content)
        if (!qrUrl) {
            await react(conn, m, '❌')
            return reply(`❌ QR code generation failed.`)
        }
        await react(conn, m, '✅')
        if (qrUrl.startsWith('http')) return conn.sendMessage(m.chat, { image: { url: qrUrl }, caption: `📱 QR Code for: _${content.slice(0, 60)}_` }, { quoted: m })
        return conn.sendMessage(m.chat, { image: Buffer.from(qrUrl.split(',')[1] || qrUrl, 'base64'), caption: `📱 QR Code` }, { quoted: m })
    }

    // ── NLP: Screenshot website ────────────────────────────────────────────────
    if (intent === 'ss_web') {
        const urlMatch = text.match(/https?:\/\/[^\s]+/)
        if (!urlMatch) return reply(`Include the URL!\nExample: _screenshot https://google.com_`)
        await react(conn, m, '⏳')
        const buf = await gtScreenshot(urlMatch[0])
        if (!buf) {
            await react(conn, m, '❌')
            return reply(`❌ Screenshot failed.`)
        }
        await react(conn, m, '✅')
        return conn.sendMessage(m.chat, { image: buf, caption: `📸 ${urlMatch[0]}` }, { quoted: m })
    }

    // ── NLP: Spotify search ────────────────────────────────────────────────────
    if (intent === 'spotify_search') {
        const query = text.replace(/\b(spotify|find|search|song|track|music|on spotify)\b/gi, '').trim() || text
        await react(conn, m, '🎵')
        const results = await gtSpotifySearch(query)
        if (!results?.length) return reply(`❌ No Spotify results for: *${query}*`)
        await react(conn, m, '✅')
        const lines = results.slice(0, 5).map((t, i) => `*${i + 1}. ${t.title || t.name}* — ${t.artist || t.artists}\n🔗 ${t.url || ''}`)
        return reply(`🎵 *Spotify: "${query}"*\n${'─'.repeat(28)}\n\n${lines.join('\n\n')}`)
    }

    // ── AI INTENT CLASSIFIER FALLBACK ─────────────────────────────────────────
    // When regex router says 'chat', use AI to classify ANY phrasing
    if (intent === 'chat') {
        await react(conn, m, '🤔')
        let classified
        try { classified = await gtClassifyIntent(text) } catch { classified = { action: 'chat', params: {} } }

        const p = classified?.params || {}
        switch (classified?.action) {
            case 'play_music': {
                await react(conn, m, '🎵')
                const q = p.query || text
                const res = await searchAndDownload(q)
                if (!res.success) { await react(conn, m, '❌'); return reply(`❌ Couldn't find: ${q}`) }
                await react(conn, m, '✅')
                await conn.sendMessage(m.chat, { audio: { url: res.audioUrl }, mimetype: 'audio/mp4', ptt: false, fileName: `${res.title}.mp3` }, { quoted: m })
                return conn.sendMessage(m.chat, { text: `🎵 *${res.title}*${res.channel ? '\n👤 ' + res.channel : ''}` })
            }
            case 'lyrics': {
                await react(conn, m, '🎵')
                const d = await gtLyrics(p.query || text)
                if (!d) { await react(conn, m, '❌'); return reply(`❌ No lyrics found for: *${p.query || text}*`) }
                await react(conn, m, '✅')
                return reply(`🎵 *${d.title || p.query}*${d.artist ? ' — ' + d.artist : ''}\n${'─'.repeat(28)}\n\n${(d.lyrics || d.lyric || '').slice(0, 3500)}`)
            }
            case 'weather': {
                await react(conn, m, '🌤')
                const w = await gtWeather(p.location || text)
                if (!w) { await react(conn, m, '❌'); return reply(`❌ Weather unavailable for: *${p.location}*`) }
                await react(conn, m, '✅')
                return reply(`⛅ *Weather — ${w.location || p.location}*\n🌡 *${w.temperature || w.temp || '?'}°C*${w.condition ? ' — ' + w.condition : ''}${w.humidity ? '\n💧 Humidity: ' + w.humidity + '%' : ''}`)
            }
            case 'define': {
                await react(conn, m, '📖')
                const d = await gtDictionary(p.word || text)
                if (!d) { await react(conn, m, '❌'); return reply(`❌ No definition for: *${p.word}*`) }
                await react(conn, m, '✅')
                let out = `📚 *${d.word || p.word}*${d.phonetic ? `  /${d.phonetic}/` : ''}\n\n`
                ;(d.meanings || []).slice(0, 2).forEach(mg => {
                    if (mg.partOfSpeech) out += `_${mg.partOfSpeech}_\n`
                    ;(mg.definitions || []).slice(0, 2).forEach((df, i) => { out += `${i + 1}. ${df.definition || df}\n` })
                    out += '\n'
                })
                return reply(out.trim())
            }
            case 'wikipedia': {
                await react(conn, m, '🌐')
                const d = await gtWiki(p.topic || text)
                if (!d) { await react(conn, m, '❌'); return reply(`❌ Nothing found on: *${p.topic}*`) }
                await react(conn, m, '✅')
                return reply(`🌐 *${d.title || p.topic}*\n${'─'.repeat(28)}\n\n${(d.extract || d.description || '').slice(0, 1000)}\n\n🔗 ${d.url || 'https://en.wikipedia.org/wiki/' + encodeURIComponent(p.topic || text)}`)
            }
            case 'google_search': {
                await react(conn, m, '🔍')
                const results = await gtGoogle(p.query || text)
                if (!results?.length) { await react(conn, m, '❌'); return reply(`❌ No results for: *${p.query}*`) }
                await react(conn, m, '✅')
                return reply(`🔍 *${p.query || text}*\n${'─'.repeat(28)}\n\n${results.slice(0, 4).map((r, i) => `*${i + 1}. ${r.title}*\n${r.snippet || ''}\n🔗 ${r.url || ''}`).join('\n\n')}`)
            }
            case 'translate': {
                await react(conn, m, '🌍')
                const r = await translate(p.text || text, p.to || 'en')
                await react(conn, m, r.success ? '✅' : '❌')
                return reply(r.success ? `🌍 *${p.to}:*\n${r.result}` : `❌ Translation failed: ${r.error}`)
            }
            case 'generate_image': {
                await react(conn, m, '🎨')
                const g = await generateImage(p.prompt || text)
                await react(conn, m, g.success ? '✅' : '❌')
                if (!g.success) return reply(`❌ Image generation failed`)
                if (g.buffer) return conn.sendMessage(m.chat, { image: g.buffer, caption: `🎨 ${p.prompt}` }, { quoted: m })
                if (g.url) return conn.sendMessage(m.chat, { image: { url: g.url }, caption: `🎨 ${p.prompt}` }, { quoted: m })
                break
            }
            case 'yt_audio': {
                await react(conn, m, '⏳')
                const d = await gtYtMp3(p.url)
                if (!d?.download_url && !d?.url && !d?.audio) { await react(conn, m, '❌'); return reply(`❌ Could not download audio.`) }
                await react(conn, m, '✅')
                await conn.sendMessage(m.chat, { audio: { url: d.download_url || d.url || d.audio }, mimetype: 'audio/mp4', ptt: false }, { quoted: m })
                return reply(`🎵 *${d.title || 'Audio'}*`)
            }
            case 'yt_video': {
                await react(conn, m, '⏳')
                const d = await gtYtMp4(p.url)
                if (!d?.download_url && !d?.url && !d?.video) { await react(conn, m, '❌'); return reply(`❌ Could not download video.`) }
                await react(conn, m, '✅')
                return conn.sendMessage(m.chat, { video: { url: d.download_url || d.url || d.video }, caption: `🎬 *${d.title || 'Video'}*` }, { quoted: m })
            }
            case 'download_social': {
                await react(conn, m, '⏳')
                const url = p.url || text.match(/https?:\/\/[^\s]+/)?.[0]
                if (!url) return reply(`Please include the video URL!`)
                let d = null
                if (/tiktok/.test(url)) d = await gtTikTok(url)
                else if (/instagram|instagr\.am/.test(url)) d = await gtInstagram(url)
                else if (/twitter|x\.com/.test(url)) d = await gtTwitter(url)
                if (!d) { await react(conn, m, '❌'); return reply(`❌ Could not download.`) }
                await react(conn, m, '✅')
                const vid = d.video?.[0] || d.nowm || d.url || d.download_url
                if (vid) return conn.sendMessage(m.chat, { video: { url: vid }, caption: `📥 ${d.title || d.desc || ''}`.slice(0, 100) }, { quoted: m })
                return reply(`Downloaded data: ${JSON.stringify(d).slice(0, 200)}`)
            }
            case 'football_scores': {
                await react(conn, m, '⚽')
                const matches = await gtLiveScore()
                if (!matches) { await react(conn, m, '❌'); return reply(`❌ No live match data.`) }
                await react(conn, m, '✅')
                const list = Array.isArray(matches) ? matches.slice(0, 8) : Object.values(matches).flat().slice(0, 8)
                if (!list.length) return reply(`⚽ No live matches right now.`)
                return reply(`⚽ *Live Scores*\n${'─'.repeat(28)}\n\n${list.map(g => `⚽ *${g.homeTeam}* ${g.score || `${g.homeScore || 0}-${g.awayScore || 0}`} *${g.awayTeam}*${g.status ? ` _(${g.status})_` : ''}`).join('\n\n')}`)
            }
            case 'football_predictions': {
                await react(conn, m, '🔮')
                const games = await gtPredictions()
                if (!games?.length) { await react(conn, m, '❌'); return reply(`❌ No predictions now.`) }
                await react(conn, m, '✅')
                return reply(`🔮 *Today's Predictions*\n${'─'.repeat(28)}\n\n${games.slice(0, 6).map(g => `🔮 *${g.match}*\n   _${g.league}_`).join('\n\n')}`)
            }
            case 'football_standings': {
                await react(conn, m, '⚽')
                const teams = await gtStandings(p.league || 'epl')
                if (!teams?.length) { await react(conn, m, '❌'); return reply(`❌ Standings unavailable.`) }
                await react(conn, m, '✅')
                const rows = teams.slice(0, 10).map((t, i) => `${String(t.position || i + 1).padStart(2)} ${(t.team || t.name || '?').padEnd(14).slice(0, 14)} ${String(t.points || 0).padStart(3)}`)
                return reply('```\n' + `*${(p.league || 'EPL').toUpperCase()} Top 10*\n#  Team           Pts\n` + rows.join('\n') + '\n```')
            }
            case 'create_qr': {
                await react(conn, m, '⏳')
                const qrUrl = await gtCreateQr(p.content || text)
                if (!qrUrl) { await react(conn, m, '❌'); return reply(`❌ QR generation failed.`) }
                await react(conn, m, '✅')
                return conn.sendMessage(m.chat, { image: qrUrl.startsWith('http') ? { url: qrUrl } : Buffer.from(qrUrl.split(',')[1] || qrUrl, 'base64'), caption: `📱 QR: _${(p.content || text).slice(0, 60)}_` }, { quoted: m })
            }
            case 'screenshot': {
                await react(conn, m, '⏳')
                const url = p.url || text.match(/https?:\/\/[^\s]+/)?.[0]
                if (!url) return reply(`Include the URL!`)
                const buf = await gtScreenshot(url)
                if (!buf) { await react(conn, m, '❌'); return reply(`❌ Screenshot failed.`) }
                await react(conn, m, '✅')
                return conn.sendMessage(m.chat, { image: buf, caption: `📸 ${url}` }, { quoted: m })
            }
            case 'set_mode': {
                if (!isOwner) return reply(`❌ Owner only.`)
                if (!global.db.data.settings) global.db.data.settings = {}
                const mode = p.mode || ((/private/i.test(text)) ? 'private' : 'public')
                global.db.data.settings.mode = mode
                await global.db.write()
                return reply(`${mode === 'private' ? '🔒' : '🌐'} *Bot mode set to ${mode}!*\n${mode === 'private' ? 'Only you can use the bot now.' : 'Everyone can use the bot now.'}`)
            }
            case 'auto_status_view': {
                if (!isOwner) return reply(`❌ Owner only.`)
                if (!global.db.data.settings) global.db.data.settings = {}
                const on = p.state === 'on'
                global.db.data.settings.autoStatusView = on
                await global.db.write()
                return reply(`👁️ *Auto Status View: ${on ? 'ON ✅' : 'OFF ❌'}*`)
            }
            case 'auto_status_like': {
                if (!isOwner) return reply(`❌ Owner only.`)
                if (!global.db.data.settings) global.db.data.settings = {}
                const on = p.state === 'on'
                global.db.data.settings.autoStatusLike = on
                await global.db.write()
                return reply(`❤️ *Auto Status Like: ${on ? 'ON ✅' : 'OFF ❌'}*`)
            }
            case 'antilink': {
                if (!global.db.data[m.chat]) global.db.data[m.chat] = {}
                const on = p.state === 'on'
                global.db.data[m.chat].antilink = on
                await global.db.write()
                return reply(`🔗 *Anti-Link: ${on ? 'ON ✅' : 'OFF ❌'}*`)
            }
            case 'antispam': {
                if (!global.db.data[m.chat]) global.db.data[m.chat] = {}
                const on = p.state === 'on'
                global.db.data[m.chat].antispam = on
                await global.db.write()
                return reply(`🚫 *Anti-Spam: ${on ? 'ON ✅' : 'OFF ❌'}*`)
            }
            case 'antidelete': {
                if (!global.db.data[m.chat]) global.db.data[m.chat] = {}
                const on = p.state === 'on'
                global.db.data[m.chat].antidelete = on
                await global.db.write()
                return reply(`🛡️ *Anti-Delete: ${on ? 'ON ✅' : 'OFF ❌'}*`)
            }
            case 'ai_toggle': {
                if (!isOwner) return reply(`❌ Owner only.`)
                if (!global.db.data.settings) global.db.data.settings = {}
                const on = p.state === 'on'
                global.db.data.settings.chatbot = on
                await global.db.write()
                return reply(`🤖 *AI Chatbot: ${on ? 'ON ✅' : 'OFF ❌'}*`)
            }
            case 'remove_bg': {
                const urlMatch = text.match(/https?:\/\/[^\s]+/)
                const imgUrl = urlMatch?.[0] || (imageBuffer ? 'data:image/jpeg;base64,' + imageBuffer.toString('base64') : null)
                if (!imgUrl) return reply(`Send an image or include its URL!`)
                await react(conn, m, '⏳')
                const out = await gtRemoveBg(imgUrl)
                if (!out) { await react(conn, m, '❌'); return reply(`❌ Background removal failed.`) }
                await react(conn, m, '✅')
                return conn.sendMessage(m.chat, { image: out.startsWith('http') ? { url: out } : Buffer.from(out.split(',')[1] || out, 'base64'), caption: '✅ Background removed!' }, { quoted: m })
            }
            case 'show_menu':
                return handleAction(m, conn, reply, 'menu', sender, null)
            case 'show_full_menu':
                return handleAction(m, conn, reply, 'show full command list', sender, null)
            case 'bible': {
                await react(conn, m, '📖')
                const d = await gtBible(p.verse || text)
                if (!d) { await react(conn, m, '❌'); return reply(`❌ Verse not found: ${p.verse}`) }
                await react(conn, m, '✅')
                return reply(`📖 *${p.verse}*\n\n${typeof d === 'string' ? d : d.text || d.verse || JSON.stringify(d)}`)
            }
            case 'wallpaper': {
                await react(conn, m, '🖼️')
                const results = await gtWallpaper(p.query || text)
                if (!results?.length) { await react(conn, m, '❌'); return reply(`❌ No wallpapers found.`) }
                await react(conn, m, '✅')
                const w = results[Math.floor(Math.random() * Math.min(results.length, 5))]
                const wUrl = w.url || w.image || w.src
                if (wUrl) return conn.sendMessage(m.chat, { image: { url: wUrl }, caption: `🖼️ ${p.query || text}` }, { quoted: m })
                break
            }
            case 'ocr': {
                const urlMatch = text.match(/https?:\/\/[^\s]+/)
                const imgUrl2 = urlMatch?.[0]
                if (!imgUrl2 && !imageBuffer) return reply(`Send an image with text in it!`)
                await react(conn, m, '⏳')
                const ocrResult = await gtOcr(imgUrl2 || '')
                if (!ocrResult) { await react(conn, m, '❌'); return reply(`❌ OCR failed.`) }
                await react(conn, m, '✅')
                return reply(`📝 *Text from image:*\n\n${ocrResult}`)
            }
            default:
                break
        }
    }

        return askNick(m, conn, reply, sender, text, imageBuffer)
}

const handle = async (m, { conn, text, reply, prefix, command, sender, isOwner }) => {
    const nickSender = m.sender || sender

    if (command === 'bera') {
        if (!text && !hasImage(m) && !hasImage(m.quoted)) return reply(
            `*Bera AI* — just talk to me.\n` +
            `${prefix}berareset · ${prefix}berarmemory · ${prefix}beraclone\n` +
            `Auto-mode: ${prefix}chatbot on/off`
        )

        let imageBuffer = null
        if (hasImage(m)) imageBuffer = await getImageBuffer(conn, m)
        else if (hasImage(m.quoted)) imageBuffer = await getImageBuffer(conn, m.quoted)

        let quotedContext = ''
        if (m.quoted && !imageBuffer) {
            const qText = m.quoted.text || m.quoted.body || m.quoted.caption || ''
            if (qText) quotedContext = `[Quoted]:\n"${qText}"\n\n`
        }

        const userText = quotedContext + (text || (imageBuffer ? 'Describe this image.' : ''))
        return handleAction(m, conn, reply, userText, nickSender, imageBuffer)
    }

    // ── AGENT MODE — full autonomous coding agent ─────────────────────────────
    // Usage: .agent create a calculator app in nodejs and html
    //        .agent delete the directory my-app
    //        .agent scaffold a fullstack stopwatch in react
    if (command === 'agent') {
        if (!text) return reply(
            `🤖 *Bera Agent* — full autonomous mode\n\n` +
            `I can scaffold projects, write files, run shell commands, manage GitHub, and more.\n\n` +
            `*Examples:*\n` +
            `• ${prefix}agent create a calculator project in nodejs and html\n` +
            `• ${prefix}agent scaffold a fullstack stopwatch in react\n` +
            `• ${prefix}agent delete the directory my-app\n` +
            `• ${prefix}agent build a todo app with express backend\n` +
            `• ${prefix}agent create github repo called weather-app and push my code\n` +
            `• ${prefix}agent what's 2-6\n\n` +
            `Files go to *./workspace/*. I work step by step until done.`
        )
        try {
            await conn.sendMessage(m.chat, { react: { text: '🤔', key: m.key } })
            const { generateAdvancedReply } = require('../Library/actions/beraai')
            const result = await generateAdvancedReply(text, `agent_${m.chat}_${nickSender}`, conn, m, { agentMode: true })
            await conn.sendMessage(m.chat, { react: { text: result.success ? '✅' : '❌', key: m.key } })
            return reply(result.reply || '❌ Agent had no output.')
        } catch (e) {
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
            return reply(`❌ Agent error: ${e.message}`)
        }
    }

    // ── .beratrigger on/off — toggle the no-prefix "Bera ..." auto-trigger ────
    if (command === 'beratrigger' || command === 'beratrig' || command === 'beralisten') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const arg = (text || '').trim().toLowerCase()
        global.db.data.settings = global.db.data.settings || {}
        const current = global.db.data.settings.beraTrigger !== false
        if (!arg || !['on', 'off', 'status'].includes(arg)) {
            const bar = current ? '▓▓▓▓▓▓▓▓▓▓' : '░░░░░░░░░░'
            return reply(
                `╭═〘 *🎯 BERA AUTO-TRIGGER* 〙\n` +
                `┃ ${current ? '🟢' : '🔴'} [${bar}]\n` +
                `┃ Status: *${current ? 'ON ✅' : 'OFF ❌'}*\n` +
                `┃\n` +
                `┃ When ON, any message containing\n` +
                `┃ the word "bera" (no prefix needed)\n` +
                `┃ triggers the bot agent.\n` +
                `┃\n` +
                `┃ Toggle: *${prefix}beratrigger on/off*\n` +
                `╰═══════════════════`
            )
        }
        if (arg === 'status') {
            const bar2 = current ? '▓▓▓▓▓▓▓▓▓▓' : '░░░░░░░░░░'
            return reply(`🎯 Bera auto-trigger ${current ? '🟢' : '🔴'} [${bar2}] *${current ? 'ON' : 'OFF'}*`)
        }
        global.db.data.settings.beraTrigger = (arg === 'on')
        await global.db.write()
        return reply(`🎯 *Bera auto-trigger: ${arg === 'on' ? 'ON ✅' : 'OFF ❌'}*\n${arg === 'on' ? 'Now responds to any message with "bera" in it.' : 'Now ONLY responds to ' + prefix + 'bera and ' + prefix + 'agent commands.'}`)
    }

    if (command === 'chatbot') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const action = text?.trim().toLowerCase()
        if (!action || !['on', 'off'].includes(action)) return reply(`Usage: ${prefix}chatbot on/off`)
        global.db.data.settings = global.db.data.settings || {}
        const key = `chatbot_${m.chat}`
        global.db.data.settings[key] = action === 'on'
        await global.db.write()
        return reply(action === 'on' ? `✅ Auto-mode ON — Bera AI listens to everything.` : `✅ Auto-mode OFF.`)
    }

    if (command === 'berareset') {
        const history = getUserHistory(nickSender)
        const count = Math.floor(history.length / 2)
        global.db.data.users[nickSender].nickHistory = []
        await global.db.write()
        return reply(`✅ Memory cleared — ${count} exchange(s) wiped.`)
    }

    if (command === 'berarmemory') {
        const history = getUserHistory(nickSender)
        if (history.length === 0) return reply(`No memory yet. Start with ${prefix}bera <message>`)
        const lines = history.map(h => {
            const label = h.role === 'user' ? '👤' : '🤖'
            const preview = h.content.length > 100 ? h.content.slice(0, 100) + '…' : h.content
            return `${label} ${preview}`
        })
        return reply(`*${Math.floor(history.length / 2)} exchange(s):*\n\n${lines.join('\n\n')}`)
    }

    if (command === 'beraclone') {
        const history = getUserHistory(nickSender)
        if (history.length === 0) return reply(`Nothing to export yet.`)
        const lines = history.map(h => `[${h.role === 'user' ? '👤 YOU' : '🤖 BERA AI'}]\n${h.content}`).join('\n\n' + '─'.repeat(30) + '\n\n')
        const doc = `🤖 BERA AI AI — CONVERSATION\n${'═'.repeat(35)}\nTurns: ${Math.floor(history.length / 2)}\nDate: ${new Date().toUTCString()}\n${'═'.repeat(35)}\n\n${lines}`
        return conn.sendMessage(m.chat, {
            document: Buffer.from(doc, 'utf-8'),
            mimetype: 'text/plain',
            fileName: `Bera_AI_${Date.now()}.txt`,
            caption: `✅ *${Math.floor(history.length / 2)} exchange(s)* exported.`
        }, { quoted: m })
    }

    if (command === 'workspace') {
        const items = listWorkspace()
        const clonedRepos = global.db.data.settings?.clonedRepos || {}
        const lastCloned = global.db.data.settings?.lastCloned || ''
        if (!items.length) return reply(`Workspace is empty. Clone something first.`)
        const lines = items.map(i => {
            const gh = clonedRepos[i]
            const tag = i === lastCloned ? ' _(last)_' : ''
            return gh ? `📁 *${i}*${tag}\n🐙 github.com/${gh.github}` : `📁 *${i}*${tag}`
        }).join('\n\n')
        return reply(`*Workspace:*\n\n${lines}`)
    }

    if (command === 'tagreply') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const action = text?.trim().toLowerCase()
        if (!action || !['on', 'off'].includes(action)) return reply(`Usage: ${prefix}tagreply on/off`)
        global.db.data.settings = global.db.data.settings || {}
        const key = `tagreply_${m.chat}`
        global.db.data.settings[key] = action === 'on'
        await global.db.write()
        return reply(action === 'on'
            ? `✅ Tag-reply ON — Bera AI responds when someone @mentions you.`
            : `✅ Tag-reply OFF.`
        )
    }

    if (command === 'setghtoken') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (!text) return reply(`Usage: ${prefix}setghtoken <github_personal_access_token>`)
        process.env.GITHUB_TOKEN = text.trim()
        return reply(`✅ GitHub token set.`)
    }

    if (command === 'transcribe' || command === 'listen') {
        return handleAction(m, conn, reply, 'transcribe this voice note', sender, null)
    }
}

handle.before = async (m, { conn, reply, prefix }) => {
    try {
        if (m.key?.fromMe) return

        const chatKey = `chatbot_${m.chat}`
        const chatbotOn = global.db.data.settings?.[chatKey] === true
        const sender = m.sender
        const pfx = global.db?.data?.settings?.prefix || prefix

        if (chatbotOn) {
            if (!m.text?.trim() && !hasImage(m)) return
            const text = m.text?.trim() || ''
            if (text.startsWith(pfx)) return
            let imageBuffer = null
            if (hasImage(m)) imageBuffer = await getImageBuffer(conn, m)
            await handleAction(m, conn, reply, text, sender, imageBuffer)
            return
        }

        const ownerJid = `${config.owner.replace(/[^0-9]/g, '')}@s.whatsapp.net`
        const tagReplyKey = `tagreply_${m.chat}`
        const tagReplyOn = global.db.data.settings?.[tagReplyKey] !== false
        const isGroup = m.chat?.endsWith('@g.us')
        const mentionedJids = m.message?.extendedTextMessage?.contextInfo?.mentionedJid ||
            m.message?.imageMessage?.contextInfo?.mentionedJid ||
            m.message?.videoMessage?.contextInfo?.mentionedJid ||
            m.msg?.contextInfo?.mentionedJid || []

        if (isGroup && tagReplyOn && Array.isArray(mentionedJids) && mentionedJids.includes(ownerJid)) {
            const msgText = m.text?.trim() || ''
            if (msgText.startsWith(pfx)) return
            const senderName = m.pushName || sender.split('@')[0]
            const context = `${senderName} just tagged the owner in a group and said: "${msgText || '(no message)'}" — The owner is not available right now. Respond as Bera AI, their AI assistant. Greet them briefly, introduce yourself, and help them or offer to pass the message along.`
            await askNick(m, conn, reply, sender, context)
            return
        }

        if (!m.text?.trim() && !hasImage(m)) return
        if (!m.quoted) return
        const nickMsgIds = global.db.data.users[sender]?.nickMsgIds || []
        if (!nickMsgIds.includes(m.quoted.id)) return
        if (typeof m.text === 'string' && m.text.startsWith(pfx)) return
        let imageBuffer = null
        if (hasImage(m)) imageBuffer = await getImageBuffer(conn, m)
        const userText = m.text?.trim() || ''
        await handleAction(m, conn, reply, userText, sender, imageBuffer)
    } catch (e) {
        console.error('[BERA BEFORE ERROR]', e.message)
    }
}

handle.command = ['bera', 'agent', 'chatbot', 'beraclone', 'workspace', 'setghtoken', 'tagreply', 'transcribe', 'listen', 'beratrigger', 'beratrig', 'beralisten']
handle.tags = ['ai']

module.exports = handle
module.exports.handleAction = handleAction
