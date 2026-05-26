/**
 * Bera AI — GitHub Integration Plugin
 * Commands: .setghtoken, .ghrepo, .ghissue, .ghsearch, .ghuser, .ghgist
 * Owner sets their GitHub token once; then Bera can manage repos and more.
 */

const axios = require('axios')

const getToken = () => global.db?.data?.settings?.githubToken || process.env.GITHUB_TOKEN || ''

const gh = (path, method = 'GET', data = null, token = null) => {
    const t = token || getToken()
    return axios({
        method,
        url: 'https://api.github.com' + path,
        headers: {
            Authorization: 'token ' + t,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'BeraBot/2.0',
        },
        data: data || undefined,
        timeout: 15000,
    })
}

const handle = async (m, { conn, command, args, text, reply, isOwner, chat, prefix }) => {
    const react = (e) => conn.sendMessage(chat, { react: { text: e, key: m.key } }).catch(() => {})

    // ── .setghtoken <token> ───────────────────────────────────────────────────
    if (command === 'setghtoken' || command === 'setgithubtoken') {
        if (!isOwner) return reply('❌ Owner only.')
        const token = args[0]?.trim()
        if (!token) return reply('❌ Usage: *' + prefix + 'setghtoken ghp_yourTokenHere*\n\nGet one at: github.com/settings/tokens')
        try {
            await react('🔍')
            const res = await gh('/user', 'GET', null, token)
            const user = res.data
            if (!global.db.data.settings) global.db.data.settings = {}
            global.db.data.settings.githubToken = token
            await global.db.write()
            await react('✅')
            return reply(
                '✅ *GitHub Token Saved!*\n\n' +
                '👤 *Account:* ' + user.login + '\n' +
                '📛 *Name:* ' + (user.name || 'N/A') + '\n' +
                '📦 *Public Repos:* ' + user.public_repos + '\n' +
                '👥 *Followers:* ' + user.followers + '\n\n' +
                'You can now use:\n' +
                prefix + 'ghrepo list\n' +
                prefix + 'ghrepo create <name>\n' +
                prefix + 'ghuser <username>\n' +
                prefix + 'ghsearch <query>\n' +
                prefix + 'ghgist <title> | <content>'
            )
        } catch (e) {
            await react('❌')
            return reply('❌ Invalid token or network error: ' + (e.response?.data?.message || e.message))
        }
    }

    // All other commands require a saved token
    if (!['setghtoken','setgithubtoken','ghuser','ghsearch'].includes(command) && !getToken()) {
        return reply('❌ No GitHub token set.\nUse: *' + prefix + 'setghtoken <your_token>*')
    }

    // ── .ghuser <username> ────────────────────────────────────────────────────
    if (command === 'ghuser') {
        const username = args[0]
        if (!username) return reply('❌ Usage: *' + prefix + 'ghuser <username>*')
        try {
            await react('🔍')
            const res = await axios.get('https://api.github.com/users/' + username, {
                headers: { 'User-Agent': 'BeraBot/2.0' },
                timeout: 10000
            })
            const u = res.data
            await react('✅')
            return reply(
                '╭══〘 *👤 GitHub User* 〙═⊷\n' +
                '┃ *Username:* ' + u.login + '\n' +
                '┃ *Name:* ' + (u.name || 'N/A') + '\n' +
                '┃ *Bio:* ' + (u.bio || 'N/A') + '\n' +
                '┃ *Location:* ' + (u.location || 'N/A') + '\n' +
                '┃ *Repos:* ' + u.public_repos + '\n' +
                '┃ *Followers:* ' + u.followers + '\n' +
                '┃ *Following:* ' + u.following + '\n' +
                '┃ *Link:* ' + u.html_url + '\n' +
                '╰══════════════════⊷'
            )
        } catch (e) {
            await react('❌')
            return reply('❌ User not found: ' + username)
        }
    }

    // ── .ghrepo list / create / delete / info ─────────────────────────────────
    if (command === 'ghrepo' || command === 'ghrepository') {
        const sub = args[0]?.toLowerCase()

        if (!sub || sub === 'list') {
            try {
                await react('📋')
                const res = await gh('/user/repos?per_page=20&sort=updated')
                const repos = res.data
                if (!repos.length) return reply('📦 No repos found.')
                const lines = repos.map((r, i) =>
                    '┃ ' + (i + 1) + '. *' + r.name + '* ' + (r.private ? '🔒' : '🌐') + ' ⭐' + r.stargazers_count
                ).join('\n')
                await react('✅')
                return reply('╭══〘 *📦 Your Repos* 〙═⊷\n' + lines + '\n╰══════════════════⊷\n\n_' + repos.length + ' repos, sorted by recent_')
            } catch (e) {
                await react('❌')
                return reply('❌ Failed: ' + (e.response?.data?.message || e.message))
            }
        }

        if (sub === 'create') {
            const repoName = args[1]
            const isPrivate = args.includes('private')
            const desc = args.slice(2).filter(a => a !== 'private').join(' ')
            if (!repoName) return reply('❌ Usage: *' + prefix + 'ghrepo create <name> [private] [description]*')
            try {
                await react('⏳')
                const res = await gh('/user/repos', 'POST', {
                    name: repoName,
                    description: desc || 'Created by Bera AI Bot',
                    private: isPrivate,
                    auto_init: true,
                })
                const repo = res.data
                await react('✅')
                return reply(
                    '✅ *Repo Created!*\n\n' +
                    '📦 *Name:* ' + repo.full_name + '\n' +
                    '🔒 *Visibility:* ' + (repo.private ? 'Private' : 'Public') + '\n' +
                    '🔗 *URL:* ' + repo.html_url + '\n' +
                    '🌿 *Default Branch:* ' + repo.default_branch
                )
            } catch (e) {
                await react('❌')
                return reply('❌ Failed to create repo: ' + (e.response?.data?.message || e.message))
            }
        }

        if (sub === 'delete') {
            if (!isOwner) return reply('❌ Owner only.')
            const repoName = args[1]
            if (!repoName) return reply('❌ Usage: *' + prefix + 'ghrepo delete <repo-name>*')
            try {
                await react('⏳')
                const meRes = await gh('/user')
                const login = meRes.data.login
                await gh('/repos/' + login + '/' + repoName, 'DELETE')
                await react('✅')
                return reply('✅ Repo *' + repoName + '* deleted.')
            } catch (e) {
                await react('❌')
                return reply('❌ Failed: ' + (e.response?.data?.message || e.message))
            }
        }

        if (sub === 'info') {
            const repoName = args[1]
            if (!repoName) return reply('❌ Usage: *' + prefix + 'ghrepo info <repo-name>*\nOr: *' + prefix + 'ghrepo info owner/repo*')
            try {
                await react('🔍')
                const fullName = repoName.includes('/') ? repoName : null
                let res
                if (fullName) {
                    res = await axios.get('https://api.github.com/repos/' + fullName, { headers: { 'User-Agent': 'BeraBot/2.0' }, timeout: 10000 })
                } else {
                    const meRes = await gh('/user')
                    res = await gh('/repos/' + meRes.data.login + '/' + repoName)
                }
                const r = res.data
                await react('✅')
                return reply(
                    '╭══〘 *📦 Repo Info* 〙═⊷\n' +
                    '┃ *Name:* ' + r.full_name + '\n' +
                    '┃ *Desc:* ' + (r.description || 'N/A') + '\n' +
                    '┃ *Stars:* ⭐ ' + r.stargazers_count + '\n' +
                    '┃ *Forks:* 🍴 ' + r.forks_count + '\n' +
                    '┃ *Issues:* 🐛 ' + r.open_issues_count + '\n' +
                    '┃ *Language:* ' + (r.language || 'N/A') + '\n' +
                    '┃ *Visibility:* ' + (r.private ? '🔒 Private' : '🌐 Public') + '\n' +
                    '┃ *Link:* ' + r.html_url + '\n' +
                    '╰══════════════════⊷'
                )
            } catch (e) {
                await react('❌')
                return reply('❌ Repo not found: ' + repoName)
            }
        }

        return reply(
            '❓ *GitHub Repo Commands:*\n\n' +
            prefix + 'ghrepo list — List your repos\n' +
            prefix + 'ghrepo create <name> [private] — Create a repo\n' +
            prefix + 'ghrepo delete <name> — Delete a repo\n' +
            prefix + 'ghrepo info <name or owner/repo> — Repo details'
        )
    }

    // ── .ghsearch <query> ─────────────────────────────────────────────────────
    if (command === 'ghsearch' || command === 'searchgithub') {
        if (!text) return reply('❌ Usage: *' + prefix + 'ghsearch <query>*')
        try {
            await react('🔍')
            const res = await axios.get('https://api.github.com/search/repositories?q=' + encodeURIComponent(text) + '&per_page=5&sort=stars', {
                headers: { 'User-Agent': 'BeraBot/2.0' },
                timeout: 10000
            })
            const items = res.data.items || []
            if (!items.length) return reply('❌ No repos found for: ' + text)
            const lines = items.map((r, i) =>
                '┃ ' + (i + 1) + '. *' + r.full_name + '*\n' +
                '┃    ⭐' + r.stargazers_count + ' | ' + (r.language || 'N/A') + '\n' +
                '┃    ' + (r.description || 'No description').slice(0, 60)
            ).join('\n┃\n')
            await react('✅')
            return reply('╭══〘 *🔍 GitHub Search: ' + text.slice(0, 30) + '* 〙═⊷\n┃\n' + lines + '\n╰══════════════════⊷')
        } catch (e) {
            await react('❌')
            return reply('❌ Search failed: ' + e.message)
        }
    }

    // ── .ghissue <repo> | <title> | <body> ────────────────────────────────────
    if (command === 'ghissue' || command === 'githubissue') {
        const parts = text.split('|').map(s => s.trim())
        if (parts.length < 2) return reply('❌ Usage: *' + prefix + 'ghissue <repo> | <title> | <body>*\nExample: ' + prefix + 'ghissue bera-ai | Bug report | Something is broken')
        const [repoName, title, body] = parts
        try {
            await react('⏳')
            const meRes = await gh('/user')
            const login = meRes.data.login
            const fullRepo = repoName.includes('/') ? repoName : login + '/' + repoName
            const res = await gh('/repos/' + fullRepo + '/issues', 'POST', {
                title: title,
                body: body || 'Created by Bera AI Bot',
            })
            await react('✅')
            return reply('✅ *Issue Created!*\n\n🔗 ' + res.data.html_url + '\n🔢 Issue #' + res.data.number + ': ' + title)
        } catch (e) {
            await react('❌')
            return reply('❌ Failed: ' + (e.response?.data?.message || e.message))
        }
    }

    // ── .ghgist <title> | <content> ───────────────────────────────────────────
    if (command === 'ghgist' || command === 'creategist') {
        const parts = text.split('|').map(s => s.trim())
        if (parts.length < 2) return reply('❌ Usage: *' + prefix + 'ghgist <filename> | <content>*\nExample: ' + prefix + 'ghgist notes.txt | Hello world')
        const [filename, content] = parts
        try {
            await react('⏳')
            const res = await gh('/gists', 'POST', {
                description: 'Created by Bera AI',
                public: false,
                files: { [filename]: { content } }
            })
            await react('✅')
            return reply('✅ *Gist Created!*\n\n🔗 ' + res.data.html_url)
        } catch (e) {
            await react('❌')
            return reply('❌ Failed: ' + (e.response?.data?.message || e.message))
        }
    }
}

handle.command = [
    'setghtoken', 'setgithubtoken',
    'ghrepo', 'ghrepository',
    'ghuser',
    'ghsearch', 'searchgithub',
    'ghissue', 'githubissue',
    'ghgist', 'creategist',
]
handle.tags = ['owner', 'tools', 'github']
handle.help = [
    'setghtoken <token>        — Save your GitHub token',
    'ghrepo list               — List your repos',
    'ghrepo create <name>      — Create a new repo',
    'ghrepo info <name>        — Repo details',
    'ghuser <username>         — View any GitHub user',
    'ghsearch <query>          — Search GitHub repos',
    'ghissue <repo>|<title>    — Create an issue',
    'ghgist <file>|<content>   — Create a secret gist',
]

module.exports = handle
