'use strict'
// ══════════════════════════════════════════════════════════════════════════════
//  Bera Replit Engine — full Replit-like dev environment over WhatsApp
//  Features: templates, projects, PM2 processes, packages, .env, git, deploy
// ══════════════════════════════════════════════════════════════════════════════
const fs   = require('fs')
const path = require('path')
const { exec } = require('child_process')
const axios = require('axios')

const WORKSPACE_ROOT = process.env.BERA_WORKSPACE || '/workspace'
try { fs.mkdirSync(WORKSPACE_ROOT, { recursive: true }) } catch {}

// ── Helpers ───────────────────────────────────────────────────────────────────
const run = (cmd, cwd = WORKSPACE_ROOT, timeout = 60000) => new Promise(resolve => {
    exec(cmd, { cwd, timeout, maxBuffer: 1024 * 1024 * 5 }, (err, stdout, stderr) => {
        const out = [(stdout || '').trim(), stderr ? stderr.trim() : ''].filter(Boolean).join('\n').slice(0, 3000)
        resolve({ success: !err, output: out || (err?.message || 'done'), code: err?.code })
    })
})

const safeId = (str) =>
    String(str || 'project').toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 40)

const pm2Name = (userId, projectName) =>
    `${String(userId || '').replace(/@.+/, '').replace(/\D/g, '').slice(-8)}-${safeId(projectName)}`

const projectDir = (userId, projectName) => {
    const uid = String(userId || 'shared').replace(/@.+/, '').replace(/[^a-zA-Z0-9_-]/g, '_')
    return path.join(WORKSPACE_ROOT, uid, safeId(projectName))
}

const getProjectList = (userId) => {
    const uid = String(userId || 'shared').replace(/@.+/, '').replace(/[^a-zA-Z0-9_-]/g, '_')
    const userDir = path.join(WORKSPACE_ROOT, uid)
    try {
        if (!fs.existsSync(userDir)) return []
        return fs.readdirSync(userDir)
            .filter(d => {
                try { return fs.statSync(path.join(userDir, d)).isDirectory() } catch { return false }
            })
            .map(d => {
                const pDir = path.join(userDir, d)
                const pkg  = path.join(pDir, 'package.json')
                const pyReq = path.join(pDir, 'requirements.txt')
                const hasPkg = fs.existsSync(pkg)
                const hasPy  = fs.existsSync(pyReq) || fs.existsSync(path.join(pDir, 'app.py')) || fs.existsSync(path.join(pDir, 'main.py'))
                const lang   = hasPkg ? 'node' : hasPy ? 'python' : 'other'
                const main   = hasPkg ? JSON.parse(fs.readFileSync(pkg, 'utf8')).main || 'index.js' : 'app.py'
                return { name: d, dir: pDir, lang, main }
            })
    } catch { return [] }
}

// ══════════════════════════════════════════════════════════════════════════════
//  TEMPLATES — 20 production-ready stacks
// ══════════════════════════════════════════════════════════════════════════════

