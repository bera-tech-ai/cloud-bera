const axios = require('axios')
const { exec } = require('child_process')
const fs   = require('fs')
const path = require('path')

// ── Gifted API ─────────────────────────────────────────────────────────────────
const GIFTED = 'https://api.gifted.co.ke'
const GIFTED_KEY = '_0u5aff45,_0l1876s8qc'

const callGiftedAI = async (systemPrompt, userMsg) => {
    const q = (systemPrompt ? systemPrompt + '\n\n' : '') + userMsg
    const endpoints = [
        `${GIFTED}/api/ai/gemini`,
        `${GIFTED}/api/ai/gpt4o`,
    ]
    for (const url of endpoints) {
        try {
            const res = await axios.get(url, {
                params: { apikey: GIFTED_KEY, q: q.slice(0, 4000) },
                timeout: 15000
            })
            const text = res.data?.result || res.data?.response || res.data?.answer ||
                         (typeof res.data === 'string' ? res.data : null)
            if (!text || text === 'Request failed with status code 403') continue
            const trimmed = String(text).trim()
            if (trimmed.startsWith('{') && (trimmed.includes('"error"') || trimmed.includes('"success":false'))) continue
            return { success: true, text: trimmed }
        } catch { continue }
    }
    return { success: false, error: 'Gifted AI unavailable' }
}

// ── Xwolf fallback ──────────────────────────────────────────────────────────────
const XWOLF_URL = 'https://apis.xwolf.space/api/ai/gemini'

const callXwolf = async (systemPrompt, userMsg) => {
    try {
        const q = systemPrompt ? `${systemPrompt}\n\n${userMsg}` : userMsg
        const res = await axios.get(XWOLF_URL, {
            params: { q: q.slice(0, 6000) },
            timeout: 12000
        })
        const text = res.data?.result || res.data?.response || res.data?.answer ||
                     (typeof res.data === 'string' ? res.data : null)
        if (!text) return { success: false, error: 'No response from Xwolf' }
        return { success: true, text: String(text).trim() }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

// ── Pollinations fallback (free, no key) ────────────────────────────────────────
const callPollinationsAgent = async (systemPrompt, userMsg) => {
    try {
        const messages = []
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt.slice(0, 3000) })
        messages.push({ role: 'user', content: userMsg.slice(0, 3000) })
        const body = JSON.stringify({ model: 'mistral', messages, seed: Math.floor(Math.random() * 99999) })
        const reply = await new Promise((resolve, reject) => {
            const req = require('https').request({
                hostname: 'text.pollinations.ai', path: '/', method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'User-Agent': 'BeraAI/3.0' }
            }, res => {
                let d = ''
                res.on('data', c => d += c)
                res.on('end', () => {
                    if (res.statusCode >= 400) return resolve(null)
                    const t = d.trim()
                    if (!t || t.startsWith('{')) return resolve(null)
                    resolve(t)
                })
            })
            req.on('error', () => resolve(null))
            req.setTimeout(18000, () => { req.destroy(); resolve(null) })
            req.write(body); req.end()
        })
        if (reply && reply.length > 2) return { success: true, text: reply }
    } catch {}
    return { success: false, error: 'Pollinations unavailable' }
}

// ── Primary AI caller with fallback ───────────────────────────────────────────
const callAI = async (systemPrompt, userMsg) => {
    // Gifted first — gemini + gpt4o confirmed working
    const gifted = await callGiftedAI(systemPrompt, userMsg)
    if (gifted.success) return gifted

    // Xwolf as second option
    const xwolf = await callXwolf(systemPrompt, userMsg)
    if (xwolf.success) return xwolf

    // Pollinations last resort (free, no key)
    const poll = await callPollinationsAgent(systemPrompt, userMsg)
    if (poll.success) return poll

    return { success: false, error: 'All AI providers failed' }
}

// Backward compatibility
const callPollinations = callAI

// ── Shell runner ──────────────────────────────────────────────────────────────
const runShell = (cmd, timeout = 30000) => new Promise(resolve => {
    exec(cmd, { timeout, maxBuffer: 1024 * 1024 * 5 }, (err, stdout, stderr) => {
        const out = (stdout || '').trim() + (stderr ? '\n[stderr]: ' + stderr.trim() : '')
        resolve({ success: !err, output: out.slice(0, 3000) || (err ? err.message : 'done') })
    })
})

// ══════════════════════════════════════════════════════════════════════════════
//  SYSTEM TOOLS
// ══════════════════════════════════════════════════════════════════════════════

