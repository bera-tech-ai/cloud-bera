/**
 * supertools2.js — Advanced autonomous tools for Bera AI Agent
 * Gives the agent Replit-level capabilities:
 *   smart scraping, data pipelines, full-stack scaffolding,
 *   format conversion, archive management, self-healing builds,
 *   NL→SQL, mock servers, and multi-step shell sequences.
 */

'use strict'

const axios  = require('axios')
const fs     = require('fs')
const path   = require('path')
const { exec } = require('child_process')

const PROJECTS = '/tmp/projects'
const GIFTED   = 'https://api.gifted.co.ke'
const GKEY     = '_0u5aff45,_0l1876s8qc'

const sh = (cmd, timeout = 60000) => new Promise(resolve => {
    exec(cmd, { timeout, maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
        const out = [(stdout || '').trim(), stderr ? '[err] ' + stderr.trim() : ''].filter(Boolean).join('\n')
        resolve({ success: !err, output: out.slice(0, 4000) || (err ? err.message : 'ok') })
    })
})

const callAI = async (sys, user) => {
    const GROQ_KEY = process.env.GROQ_API_KEY
    if (GROQ_KEY) {
        try {
            const msgs = []
            if (sys) msgs.push({ role: 'system', content: sys.slice(0, 2000) })
            msgs.push({ role: 'user', content: user.slice(0, 5000) })
            const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: 'llama-3.3-70b-versatile', messages: msgs, max_tokens: 2000
            }, { headers: { Authorization: `Bearer ${GROQ_KEY}` }, timeout: 15000 })
            const t = r.data?.choices?.[0]?.message?.content
            if (t) return { success: true, text: t.trim() }
        } catch {}
    }
    try {
        const q = (sys ? sys + '\n\n' : '') + user
        const r = await axios.get(`${GIFTED}/api/ai/overchat`, {
            params: { apikey: 'gifted', model: 'deepseek', q: q.slice(0, 4000) }, timeout: 15000
        })
        const t = r.data?.result
        if (t) return { success: true, text: String(t).trim() }
    } catch {}
    return { success: false, text: 'AI unavailable' }
}

// ══════════════════════════════════════════════════════════════════════════════
//  1. SMART CONTENT EXTRACTION
//     Intelligently detect page type and extract structured data
// ══════════════════════════════════════════════════════════════════════════════

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0 Safari/537.36'