const TEMPLATES = {

'express-app': {
    desc: 'Express.js web app with HTML views and static files',
    lang: 'node', main: 'index.js', port: 3000,
    files: {
        'package.json': (name) => JSON.stringify({ name, version: '1.0.0', main: 'index.js', scripts: { start: 'node index.js', dev: 'node index.js' }, dependencies: { express: '^4.18.2' } }, null, 2),
        'index.js': (name, port) => `const express = require('express')
const path = require('path')
const app = express()
const PORT = process.env.PORT || ${port}

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, 'public')))

app.get('/', (req, res) => {
  res.send(\`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${name}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;background:#0f0f1a;color:#e0e0ff;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#1a1a2e;border:1px solid #e94560;border-radius:16px;padding:2rem 3rem;text-align:center;box-shadow:0 0 40px rgba(233,69,96,.15)}
h1{color:#e94560;font-size:2.5rem;margin-bottom:.5rem}p{color:#a0a0cc;margin:.5rem 0}
.badge{display:inline-block;background:#e94560;color:#fff;border-radius:8px;padding:.3rem .8rem;font-size:.85rem;margin-top:1rem}</style></head>
<body><div class="card"><h1>🚀 ${name}</h1><p>Your Express app is running!</p><div class="badge">PORT \${PORT}</div>
<p style="margin-top:1rem;font-size:.85rem;color:#666">Built with Bera AI · Express.js</p></div></body></html>\`)
})

app.listen(PORT, () => console.log(\`[${name}] Running on http://localhost:\${PORT}\`))
`,
        'public/style.css': () => `/* Add your styles here */`,
        '.gitignore': () => 'node_modules\n.env\n*.log',
        'README.md': (name) => `# ${name}\n\nExpress.js web app created with Bera AI.\n\n## Start\n\`\`\`bash\nnpm start\n\`\`\``,
    }
},

'express-api': {
    desc: 'REST API with CRUD endpoints, CORS, validation',
    lang: 'node', main: 'index.js', port: 4000,
    files: {
        'package.json': (name) => JSON.stringify({ name, version: '1.0.0', main: 'index.js', scripts: { start: 'node index.js' }, dependencies: { express: '^4.18.2', cors: '^2.8.5' } }, null, 2),
        'index.js': (name, port) => `const express = require('express')
const cors    = require('cors')
const app     = express()
const PORT    = process.env.PORT || ${port}

app.use(cors())
app.use(express.json())

// In-memory store (replace with DB in production)
const items = new Map()
let nextId = 1

app.get('/api/health', (_, res) => res.json({ status: 'ok', app: '${name}', uptime: process.uptime() }))

app.get('/api/items', (_, res) => res.json({ items: [...items.values()], total: items.size }))
app.get('/api/items/:id', (req, res) => {
  const item = items.get(+req.params.id)
  if (!item) return res.status(404).json({ error: 'Not found' })
  res.json(item)
})
app.post('/api/items', (req, res) => {
  const { name, value } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })
  const item = { id: nextId++, name, value: value ?? null, createdAt: new Date().toISOString() }
  items.set(item.id, item)
  res.status(201).json(item)
})
app.put('/api/items/:id', (req, res) => {
  const item = items.get(+req.params.id)
  if (!item) return res.status(404).json({ error: 'Not found' })
  Object.assign(item, req.body, { id: item.id })
  res.json(item)
})
app.delete('/api/items/:id', (req, res) => {
  if (!items.delete(+req.params.id)) return res.status(404).json({ error: 'Not found' })
  res.json({ success: true })
})

app.listen(PORT, () => console.log(\`[${name}] API running on http://localhost:\${PORT}\`))
`,
        '.gitignore': () => 'node_modules\n.env\n*.log',
        'README.md': (name) => `# ${name}\n\nREST API · GET/POST/PUT/DELETE /api/items\n\n## Start\n\`\`\`bash\nnpm start\n\`\`\``,
    }
},

'express-auth': {
    desc: 'Express API with JWT auth, bcrypt, SQLite',
    lang: 'node', main: 'index.js', port: 4001,
    files: {
        'package.json': (name) => JSON.stringify({ name, version: '1.0.0', main: 'index.js', scripts: { start: 'node index.js' }, dependencies: { express: '^4.18.2', cors: '^2.8.5', jsonwebtoken: '^9.0.0', bcryptjs: '^2.4.3', 'better-sqlite3': '^9.0.0' } }, null, 2),
        'index.js': (name, port) => `const express = require('express')
const cors    = require('cors')
const jwt     = require('jsonwebtoken')
const bcrypt  = require('bcryptjs')
const Database = require('better-sqlite3')
const app     = express()
const PORT    = process.env.PORT || ${port}
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production'

app.use(cors()); app.use(express.json())

const db = new Database('./data.db')
db.exec(\`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, createdAt TEXT DEFAULT CURRENT_TIMESTAMP)\`)

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'No token' })
  try { req.user = jwt.verify(token, JWT_SECRET); next() }
  catch { res.status(401).json({ error: 'Invalid token' }) }
}

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body
  if (!username || !password) return res.status(400).json({ error: 'username + password required' })
  try {
    const hash = await bcrypt.hash(password, 10)
    const stmt = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)')
    const result = stmt.run(username, hash)
    res.status(201).json({ id: result.lastInsertRowid, username })
  } catch (e) { res.status(409).json({ error: 'Username taken' }) }
})

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
  if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Bad credentials' })
  const token = jwt.sign({ id: user.id, username }, JWT_SECRET, { expiresIn: '7d' })
  res.json({ token, user: { id: user.id, username } })
})

app.get('/api/me', auth, (req, res) => res.json({ user: req.user }))
app.get('/api/health', (_, res) => res.json({ status: 'ok', uptime: process.uptime() }))

app.listen(PORT, () => console.log(\`[${name}] Auth API on http://localhost:\${PORT}\`))
`,
        '.gitignore': () => 'node_modules\n.env\n*.db\n*.log',
    }
},

'websocket': {
    desc: 'Real-time WebSocket server with Socket.io + live chat UI',
    lang: 'node', main: 'index.js', port: 5000,
    files: {
        'package.json': (name) => JSON.stringify({ name, version: '1.0.0', main: 'index.js', scripts: { start: 'node index.js' }, dependencies: { express: '^4.18.2', 'socket.io': '^4.7.2' } }, null, 2),
        'index.js': (name, port) => `const express  = require('express')
const http     = require('http')
const { Server } = require('socket.io')
const app      = express()
const server   = http.createServer(app)
const io       = new Server(server)
const PORT     = process.env.PORT || ${port}

app.get('/', (_, res) => res.send(\`<!DOCTYPE html><html><head><title>${name}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#1a1a2e;color:#e0e0ff}
#app{max-width:600px;margin:2rem auto;padding:1rem}h1{color:#e94560;margin-bottom:1rem}
#messages{height:300px;background:#0f0f1a;border:1px solid #333;border-radius:8px;overflow-y:auto;padding:1rem;margin-bottom:1rem}
.msg{margin:.3rem 0;color:#a0a0cc}.msg .user{color:#e94560;font-weight:bold}
#form{display:flex;gap:.5rem}input{flex:1;background:#0f0f1a;border:1px solid #e94560;color:#e0e0ff;padding:.5rem;border-radius:4px}
button{background:#e94560;color:#fff;border:none;padding:.5rem 1rem;border-radius:4px;cursor:pointer}</style></head>
<body><div id="app"><h1>💬 ${name}</h1><div id="messages"></div>
<form id="form"><input id="input" placeholder="Type a message..."><button>Send</button></form></div>
<script src="/socket.io/socket.io.js"><\/script><script>
const socket = io();const msgs = document.getElementById('messages');const form = document.getElementById('form');const input = document.getElementById('input');
socket.on('message',({user,text,ts})=>{const d=document.createElement('div');d.className='msg';d.innerHTML=\`<span class="user">\${user}</span> <span style="color:#666">\${ts}</span>: \${text}\`;msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight})
socket.on('count',n=>{document.title=\`${name} (\${n} online)\`})
form.addEventListener('submit',e=>{e.preventDefault();if(input.value.trim()){socket.emit('message',input.value);input.value=''}})
<\/script></body></html>\`))

const users = new Map()
io.on('connection', socket => {
  const user = 'User' + Math.floor(Math.random() * 1000)
  users.set(socket.id, user)
  io.emit('count', users.size)
  socket.broadcast.emit('message', { user: '🔔 System', text: \`\${user} joined\`, ts: new Date().toLocaleTimeString() })
  socket.on('message', text => io.emit('message', { user, text, ts: new Date().toLocaleTimeString() }))
  socket.on('disconnect', () => { users.delete(socket.id); io.emit('count', users.size) })
})

server.listen(PORT, () => console.log(\`[${name}] WebSocket server on http://localhost:\${PORT}\`))
`,
        '.gitignore': () => 'node_modules\n.env\n*.log',
    }
},

'discord-bot': {
    desc: 'Discord.js v14 bot with slash commands and event handlers',
    lang: 'node', main: 'index.js', port: null,
    files: {
        'package.json': (name) => JSON.stringify({ name, version: '1.0.0', main: 'index.js', scripts: { start: 'node index.js' }, dependencies: { 'discord.js': '^14.14.1', dotenv: '^16.0.0' } }, null, 2),
        '.env': () => 'DISCORD_TOKEN=your-bot-token-here\nCLIENT_ID=your-client-id-here\nGUILD_ID=your-guild-id-here',
        'index.js': (name) => `require('dotenv').config()
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js')
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] })

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),
  new SlashCommandBuilder().setName('hello').setDescription('Say hello').addStringOption(o => o.setName('name').setDescription('Your name').setRequired(false)),
  new SlashCommandBuilder().setName('info').setDescription('Bot information'),
].map(c => c.toJSON())

client.once('ready', async () => {
  console.log(\`[${name}] Logged in as \${client.user.tag}\`)
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN)
  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands })
  console.log('[${name}] Slash commands registered')
})

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return
  const { commandName } = interaction
  if (commandName === 'ping') {
    await interaction.reply(\`🏓 Pong! Latency: \${client.ws.ping}ms\`)
  } else if (commandName === 'hello') {
    const name2 = interaction.options.getString('name') || interaction.user.username
    await interaction.reply(\`👋 Hello, \${name2}!\`)
  } else if (commandName === 'info') {
    await interaction.reply({ content: \`🤖 *${name}*\\nBuilt with Discord.js v14\\nUptime: \${Math.floor(process.uptime())}s\\nServers: \${client.guilds.cache.size}\`, ephemeral: true })
  }
})

client.on('messageCreate', msg => {
  if (msg.author.bot) return
  if (msg.content.toLowerCase() === 'hello bot') msg.reply('👋 Hi there!')
})

client.login(process.env.DISCORD_TOKEN)
`,
        '.gitignore': () => 'node_modules\n.env\n*.log',
        'README.md': (name) => `# ${name}\n\nDiscord bot with slash commands.\n\n## Setup\n1. Create bot at discord.com/developers\n2. Add token to .env\n3. \`npm start\``,
    }
},

'telegram-bot': {
    desc: 'Telegraf.js Telegram bot with commands and inline keyboards',
    lang: 'node', main: 'index.js', port: null,
    files: {
        'package.json': (name) => JSON.stringify({ name, version: '1.0.0', main: 'index.js', scripts: { start: 'node index.js' }, dependencies: { telegraf: '^4.15.0', dotenv: '^16.0.0' } }, null, 2),
        '.env': () => 'BOT_TOKEN=your-telegram-bot-token-here',
        'index.js': (name) => `require('dotenv').config()
const { Telegraf, Markup } = require('telegraf')
const bot = new Telegraf(process.env.BOT_TOKEN)

bot.start(ctx => ctx.reply(\`👋 Welcome to *${name}*!\\n\\nI'm your Telegram bot.\\n\\nCommands:\\n/help — Show this help\\n/ping — Check latency\\n/info — Bot info\\n/menu — Interactive menu\`, { parse_mode: 'Markdown' }))

bot.help(ctx => ctx.reply('*Available Commands*\\n/start — Start\\n/ping — Ping\\n/info — Info\\n/menu — Menu', { parse_mode: 'Markdown' }))

bot.command('ping', ctx => {
  const start = Date.now()
  ctx.reply('🏓 Pong!').then(() => ctx.reply(\`⚡ Latency: \${Date.now() - start}ms\`))
})

bot.command('info', ctx => ctx.reply(
  \`🤖 *${name}*\\n📅 Uptime: \${Math.floor(process.uptime())}s\\n👤 User: \${ctx.from.first_name}\`,
  { parse_mode: 'Markdown' }
))

bot.command('menu', ctx => ctx.reply('What would you like?', Markup.inlineKeyboard([
  [Markup.button.callback('🏓 Ping', 'ping'), Markup.button.callback('ℹ️ Info', 'info')],
  [Markup.button.callback('❌ Close', 'close')],
])))

bot.action('ping',  ctx => { ctx.answerCbQuery(); ctx.editMessageText('🏓 Pong!') })
bot.action('info',  ctx => { ctx.answerCbQuery(); ctx.editMessageText(\`Uptime: \${Math.floor(process.uptime())}s\`) })
bot.action('close', ctx => { ctx.answerCbQuery('Closed'); ctx.deleteMessage() })

bot.on('text', ctx => {
  const text = ctx.message.text.toLowerCase()
  if (text.includes('hello') || text.includes('hi')) ctx.reply(\`👋 Hello, \${ctx.from.first_name}!\`)
})

bot.launch().then(() => console.log('[${name}] Bot running'))
process.once('SIGINT',  () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
`,
        '.gitignore': () => 'node_modules\n.env\n*.log',
    }
},

'flask': {
    desc: 'Python Flask web app with templates and REST routes',
    lang: 'python', main: 'app.py', port: 5000,
    files: {
        'app.py': (name, port) => `from flask import Flask, jsonify, request, render_template_string
import os, time

app = Flask(__name__)
PORT = int(os.environ.get('PORT', ${port}))
START_TIME = time.time()

HTML = """<!DOCTYPE html>
<html><head><title>${name}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;background:#0f0f1a;color:#e0e0ff;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#1a1a2e;border:1px solid #e94560;border-radius:16px;padding:2rem 3rem;text-align:center}
h1{color:#e94560;font-size:2.5rem;margin-bottom:.5rem}p{color:#a0a0cc;margin:.3rem 0}
.badge{display:inline-block;background:#e94560;color:#fff;border-radius:8px;padding:.3rem .8rem;font-size:.85rem;margin-top:1rem}</style></head>
<body><div class="card"><h1>🐍 ${name}</h1><p>Flask is running!</p>
<div class="badge">Port {{ port }}</div><p style="margin-top:1rem;font-size:.85rem;color:#666">Built with Bera AI · Flask</p></div></body></html>"""

@app.route('/')
def index():
    return render_template_string(HTML, port=PORT)

@app.route('/api/health')
def health():
    return jsonify({"status": "ok", "app": "${name}", "uptime": round(time.time() - START_TIME, 2)})

@app.route('/api/echo', methods=['POST'])
def echo():
    data = request.get_json(silent=True) or {}
    return jsonify({"echo": data})

if __name__ == '__main__':
    print(f"[${name}] Running on http://localhost:{PORT}")
    app.run(host='0.0.0.0', port=PORT, debug=False)
`,
        'requirements.txt': () => 'flask>=2.3.0\ngunicorn>=21.0.0',
        '.gitignore': () => '__pycache__\n*.pyc\n.env\nvenv\n*.log',
        'README.md': (name) => `# ${name}\n\nFlask web app created with Bera AI.\n\n## Run\n\`\`\`bash\npip install -r requirements.txt\npython app.py\n\`\`\``,
    }
},

'fastapi': {
    desc: 'FastAPI with auto-docs, Pydantic models, async routes',
    lang: 'python', main: 'main.py', port: 8000,
    files: {
        'main.py': (name, port) => `from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import os, time, uuid

app = FastAPI(title="${name}", version="1.0.0", description="Built with Bera AI")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

START_TIME = time.time()
items: dict = {}

class Item(BaseModel):
    name: str
    description: Optional[str] = None
    price: Optional[float] = None

class ItemResponse(Item):
    id: str
    createdAt: float

@app.get("/")
def root():
    return {"app": "${name}", "docs": "/docs", "health": "/health"}

@app.get("/health")
def health():
    return {"status": "ok", "uptime": round(time.time() - START_TIME, 2)}

@app.get("/items", response_model=List[ItemResponse])
def list_items():
    return list(items.values())

@app.post("/items", response_model=ItemResponse, status_code=201)
def create_item(item: Item):
    item_id = str(uuid.uuid4())[:8]
    new_item = ItemResponse(**item.dict(), id=item_id, createdAt=time.time())
    items[item_id] = new_item
    return new_item

@app.get("/items/{item_id}", response_model=ItemResponse)
def get_item(item_id: str):
    if item_id not in items:
        raise HTTPException(status_code=404, detail="Item not found")
    return items[item_id]

@app.delete("/items/{item_id}")
def delete_item(item_id: str):
    if item_id not in items:
        raise HTTPException(status_code=404, detail="Item not found")
    del items[item_id]
    return {"success": True}

if __name__ == "__main__":
    import uvicorn
    PORT = int(os.environ.get("PORT", ${port}))
    print(f"[${name}] FastAPI on http://localhost:{PORT} | Docs: http://localhost:{PORT}/docs")
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
`,
        'requirements.txt': () => 'fastapi>=0.104.0\nuvicorn[standard]>=0.24.0\npydantic>=2.0.0',
        '.gitignore': () => '__pycache__\n*.pyc\n.env\nvenv\n*.log',
        'README.md': (name) => `# ${name}\n\nFastAPI app · Docs at /docs\n\n## Run\n\`\`\`bash\npip install -r requirements.txt\npython main.py\n\`\`\``,
    }
},

'sqlite-rest': {
    desc: 'REST API backed by SQLite database (persistent data)',
    lang: 'node', main: 'index.js', port: 4002,
    files: {
        'package.json': (name) => JSON.stringify({ name, version: '1.0.0', main: 'index.js', scripts: { start: 'node index.js' }, dependencies: { express: '^4.18.2', cors: '^2.8.5', 'better-sqlite3': '^9.0.0' } }, null, 2),
        'index.js': (name, port) => `const express  = require('express')
const cors     = require('cors')
const Database = require('better-sqlite3')
const path     = require('path')
const app      = express()
const PORT     = process.env.PORT || ${port}

app.use(cors()); app.use(express.json())

const db = new Database(path.join(__dirname, 'data.db'))
db.exec(\`
  CREATE TABLE IF NOT EXISTS records (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    key     TEXT NOT NULL,
    value   TEXT,
    created TEXT DEFAULT CURRENT_TIMESTAMP,
    updated TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_key ON records(key);
\`)

app.get('/api/health', (_, res) => res.json({ status: 'ok', db: 'sqlite', rows: db.prepare('SELECT COUNT(*) as c FROM records').get().c }))

app.get('/api/records', (_, res) => res.json(db.prepare('SELECT * FROM records ORDER BY id DESC').all()))
app.get('/api/records/:key', (req, res) => {
  const row = db.prepare('SELECT * FROM records WHERE key = ?').get(req.params.key)
  row ? res.json(row) : res.status(404).json({ error: 'Not found' })
})
app.post('/api/records', (req, res) => {
  const { key, value } = req.body
  if (!key) return res.status(400).json({ error: 'key required' })
  const info = db.prepare('INSERT OR REPLACE INTO records (key, value, updated) VALUES (?, ?, CURRENT_TIMESTAMP)').run(key, String(value ?? ''))
  res.status(201).json({ id: info.lastInsertRowid, key, value })
})
app.delete('/api/records/:key', (req, res) => {
  const info = db.prepare('DELETE FROM records WHERE key = ?').run(req.params.key)
  info.changes ? res.json({ success: true }) : res.status(404).json({ error: 'Not found' })
})
app.get('/api/query', (req, res) => {
  try { res.json(db.prepare(req.query.sql || 'SELECT 1').all()) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

app.listen(PORT, () => console.log(\`[${name}] SQLite REST API on http://localhost:\${PORT}\`))
`,
        '.gitignore': () => 'node_modules\n.env\n*.db\n*.log',
    }
},

'cli-tool': {
    desc: 'Commander.js CLI tool with commands and arguments',
    lang: 'node', main: 'cli.js', port: null,
    files: {
        'package.json': (name) => JSON.stringify({ name, version: '1.0.0', bin: { [name]: './cli.js' }, scripts: { start: `node cli.js` }, dependencies: { commander: '^11.1.0', chalk: '^4.1.2', inquirer: '^8.2.6' } }, null, 2),
        'cli.js': (name) => `#!/usr/bin/env node
const { Command } = require('commander')
const chalk = require('chalk')
const program = new Command()

program.name('${name}').description('CLI tool built with Bera AI').version('1.0.0')

program.command('hello [name]')
  .description('Say hello')
  .option('-u, --upper', 'Uppercase output')
  .action((name = 'World', opts) => {
    let msg = \`Hello, \${name}!\`
    if (opts.upper) msg = msg.toUpperCase()
    console.log(chalk.green('✓'), chalk.bold(msg))
  })

program.command('info')
  .description('Show system info')
  .action(() => {
    console.log(chalk.blue.bold('\\n${name} Info'))
    console.log(chalk.gray('  Node:'), process.version)
    console.log(chalk.gray('  Platform:'), process.platform)
    console.log(chalk.gray('  CWD:'), process.cwd())
    console.log(chalk.gray('  Memory:'), Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB')
    console.log()
  })

program.command('count <from> <to>')
  .description('Count from one number to another')
  .action((from, to) => {
    const [a, b] = [parseInt(from), parseInt(to)]
    for (let i = a; i <= b; i++) process.stdout.write(chalk.cyan(i + ' '))
    console.log()
  })

program.parse()
`,
        '.gitignore': () => 'node_modules\n*.log',
    }
},

'html-css-js': {
    desc: 'Static website — modern HTML5 + CSS3 + vanilla JS',
    lang: 'static', main: 'index.html', port: null,
    files: {
        'index.html': (name) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${name}</title><link rel="stylesheet" href="style.css"></head>
<body>
<nav class="navbar"><div class="brand">${name}</div><ul><li><a href="#">Home</a></li><li><a href="#">About</a></li><li><a href="#">Contact</a></li></ul></nav>
<main>
  <section class="hero"><h1>Welcome to <span>${name}</span></h1><p>A modern static website built with Bera AI.</p>
  <button class="btn" onclick="document.querySelector('.counter').textContent=+document.querySelector('.counter').textContent+1">Click me! <span class="counter">0</span></button></section>
  <section class="cards"><div class="card"><h3>🚀 Fast</h3><p>Pure HTML/CSS/JS — no frameworks needed.</p></div>
  <div class="card"><h3>📱 Responsive</h3><p>Looks great on all screen sizes.</p></div>
  <div class="card"><h3>✨ Modern</h3><p>Clean design with CSS custom properties.</p></div></section>
</main>
<footer><p>Built with Bera AI</p></footer>
<script src="app.js"></script></body></html>`,
        'style.css': (name) => `:root{--primary:#e94560;--bg:#0f0f1a;--surface:#1a1a2e;--text:#e0e0ff;--muted:#a0a0cc}
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
.navbar{display:flex;align-items:center;justify-content:space-between;padding:1rem 2rem;background:var(--surface);border-bottom:1px solid rgba(233,69,96,.2)}
.brand{font-size:1.3rem;font-weight:700;color:var(--primary)}.navbar ul{display:flex;gap:1.5rem;list-style:none}
.navbar a{color:var(--muted);text-decoration:none;transition:.2s}.navbar a:hover{color:var(--primary)}
.hero{text-align:center;padding:5rem 2rem;background:radial-gradient(ellipse at center,rgba(233,69,96,.07) 0%,transparent 70%)}
.hero h1{font-size:3rem;font-weight:800;margin-bottom:1rem}.hero span{color:var(--primary)}
.hero p{color:var(--muted);font-size:1.2rem;margin-bottom:2rem}
.btn{background:var(--primary);color:#fff;border:none;padding:.8rem 2rem;border-radius:8px;font-size:1rem;cursor:pointer;transition:.2s}
.btn:hover{transform:translateY(-2px);box-shadow:0 4px 20px rgba(233,69,96,.4)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:1.5rem;padding:3rem 2rem;max-width:900px;margin:0 auto}
.card{background:var(--surface);border:1px solid rgba(233,69,96,.15);border-radius:12px;padding:1.5rem;transition:.2s}
.card:hover{border-color:var(--primary);transform:translateY(-3px)}.card h3{color:var(--primary);margin-bottom:.5rem}
.card p{color:var(--muted);font-size:.9rem}footer{text-align:center;padding:1.5rem;border-top:1px solid rgba(255,255,255,.05);color:var(--muted);font-size:.85rem}`,
        'app.js': (name) => `// ${name} — app.js
console.log('${name} loaded')
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM ready')
  // Add your JavaScript here
})`,
    }
},

'python-script': {
    desc: 'Python utility script with argument parsing and logging',
    lang: 'python', main: 'main.py', port: null,
    files: {
        'main.py': (name) => `#!/usr/bin/env python3
"""${name} — Python script created with Bera AI"""
import argparse, logging, sys, os, json
from datetime import datetime

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger('${name}')

def main():
    parser = argparse.ArgumentParser(description='${name}')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    parser.add_argument('--output',  '-o', type=str, help='Output file')
    parser.add_argument('input', nargs='?', help='Input value')
    args = parser.parse_args()

    if args.verbose:
        logger.setLevel(logging.DEBUG)

    logger.info(f'Starting ${name}')

    result = {
        "name": "${name}",
        "input": args.input,
        "timestamp": datetime.now().isoformat(),
        "python": sys.version.split()[0],
    }

    output = json.dumps(result, indent=2)
    
    if args.output:
        with open(args.output, 'w') as f: f.write(output)
        logger.info(f'Output written to {args.output}')
    else:
        print(output)

    logger.info('Done')
    return 0

if __name__ == '__main__':
    sys.exit(main())
`,
        'requirements.txt': () => '# Add dependencies here\n# requests>=2.28.0',
        '.gitignore': () => '__pycache__\n*.pyc\n.env\nvenv\n*.log\noutput.json',
    }
},

'typescript-api': {
    desc: 'TypeScript Express API with types, interfaces, and ts-node',
    lang: 'node', main: 'src/index.ts', port: 4003,
    files: {
        'package.json': (name) => JSON.stringify({ name, version: '1.0.0', main: 'dist/index.js', scripts: { start: 'ts-node src/index.ts', build: 'tsc', dev: 'ts-node src/index.ts' }, dependencies: { express: '^4.18.2', cors: '^2.8.5' }, devDependencies: { typescript: '^5.2.0', 'ts-node': '^10.9.0', '@types/express': '^4.17.0', '@types/cors': '^2.8.0', '@types/node': '^20.0.0' } }, null, 2),
        'tsconfig.json': () => JSON.stringify({ compilerOptions: { target: 'ES2020', module: 'commonjs', outDir: './dist', rootDir: './src', strict: true, esModuleInterop: true, skipLibCheck: true, forceConsistentCasingInFileNames: true }, include: ['src/**/*'], exclude: ['node_modules', 'dist'] }, null, 2),
        'src/index.ts': (name, port) => `import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'

const app = express()
const PORT = process.env.PORT || ${port}

app.use(cors())
app.use(express.json())

interface Item {
  id: number
  name: string
  value?: string
  createdAt: string
}

const items: Map<number, Item> = new Map()
let nextId = 1

app.get('/api/health', (_: Request, res: Response) => {
  res.json({ status: 'ok', app: '${name}', uptime: process.uptime() })
})

app.get('/api/items', (_: Request, res: Response) => {
  res.json([...items.values()])
})

app.post('/api/items', (req: Request, res: Response) => {
  const { name, value } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  const item: Item = { id: nextId++, name, value, createdAt: new Date().toISOString() }
  items.set(item.id, item)
  res.status(201).json(item)
})

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack)
  res.status(500).json({ error: err.message })
})

