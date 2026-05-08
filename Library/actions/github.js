const axios = require('axios')

const getToken = () =>
    global.db?.data?.settings?.githubToken || process.env.GITHUB_TOKEN || ''

const gh = (endpoint, method = 'GET', data = null) => {
    const token = getToken()
    if (!token) return Promise.resolve({ error: 'No GitHub token set. Tell me your GitHub token like: "my github token is ghp_xxxx"' })
    return axios({
        method,
        url: `https://api.github.com${endpoint}`,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'BeraBot/2.0',
            'X-GitHub-Api-Version': '2022-11-28'
        },
        data,
        timeout: 25000
    }).then(r => r.data).catch(e => ({ error: e.response?.data?.message || e.message }))
}

const getUser        = ()                         => gh('/user')
const getRepo        = (owner, repo)              => gh(`/repos/${owner}/${repo}`)
const listBranches   = (owner, repo)              => gh(`/repos/${owner}/${repo}/branches`)
const searchRepos    = (query)                    => gh(`/search/repositories?q=${encodeURIComponent(query)}&per_page=5`)

const listRepos = async (perPage = 50) => {
    const data = await gh(`/user/repos?per_page=${perPage}&sort=updated&affiliation=owner,collaborator`)
    if (data.error) return data
    return data.map(r => ({ name: r.name, private: r.private, url: r.html_url, updated: r.updated_at, description: r.description, language: r.language }))
}

const createRepo = (name, isPrivate = false, description = '') =>
    gh('/user/repos', 'POST', { name, private: isPrivate, description, auto_init: true })

const deleteRepo = async (owner, repo) => {
    const data = await gh(`/repos/${owner}/${repo}`, 'DELETE')
    return data === '' || data === undefined ? { success: true } : data
}

const listFiles = (owner, repo, filePath = '') =>
    gh(`/repos/${owner}/${repo}/contents/${filePath}`)

const getFile = (owner, repo, filePath) =>
    gh(`/repos/${owner}/${repo}/contents/${filePath}`)

const createFile = async (owner, repo, filePath, content, message = 'Add file via Bera AI') => {
    const encoded = Buffer.from(content).toString('base64')
    return gh(`/repos/${owner}/${repo}/contents/${filePath}`, 'PUT', { message, content: encoded })
}

const updateFile = async (owner, repo, filePath, content, sha, message = 'Update via Bera AI') => {
    const encoded = Buffer.from(content).toString('base64')
    return gh(`/repos/${owner}/${repo}/contents/${filePath}`, 'PUT', { message, content: encoded, sha })
}

const upsertFile = async (owner, repo, filePath, content, message) => {
    const existing = await getFile(owner, repo, filePath)
    if (existing.sha) {
        return updateFile(owner, repo, filePath, content, existing.sha, message || `Update ${filePath} via Bera AI`)
    }
    return createFile(owner, repo, filePath, content, message || `Add ${filePath} via Bera AI`)
}

const pushMultipleFiles = async (owner, repo, files) => {
    const results = []
    for (const { path, content, message } of files) {
        const res = await upsertFile(owner, repo, path, content, message)
        results.push({ path, ok: !res.error, error: res.error })
    }
    return results
}

const createIssue = (owner, repo, title, body = '') =>
    gh(`/repos/${owner}/${repo}/issues`, 'POST', { title, body })

const listIssues = (owner, repo) =>
    gh(`/repos/${owner}/${repo}/issues?state=open&per_page=10`)

const forkRepo = (owner, repo) =>
    gh(`/repos/${owner}/${repo}/forks`, 'POST', {})

const createBranch = async (owner, repo, branchName, fromBranch = 'main') => {
    const ref = await gh(`/repos/${owner}/${repo}/git/ref/heads/${fromBranch}`)
    if (ref.error) return ref
    const sha = ref.object?.sha
    if (!sha) return { error: 'Could not get branch SHA' }
    return gh(`/repos/${owner}/${repo}/git/refs`, 'POST', { ref: `refs/heads/${branchName}`, sha })
}

const getCommits = (owner, repo, perPage = 5) =>
    gh(`/repos/${owner}/${repo}/commits?per_page=${perPage}`)

const getOwner = async () => {
    const user = await getUser()
    return user?.login || null
}