const systemInfo = async () => {
    try {
        const [ram, disk, cpu, uptime, processes] = await Promise.all([
            runShell("free -m | awk 'NR==2{printf \"%s/%s MB (%.0f%%)\", $3,$2,$3*100/$2}'"),
            runShell("df -h / | awk 'NR==2{print $3\"/\"$2\" (\"$5\" used)\"}'"),
            runShell("top -bn1 | grep 'Cpu(s)' | awk '{print $2+$4\"%\"}'"),
            runShell("uptime -p"),
            runShell("ps aux --no-headers | wc -l")
        ])
        return {
            success: true,
            ram:       ram.output,
            disk:      disk.output,
            cpu:       cpu.output,
            uptime:    uptime.output,
            processes: processes.output.trim() + ' processes'
        }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

const portCheck = async (port) => {
    const r = await runShell(`ss -tlnp | grep :${port}; netstat -tlnp 2>/dev/null | grep :${port}; lsof -i :${port} -n -P 2>/dev/null | head -5`)
    return {
        success: true,
        port,
        open: r.output.trim().length > 0,
        info: r.output.trim() || `Nothing listening on port ${port}`
    }
}

const dockerManage = async (action, name) => {
    const cmds = {
        list:    'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"',
        listall: 'docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"',
        logs:    `docker logs ${name} --tail 50 2>&1`,
        start:   `docker start ${name}`,
        stop:    `docker stop ${name}`,
        restart: `docker restart ${name}`,
        remove:  `docker rm -f ${name}`,
        stats:   'docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"',
        images:  'docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"'
    }
    const cmd = cmds[action] || cmds.list
    return runShell(cmd, 20000)
}

const cronManage = async (action, expr, cmd) => {
    if (action === 'list') {
        return runShell('crontab -l 2>/dev/null || echo "No cron jobs"')
    }
    if (action === 'add' && expr && cmd) {
        const addCmd = `(crontab -l 2>/dev/null; echo "${expr} ${cmd}") | crontab -`
        return runShell(addCmd)
    }
    if (action === 'clear') {
        return runShell('crontab -r 2>/dev/null; echo "Cron cleared"')
    }
    return { success: false, output: 'Unknown cron action. Use: list, add, clear' }
}

const processKill = async (nameOrPid) => {
    const isPid = /^\d+$/.test(nameOrPid)
    const cmd = isPid ? `kill -9 ${nameOrPid}` : `pkill -f "${nameOrPid}"; killall "${nameOrPid}" 2>/dev/null; echo "killed"`
    return runShell(cmd)
}

// ══════════════════════════════════════════════════════════════════════════════
//  DEVELOPER TOOLS
// ══════════════════════════════════════════════════════════════════════════════

const codeReview = async (code, context = '') => {
    const sys = `You are an expert code reviewer. Analyze the code and provide:
1. 🐛 Bugs or errors
2. 🔒 Security issues  
3. ⚡ Performance improvements
4. 📝 Code quality suggestions
Be specific and concise. Use emojis for each point.`
    return callAI(sys, `${context ? 'Context: ' + context + '\n\n' : ''}Code:\n\`\`\`\n${code.slice(0, 4000)}\n\`\`\``)
}

const codeExplain = async (code, fileName = '') => {
    const sys = `You are a senior developer. Explain this code clearly to a developer. Cover: what it does, key functions, dependencies used, and any notable patterns. Be concise.`
    return callAI(sys, `File: ${fileName}\n\n\`\`\`\n${code.slice(0, 4000)}\n\`\`\``)
}

const bugFinder = async (code, fileName = '') => {
    const sys = `You are a bug hunter. Find ALL bugs, logic errors, unhandled edge cases, and potential crashes in this code. For each bug: state the line/function, what the bug is, and how to fix it. If no bugs, say so.`
    return callAI(sys, `File: ${fileName}\n\n\`\`\`\n${code.slice(0, 4000)}\n\`\`\``)
}

const httpRequest = async (method, url, data, headers = {}) => {
    try {
        const config = { method: method.toUpperCase(), url, timeout: 20000, headers: { 'User-Agent': 'Bera-Agent/1.0', ...headers } }
        if (data && ['POST', 'PUT', 'PATCH'].includes(config.method)) {
            config.data = typeof data === 'string' ? data : JSON.stringify(data)
            config.headers['Content-Type'] = 'application/json'
        }
        const r = await axios(config)
        const body = typeof r.data === 'object' ? JSON.stringify(r.data, null, 2) : String(r.data)
        return {
            success: true,
            status: r.status,
            output: `HTTP ${r.status} ${r.statusText}\n\n${body.slice(0, 2000)}`
        }
    } catch (e) {
        const status = e.response?.status
        const body   = e.response?.data ? JSON.stringify(e.response.data).slice(0, 500) : e.message
        return { success: false, output: `HTTP ${status || 'ERR'}: ${body}` }
    }
}

const gitStatus = async (folder) => {
    const cwd = folder || '.'
    const [status, log, diff] = await Promise.all([
        runShell(`cd ${cwd} && git status --short 2>&1`),
        runShell(`cd ${cwd} && git log --oneline -5 2>&1`),
        runShell(`cd ${cwd} && git diff --stat 2>&1`)
    ])
    return {
        success: true,
        output: `📁 Status:\n${status.output || 'clean'}\n\n📜 Last commits:\n${log.output || 'none'}\n\n📊 Diff:\n${diff.output || 'no changes'}`
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  ANALYTICS & MONITORING
// ══════════════════════════════════════════════════════════════════════════════

const usageStats = () => {
    try {
        const stats   = global.db?.data?.stats || {}
        const users   = global.db?.data?.users || {}
        const cmds    = global.db?.data?.commandStats || {}
        const userArr = Object.entries(users)
        const topUser = userArr.sort((a,b) => (b[1].commandCount||0) - (a[1].commandCount||0)).slice(0, 3)
        const topCmd  = Object.entries(cmds).sort((a,b) => b[1]-a[1]).slice(0, 5)
        return {
            success: true,
            total:   stats.totalCommands || 0,
            users:   userArr.length,
            topUsers: topUser.map(([jid, u]) => `+${jid.replace(/@.+/,'')} (${u.commandCount||0} cmds)`),
            topCmds:  topCmd.map(([cmd, n]) => `.${cmd}: ${n}`)
        }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

const errorLogAnalyze = async (logContent) => {
    const sys = `You are a log analyzer. Read these logs and provide:
1. 🔴 Critical errors (with line context)
2. ⚠️ Warnings
3. 📊 Pattern summary (most common issues)
4. 💡 Suggested fixes
Be concise and actionable.`
    return callAI(sys, `Logs:\n${logContent.slice(0, 5000)}`)
}

const pm2Manage = async (action, name) => {
    const cmds = {
        list:    'pm2 list',
        logs:    `pm2 logs ${name || ''} --lines 50 --nostream 2>&1 | tail -50`,
        start:   `pm2 start ${name}`,
        stop:    `pm2 stop ${name}`,
        restart: `pm2 restart ${name}`,
        delete:  `pm2 delete ${name}`,
        status:  `pm2 show ${name} 2>&1`,
        save:    'pm2 save',
        monit:   'pm2 jlist 2>/dev/null || pm2 list'
    }
    const cmd = cmds[action] || cmds.list
    return runShell(cmd, 20000)
}

// ══════════════════════════════════════════════════════════════════════════════
//  AUTOMATION
// ══════════════════════════════════════════════════════════════════════════════

const scheduleMessage = (conn, target, messageText, delayMs) => {
    const sendAt = new Date(Date.now() + delayMs)
    setTimeout(async () => {
        try {
            await conn.sendMessage(target, { text: messageText })
        } catch (e) {
            console.error('[SCHEDULE]', e.message)
        }
    }, delayMs)
    return { success: true, output: `Message scheduled for ${sendAt.toLocaleTimeString()}` }
}

const backupToGithub = async (folder, repoUrl) => {
    const steps = []
    const folderName = path.basename(folder)
    const zipPath = `/tmp/${folderName}_backup_${Date.now()}.zip`
    let r = await runShell(`zip -r ${zipPath} ${folder} --exclude="*/node_modules/*" --exclude="*/.git/*"`, 60000)
    steps.push({ step: 'zip', ok: r.success, out: r.output.slice(0, 100) })
    if (!r.success) return { success: false, output: steps.map(s => `${s.ok?'✅':'❌'} ${s.step}: ${s.out}`).join('\n') }
    const sizeMB = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2)
    return { success: true, output: `✅ Backup created: ${zipPath} (${sizeMB} MB)\nFolder: ${folder}`, file: zipPath }
}

const sqliteQuery = async (dbPath, query) => {
    const escapedQuery = query.replace(/'/g, "''")
    const r = await runShell(`sqlite3 "${dbPath}" "${escapedQuery}" 2>&1`, 15000)
    return r
}

// ══════════════════════════════════════════════════════════════════════════════
//  GROUP TOOLS
// ══════════════════════════════════════════════════════════════════════════════

const groupAnalyzer = async (conn, chat) => {
    try {
        const meta = await conn.groupMetadata(chat)
        const parts = meta.participants || []
        const admins   = parts.filter(p => p.admin)
        const members  = parts.filter(p => !p.admin)
        return {
            success: true,
            name:        meta.subject || 'Unknown',
            description: meta.desc || 'No description',
            total:       parts.length,
            admins:      admins.length,
            members:     members.length,
            adminList:   admins.map(a => a.pushName || a.id.replace(/@.+/,'')).slice(0, 10),
            created:     meta.creation ? new Date(meta.creation * 1000).toDateString() : 'Unknown'
        }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  NPM TOOLS
// ══════════════════════════════════════════════════════════════════════════════

const npmStats = async (pkg) => {
    try {
        const [weekly, monthly, info] = await Promise.all([
            axios.get(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(pkg)}`, { timeout: 10000 }),
            axios.get(`https://api.npmjs.org/downloads/point/last-month/${encodeURIComponent(pkg)}`, { timeout: 10000 }),
            axios.get(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`, { timeout: 10000 })
        ])
        const latest = info.data['dist-tags']?.latest || 'unknown'
        return {
            success: true, pkg,
            weekly:  weekly.data.downloads?.toLocaleString() || '0',
            monthly: monthly.data.downloads?.toLocaleString() || '0',
            version: latest,
            description: info.data.description || '',
            author: info.data.author?.name || info.data.maintainers?.[0]?.name || 'unknown'
        }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  GROUP MEMBER RESOLVER
// ══════════════════════════════════════════════════════════════════════════════

const resolveGroupMember = async (conn, chat, jidOrName) => {
    try {
        const meta = await conn.groupMetadata(chat)
        const search = jidOrName.replace(/[@+]/g, '').toLowerCase()
        const found  = meta.participants.find(p =>
            p.id.replace(/@.+/, '').includes(search) ||
            (p.pushName || '').toLowerCase().includes(search)
        )
        if (!found) return { success: false, error: 'Member not found' }
        return {
            success: true,
            jid:        found.id,
            phone:      found.id.replace(/@.+/, ''),
            name:       found.pushName || 'Unknown',
            isAdmin:    found.admin === 'admin' || found.admin === 'superadmin',
            isSuperAdmin: found.admin === 'superadmin'
        }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  PROJECT CREATOR
// ══════════════════════════════════════════════════════════════════════════════

const createProject = async (name, type = 'express', port = 3000, description = '') => {
    const safeName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    const projDir  = `/tmp/projects/${safeName}`
    const steps = []
    let r = await runShell(`mkdir -p ${projDir}`)
    steps.push({ step: 'mkdir', ok: r.success, out: r.output })
    const pkg = JSON.stringify({ name: safeName, version: '1.0.0', description, main: 'index.js', scripts: { start: 'node index.js' }, dependencies: { express: '*' } }, null, 2)
    fs.writeFileSync(`${projDir}/package.json`, pkg)
    steps.push({ step: 'package.json', ok: true, out: 'created' })
    const mainCode = `const express = require('express')
const app = express()
const PORT = ${port}
app.use(express.json())
app.use(express.static('public'))
app.get('/', (req, res) => {
  res.send(\`<!DOCTYPE html><html><head><title>${name}</title>
<style>body{font-family:Arial,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#1a1a2e;color:#eee}h1{color:#e94560}#display{font-size:4rem;font-weight:bold;color:#0f3460;background:#e94560;padding:20px 40px;border-radius:12px;margin:20px}button{padding:12px 30px;margin:8px;border:none;border-radius:8px;font-size:1rem;cursor:pointer;background:#0f3460;color:#fff}button:hover{background:#e94560}</style></head>
<body><h1>${name}</h1><div id="display">00:00:00</div><div><button onclick="start()">Start</button><button onclick="pause()">Pause</button><button onclick="reset()">Reset</button></div>
<script>let t=0,running=false,interval;function fmt(n){return String(n).padStart(2,'0')}function tick(){t++;const h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60;document.getElementById('display').textContent=fmt(h)+':'+fmt(m)+':'+fmt(s)}function start(){if(!running){running=true;interval=setInterval(tick,1000)}}function pause(){running=false;clearInterval(interval)}function reset(){running=false;clearInterval(interval);t=0;document.getElementById('display').textContent='00:00:00'}<\/script></body></html>\`)
})
app.listen(PORT, () => console.log(\`${name} running on port \${PORT}\`))
`
    fs.writeFileSync(`${projDir}/index.js`, mainCode)
    steps.push({ step: 'index.js', ok: true, out: 'created' })
    r = await runShell(`cd ${projDir} && npm install --loglevel=error`, 60000)
    steps.push({ step: 'npm install', ok: r.success, out: r.output.slice(0, 200) })
    r = await runShell(`pm2 delete ${safeName} 2>/dev/null; pm2 start ${projDir}/index.js --name ${safeName}`)
    steps.push({ step: 'pm2 start', ok: r.success, out: r.output.slice(0, 300) })
    return { success: true, name: safeName, dir: projDir, port, steps }
}

// ══════════════════════════════════════════════════════════════════════════════
//  GITHUB TOKEN
// ══════════════════════════════════════════════════════════════════════════════

const githubTokenRegen = async (tokenInDB) => {
    try {
        const ghToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN || tokenInDB
        if (!ghToken) return { success: false, error: 'No GitHub token configured' }
        const meRes = await axios.get('https://api.github.com/user', {
            headers: { 'Authorization': `Bearer ${ghToken}`, 'User-Agent': 'Bera-AI' }, timeout: 10000
        })
        return {
            success: true, username: meRes.data.login, canAutoCreate: false,
            message: `Token is valid for *${meRes.data.login}*.\n\nTo generate a new token:\n1. Go to: https://github.com/settings/tokens/new\n2. Set expiry, select repo/workflow scopes\n3. Click Generate token\n4. Send *.setgithub <token>* to update`
        }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  AGENT PLANNER (Gifted AI)
// ══════════════════════════════════════════════════════════════════════════════

const PLAN_PROMPT = `You are Bera AI's action planner. Given a user task, return ONLY strict JSON — no markdown.

Available actions:
SYSTEM & SHELL:
- shell          → args: { cmd }
- file_read      → args: { path }
- file_write     → args: { path, content }
- js_eval        → args: { code }
- system_info    → args: {}
- port_check     → args: { port }
- file_search    → args: { pattern, directory, ext }
- file_diff      → args: { file1, file2 }
- env_manage     → args: { action("list"|"get"|"set"|"delete"), key, value }
- password_gen   → args: { length, noSymbols }
- json_tools     → args: { action("format"|"minify"|"validate"|"keys"), json }

CODE EXECUTION (any language via Piston API):
- run_code       → args: { code, lang, stdin }   ← lang: js, python, php, ruby, go, rust, c, cpp, java, kotlin, swift, lua, perl, r, haskell, ts, bash, etc.
- npm_install    → args: { packages, cwd }
- code_gen       → args: { description, language }   ← AI writes code for you
- code_review    → args: { code, context }
- code_explain   → args: { code, fileName }
- bug_finder     → args: { code, fileName }
- npm_stats      → args: { package }

WEB SCRAPING & BROWSING:
- web_scrape     → args: { url }   ← full structured scrape (title, text, links, images, tables, JSON-LD)
- extract_links  → args: { url, filter }   ← get all links, optionally filtered
- extract_table  → args: { url }   ← parse HTML tables to structured JSON
- extract_data   → args: { url }   ← get JSON-LD, Open Graph, meta tags
- extract_emails → args: { url }   ← find all email addresses on page
- extract_phones → args: { url }   ← find all phone numbers on page
- find_text      → args: { url, query }   ← search for keyword on a page
- bulk_scrape    → args: { urls }   ← scrape multiple URLs (array)
- regex_extract  → args: { url, pattern, flags }   ← regex match on page content
- fetch_json     → args: { url, headers }   ← fetch and pretty-print JSON API
- api_test       → args: { method, url, body, headers }   ← test any API endpoint
- screenshot     → args: { url }   ← screenshot a website
- page_monitor   → args: { url, previousHash }   ← detect if page content changed

NETWORKING:
- http_request   → args: { method, url, data, headers }
- url_check      → args: { urls }   ← check if URLs are up (array or space-separated)
- dns_check      → args: { host }
- ssl_check      → args: { domain }
- ping           → args: { host }
- whois          → args: { domain }
- ip_lookup      → args: { ip }

PROJECT MANAGEMENT:
- create_project → args: { name, type, port, description }   ← creates in /tmp/projects/<name>
- workspace_save → args: { projectDir, repoName, description, isPrivate }   ← save to GitHub
- pm2_start      → args: { script, name }
- pm2_stop       → args: { name }
- pm2_restart    → args: { name }
- pm2_logs       → args: { name, lines }
- pm2_list       → args: {}
- git_clone      → args: { url, folder }
- git_push       → args: { folder, message }
- git_status     → args: { folder }
- github_token   → args: {}
- docker_manage  → args: { action, name }
- berahost_deploy→ args: { botName, repoUrl, ram, disk, cpu }
- berahost_list  → args: {}
- berahost_power → args: { serverId, action }

AI:
- search         → args: { query }
- image_gen      → args: { prompt }
- music          → args: { query }

APP BUILDER (Replit-style, full multi-file projects):
- build_webapp   → args: { name, type("express"|"express-api"|"react"|"vue"|"nextjs"|"flask"|"fastapi"|"static"|"discord"|"telegram"), description, port }   ← AI generates real code, installs deps, starts with PM2
- generate_api   → args: { description, port }   ← describe your API → get a working REST API running
- auto_fix       → args: { projectDir }   ← detect & self-fix build errors (up to 3 attempts)

DATA & ANALYSIS:
- analyze_data   → args: { data, question }   ← CSV or JSON → stats, patterns, AI insights
- markdown_tools → args: { action("to_html"|"generate"|"table"), input }   ← markdown utilities

DEEP WEB:
- crawl_site     → args: { url, maxDepth, maxPages }   ← crawl entire website, follow links
- compare_apis   → args: { urls, method }   ← benchmark multiple APIs side-by-side
- load_test      → args: { url, requests, concurrency, method }   ← stress-test any endpoint

SECURITY & CRYPTO:
- jwt_tools      → args: { action("encode"|"decode"|"verify"|"apikey"|"hash"|"base64encode"|"base64decode"), payload, secret, expiresIn }
- password_gen   → args: { length, noSymbols }

DATABASE (SQLite):
- sqlite_manage  → args: { action("create"|"schema"|"tables"|"insert"|"query"|"run"|"drop"|"info"|"seed"), dbPath, query, data }

GITHUB (full management):
- github_manage  → args: { action("whoami"|"list_repos"|"create_repo"|"delete_repo"|"create_issue"|"list_issues"|"commit_file"|"read_file"|"get_commits"|"fork"|"star"|"search_repos"), opts: { name, repo, owner, title, body, path, content, message, description, private, query, labels } }

DOCS & TESTING:
- generate_docs  → args: { code, language, style("markdown"|"jsdoc"|"html") }   ← auto-generate documentation
- generate_tests → args: { code, language, framework("jest"|"mocha"|"pytest") }   ← write unit tests

RULES:
- "save to workspace" or "save on workspace" = workspace_save (GitHub), NOT save_note
- "build me a <type> app" = build_webapp with the right type
- "create an API for X" = generate_api
- "scrape the whole site" = crawl_site, single page = web_scrape
- When user says "scrape", "extract", "get data from" a URL → use web_scrape or extract_*
- For any programming language task → use run_code with the right lang
- For "write code for X" → use code_gen then run_code
- For "analyze this data/CSV/JSON" → use analyze_data
- For JWT/token operations → use jwt_tools
- For SQLite database operations → use sqlite_manage
- For GitHub management → use github_manage (not workspace_save)
- urls arg in bulk_scrape must be an array: ["url1","url2"]
- build_webapp type must be one of: express, express-api, react, vue, nextjs, flask, fastapi, static, discord, telegram

Return format (ONLY JSON, no markdown):
{"plan":"one line summary","steps":[{"action":"web_scrape","args":{"url":"https://example.com"},"desc":"Scrape example.com"}]}

Task: `

const SUMMARY_PROMPT = `You are Bera AI — a smart, direct assistant. Summarize what was done clearly. Use bullets for multiple results. Be concise.

Task: {task}
Steps:
{steps}

Reply:`

const planTask = async (task) => {
    try {
        const result = await callAI('', PLAN_PROMPT + task)
        if (!result.success) return { success: false, error: result.error }
        const jsonMatch = result.text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) return { success: false, error: 'Could not parse plan' }
        const plan = JSON.parse(jsonMatch[0])
        if (!plan.steps || !Array.isArray(plan.steps)) return { success: false, error: 'Invalid plan' }
        return { success: true, plan }
    } catch (e) {
        return { success: false, error: 'Plan failed: ' + e.message }
    }
}

const executeStep = async (step, conn, chat, m) => {
    const { action, args, desc } = step
    try {
        switch (action) {
            case 'shell':        return { ...await runShell(args.cmd, 45000), desc }
            case 'file_read': {
                const content = fs.existsSync(args.path) ? fs.readFileSync(args.path, 'utf8').slice(0, 3000) : 'File not found'
                return { success: true, output: content, desc }
            }
            case 'file_write':
                fs.mkdirSync(path.dirname(args.path), { recursive: true })
                fs.writeFileSync(args.path, args.content || '')
                return { success: true, output: `Written: ${args.path}`, desc }
            case 'js_eval': {
                const out = eval(args.code)
                return { success: true, output: String(out ?? 'done'), desc }
            }
            case 'npm_install':    return { ...await runShell(`cd ${args.cwd||'.'} && npm install ${args.packages||''} --loglevel=error`, 60000), desc }
            case 'pm2_start':      return { ...await runShell(`pm2 start ${args.script} --name ${args.name}`), desc }
            case 'pm2_stop':       return { ...await runShell(`pm2 stop ${args.name}`), desc }
            case 'pm2_restart':    return { ...await runShell(`pm2 restart ${args.name}`), desc }
            case 'pm2_logs':       return { ...await runShell(`pm2 logs ${args.name} --lines ${args.lines||50} --nostream 2>&1 | tail -${args.lines||50}`), desc }
            case 'pm2_list':       return { ...await pm2Manage('list'), desc }
            case 'create_project': {
                const r = await createProject(args.name, args.type||'express', args.port||3000, args.description||'')
                return { success: r.success, output: r.steps.map(s=>`${s.ok?'✅':'❌'} ${s.step}`).join(' | '), desc }
            }
            case 'workspace_save': {
                try {
                    const gh = require('./github')
                    const repoName = (args.repoName || path.basename(args.projectDir || 'workspace')).replace(/[^a-zA-Z0-9-_.]/g, '-')
                    const createRes = await gh.createRepo(repoName, args.description || '', !!args.isPrivate)
                    if (!createRes.success && !createRes.html_url) return { success: false, output: `❌ Could not create GitHub repo: ${createRes.message || createRes.error || JSON.stringify(createRes)}`, desc }
                    const repoUrl = createRes.clone_url || createRes.html_url || `https://github.com/${createRes.full_name}`
                    const htmlUrl = createRes.html_url || repoUrl
                    const token = gh.getToken()
                    const authUrl = token ? repoUrl.replace('https://', `https://${token}@`) : repoUrl
                    const pushCmd = `cd "${args.projectDir}" && git init && git add . && git commit -m "Initial commit via Bera AI" 2>&1 && git remote remove origin 2>/dev/null; git remote add origin "${authUrl}" && git branch -M main && git push -u origin main 2>&1`
                    const pushRes = await runShell(pushCmd, 60000)
                    const out = pushRes.success || (pushRes.output || '').includes('main')
                        ? `✅ Saved to GitHub!\n🔗 ${htmlUrl}\n📁 Repo: ${repoName}`
                        : `⚠️ Repo created at ${htmlUrl} but push had issues:\n${(pushRes.output || pushRes.error || '').slice(0, 300)}`
                    return { success: true, output: out, desc }
                } catch (e) {
                    return { success: false, output: `❌ workspace_save failed: ${e.message}`, desc }
                }
            }
            case 'git_clone':      return { ...await runShell(`git clone ${args.url} ${args.folder||''} 2>&1`, 60000), desc }
            case 'git_push':       return { ...await runShell(`cd ${args.folder} && git add . && git commit -m "${args.message||'update'}" && git push 2>&1`, 30000), desc }
            case 'git_status':     return { ...await gitStatus(args.folder), desc }
            case 'http_request':   return { ...await httpRequest(args.method||'GET', args.url, args.data, args.headers), desc }
            case 'system_info': {
                const r = await systemInfo()
                return { success: r.success, output: `RAM: ${r.ram} | CPU: ${r.cpu} | Disk: ${r.disk} | Uptime: ${r.uptime} | Processes: ${r.processes}`, desc }
            }
            case 'port_check': {
                const r = await portCheck(args.port)
                return { success: r.success, output: `Port ${r.port}: ${r.open?'OPEN':'CLOSED'}\n${r.info}`, desc }
            }
            case 'docker_manage':  return { ...await dockerManage(args.action, args.name), desc }
            case 'code_review': {
                const r = await codeReview(args.code, args.context)
                return { success: r.success, output: r.text||r.error, desc }
            }
            case 'code_explain': {
                const r = await codeExplain(args.code, args.fileName)
                return { success: r.success, output: r.text||r.error, desc }
            }
            case 'bug_finder': {
                const r = await bugFinder(args.code, args.fileName)
                return { success: r.success, output: r.text||r.error, desc }
            }
            case 'npm_stats': {
                const r = await npmStats(args.package)
                return { success: r.success, output: r.success ? `${r.pkg} v${r.version} | Weekly: ${r.weekly} | Monthly: ${r.monthly}` : r.error, desc }
            }
            case 'github_token': {
                const r = await githubTokenRegen()
                return { success: r.success, output: r.message||r.error, desc }
            }
            case 'berahost_deploy': {
                const { deployBot } = require('./berahost')
                const r = await deployBot(args.botName, args.repoUrl, null, args.ram||512, args.disk||2048, args.cpu||100)
                return { success: r.success, output: r.success ? r.message : r.error, desc }
            }
            case 'berahost_list': {
                const { listServers } = require('./berahost')
                const r = await listServers()
                if (!r.success) return { success: false, output: r.error, desc }
                return { success: true, output: r.servers.map(s=>`${s.name} (${s.status}) RAM:${s.ram}MB`).join('\n'), desc }
            }
            case 'berahost_power': {
                const { serverPower } = require('./berahost')
                const r = await serverPower(args.serverId, args.action)
                return { success: r.success, output: r.output||r.error, desc }
            }
            case 'search': {
                const r = await axios.get(`https://ddg-api.rasa.gg/search?q=${encodeURIComponent(args.query)}&max_results=3`, { timeout: 15000 })
                const results = r.data?.results || r.data || []
                return { success: true, output: Array.isArray(results) ? results.slice(0,3).map(x=>`• ${x.title}: ${x.body||x.snippet||''}`).join('\n') : String(results).slice(0,500), desc }
            }

            // ── Code execution (any language via Piston) ────────────────────
            case 'run_code': {
                const { runCode, formatRunResult } = require('./coderunner')
                const r = await runCode(args.code || '', args.lang || 'javascript', args.stdin || '', 20000)
                return { success: r.success, output: formatRunResult(r), desc }
            }
            case 'code_gen': {
                const r = await codeGen(args.description || args.task || '', args.language || 'javascript')
                return { success: r.success, output: r.text || r.error, desc }
            }

            // ── Web scraping ────────────────────────────────────────────────
            case 'web_scrape': {
                const sc = require('./scraper')
                const r = await sc.scrapePage(args.url)
                if (!r.success) return { success: false, output: `❌ Scrape failed: ${r.error}`, desc }
                const out = [
                    `🌐 *${r.title || r.url}*`,
                    `📄 Text (${r.text.length} chars): ${r.text.slice(0, 600)}...`,
                    `🔗 Links: ${r.linksCount} found`,
                    `🖼️ Images: ${r.imagesCount} | 📊 Tables: ${r.tablesCount}`,
                    r.meta.description ? `📝 Description: ${r.meta.description.slice(0, 200)}` : '',
                    r.headings.length ? `📑 Headings: ${r.headings.slice(0,5).map(h=>`H${h.level}: ${h.text}`).join(' | ')}` : '',
                ].filter(Boolean).join('\n')
                return { success: true, output: out, rawData: r, desc }
            }
            case 'extract_links': {
                const sc = require('./scraper')
                const r = await sc.extractLinks(args.url, args.filter || '')
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                const preview = r.links.slice(0, 20).map(l => `• ${l.text || '(no text)'}: ${l.href}`).join('\n')
                return { success: true, output: `🔗 Found ${r.total} links${args.filter ? ` (filtered by "${args.filter}")` : ''}:\n\n${preview}`, desc }
            }
            case 'extract_table': {
                const sc = require('./scraper')
                const r = await sc.extractTables(args.url)
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                if (!r.count) return { success: true, output: '📊 No tables found on this page.', desc }
                const preview = r.tables.map((t, i) =>
                    `📊 Table ${i+1} (${t.rowCount} rows):\nHeaders: ${t.headers.join(' | ')}\nRow 1: ${(t.rows[0] || []).join(' | ')}`
                ).join('\n\n')
                return { success: true, output: preview, rawData: r, desc }
            }
            case 'extract_data': {
                const sc = require('./scraper')
                const r = await sc.extractStructuredData(args.url)
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                const ogStr = Object.entries(r.og || {}).map(([k,v]) => `og:${k}=${v}`).join('\n') || '(none)'
                const metaStr = Object.entries(r.meta || {}).filter(([k]) => !k.startsWith('og:')).slice(0,8).map(([k,v]) => `${k}: ${v}`).join('\n') || '(none)'
                const schemaTypes = (r.jsonld || []).map(s => s['@type'] || '?').join(', ') || '(none)'
                return { success: true, output: `🔍 Structured data for ${r.title || r.url}\n\n📌 Open Graph:\n${ogStr}\n\n🏷️ Meta:\n${metaStr}\n\n📦 JSON-LD types: ${schemaTypes}`, desc }
            }
            case 'extract_emails': {
                const sc = require('./scraper')
                const r = await sc.extractEmails(args.url)
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                return { success: true, output: r.count ? `📧 Found ${r.count} email(s):\n${r.emails.join('\n')}` : '📧 No emails found.', desc }
            }
            case 'extract_phones': {
                const sc = require('./scraper')
                const r = await sc.extractPhones(args.url)
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                return { success: true, output: r.count ? `📞 Found ${r.count} phone(s):\n${r.phones.join('\n')}` : '📞 No phones found.', desc }
            }
            case 'find_text': {
                const sc = require('./scraper')
                const r = await sc.findText(args.url, args.query || '')
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                return { success: true, output: r.found ? `🔎 "${args.query}" found ${r.matches.length} time(s):\n\n${r.matches.join('\n\n')}` : `🔎 "${args.query}" not found on this page.`, desc }
            }
            case 'bulk_scrape': {
                const sc = require('./scraper')
                const urls = Array.isArray(args.urls) ? args.urls : String(args.urls).split(/[\s,]+/).filter(u => u.startsWith('http'))
                const r = await sc.bulkScrape(urls.slice(0, 10))
                const summary = r.results.map((res, i) => res.success
                    ? `✅ ${res.url.slice(0,50)}: "${res.title}" (${res.text.length} chars)`
                    : `❌ ${res.url.slice(0,50)}: ${res.error}`
                ).join('\n')
                return { success: true, output: `📦 Bulk scrape (${r.count} URLs):\n\n${summary}`, desc }
            }
            case 'regex_extract': {
                const sc = require('./scraper')
                const r = await sc.regexExtract(args.url, args.pattern, args.flags || 'gi')
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                return { success: true, output: `🔍 Regex /${args.pattern}/ → ${r.count} match(es):\n\n${r.matches.slice(0,20).join('\n')}`, desc }
            }
            case 'fetch_json': {
                const sc = require('./scraper')
                const r = await sc.fetchJson(args.url, args.headers || {})
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                return { success: true, output: `📡 JSON from ${args.url}\nType: ${r.type}\n\n${r.data}`, desc }
            }
            case 'api_test': {
                const sc = require('./scraper')
                const r = await sc.apiTest(args.method || 'GET', args.url, args.body || null, args.headers || {})
                if (!r.success) return { success: false, output: `❌ API test failed: ${r.error}`, desc }
                const icon = r.ok ? '✅' : '⚠️'
                return { success: true, output: `${icon} ${args.method?.toUpperCase() || 'GET'} ${args.url}\nStatus: ${r.status} | Time: ${r.ms}ms\n\n📦 Response:\n${r.body}`, desc }
            }
            case 'screenshot': {
                const { takeScreenshot } = require('./browser')
                const r = await takeScreenshot(args.url)
                if (!r.success) return { success: false, output: `❌ Screenshot failed: ${r.error}`, desc }
                return { success: true, output: `📸 Screenshot captured`, buffer: r.buffer, mimetype: r.mimetype, isMedia: true, desc }
            }
            case 'page_monitor': {
                const sc = require('./scraper')
                const r = await sc.checkPageChange(args.url, args.previousHash || '')
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                return { success: true, output: `👁️ ${args.url}\nContent hash: ${r.hash}\nChanged: ${r.changed ? '⚠️ YES' : '✅ No'}\nLength: ${r.contentLength} chars`, desc }
            }

            // ── Networking ──────────────────────────────────────────────────
            case 'url_check': {
                const urlList = Array.isArray(args.urls) ? args.urls : String(args.urls || '').split(/[\s,]+/).filter(u => u.startsWith('http'))
                const r = await urlCheck(urlList)
                return { success: r.success, output: r.output, desc }
            }
            case 'dns_check': { const r = await dnsCheck(args.host); return { success: r.success, output: r.output, desc } }
            case 'ssl_check': { const r = await sslCheck(args.domain); return { success: r.success, output: r.output, desc } }
            case 'ping':      { const r = await pingHost(args.host); return { success: r.success, output: r.output, desc } }
            case 'whois':     { const r = await whoisLookup(args.domain); return { success: r.success, output: r.output, desc } }
            case 'ip_lookup': { const r = await ipLookup(args.ip); return { success: r.success, output: r.output, desc } }

            // ── Dev tools ───────────────────────────────────────────────────
            case 'env_manage':   { const r = await envManager(args.action, args.key, args.value); return { success: r.success, output: r.output || r.error, desc } }
            case 'file_search':  { const r = await fileSearch(args.pattern, args.directory || '.', args.ext || ''); return { success: r.success, output: r.output, desc } }
            case 'file_diff':    { const r = await fileDiff(args.file1, args.file2); return { success: r.success, output: r.output, desc } }
            case 'json_tools':   { const r = jsonTools(args.action, args.json); return { success: r.success, output: r.output, desc } }
            case 'password_gen': { const r = passwordGen(args.length || 16, { noSymbols: args.noSymbols }); return { success: r.success, output: `🔑 Password: \`${r.password}\`\n${r.strength}`, desc } }

            // ── Supertools — App Builder ────────────────────────────────────
            case 'build_webapp': {
                const st = require('./supertools')
                const r = await st.buildWebApp(args.name, args.type || 'express', args.description || '', args.port || null)
                if (!r.success) return { success: false, output: `❌ Build failed`, desc }
                return {
                    success: true,
                    output: `🚀 *${r.name}* (${r.type}) built!\n📁 ${r.dir}\n🔌 Port: ${r.port}\n📄 Main: ${r.mainFile}\n\n${r.summary}`,
                    desc
                }
            }
            case 'generate_api': {
                const st = require('./supertools')
                const r = await st.generateAPI(args.description || args.desc || '', args.port || 4000)
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                return {
                    success: true,
                    output: `⚡ REST API generated!\n📁 ${r.dir}\n🔌 Port: ${r.port}\n${r.running ? '✅ Running with PM2' : '⚠️ Not started'}\n\nCode preview:\n\`\`\`js\n${(r.code || '').slice(0, 500)}\n\`\`\``,
                    desc
                }
            }
            case 'auto_fix': {
                const st = require('./supertools')
                const r = await st.autoFixBuild(args.projectDir || args.dir || '/tmp/projects')
                const out = r.success
                    ? `✅ Build ${r.fixed ? 'auto-fixed in' : 'OK —'} ${r.attempts} attempt(s)`
                    : `⚠️ Could not fully fix after ${r.attempts} attempt(s):\n${r.lastError}`
                return { success: r.success, output: out, desc }
            }

            // ── Supertools — Data ───────────────────────────────────────────
            case 'analyze_data': {
                const st = require('./supertools')
                const r = await st.analyzeData(args.data || args.csv || args.json || '', args.question || '')
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                return {
                    success: true,
                    output: `📊 *Data Analysis*\nType: ${r.dataType} | Rows: ${r.rows} | Columns: ${r.columns}\nColumns: ${(r.columnNames || []).join(', ')}\n\n${r.statSummary}\n\n💡 *Insights:*\n${r.insights}`,
                    desc
                }
            }
            case 'markdown_tools': {
                const st = require('./supertools')
                const r = await st.markdownTools(args.action || 'generate', args.input || '')
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                const out = r.html || r.markdown || r.table || 'Done'
                return { success: true, output: out.slice(0, 3000), desc }
            }

            // ── Supertools — Deep Web ───────────────────────────────────────
            case 'crawl_site': {
                const st = require('./supertools')
                const r = await st.crawlSite(args.url, args.maxDepth || 2, args.maxPages || 20)
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                const pageList = r.pages.slice(0, 15).map(p =>
                    `${p.ok ? '✅' : '❌'} [D${p.depth}] *${p.title}*\n   ${p.url.slice(0, 70)}`
                ).join('\n')
                return {
                    success: true,
                    output: `🕷️ *Site Crawl: ${r.baseUrl}*\nPages found: ${r.pagesFound} | Success: ${r.pagesSuccess} | Failed: ${r.pagesFailed}\n\n${pageList}`,
                    desc
                }
            }
            case 'compare_apis': {
                const st = require('./supertools')
                const urls = Array.isArray(args.urls) ? args.urls : String(args.urls || '').split(/[\s,]+/).filter(u => u.startsWith('http'))
                const r = await st.compareAPIs(urls, args.method || 'GET', args.body || null)
                return {
                    success: r.success,
                    output: `📊 *API Comparison* (${r.count} endpoints)\n\n${r.summary}\n\n${r.fastest}`,
                    desc
                }
            }
            case 'load_test': {
                const st = require('./supertools')
                const r = await st.loadTest(args.url, args.requests || 20, args.concurrency || 5, args.method || 'GET', args.body || null)
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                return {
                    success: true,
                    output: `🔥 *Load Test: ${r.url}*\n\n📋 Results:\n• Total: ${r.totalRequests} requests\n• ✅ Success: ${r.successful} (${r.successRate})\n• ❌ Failed: ${r.failed}\n• ⚡ RPS: ${r.rps}\n• ⏱️ Total: ${r.totalTimeMs}ms\n\n📈 Latency:\n• Avg: ${r.latency.avg}ms\n• P50: ${r.latency.p50}ms\n• P90: ${r.latency.p90}ms\n• P99: ${r.latency.p99}ms\n• Min/Max: ${r.latency.min}/${r.latency.max}ms\n\n🔢 Status codes: ${JSON.stringify(r.statusCodes)}`,
                    desc
                }
            }

            // ── Supertools — Security ───────────────────────────────────────
            case 'jwt_tools': {
                const st = require('./supertools')
                const r = st.jwtTools(args.action || 'encode', args.payload || {}, args.secret || 'bera-secret', args.expiresIn || '24h')
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                const act = args.action || 'encode'
                if (act === 'encode' || act === 'sign')
                    return { success: true, output: `🔐 *JWT Token*\n\`\`\`\n${r.token}\n\`\`\`\nExpires: ${r.expiresIn}`, desc }
                if (act === 'decode' || act === 'verify')
                    return { success: true, output: `🔓 *JWT Decoded*\nExpired: ${r.expired ? '⚠️ YES' : '✅ No'}\nExpires: ${r.expiresAt || 'N/A'}\nSig valid: ${r.signatureValid === null ? 'not checked' : r.signatureValid ? '✅' : '❌'}\n\nPayload:\n${JSON.stringify(r.payload, null, 2)}`, desc }
                if (act === 'apikey')
                    return { success: true, output: `🔑 *API Key*\n\`${r.apiKey}\`\nHash: \`${r.hash.slice(0, 20)}...\``, desc }
                if (act === 'hash')
                    return { success: true, output: `#️⃣ *Hashes for: "${r.input.slice(0, 30)}"*\nMD5: \`${r.md5}\`\nSHA1: \`${r.sha1}\`\nSHA256: \`${r.sha256}\``, desc }
                return { success: true, output: JSON.stringify(r, null, 2).slice(0, 1000), desc }
            }

            // ── Supertools — Database ───────────────────────────────────────
            case 'sqlite_manage': {
                const st = require('./supertools')
                const r = await st.sqliteManage(args.action || 'info', args.dbPath || 'bera.db', args.query || '', args.data || {})
                return { success: r.success, output: r.output || r.error || 'Done', desc }
            }

            // ── Supertools — GitHub ─────────────────────────────────────────
            case 'github_manage': {
                const st = require('./supertools')
                const r = await st.githubManage(args.action || 'whoami', args.opts || args)
                return { success: r.success, output: r.output || r.error, desc }
            }

            // ── Supertools — Docs & Tests ───────────────────────────────────
            case 'generate_docs': {
                const st = require('./supertools')
                const r = await st.generateDocs(args.code || '', args.language || 'javascript', args.style || 'markdown')
                return { success: r.success, output: (r.docs || r.error || '').slice(0, 3000), desc }
            }
            case 'generate_tests': {
                const st = require('./supertools')
                const r = await st.generateTests(args.code || '', args.language || 'javascript', args.framework || 'jest')
                return { success: r.success, output: (r.tests || r.error || '').slice(0, 3000), desc }
            }

            default: return { success: false, output: `Unknown action: ${action}`, desc }
        }
    } catch (e) {
        return { success: false, output: `Error: ${e.message}`, desc }
    }
}

const summarizeResults = async (task, stepResults) => {
    try {
        const stepsText = stepResults.map((s, i) => `Step ${i+1} (${s.desc}): ${s.success?'OK':'FAIL'} — ${(s.output||'').slice(0,300)}`).join('\n')
        const r = await callAI('You are Bera AI — smart, direct.', SUMMARY_PROMPT.replace('{task}', task).replace('{steps}', stepsText))
        return r.success ? r.text : 'Task completed.'
    } catch { return 'Task completed.' }
}

// ── v3 NEW TOOLS ─────────────────────────────────────────────────────────────
const webScrape = async (url) => {
    try {
        const res = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BeraBot/1.0)' }, maxContentLength: 2097152 })
        const html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
        const text = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s{2,}/g, ' ').trim().slice(0, 3000)
        const tm = html.match(/<title[^>]*>([^<]+)<\/title>/i)
        return { success: true, url, title: tm ? tm[1].trim() : url, text, length: text.length }
    } catch (e) { return { success: false, error: e.message } }
}

const dnsCheck = async (host) => {
    const d = host.replace(/https?:\/\//, '').split('/')[0]
    const r = await runShell(`dig +short A ${d}; dig +short MX ${d}; dig +short NS ${d} | head -4`)
    const p = await runShell(`ping -c 2 -W 3 ${d} 2>&1 | tail -3`)
    return { success: true, domain: d, output: `DNS for ${d}:\n${r.output || 'No records found'}\n\nPing:\n${p.output}` }
}

const sslCheck = async (domain) => {
    const h = domain.replace(/https?:\/\//, '').split('/')[0]
    const r = await runShell(`echo | openssl s_client -connect ${h}:443 -servername ${h} 2>/dev/null | openssl x509 -noout -subject -issuer -dates 2>/dev/null || echo "SSL check failed"`)
    return { success: true, domain: h, output: r.output || 'Could not retrieve SSL info' }
}

const codeGen = async (description, language = 'javascript') => {
    const sys = `You are an expert ${language} developer. Write complete, working, production-ready code. Return ONLY the code with brief comments, no markdown fences, no preamble.`
    return callAI(sys, `Write ${language} code for: ${description}`)
}

const envManager = async (action, key, value) => {
    const envPath = './.env'
    try {
        let content = require('fs').existsSync(envPath) ? require('fs').readFileSync(envPath, 'utf8') : ''
        if (action === 'list') { return { success: true, output: content.split('\n').filter(l => l.trim() && !l.startsWith('#')).join('\n') || 'No env vars set' } }
        if (action === 'get' && key) { const m = content.match(new RegExp(`^${key}=(.*)$`, 'm')); return { success: true, output: m ? `${key}=${m[1]}` : `${key} not found` } }
        if (action === 'set' && key) { const re = new RegExp(`^${key}=.*$`, 'm'); const nl = `${key}=${value}`; content = re.test(content) ? content.replace(re, nl) : content + '\n' + nl; require('fs').writeFileSync(envPath, content.trim() + '\n'); return { success: true, output: `Set ${key}=${value}` } }
        if (action === 'delete' && key) { content = content.replace(new RegExp(`^${key}=.*\n?`, 'm'), ''); require('fs').writeFileSync(envPath, content.trim() + '\n'); return { success: true, output: `Deleted ${key}` } }
        return { success: false, output: 'Usage: list | get KEY | set KEY VALUE | delete KEY' }
    } catch (e) { return { success: false, error: e.message } }
}

const fileSearch = async (pattern, directory = '.', fileExt = '') => {
    const ext = fileExt ? `--include="*.${fileExt}"` : '--include="*.js" --include="*.ts" --include="*.json" --include="*.py" --include="*.md"'
    const files = await runShell(`grep -r "${pattern.replace(/"/g, '\\"')}" ${directory} ${ext} --exclude-dir=node_modules --exclude-dir=.git -l 2>/dev/null | head -10`)
    const matches = await runShell(`grep -r "${pattern.replace(/"/g, '\\"')}" ${directory} ${ext} --exclude-dir=node_modules --exclude-dir=.git -n 2>/dev/null | head -15`)
    return { success: true, output: `Files:\n${files.output || 'None'}\n\nMatches:\n${matches.output || 'No matches'}` }
}

const fileDiff = async (file1, file2) => {
    const r = await runShell(`diff -u "${file1}" "${file2}" 2>&1 | head -50`)
    return { success: true, output: r.output || 'Files are identical' }
}

const urlCheck = async (urls) => {
    const list = Array.isArray(urls) ? urls : String(urls).split(/[\s,]+/).filter(u => u.startsWith('http'))
    const results = await Promise.all(list.slice(0, 5).map(async url => {
        try {
            const t0 = Date.now(); const r = await axios.get(url, { timeout: 10000, validateStatus: () => true }); const ms = Date.now() - t0
            const e = r.status >= 200 && r.status < 300 ? '🟢' : r.status >= 300 && r.status < 400 ? '🟡' : '🔴'
            return `${e} ${url.slice(0, 50)}: HTTP ${r.status} (${ms}ms)`
        } catch (e) { return `🔴 ${url.slice(0, 50)}: ${e.code || e.message}` }
    }))
    return { success: true, output: results.join('\n') }
}

const passwordGen = (length = 16, options = {}) => {
    const pool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' + (options.noSymbols ? '' : '!@#$%^&*()_+-=[]{}|;:,.<>?')
    const bytes = require('crypto').randomBytes(length)
    const pass  = Array.from(bytes).map(b => pool[b % pool.length]).join('')
    return { success: true, password: pass, length: pass.length, strength: length >= 20 ? '💪 Strong' : length >= 12 ? '👍 Good' : '⚠️ Weak' }
}

const autoCommitCode = async (folder, message) => {
    const cmd = ['cd ' + (folder || '.'), 'git add .', 'git commit -m "' + (message || 'auto: update').replace(/"/g, '') + '"', 'git push 2>&1'].join(' && ')
    return runShell(cmd, 60000)
}

const jsonTools = (action, json) => {
    try {
        const parsed = JSON.parse(json)
        if (action === 'format' || action === 'pretty') return { success: true, output: JSON.stringify(parsed, null, 2) }
        if (action === 'minify') return { success: true, output: JSON.stringify(parsed) }
        if (action === 'validate') return { success: true, output: `✅ Valid JSON\nType: ${Array.isArray(parsed) ? 'Array[' + parsed.length + ']' : 'Object'}\nKeys: ${typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed).join(', ') : 'N/A'}` }
        if (action === 'keys') return { success: true, output: 'Keys: ' + Object.keys(parsed).join(', ') }
        return { success: true, output: JSON.stringify(parsed, null, 2).slice(0, 2000) }
    } catch (e) { return { success: false, output: `❌ Invalid JSON: ${e.message}` } }
}

const pingHost = async (host) => {
    const h = host.replace(/https?:\/\//, '').split('/')[0]
    const r = await runShell(`ping -c 4 -W 3 ${h} 2>&1`)
    return { success: true, host: h, output: r.output }
}

const whoisLookup = async (domain) => {
    const h = domain.replace(/https?:\/\//, '').split('/')[0]
    const r = await runShell(`whois ${h} 2>/dev/null | head -25`)
    if (!r.output || r.output.includes('command not found')) {
        try {
            const res = await axios.get(`https://rdap.org/domain/${h}`, { timeout: 10000 })
            const d = res.data
            return { success: true, output: `Domain: ${d.ldhName || h}\nStatus: ${(d.status || []).join(', ')}` }
        } catch { return { success: false, output: 'whois not available' } }
    }
    return { success: true, host: h, output: r.output }
}

const ipLookup = async (ip) => {
    try {
        const r = await axios.get(`https://ipapi.co/${ip}/json/`, { timeout: 10000 })
        const d = r.data
        return { success: true, output: `IP: ${d.ip}\nCity: ${d.city}, ${d.region}\nCountry: ${d.country_name}\nISP: ${d.org}\nTimezone: ${d.timezone}` }
    } catch (e) { return { success: false, error: e.message } }
}

module.exports = {
    planTask, executeStep, summarizeResults, callAI, callGiftedAI, callXwolf, callPollinations, runShell,
    npmStats, resolveGroupMember, createProject, pm2Manage, githubTokenRegen,
    systemInfo, portCheck, dockerManage, cronManage, processKill,
    codeReview, codeExplain, bugFinder, httpRequest, gitStatus,
    usageStats, errorLogAnalyze, scheduleMessage, backupToGithub,
    sqliteQuery, groupAnalyzer,
    webScrape, dnsCheck, sslCheck, codeGen, envManager, fileSearch, fileDiff,
    urlCheck, passwordGen, autoCommitCode, jsonTools, pingHost, whoisLookup, ipLookup
}
