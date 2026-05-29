'use strict'
// ── Per-user shell session — tracks cwd, history, and active project ──────────
const fs   = require('fs')
const path = require('path')
const { exec } = require('child_process')

const WORKSPACE_ROOT = process.env.BERA_WORKSPACE || '/workspace'
const sessions = new Map()   // userId → session

const getOrCreate = (userId) => {
    if (!sessions.has(userId)) {
        const uid = String(userId || 'shared').replace(/@.+/, '').replace(/[^a-zA-Z0-9_-]/g, '_')
        const cwd = path.join(WORKSPACE_ROOT, uid)
        try { fs.mkdirSync(cwd, { recursive: true }) } catch {}
        sessions.set(userId, {
            uid,
            cwd,
            history:    [],
            activeProject: null,
            env:        {},
            createdAt:  Date.now(),
            lastActive: Date.now(),
        })
    }
    return sessions.get(userId)
}

const getSession = (userId) => getOrCreate(userId)

const setCwd = (userId, newCwd) => {
    const s = getOrCreate(userId)
    s.cwd = newCwd
    s.lastActive = Date.now()
}

const setProject = (userId, projectName, projectDir) => {
    const s = getOrCreate(userId)
    s.activeProject = projectName
    if (projectDir) s.cwd = projectDir
    s.lastActive = Date.now()
}

const addHistory = (userId, cmd, output) => {
    const s = getOrCreate(userId)
    s.history.push({ cmd, output: (output || '').slice(0, 200), at: Date.now() })
    if (s.history.length > 50) s.history = s.history.slice(-50)
    s.lastActive = Date.now()
}

const resetSession = (userId) => {
    sessions.delete(userId)
    return getOrCreate(userId)
}

// Run a command in session context, handle `cd` specially
const runInSession = (userId, rawCmd, timeout = 30000) => {
    const s = getOrCreate(userId)

    // Handle cd specially — update session cwd
    const cdMatch = rawCmd.trim().match(/^cd\s+(.+)$/)
    if (cdMatch) {
        let target = cdMatch[1].trim().replace(/^["']|["']$/g, '')
        if (!path.isAbsolute(target)) target = path.resolve(s.cwd, target)
        if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
            s.cwd = target
            s.lastActive = Date.now()
            addHistory(userId, rawCmd, `Now in: ${target}`)
            return Promise.resolve({ success: true, output: `📁 ${target}`, cwd: target })
        }
        return Promise.resolve({ success: false, output: `❌ Directory not found: ${target}`, cwd: s.cwd })
    }

    // Build composite command that runs in the session cwd + applies session env
    const envStr = Object.entries(s.env).map(([k, v]) => `export ${k}="${v.replace(/"/g, '\\"')}"`).join('; ')
    const fullCmd = envStr ? `cd "${s.cwd}" && ${envStr} && ${rawCmd}` : `cd "${s.cwd}" && ${rawCmd}`

    return new Promise(resolve => {
        exec(fullCmd, { timeout, maxBuffer: 1024 * 1024 * 4 }, (err, stdout, stderr) => {
            const out = [(stdout || '').trim(), stderr ? `[stderr] ${stderr.trim()}` : ''].filter(Boolean).join('\n').slice(0, 3000)
            const result = { success: !err || err.killed === false, output: out || (err ? err.message : 'done'), cwd: s.cwd }
            addHistory(userId, rawCmd, result.output)
            resolve(result)
        })
    })
}

const getHistory = (userId, n = 10) => {
    const s = getOrCreate(userId)
    return s.history.slice(-n)
}

const sessionInfo = (userId) => {
    const s = getOrCreate(userId)
    return {
        uid:           s.uid,
        cwd:           s.cwd,
        activeProject: s.activeProject,
        historyCount:  s.history.length,
        uptime:        Math.round((Date.now() - s.createdAt) / 1000 / 60) + 'm',
        lastActive:    new Date(s.lastActive).toLocaleTimeString()
    }
}

module.exports = { getSession, setCwd, setProject, resetSession, runInSession, addHistory, getHistory, sessionInfo }