const PROJECT_TEMPLATES = {
    node: {
        label: 'Node.js',
        files: (name) => [
            { path: 'package.json', content: JSON.stringify({ name, version: '1.0.0', description: '', main: 'index.js', scripts: { start: 'node index.js', dev: 'nodemon index.js', test: 'echo "No test yet"' }, keywords: [], author: '', license: 'MIT' }, null, 2) },
            { path: 'index.js', content: `const http = require('http')\n\nconst PORT = process.env.PORT || 3000\n\nconst server = http.createServer((req, res) => {\n  res.writeHead(200, { 'Content-Type': 'application/json' })\n  res.end(JSON.stringify({ message: 'Hello from ${name}!' }))\n})\n\nserver.listen(PORT, () => console.log(\`🚀 ${name} running on port \${PORT}\`))\n` },
            { path: 'README.md', content: `# ${name}\n\nA Node.js project created with Bera AI.\n\n## Getting Started\n\n\`\`\`bash\nnpm install\nnpm start\n\`\`\`\n` },
            { path: '.gitignore', content: 'node_modules/\n.env\n*.log\ndist/\n.DS_Store\n' },
            { path: '.env.example', content: 'PORT=3000\n' }
        ]
    },
    express: {
        label: 'Express API',
        files: (name) => [
            { path: 'package.json', content: JSON.stringify({ name, version: '1.0.0', description: 'Express REST API', main: 'index.js', scripts: { start: 'node index.js', dev: 'nodemon index.js' }, dependencies: { express: '^4.18.0' }, license: 'MIT' }, null, 2) },
            { path: 'index.js', content: `const express = require('express')\nconst app = express()\nconst PORT = process.env.PORT || 3000\n\napp.use(express.json())\n\napp.get('/', (req, res) => res.json({ message: 'Welcome to ${name} API' }))\n\napp.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }))\n\napp.listen(PORT, () => console.log(\`🚀 ${name} API on port \${PORT}\`))\n` },
            { path: 'routes/index.js', content: `const express = require('express')\nconst router = express.Router()\n\nrouter.get('/', (req, res) => res.json({ message: 'Routes working' }))\n\nmodule.exports = router\n` },
            { path: 'README.md', content: `# ${name}\n\nExpress REST API created with Bera AI.\n\n## Setup\n\n\`\`\`bash\nnpm install\nnpm start\n\`\`\`\n\n## Endpoints\n\n| Method | Path | Description |\n|--------|------|-------------|\n| GET | / | Welcome message |\n| GET | /health | Health check |\n` },
            { path: '.gitignore', content: 'node_modules/\n.env\n*.log\n.DS_Store\n' },
            { path: '.env.example', content: 'PORT=3000\n' }
        ]
    },
    python: {
        label: 'Python',
        files: (name) => [
            { path: 'main.py', content: `#!/usr/bin/env python3\n\ndef main():\n    print(f"Hello from ${name}!")\n\nif __name__ == "__main__":\n    main()\n` },
            { path: 'requirements.txt', content: '# Add your dependencies here\n' },
            { path: 'README.md', content: `# ${name}\n\nA Python project created with Bera AI.\n\n## Run\n\n\`\`\`bash\npython main.py\n\`\`\`\n` },
            { path: '.gitignore', content: '__pycache__/\n*.pyc\n*.pyo\n.env\nvenv/\n.DS_Store\n*.egg-info/\ndist/\n' },
            { path: '.env.example', content: '# Environment variables\n' }
        ]
    },
    flask: {
        label: 'Flask API',
        files: (name) => [
            { path: 'app.py', content: `from flask import Flask, jsonify\n\napp = Flask(__name__)\n\n@app.route('/')\ndef index():\n    return jsonify({'message': 'Welcome to ${name}'})\n\n@app.route('/health')\ndef health():\n    return jsonify({'status': 'ok'})\n\nif __name__ == '__main__':\n    app.run(debug=True, port=5000)\n` },
            { path: 'requirements.txt', content: 'flask>=2.0.0\npython-dotenv>=0.19.0\n' },
            { path: 'README.md', content: `# ${name}\n\nFlask REST API created with Bera AI.\n\n## Setup\n\n\`\`\`bash\npip install -r requirements.txt\npython app.py\n\`\`\`\n` },
            { path: '.gitignore', content: '__pycache__/\n*.pyc\n.env\nvenv/\n.DS_Store\n' },
            { path: '.env.example', content: 'FLASK_ENV=development\nPORT=5000\n' }
        ]
    },
    html: {
        label: 'Static Website',
        files: (name) => [
            { path: 'index.html', content: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${name}</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>Welcome to ${name}</h1>\n  <p>Built with Bera AI 🤖</p>\n  <script src="script.js"></script>\n</body>\n</html>\n` },
            { path: 'style.css', content: `* { box-sizing: border-box; margin: 0; padding: 0; }\nbody { font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f0f0f0; }\nh1 { color: #333; margin-bottom: 1rem; }\np { color: #666; }\n` },
            { path: 'script.js', content: `console.log('${name} loaded!')\n` },
            { path: 'README.md', content: `# ${name}\n\nStatic website created with Bera AI.\n\nOpen \`index.html\` in your browser to view.\n` },
            { path: '.gitignore', content: '.DS_Store\nnode_modules/\n' }
        ]
    },
    react: {
        label: 'React App (Vite)',
        files: (name) => [
            { path: 'package.json', content: JSON.stringify({ name, version: '0.0.1', private: true, scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' }, dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' }, devDependencies: { vite: '^5.0.0', '@vitejs/plugin-react': '^4.0.0' } }, null, 2) },
            { path: 'index.html', content: `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${name}</title></head>\n<body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body>\n</html>\n` },
            { path: 'vite.config.js', content: `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nexport default defineConfig({ plugins: [react()] })\n` },
            { path: 'src/main.jsx', content: `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App'\nReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)\n` },
            { path: 'src/App.jsx', content: `export default function App() {\n  return (\n    <div style={{ textAlign:'center', marginTop:'4rem' }}>\n      <h1>${name}</h1>\n      <p>Built with Bera AI 🤖</p>\n    </div>\n  )\n}\n` },
            { path: 'README.md', content: `# ${name}\n\nReact + Vite app created with Bera AI.\n\n## Setup\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n` },
            { path: '.gitignore', content: 'node_modules/\ndist/\n.env\n.DS_Store\n' }
        ]
    },
    bot: {
        label: 'WhatsApp Bot',
        files: (name) => [
            { path: 'package.json', content: JSON.stringify({ name, version: '1.0.0', description: 'WhatsApp Bot', main: 'index.js', scripts: { start: 'node index.js' }, license: 'MIT' }, null, 2) },
            { path: 'index.js', content: `// ${name} — WhatsApp Bot\n// Setup your WhatsApp library here\n\nconsole.log('${name} starting...')\n` },
            { path: 'config.js', content: `module.exports = {\n  prefix: '.',\n  owner: process.env.OWNER_NUMBER || '',\n  botName: '${name}'\n}\n` },
            { path: 'README.md', content: `# ${name}\n\nWhatsApp Bot created with Bera AI.\n\n## Setup\n\n\`\`\`bash\nnpm install\nnpm start\n\`\`\`\n` },
            { path: '.gitignore', content: 'node_modules/\n.env\nsession/\n*.log\n.DS_Store\n' },
            { path: '.env.example', content: 'OWNER_NUMBER=254700000000\n' }
        ]
    }
}

const detectProjectType = (text) => {
    const t = text.toLowerCase()
    if (/\b(react|vite|jsx|frontend)\b/.test(t)) return 'react'
    if (/\b(flask|fastapi|django)\b/.test(t)) return 'flask'
    if (/\b(python|py)\b/.test(t)) return 'python'
    if (/\b(html|css|static|website|landing)\b/.test(t)) return 'html'
    if (/\b(express|api|rest)\b/.test(t)) return 'express'
    if (/\b(bot|whatsapp|wa)\b/.test(t)) return 'bot'
    return 'node'
}

module.exports = {
    getToken, getUser, getOwner, getRepo, listRepos, createRepo, deleteRepo,
    listFiles, getFile, createFile, updateFile, upsertFile, pushMultipleFiles,
    createIssue, listIssues, forkRepo, createBranch, getCommits,
    listBranches, searchRepos, PROJECT_TEMPLATES, detectProjectType
}