const fetchPage = async (url, timeout = 20000) => {
    const r = await axios.get(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html,*/*', 'Accept-Language': 'en-US,en;q=0.9' },
        timeout, maxRedirects: 5
    })
    return r.data
}

const cleanText = s => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

const smartExtract = async (url, hint = '') => {
    try {
        const html = await fetchPage(url)
        const lower = html.toLowerCase()
        const hint2 = hint.toLowerCase()

        // Detect page type
        const isEcommerce = hint2.includes('product') || hint2.includes('price') ||
            lower.includes('add to cart') || lower.includes('buy now') || lower.includes('price')
        const isJob = hint2.includes('job') || hint2.includes('career') ||
            lower.includes('apply now') || lower.includes('job description') || lower.includes('salary')
        const isNews = hint2.includes('news') || hint2.includes('article') ||
            lower.includes('published') || lower.includes('author') || lower.includes('byline')
        const isDirectory = hint2.includes('directory') || hint2.includes('contact') ||
            lower.includes('email') || lower.includes('phone')

        const result = { url, type: 'generic', items: [], raw: {} }

        if (isEcommerce) {
            result.type = 'ecommerce'
            // Extract products: name, price, rating, image
            const priceMatches = [...html.matchAll(/(?:ksh|kes|usd|eur|gbp|\$|€|£|ksh\.?)\s*[\d,]+(?:\.\d{2})?|[\d,]+(?:\.\d{2})?\s*(?:ksh|usd|eur|gbp)/gi)]
            const titleMatches = [...html.matchAll(/<(?:h[1-4]|span|div)[^>]*(?:title|name|product)[^>]*>([^<]{5,100})<\//gi)]
            const imgMatches   = [...html.matchAll(/<img[^>]+src=["']([^"']+(?:product|item)[^"']*)["']/gi)]
            const prices = [...new Set(priceMatches.slice(0, 20).map(m => m[0].trim()))]
            const titles = [...new Set(titleMatches.slice(0, 20).map(m => cleanText(m[1])))]
            result.items = titles.slice(0, 15).map((t, i) => ({ name: t, price: prices[i] || '' }))
            result.raw = { prices: prices.slice(0, 10), titles: titles.slice(0, 10), images: imgMatches.slice(0, 5).map(m => m[1]) }
            result.summary = `Found ${result.items.length} products, ${prices.length} prices`
        } else if (isJob) {
            result.type = 'jobs'
            const jobMatches = [...html.matchAll(/<(?:h[1-6]|div|span|a)[^>]*(?:job|position|role|career)[^>]*>([^<]{5,120})<\//gi)]
            const salaryMatch = [...html.matchAll(/(?:salary|pay|compensation)[^>]*>([^<]{3,60})<\//gi)]
            const locationMatch = [...html.matchAll(/(?:location|city|country|remote)[^>]*>([^<]{3,60})<\//gi)]
            const jobs = [...new Set(jobMatches.slice(0, 20).map(m => cleanText(m[1])))]
            result.items = jobs.slice(0, 15).map((j, i) => ({
                title: j,
                salary: cleanText(salaryMatch[i]?.[1] || ''),
                location: cleanText(locationMatch[i]?.[1] || '')
            }))
            result.summary = `Found ${result.items.length} job listings`
        } else if (isNews || true) {
            result.type = 'articles'
            // Extract article titles, dates, authors, links
            const titleMatches = [...html.matchAll(/<(?:h[1-4]|a)[^>]*>([^<]{20,200})<\//gi)]
            const dateMatches  = [...html.matchAll(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4})/gi)]
            const linkMatches  = [...html.matchAll(/<a[^>]+href=["']([^"'#]{10,200})["'][^>]*>([^<]{10,150})<\/a>/gi)]
            const titles = [...new Set(titleMatches.slice(0, 30).map(m => cleanText(m[1])).filter(t => t.length > 10 && t.length < 200))]
            const dates = dateMatches.slice(0, 10).map(m => m[0])
            const links = linkMatches.slice(0, 20).map(m => ({ text: cleanText(m[2]), href: m[1] }))
            result.items = titles.slice(0, 20).map((t, i) => ({ title: t, date: dates[i] || '', link: links[i]?.href || '' }))
            result.summary = `Found ${result.items.length} articles/items, ${dates.length} dates`
        }

        // Always include emails and phones
        const emails = [...new Set([...html.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)].map(m => m[0]))]
        const phones = [...new Set([...html.matchAll(/(?:\+?254|0)[\s\-]?[17]\d{2}[\s\-]?\d{3}[\s\-]?\d{3}|(?:\+?[1-9]\d{6,14})/g)].map(m => m[0].trim()))]
        if (emails.length) result.raw.emails = emails.slice(0, 10)
        if (phones.length) result.raw.phones = phones.slice(0, 10)

        return { success: true, ...result }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  2. DATA PIPELINE
//     Scrape multiple URLs → clean → store to SQLite → export CSV/JSON
// ══════════════════════════════════════════════════════════════════════════════

const dataPipeline = async ({ sources = [], hint = '', dbPath = null, exportFormat = 'json', outputPath = null }) => {
    const results = []
    const errors  = []
    const db = dbPath || `/tmp/pipeline_${Date.now()}.db`
    const out = outputPath || `/tmp/pipeline_out_${Date.now()}.${exportFormat}`

    // 1. Scrape all sources
    for (const url of sources.slice(0, 10)) {
        try {
            const r = await smartExtract(url, hint)
            if (r.success && r.items.length) {
                results.push(...r.items.map(item => ({ ...item, _source: url })))
            } else {
                errors.push(`${url}: ${r.error || 'no items'}`)
            }
        } catch (e) { errors.push(`${url}: ${e.message}`) }
    }

    if (!results.length) return { success: false, error: 'No data extracted', errors }

    // 2. Deduplicate
    const seen = new Set()
    const unique = results.filter(item => {
        const key = JSON.stringify(item).slice(0, 50)
        if (seen.has(key)) return false
        seen.add(key); return true
    })

    // 3. Store to SQLite
    const cols = [...new Set(unique.flatMap(Object.keys))].filter(k => !k.startsWith('_'))
    const colDefs = cols.map(c => `"${c}" TEXT`).join(', ')
    await sh(`sqlite3 "${db}" "CREATE TABLE IF NOT EXISTS data (id INTEGER PRIMARY KEY, ${colDefs}, source TEXT);"`)
    for (const row of unique.slice(0, 500)) {
        const vals = cols.map(c => `'${String(row[c] || '').replace(/'/g, "''")}'`).join(', ')
        const src  = `'${String(row._source || '').replace(/'/g, "''")}'`
        await sh(`sqlite3 "${db}" "INSERT INTO data (${cols.map(c => `"${c}"`).join(', ')}, source) VALUES (${vals}, ${src});"`)
    }

    // 4. Export
    if (exportFormat === 'csv') {
        await sh(`sqlite3 -csv -header "${db}" "SELECT * FROM data;" > "${out}"`)
    } else if (exportFormat === 'tsv') {
        await sh(`sqlite3 -separator '\\t' "${db}" ".headers on" "SELECT * FROM data;" > "${out}"`)
    } else {
        // JSON
        fs.writeFileSync(out, JSON.stringify(unique, null, 2))
    }

    const stat = fs.existsSync(out) ? fs.statSync(out) : null
    return {
        success: true,
        sources: sources.length,
        records: unique.length,
        errors: errors.length,
        db, output: out,
        fileSize: stat ? `${(stat.size / 1024).toFixed(1)} KB` : '?',
        columns: cols,
        preview: unique.slice(0, 3)
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  3. FULL-STACK PROJECT SCAFFOLD
//     Generate complete multi-file projects with proper architecture
// ══════════════════════════════════════════════════════════════════════════════

const STACK_TEMPLATES = {
    'express-rest': {
        files: {
            'package.json': (name, port) => JSON.stringify({
                name, version: '1.0.0', main: 'src/index.js',
                scripts: { start: 'node src/index.js', dev: 'nodemon src/index.js', test: 'node tests/test.js' },
                dependencies: { express: '^4.18.2', cors: '^2.8.5', dotenv: '^16.3.1', 'express-validator': '^7.0.1' },
                devDependencies: { nodemon: '^3.0.1' }
            }, null, 2),
            '.env.example': (name, port) => `PORT=${port}\nNODE_ENV=development\n# Add your env vars here`,
            '.gitignore': () => 'node_modules/\n.env\n*.db\n*.log',
            'README.md': (name, port, desc) => `# ${name}\n\n${desc}\n\n## Quick Start\n\`\`\`bash\nnpm install\ncp .env.example .env\nnpm start\n\`\`\`\n\nServer runs on port ${port}`,
            'src/index.js': (name, port) => `require('dotenv').config()
const express = require('express')
const cors    = require('cors')
const routes  = require('./routes')

const app  = express()
const PORT = process.env.PORT || ${port}

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Routes
app.use('/api', routes)

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date() }))

// 404
app.use((req, res) => res.status(404).json({ error: 'Route not found' }))

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack)
    res.status(500).json({ error: err.message || 'Server error' })
})

app.listen(PORT, () => console.log(\`✅ ${name} API running → http://localhost:\${PORT}\`))
module.exports = app`,
            'src/routes/index.js': (name) => `const router = require('express').Router()
const { body, validationResult } = require('express-validator')

// In-memory data store (replace with DB for production)
let items = [{ id: 1, name: 'Sample Item', createdAt: new Date() }]
let nextId = 2

// GET all items
router.get('/items', (req, res) => {
    const { search, limit = 20, page = 1 } = req.query
    let data = items
    if (search) data = data.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    const total = data.length
    data = data.slice((page - 1) * limit, page * limit)
    res.json({ data, total, page: +page, pages: Math.ceil(total / limit) })
})

// GET single item
router.get('/items/:id', (req, res) => {
    const item = items.find(i => i.id === +req.params.id)
    if (!item) return res.status(404).json({ error: 'Not found' })
    res.json(item)
})

// POST create
router.post('/items', [body('name').notEmpty().trim()], (req, res) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() })
    const item = { id: nextId++, ...req.body, createdAt: new Date() }
    items.push(item)
    res.status(201).json(item)
})

// PUT update
router.put('/items/:id', (req, res) => {
    const idx = items.findIndex(i => i.id === +req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'Not found' })
    items[idx] = { ...items[idx], ...req.body, updatedAt: new Date() }
    res.json(items[idx])
})

// DELETE
router.delete('/items/:id', (req, res) => {
    const idx = items.findIndex(i => i.id === +req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'Not found' })
    items.splice(idx, 1)
    res.json({ deleted: true })
})

module.exports = router`,
            'src/routes.js': () => `module.exports = require('./routes/index')`,
            'tests/test.js': (name, port) => `const http = require('http')
function req(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const opts = { hostname: 'localhost', port: ${port}, path, method,
            headers: { 'Content-Type': 'application/json' } }
        const r = http.request(opts, res => {
            let d = ''; res.on('data', c => d += c)
            res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d || '{}') }))
        })
        r.on('error', reject)
        if (body) r.write(JSON.stringify(body))
        r.end()
    })
}
async function runTests() {
    let pass = 0, fail = 0
    const test = async (name, fn) => {
        try { await fn(); console.log('✅', name); pass++ }
        catch(e) { console.log('❌', name, '-', e.message); fail++ }
    }
    await test('Health check', async () => {
        const r = await req('/health'); if (r.status !== 200) throw new Error('Not 200')
    })
    await test('GET /api/items', async () => {
        const r = await req('/api/items'); if (!r.body.data) throw new Error('No data field')
    })
    await test('POST /api/items', async () => {
        const r = await req('/api/items', 'POST', { name: 'Test' })
        if (r.status !== 201) throw new Error('Not 201')
    })
    console.log(\`\\n📊 Results: \${pass} passed, \${fail} failed\`)
    process.exit(fail > 0 ? 1 : 0)
}
runTests().catch(console.error)`
        }
    },
    'next': {
        initCmd: (name) => `npx create-next-app@latest ${name} --js --no-tailwind --no-eslint --no-app --no-src-dir --no-import-alias --yes 2>&1`,
        postCmd: null
    },
    'react': {
        initCmd: (name) => `npx create-react-app ${name} --template minimal 2>&1 || npx create-vite ${name} --template react 2>&1`,
        postCmd: null
    },
    'flask': {
        files: {
            'requirements.txt': () => 'flask\nflask-cors\npython-dotenv\n',
            '.env': (n, p) => `PORT=${p}\nDEBUG=True`,
            'app.py': (name, port) => `from flask import Flask, jsonify, request
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)

items = [{"id": 1, "name": "Sample"}]
next_id = 2

@app.get('/health')
def health(): return jsonify({"status": "ok"})

@app.get('/api/items')
def get_items(): return jsonify(items)

@app.post('/api/items')
def create_item():
    global next_id
    data = request.json
    item = {"id": next_id, **data}
    next_id += 1; items.append(item)
    return jsonify(item), 201

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.getenv('PORT', ${port})), debug=True)`,
            'README.md': (n, p, d) => `# ${n}\n\n${d}\n\n## Run\n\`\`\`bash\npip install -r requirements.txt\npython app.py\n\`\`\``
        }
    }
}

const getNextPort = async () => {
    const r = await sh("pm2 jlist 2>/dev/null | node -e \"const d=require('fs').readFileSync('/dev/stdin','utf8'); try{const j=JSON.parse(d);const ports=j.map(p=>p.pm2_env?.PORT||p.pm2_env?.env?.PORT||0).filter(Boolean);console.log(ports.length?Math.max(...ports)+1:3001)}catch{console.log(3001)}\"")
    const p = parseInt(r.output.trim())
    return isNaN(p) || p < 3000 ? 3001 + Math.floor(Math.random() * 1000) : p
}

const scaffoldProject = async (name, stack = 'express-rest', description = '', port = null) => {
    const safeName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    const dir = path.join(PROJECTS, safeName)
    const resolvedPort = port || await getNextPort()

    await sh(`mkdir -p "${dir}"`)
    const steps = []

    const tpl = STACK_TEMPLATES[stack] || STACK_TEMPLATES['express-rest']

    // If template has initCmd (create-next-app, create-react-app)
    if (tpl.initCmd) {
        const r = await sh(tpl.initCmd(safeName), 180000)
        steps.push({ step: 'scaffold', ok: r.success, out: r.output.slice(0, 300) })
        if (!r.success) return { success: false, error: 'Scaffold failed', steps }
        // Move if needed
        const generatedDir = path.join('/tmp', safeName)
        if (fs.existsSync(generatedDir)) {
            await sh(`mv "${generatedDir}" "${dir}" 2>/dev/null || cp -r "${generatedDir}/." "${dir}/"`)
        }
    } else {
        // Write template files
        const files = tpl.files || {}
        for (const [relPath, contentFn] of Object.entries(files)) {
            const absPath = path.join(dir, relPath)
            await sh(`mkdir -p "${path.dirname(absPath)}"`)
            try {
                fs.writeFileSync(absPath, contentFn(safeName, resolvedPort, description))
                steps.push({ step: `write:${relPath}`, ok: true })
            } catch (e) {
                steps.push({ step: `write:${relPath}`, ok: false, out: e.message })
            }
        }
    }

    // Install dependencies
    const hasPkg = fs.existsSync(path.join(dir, 'package.json'))
    const hasReqs = fs.existsSync(path.join(dir, 'requirements.txt'))
    if (hasPkg) {
        const r = await sh(`cd "${dir}" && npm install --loglevel=error 2>&1`, 120000)
        steps.push({ step: 'npm install', ok: r.success, out: r.output.slice(0, 200) })
    } else if (hasReqs) {
        const r = await sh(`cd "${dir}" && pip install -r requirements.txt -q 2>&1`, 120000)
        steps.push({ step: 'pip install', ok: r.success, out: r.output.slice(0, 200) })
    }

    // Start with PM2
    const mainFile = hasPkg
        ? (JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).main || 'index.js')
        : 'app.py'
    const startCmd = hasReqs
        ? `pm2 start "${dir}/${mainFile}" --name "${safeName}" --interpreter python3 -- --port ${resolvedPort}`
        : `PORT=${resolvedPort} pm2 start "${dir}/${mainFile}" --name "${safeName}"`
    const pmR = await sh(`pm2 delete "${safeName}" 2>/dev/null; ${startCmd}`)
    steps.push({ step: 'pm2 start', ok: pmR.success, out: pmR.output.slice(0, 200) })

    return {
        success: true,
        name: safeName, dir, port: resolvedPort, stack,
        mainFile: `${dir}/${mainFile}`,
        stepsOk: steps.filter(s => s.ok).length,
        stepsTotal: steps.length,
        steps,
        startCmd,
        readme: fs.existsSync(path.join(dir, 'README.md')) ? fs.readFileSync(path.join(dir, 'README.md'), 'utf8').slice(0, 500) : '',
        summary: `✅ ${safeName} (${stack}) scaffolded with ${steps.filter(s => s.ok).length}/${steps.length} steps OK, running on port ${resolvedPort}`
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  4. AUTO DEPENDENCY DETECTION & INSTALL
// ══════════════════════════════════════════════════════════════════════════════

const autoInstallDeps = async (codeOrDir, lang = 'node') => {
    let code = codeOrDir
    // If it's a directory, read all JS/PY files
    if (fs.existsSync(codeOrDir) && fs.statSync(codeOrDir).isDirectory()) {
        const ext = lang === 'python' ? '.py' : '.js'
        const r = await sh(`find "${codeOrDir}" -name "*${ext}" -not -path "*/node_modules/*" -not -path "*/.git/*" | head -20`)
        const files = r.output.split('\n').filter(Boolean)
        code = files.map(f => { try { return fs.readFileSync(f, 'utf8') } catch { return '' } }).join('\n')
    }

    if (lang === 'python' || lang === 'py') {
        const imports = [...new Set([...code.matchAll(/^(?:import|from)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm)].map(m => m[1]))]
        const stdlib = new Set(['os', 'sys', 'json', 're', 'math', 'time', 'datetime', 'random', 'pathlib',
            'collections', 'itertools', 'functools', 'typing', 'abc', 'io', 'threading', 'subprocess',
            'hashlib', 'base64', 'urllib', 'http', 'socket', 'logging', 'copy', 'enum', 'dataclasses',
            'contextlib', 'inspect', 'ast', 'traceback', 'warnings', 'platform', 'signal', 'queue'])
        const third = imports.filter(i => !stdlib.has(i) && !i.startsWith('_'))
        if (!third.length) return { success: true, installed: [], message: 'No missing packages detected' }
        const r = await sh(`pip install ${third.join(' ')} -q 2>&1`, 120000)
        return { success: r.success, installed: third, output: r.output.slice(0, 500) }
    } else {
        // Node.js
        const requires = [...new Set([
            ...[...code.matchAll(/require\(['"]([^'"./][^'"]+)['"]\)/g)].map(m => m[0].match(/['"]([^'"]+)['"]/)?.[1]),
            ...[...code.matchAll(/from ['"]([^'"./][^'"]+)['"]/g)].map(m => m[1])
        ].filter(Boolean))]
        const builtins = new Set(['fs', 'path', 'http', 'https', 'crypto', 'os', 'events', 'stream',
            'url', 'util', 'child_process', 'readline', 'zlib', 'buffer', 'querystring',
            'net', 'tls', 'dns', 'cluster', 'worker_threads', 'vm', 'assert', 'timers'])
        const third = requires.filter(r => !builtins.has(r))
        if (!third.length) return { success: true, installed: [], message: 'No missing packages detected' }

        let dir = '/tmp'
        if (fs.existsSync(codeOrDir) && fs.statSync(codeOrDir).isDirectory()) dir = codeOrDir

        const r = await sh(`cd "${dir}" && npm install ${third.join(' ')} --loglevel=error 2>&1`, 120000)
        return { success: r.success, installed: third, output: r.output.slice(0, 500) }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  5. FORMAT CONVERTER  (JSON ↔ CSV ↔ YAML ↔ XML ↔ TSV)
// ══════════════════════════════════════════════════════════════════════════════

const formatConvert = (input, from, to) => {
    try {
        let data
        const f = from.toLowerCase(), t = to.toLowerCase()

        // Parse input
        if (f === 'json') {
            data = JSON.parse(input)
        } else if (f === 'csv' || f === 'tsv') {
            const sep = f === 'tsv' ? '\t' : ','
            const lines = input.trim().split('\n')
            const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''))
            data = lines.slice(1).map(line => {
                const vals = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ''))
                return Object.fromEntries(headers.map((h, i) => [h, vals[i] || '']))
            })
        } else if (f === 'yaml' || f === 'yml') {
            // Simple YAML parser for flat key: value
            data = {}
            input.split('\n').forEach(line => {
                const m = line.match(/^(\s*)([\w\-]+):\s*(.*)$/)
                if (m) data[m[2]] = m[3].replace(/^['"]|['"]$/g, '').trim()
            })
        }

        // Convert to output format
        if (t === 'json') {
            return { success: true, output: JSON.stringify(data, null, 2), format: 'json' }
        } else if (t === 'csv' || t === 'tsv') {
            const sep = t === 'tsv' ? '\t' : ','
            const arr = Array.isArray(data) ? data : [data]
            const headers = [...new Set(arr.flatMap(Object.keys))]
            const rows = arr.map(row => headers.map(h => {
                const v = String(row[h] || '')
                return t === 'csv' && (v.includes(',') || v.includes('"')) ? `"${v.replace(/"/g, '""')}"` : v
            }).join(sep))
            return { success: true, output: [headers.join(sep), ...rows].join('\n'), format: t }
        } else if (t === 'yaml' || t === 'yml') {
            const arr = Array.isArray(data) ? data : [data]
            const yaml = arr.map((obj, i) => {
                const lines = Object.entries(obj).map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
                return `- # Record ${i + 1}\n${lines.join('\n')}`
            }).join('\n')
            return { success: true, output: yaml, format: 'yaml' }
        } else if (t === 'xml') {
            const arr = Array.isArray(data) ? data : [data]
            const toXml = (obj, tag = 'item') => {
                const inner = Object.entries(obj).map(([k, v]) => `  <${k}>${v}</${k}>`).join('\n')
                return `<${tag}>\n${inner}\n</${tag}>`
            }
            const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<root>\n${arr.map(o => toXml(o)).join('\n')}\n</root>`
            return { success: true, output: xml, format: 'xml' }
        } else if (t === 'table') {
            const arr = Array.isArray(data) ? data : [data]
            const headers = [...new Set(arr.flatMap(Object.keys))]
            const maxWidths = headers.map(h => Math.max(h.length, ...arr.map(r => String(r[h] || '').length)))
            const pad = (s, n) => String(s || '').padEnd(n)
            const sep = '+' + maxWidths.map(w => '-'.repeat(w + 2)).join('+') + '+'
            const head = '|' + headers.map((h, i) => ` ${pad(h, maxWidths[i])} `).join('|') + '|'
            const rows = arr.map(r => '|' + headers.map((h, i) => ` ${pad(r[h], maxWidths[i])} `).join('|') + '|')
            return { success: true, output: [sep, head, sep, ...rows, sep].join('\n'), format: 'table' }
        }

        return { success: false, error: `Unknown target format: ${to}` }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  6. ZIP / ARCHIVE TOOLS
// ══════════════════════════════════════════════════════════════════════════════

const zipTools = async (action, target, dest = null) => {
    const actions = {
        create:  () => sh(`zip -r "${dest || target + '.zip'}" "${target}" --exclude="*/node_modules/*" --exclude="*/.git/*" 2>&1`, 60000),
        extract: () => sh(`unzip -o "${target}" ${dest ? '-d "' + dest + '"' : '-d "/tmp/extracted_' + Date.now() + '"'} 2>&1`, 60000),
        list:    () => sh(`unzip -l "${target}" 2>&1 || zipinfo "${target}" 2>&1`),
        tar:     () => sh(`tar -czf "${dest || target + '.tar.gz'}" "${target}" --exclude="node_modules" --exclude=".git" 2>&1`, 60000),
        untar:   () => sh(`tar -xzf "${target}" ${dest ? '-C "' + dest + '"' : '-C "/tmp"'} 2>&1`, 60000),
        tarlist: () => sh(`tar -tzf "${target}" 2>&1`)
    }
    const fn = actions[action]
    if (!fn) return { success: false, output: `Unknown action: ${action}. Use: create, extract, list, tar, untar, tarlist` }
    return fn()
}

// ══════════════════════════════════════════════════════════════════════════════
//  7. MULTI-SHELL SEQUENCES
//     Run ordered commands with dependency checking, conditionals, and reports
// ══════════════════════════════════════════════════════════════════════════════

const multiShell = async (commands) => {
    // commands = [{ cmd, desc, required: true/false, timeout: 30000, onlyIf: "previous_success" }]
    const results = []
    let aborted = false

    for (const step of commands) {
        if (aborted) {
            results.push({ ...step, status: 'skipped', output: 'Skipped — previous required step failed' })
            continue
        }
        const start = Date.now()
        const r = await sh(step.cmd || '', step.timeout || 30000)
        const elapsed = Date.now() - start
        const result = {
            desc: step.desc || step.cmd,
            cmd: step.cmd,
            status: r.success ? 'ok' : 'failed',
            output: r.output.slice(0, 500),
            elapsed: `${elapsed}ms`,
            required: step.required !== false
        }
        results.push(result)
        if (!r.success && step.required !== false) aborted = true
    }

    const ok    = results.filter(r => r.status === 'ok').length
    const failed = results.filter(r => r.status === 'failed').length
    const skipped = results.filter(r => r.status === 'skipped').length
    const summary = results.map(r => {
        const icon = r.status === 'ok' ? '✅' : r.status === 'failed' ? '❌' : '⏭️'
        return `${icon} ${r.desc} (${r.elapsed})\n   ${r.output.slice(0, 150)}`
    }).join('\n\n')

    return {
        success: !aborted,
        ok, failed, skipped,
        total: commands.length,
        summary,
        results
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  8. NATURAL LANGUAGE → SQL
// ══════════════════════════════════════════════════════════════════════════════

const nlToSql = async (naturalLanguage, schema = '', dialect = 'sqlite') => {
    const sys = `You are an expert SQL developer. Convert the user's natural language description to a ${dialect.toUpperCase()} query.
${schema ? 'Database schema:\n' + schema : ''}
Rules:
- Return ONLY the SQL query — no explanation, no markdown, no code blocks
- Use ${dialect} syntax
- Use proper JOINs, GROUP BY, ORDER BY, LIMIT as needed
- For ambiguous table names, infer from the natural language`

    const r = await callAI(sys, naturalLanguage)
    if (!r.success) return { success: false, error: 'AI unavailable' }

    // Clean up any accidental markdown
    const sql = r.text
        .replace(/```sql\n?/gi, '').replace(/```\n?/g, '').trim()

    // Basic validation — should start with SELECT/INSERT/UPDATE/DELETE/CREATE
    const valid = /^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|WITH|EXPLAIN)\s/i.test(sql)
    return { success: true, sql, valid, dialect, originalRequest: naturalLanguage }
}

// ══════════════════════════════════════════════════════════════════════════════
//  9. SELF-TEST & AUTO-FIX LOOP
//     Build a project, hit its endpoints, read logs, fix errors, repeat
// ══════════════════════════════════════════════════════════════════════════════

const selfTestFix = async (projectDir, port, testEndpoints = ['/health'], maxRetries = 4) => {
    const safeName = path.basename(projectDir)
    const log = []
    let lastError = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        log.push(`\n🔄 Attempt ${attempt}/${maxRetries}`)

        // Restart PM2
        await sh(`pm2 restart "${safeName}" 2>/dev/null || pm2 start "${projectDir}/index.js" --name "${safeName}" 2>&1`)
        await new Promise(r => setTimeout(r, 2000))

        // Test all endpoints
        let allPassed = true
        for (const ep of testEndpoints) {
            try {
                const r = await axios.get(`http://localhost:${port}${ep}`, { timeout: 5000 })
                log.push(`  ✅ GET ${ep} → ${r.status}`)
            } catch (e) {
                log.push(`  ❌ GET ${ep} → ${e.message}`)
                allPassed = false
                lastError = e.message
            }
        }

        if (allPassed) {
            log.push(`\n✅ All ${testEndpoints.length} endpoint(s) passing after ${attempt} attempt(s)!`)
            return { success: true, attempts: attempt, log: log.join('\n'), port }
        }

        if (attempt < maxRetries) {
            // Read error logs
            const pmLogs = await sh(`pm2 logs "${safeName}" --lines 20 --nostream 2>&1 | tail -20`)
            const errorLines = pmLogs.output

            // Ask AI to fix the code
            log.push(`  🤖 Asking AI to fix the error...`)
            const mainFile = path.join(projectDir, 'src', 'index.js')
            const fallbackFile = path.join(projectDir, 'index.js')
            const targetFile = fs.existsSync(mainFile) ? mainFile : fallbackFile

            if (fs.existsSync(targetFile)) {
                const code = fs.readFileSync(targetFile, 'utf8')
                const fix = await callAI(
                    'You are an expert Node.js debugger. Fix the code based on the error. Return ONLY the corrected code, no explanations.',
                    `Error:\n${lastError}\n\nLogs:\n${errorLines.slice(0, 500)}\n\nCode:\n${code.slice(0, 3000)}`
                )
                if (fix.success && fix.text.includes('require') || fix.text.includes('const')) {
                    fs.writeFileSync(targetFile, fix.text.replace(/```(?:js|javascript)?\n?/gi, '').replace(/```\n?/g, '').trim())
                    log.push(`  ✏️ Code updated with AI fix`)
                }
            }
        }
    }

    return { success: false, attempts: maxRetries, log: log.join('\n'), lastError, port }
}

// ══════════════════════════════════════════════════════════════════════════════
//  10. MOCK API SERVER
//      Describe an API in plain English → bot generates & runs it live
// ══════════════════════════════════════════════════════════════════════════════

const mockServer = async (spec, port = null) => {
    const resolvedPort = port || await getNextPort()
    const name = `mock-${Date.now()}`
    const dir  = path.join(PROJECTS, name)
    await sh(`mkdir -p "${dir}"`)

    // Ask AI to generate the Express server code
    const sys = `You are an expert Express.js developer. Generate a complete, runnable Express server based on the API spec.
Requirements:
- Use express only (no other deps except cors)
- Include realistic sample data (arrays of 3-5 objects)
- Support GET, POST, PUT, DELETE for each resource
- Add CORS, JSON parsing
- Listen on PORT env var or the given port
- Add a GET /health endpoint
- Return ONLY the complete Node.js code — no markdown, no explanation`

    const r = await callAI(sys, `Port: ${resolvedPort}\n\nAPI Spec:\n${spec}`)
    if (!r.success) return { success: false, error: 'Could not generate server' }

    let code = r.text.replace(/```(?:js|javascript|node)?\n?/gi, '').replace(/```\n?/g, '').trim()
    if (!code.includes('listen')) {
        code += `\n\napp.listen(process.env.PORT || ${resolvedPort}, () => console.log('Mock API running on port ${resolvedPort}'))`
    }

    fs.writeFileSync(path.join(dir, 'index.js'), code)
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
        name, version: '1.0.0', main: 'index.js',
        dependencies: { express: '^4.18.2', cors: '^2.8.5' }
    }, null, 2))

    await sh(`cd "${dir}" && npm install --loglevel=error 2>&1`, 60000)
    const pm = await sh(`PORT=${resolvedPort} pm2 start "${dir}/index.js" --name "${name}"`)
    await new Promise(r => setTimeout(r, 2000))

    // Quick health check
    let healthy = false
    try {
        await axios.get(`http://localhost:${resolvedPort}/health`, { timeout: 3000 })
        healthy = true
    } catch {}

    return {
        success: true, name, port: resolvedPort, dir,
        healthy, started: pm.success,
        endpoints: [...spec.matchAll(/(?:GET|POST|PUT|DELETE|PATCH)\s+\/\S+/gi)].map(m => m[0]),
        codePreview: code.slice(0, 600)
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  11. GITHUB CODE SEARCH
// ══════════════════════════════════════════════════════════════════════════════

const githubCodeSearch = async (query, lang = '', limit = 5) => {
    try {
        const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN || ''
        const q = lang ? `${query} language:${lang}` : query
        const r = await axios.get('https://api.github.com/search/code', {
            params: { q, per_page: limit },
            headers: {
                Accept: 'application/vnd.github.v3+json',
                'User-Agent': 'Bera-AI',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            timeout: 10000
        })
        const items = (r.data.items || []).slice(0, limit)
        const results = await Promise.all(items.map(async item => {
            let snippet = ''
            try {
                const raw = await axios.get(item.url, {
                    headers: { Accept: 'application/vnd.github.v3.raw', 'User-Agent': 'Bera-AI', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                    timeout: 5000
                })
                snippet = String(raw.data).slice(0, 300)
            } catch {}
            return { repo: item.repository?.full_name, file: item.path, url: item.html_url, snippet }
        }))
        return { success: true, total: r.data.total_count, results }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  12. AI CODE FIXER  (read file, fix with AI, write back)
// ══════════════════════════════════════════════════════════════════════════════

const aiCodeFix = async (filePath, errorOrInstruction) => {
    try {
        const code = fs.readFileSync(filePath, 'utf8')
        const ext  = path.extname(filePath).slice(1) || 'js'
        const fix  = await callAI(
            `You are an expert ${ext} developer. Fix or improve the code as instructed. Return ONLY the complete fixed code — no markdown, no explanations.`,
            `File: ${path.basename(filePath)}\nInstruction: ${errorOrInstruction}\n\nCurrent code:\n${code.slice(0, 4000)}`
        )
        if (!fix.success) return { success: false, error: 'AI unavailable' }
        const cleaned = fix.text.replace(/```[a-z]*\n?/gi, '').replace(/```\n?/g, '').trim()
        fs.writeFileSync(filePath, cleaned)
        return { success: true, file: filePath, lines: cleaned.split('\n').length, preview: cleaned.slice(0, 200) }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  13. PROJECT MEMORY  (remember what was built, their ports, status)
// ══════════════════════════════════════════════════════════════════════════════

const MEMORY_FILE = '/tmp/bera_projects.json'

const projectMemory = {
    save: (name, info) => {
        let db = {}
        try { db = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')) } catch {}
        db[name] = { ...info, savedAt: new Date().toISOString() }
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(db, null, 2))
        return { success: true, saved: name }
    },
    get: (name) => {
        try {
            const db = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'))
            return name ? db[name] : db
        } catch { return null }
    },
    list: () => {
        try {
            const db = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'))
            return Object.entries(db).map(([name, info]) =>
                `• *${name}* (${info.stack || info.type || 'project'}) port:${info.port || '?'} — ${info.savedAt?.slice(0, 10) || 'unknown date'}`
            ).join('\n') || 'No projects saved yet'
        } catch { return 'No projects saved yet' }
    },
    delete: (name) => {
        try {
            const db = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'))
            delete db[name]
            fs.writeFileSync(MEMORY_FILE, JSON.stringify(db, null, 2))
            return { success: true }
        } catch { return { success: false } }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  14. DEEP SCRAPE WITH AI ANALYSIS
//     Scrape + AI interpretation of the data
// ══════════════════════════════════════════════════════════════════════════════

const deepScrapeAnalyze = async (url, question = 'Summarize the key information on this page') => {
    // Fetch raw HTML
    let text = ''
    try {
        const html = await fetchPage(url, 20000)
        text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 6000)
    } catch (e) {
        return { success: false, error: `Could not fetch ${url}: ${e.message}` }
    }

    const ai = await callAI(
        `You are an expert web analyst. Answer the user's question based on the webpage content. Be specific, accurate, and cite key facts. Use bullet points where helpful.`,
        `URL: ${url}\nQuestion: ${question}\n\nPage content:\n${text}`
    )

    return {
        success: ai.success,
        url, question,
        answer: ai.text || 'Could not analyze',
        model: ai.model || 'unknown',
        contentLength: text.length
    }
}

module.exports = {
    smartExtract,
    dataPipeline,
    scaffoldProject,
    autoInstallDeps,
    formatConvert,
    zipTools,
    multiShell,
    nlToSql,
    selfTestFix,
    mockServer,
    githubCodeSearch,
    aiCodeFix,
    projectMemory,
    deepScrapeAnalyze
}