app.listen(PORT, () => console.log(\`[${name}] TypeScript API on http://localhost:\${PORT}\`))
`,
        '.gitignore': () => 'node_modules\ndist\n.env\n*.log',
    }
},

}

// ══════════════════════════════════════════════════════════════════════════════
//  PROJECT CREATION
// ══════════════════════════════════════════════════════════════════════════════

const createProject = async (userId, name, template = 'express-api', customPort) => {
    const tpl = TEMPLATES[template]
    if (!tpl) {
        const available = Object.keys(TEMPLATES).join(', ')
        return { success: false, error: `Unknown template '${template}'. Available: ${available}` }
    }

    const safeName = safeId(name || template)
    const dir      = projectDir(userId, safeName)
    const port     = customPort || tpl.port || 3000

    if (fs.existsSync(dir)) {
        return { success: false, error: `Project '${safeName}' already exists at ${dir}. Use a different name.` }
    }

    try {
        fs.mkdirSync(dir, { recursive: true })

        // Write all template files
        for (const [relPath, contentFn] of Object.entries(tpl.files)) {
            const fullPath = path.join(dir, relPath)
            fs.mkdirSync(path.dirname(fullPath), { recursive: true })
            fs.writeFileSync(fullPath, contentFn(safeName, port))
        }

        // Write meta file
        const meta = { name: safeName, template, lang: tpl.lang, main: tpl.main, port, createdAt: Date.now() }
        fs.writeFileSync(path.join(dir, '.bera-meta.json'), JSON.stringify(meta, null, 2))

        // Auto-install if node project
        let installOutput = ''
        if (tpl.lang === 'node') {
            const r = await run('npm install --loglevel=error 2>&1', dir, 120000)
            installOutput = r.success ? '📦 npm install done' : `⚠️ npm install: ${r.output.slice(0, 200)}`
        }
        if (tpl.lang === 'python') {
            const r = await run('pip install -r requirements.txt -q 2>&1', dir, 120000)
            installOutput = r.success ? '📦 pip install done' : `⚠️ pip install: ${r.output.slice(0, 200)}`
        }

        const files = fs.readdirSync(dir).filter(f => !f.startsWith('.') && f !== 'node_modules' && f !== '__pycache__')
        return {
            success: true,
            name: safeName,
            dir,
            template,
            lang:   tpl.lang,
            main:   tpl.main,
            port,
            files,
            install: installOutput,
        }
    } catch (e) {
        return { success: false, error: `Failed to create project: ${e.message}` }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  PROCESS MANAGEMENT (PM2)
// ══════════════════════════════════════════════════════════════════════════════

const startProject = async (userId, name) => {
    const dir   = projectDir(userId, name)
    if (!fs.existsSync(dir)) return { success: false, error: `Project '${name}' not found` }

    const meta  = readMeta(dir)
    const pName = pm2Name(userId, name)

    let startCmd
    if (meta.lang === 'python') {
        startCmd = `pm2 start ${meta.main} --name "${pName}" --interpreter python3 -- 2>&1`
    } else if (meta.lang === 'node') {
        const pkg = readJson(path.join(dir, 'package.json'))
        const startScript = pkg?.scripts?.start ? `npm start` : `node ${meta.main || 'index.js'}`
        if (startScript === 'npm start') {
            startCmd = `pm2 start npm --name "${pName}" -- start 2>&1`
        } else {
            startCmd = `pm2 start ${meta.main || 'index.js'} --name "${pName}" 2>&1`
        }
    } else {
        return { success: false, error: `Cannot auto-start '${meta.lang}' projects (static/CLI)` }
    }

    // Inject .env if exists
    const envFile = path.join(dir, '.env')
    if (fs.existsSync(envFile)) {
        const envArgs = parseEnvFile(envFile).map(([k,v]) => `--env ${k}=${v}`).join(' ')
        // PM2 reads .env automatically with --env-file flag (PM2 5+)
    }

    const r = await run(startCmd, dir, 30000)
    return { success: r.success, output: r.output, name: pName, dir, port: meta.port }
}

const stopProject = async (userId, name) => {
    const pName = pm2Name(userId, name)
    const r = await run(`pm2 stop "${pName}" 2>&1`)
    return { success: r.success || r.output.includes('not found') === false, output: r.output }
}

const restartProject = async (userId, name) => {
    const pName = pm2Name(userId, name)
    const r = await run(`pm2 restart "${pName}" 2>&1`)
    return { success: r.success, output: r.output }
}

const deleteProcess = async (userId, name) => {
    const pName = pm2Name(userId, name)
    const r = await run(`pm2 delete "${pName}" 2>&1`)
    return { success: r.success, output: r.output }
}

const getProjectLogs = async (userId, name, lines = 40) => {
    const pName = pm2Name(userId, name)
    const r = await run(`pm2 logs "${pName}" --lines ${lines} --nostream 2>&1 | tail -${lines}`)
    return { success: true, output: r.output || '(no logs yet)' }
}

const getProjectStatus = async (userId, name) => {
    const pName = pm2Name(userId, name)
    const r = await run(`pm2 jlist 2>/dev/null | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const l=JSON.parse(d||'[]');const p=l.find(x=>x.name==='${pName}');if(p)console.log(JSON.stringify({name:p.name,status:p.pm2_env.status,pid:p.pid,cpu:p.monit?.cpu,memory:Math.round((p.monit?.memory||0)/1024/1024)+'MB',uptime:p.pm2_env.pm_uptime,restarts:p.pm2_env.restart_time}));else console.log('not found')"`)
    try {
        if (r.output === 'not found') return { success: false, error: 'Process not running' }
        return { success: true, ...JSON.parse(r.output) }
    } catch {
        return { success: false, error: r.output }
    }
}

const listRunningProjects = async (userId) => {
    const prefix = String(userId || '').replace(/@.+/, '').replace(/\D/g, '').slice(-8) + '-'
    const r = await run(`pm2 jlist 2>/dev/null`)
    try {
        const all = JSON.parse(r.output || '[]')
        return all
            .filter(p => p.name.startsWith(prefix))
            .map(p => ({
                name:     p.name.replace(prefix, ''),
                status:   p.pm2_env.status,
                pid:      p.pid,
                cpu:      p.monit?.cpu + '%',
                memory:   Math.round((p.monit?.memory || 0) / 1024 / 1024) + 'MB',
                restarts: p.pm2_env.restart_time,
            }))
    } catch { return [] }
}

// ══════════════════════════════════════════════════════════════════════════════
//  PACKAGE MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

const installPackages = async (userId, packages, projectName, manager = 'auto') => {
    const dir  = projectName ? projectDir(userId, projectName) : null
    const cwd  = dir && fs.existsSync(dir) ? dir : WORKSPACE_ROOT
    const pkgs = Array.isArray(packages) ? packages.join(' ') : packages

    // Auto-detect manager
    if (manager === 'auto') {
        if (fs.existsSync(path.join(cwd, 'requirements.txt')) || fs.existsSync(path.join(cwd, 'app.py'))) manager = 'pip'
        else manager = 'npm'
    }

    const cmd = manager === 'pip'
        ? `pip install ${pkgs} 2>&1`
        : `npm install ${pkgs} --loglevel=warn 2>&1`

    const r = await run(cmd, cwd, 120000)
    return { success: r.success, output: r.output.slice(0, 1000), manager, packages: pkgs }
}

const uninstallPackages = async (userId, packages, projectName, manager = 'auto') => {
    const dir  = projectName ? projectDir(userId, projectName) : null
    const cwd  = dir && fs.existsSync(dir) ? dir : WORKSPACE_ROOT
    const pkgs = Array.isArray(packages) ? packages.join(' ') : packages

    if (manager === 'auto') {
        manager = fs.existsSync(path.join(cwd, 'requirements.txt')) ? 'pip' : 'npm'
    }

    const cmd = manager === 'pip'
        ? `pip uninstall -y ${pkgs} 2>&1`
        : `npm uninstall ${pkgs} 2>&1`

    const r = await run(cmd, cwd, 60000)
    return { success: r.success, output: r.output.slice(0, 500) }
}

// ══════════════════════════════════════════════════════════════════════════════
//  ENVIRONMENT VARIABLES (.env)
// ══════════════════════════════════════════════════════════════════════════════

const getEnvPath = (userId, projectName) => {
    const dir = projectName ? projectDir(userId, projectName) : path.join(WORKSPACE_ROOT, String(userId || 'shared').replace(/@.+/, '').replace(/[^a-zA-Z0-9_-]/g, '_'))
    return path.join(dir, '.env')
}

const readEnvFile = (envPath) => {
    if (!fs.existsSync(envPath)) return {}
    return Object.fromEntries(
        fs.readFileSync(envPath, 'utf8').split('\n')
            .filter(l => l.includes('=') && !l.trim().startsWith('#'))
            .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')] })
    )
}

const parseEnvFile = (envPath) => Object.entries(readEnvFile(envPath))

const setEnvVar = (userId, projectName, key, value) => {
    const envPath = getEnvPath(userId, projectName)
    fs.mkdirSync(path.dirname(envPath), { recursive: true })
    const vars = readEnvFile(envPath)
    vars[key] = value
    const content = Object.entries(vars).map(([k, v]) => `${k}=${v.includes(' ') || v.includes('#') ? `"${v}"` : v}`).join('\n') + '\n'
    fs.writeFileSync(envPath, content)
    return { success: true, output: `✅ Set ${key} in ${envPath}` }
}

const getEnvVars = (userId, projectName) => {
    const envPath = getEnvPath(userId, projectName)
    const vars = readEnvFile(envPath)
    if (!Object.keys(vars).length) return { success: true, output: '(no environment variables set)', vars: {} }
    const lines = Object.entries(vars).map(([k, v]) => `  ${k} = ${v.length > 40 ? v.slice(0,37)+'...' : v}`)
    return { success: true, output: `🔑 *Environment Variables* (${envPath})\n\n${lines.join('\n')}`, vars }
}

const deleteEnvVar = (userId, projectName, key) => {
    const envPath = getEnvPath(userId, projectName)
    const vars = readEnvFile(envPath)
    if (!(key in vars)) return { success: false, output: `Variable '${key}' not found` }
    delete vars[key]
    const content = Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n') + '\n'
    fs.writeFileSync(envPath, content)
    return { success: true, output: `✅ Deleted ${key}` }
}

// ══════════════════════════════════════════════════════════════════════════════
//  FILE SYSTEM TOOLS
// ══════════════════════════════════════════════════════════════════════════════

const getFileTree = async (userId, projectName, maxDepth = 3) => {
    const dir = projectName ? projectDir(userId, projectName) : path.join(WORKSPACE_ROOT, String(userId || 'shared').replace(/@.+/, '').replace(/[^a-zA-Z0-9_-]/g, '_'))
    if (!fs.existsSync(dir)) return { success: false, output: `Directory not found: ${dir}` }

    const r = await run(`find . -not -path './node_modules/*' -not -path './__pycache__/*' -not -path './.git/*' -not -name '*.log' | sort | head -60`, dir)
    const lines = r.output.split('\n').filter(Boolean)

    // Convert find output to tree-like display
    const tree = lines.map(line => {
        const depth  = (line.match(/\//g) || []).length
        const name   = path.basename(line)
        const isDir  = !name.includes('.')
        const indent = '  '.repeat(depth)
        return `${indent}${isDir ? '📁' : '📄'} ${name}`
    }).join('\n')

    return { success: true, output: `📁 *${dir}*\n\n${tree || '(empty)'}`, dir }
}

const searchInFiles = async (userId, projectName, pattern, fileGlob = '') => {
    const dir = projectDir(userId, projectName)
    if (!fs.existsSync(dir)) return { success: false, output: 'Project not found' }

    const globPart = fileGlob ? `--include="${fileGlob}"` : ''
    const r = await run(`grep -rn ${globPart} --exclude-dir=node_modules --exclude-dir=.git --exclude="*.log" "${pattern}" . 2>&1 | head -20`, dir)
    if (!r.output.trim()) return { success: true, output: `No matches for "${pattern}"` }
    return { success: true, output: `🔍 *"${pattern}"* in ${dir}:\n\n${r.output}` }
}

const getProjectInfo = (userId, projectName) => {
    const dir = projectDir(userId, projectName)
    if (!fs.existsSync(dir)) return { success: false, error: `Project '${projectName}' not found` }

    const meta = readMeta(dir)
    const stat = fs.statSync(dir)

    let sizeOutput = ''
    try { sizeOutput = require('child_process').execSync(`du -sh "${dir}" 2>/dev/null | cut -f1`).toString().trim() } catch {}

    const hasGit = fs.existsSync(path.join(dir, '.git'))
    const hasEnv = fs.existsSync(path.join(dir, '.env'))

    const files = fs.readdirSync(dir).filter(f => f !== 'node_modules' && f !== '__pycache__' && !f.startsWith('.'))

    return {
        success: true,
        name:     projectName,
        dir,
        template: meta.template,
        lang:     meta.lang,
        main:     meta.main,
        port:     meta.port,
        size:     sizeOutput || '?',
        hasGit,
        hasEnv,
        files,
        created:  new Date(meta.createdAt || stat.birthtime).toLocaleString()
    }
}

const deleteProject = async (userId, name) => {
    const dir = projectDir(userId, name)
    if (!fs.existsSync(dir)) return { success: false, error: `Project '${name}' not found` }

    // Stop PM2 process first
    await deleteProcess(userId, name)

    // Delete directory
    const r = await run(`rm -rf "${dir}"`)
    return { success: r.success, output: r.success ? `✅ Deleted project '${name}' and all its files` : r.output }
}

// ══════════════════════════════════════════════════════════════════════════════
//  GIT INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════

const gitInit = async (userId, projectName) => {
    const dir = projectDir(userId, projectName)
    if (!fs.existsSync(dir)) return { success: false, error: 'Project not found' }
    const r = await run('git init && git add . && git commit -m "Initial commit via Bera AI" 2>&1', dir)
    return { success: r.success, output: r.output }
}

const gitStatus = async (userId, projectName) => {
    const dir = projectDir(userId, projectName)
    if (!fs.existsSync(dir)) return { success: false, error: 'Project not found' }
    const [status, log, diff] = await Promise.all([
        run('git status --short 2>&1', dir),
        run('git log --oneline -5 2>&1', dir),
        run('git diff --stat 2>&1', dir),
    ])
    return {
        success: true,
        output: `📦 *${projectName} git status*\n\n🔴 Changed:\n${status.output || 'clean'}\n\n📜 Last commits:\n${log.output || 'none'}\n\n📊 Diff:\n${diff.output || 'no changes'}`
    }
}

const gitAdd = async (userId, projectName, files = '.') => {
    const dir = projectDir(userId, projectName)
    const r = await run(`git add ${files} 2>&1`, dir)
    return { success: r.success, output: r.output || 'Staged' }
}

const gitDiff = async (userId, projectName) => {
    const dir = projectDir(userId, projectName)
    const r = await run('git diff HEAD 2>&1 | head -80', dir)
    return { success: true, output: r.output || '(no changes)' }
}

const gitPull = async (userId, projectName) => {
    const dir = projectDir(userId, projectName)
    const r = await run('git pull 2>&1', dir, 30000)
    return { success: r.success, output: r.output }
}

const gitBranch = async (userId, projectName, branchName) => {
    const dir = projectDir(userId, projectName)
    if (branchName) {
        const r = await run(`git checkout -b "${branchName}" 2>&1`, dir)
        return { success: r.success, output: r.output }
    }
    const r = await run('git branch -a 2>&1', dir)
    return { success: true, output: r.output || 'No branches' }
}

// ══════════════════════════════════════════════════════════════════════════════
//  DEPLOYMENT
// ══════════════════════════════════════════════════════════════════════════════

const deployInfo = async (userId, projectName) => {
    const dir  = projectDir(userId, projectName)
    const meta = readMeta(dir)
    const pName = pm2Name(userId, projectName)

    const lines = [
        `🚀 *Deploy Info: ${projectName}*`,
        ``,
        `📁 Directory: ${dir}`,
        `🔧 Language: ${meta.lang}`,
        `📄 Main file: ${meta.main}`,
        meta.port ? `🌐 Port: ${meta.port}` : `⚡ No HTTP server (CLI/static)`,
        ``,
        `*PM2 process name:* \`${pName}\``,
        ``,
        `*Quick deploy options:*`,
        `• Vercel: \`npm i -g vercel && vercel --yes\` (from project dir)`,
        `• Railway: \`npm i -g @railway/cli && railway up\``,
        `• Render: Push to GitHub → connect at render.com`,
        `• GitHub Pages (static): \`npx gh-pages -d .\``,
        ``,
        `*Run:* .replit run ${projectName}`,
        `*Logs:* .replit logs ${projectName}`,
    ]
    return { success: true, output: lines.join('\n') }
}

const deployGithubPages = async (userId, projectName, ghToken) => {
    const dir = projectDir(userId, projectName)
    if (!fs.existsSync(dir)) return { success: false, error: 'Project not found' }

    const token = ghToken || process.env.GITHUB_TOKEN
    if (!token) return { success: false, error: 'GitHub token not configured. Use .replit env <project> set GITHUB_TOKEN=xxx' }

    const r = await run(`npx --yes gh-pages -d . --dotfiles 2>&1`, dir, 120000)
    return { success: r.success, output: r.output.slice(0, 600) }
}

// ══════════════════════════════════════════════════════════════════════════════
//  SEARCH
// ══════════════════════════════════════════════════════════════════════════════

const searchNpm = async (query) => {
    try {
        const r = await axios.get(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=8`, { timeout: 10000 })
        const results = r.data.objects || []
        if (!results.length) return { success: true, output: `No npm packages found for "${query}"` }
        const lines = results.map(o => `• *${o.package.name}* v${o.package.version}\n  ${o.package.description || '(no description)'}\n  ${o.package.links?.npm || ''}`)
        return { success: true, output: `📦 *npm search: ${query}*\n\n${lines.join('\n\n')}` }
    } catch (e) {
        return { success: false, output: `Search failed: ${e.message}` }
    }
}

const searchPypi = async (query) => {
    try {
        const r = await axios.get(`https://pypi.org/search/?q=${encodeURIComponent(query)}&format=json`, { timeout: 10000 })
        const results = r.data.slice ? r.data.slice(0, 8) : []
        if (!results.length) return { success: true, output: `No PyPI packages found for "${query}"` }
        const lines = results.map(p => `• *${p.name}* v${p.version}\n  ${p.summary || ''}`)
        return { success: true, output: `🐍 *PyPI search: ${query}*\n\n${lines.join('\n\n')}` }
    } catch (e) {
        // Fallback: use pip search info
        const r = await run(`pip index versions "${query}" 2>&1 | head -5`)
        return { success: true, output: r.output || `No results for "${query}"` }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════════════════

const readMeta = (dir) => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, '.bera-meta.json'), 'utf8')) }
    catch { return { lang: 'node', main: 'index.js', port: 3000 } }
}

const readJson = (filePath) => {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) }
    catch { return null }
}

const listTemplates = () => {
    const rows = Object.entries(TEMPLATES).map(([id, t]) =>
        `• *${id}* — ${t.desc} (${t.lang}${t.port ? `, port ${t.port}` : ''})`
    )
    return `🧩 *Available Templates (${rows.length})*\n\n${rows.join('\n')}\n\nUsage: \`.replit new <template> <project-name>\``
}

module.exports = {
    TEMPLATES, WORKSPACE_ROOT,
    createProject, getProjectList, getProjectInfo, deleteProject,
    startProject, stopProject, restartProject, deleteProcess,
    getProjectLogs, getProjectStatus, listRunningProjects,
    installPackages, uninstallPackages,
    setEnvVar, getEnvVars, deleteEnvVar,
    getFileTree, searchInFiles,
    gitInit, gitStatus, gitAdd, gitDiff, gitPull, gitBranch,
    deployInfo, deployGithubPages,
    searchNpm, searchPypi,
    listTemplates, projectDir, pm2Name,
}
