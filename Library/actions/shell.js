const { exec } = require('child_process')
const path = require('path')
const fs = require('fs')

const WORK_DIR = path.resolve('./workspace')
if (!fs.existsSync(WORK_DIR)) fs.mkdirSync(WORK_DIR, { recursive: true })

const run = (cmd, cwd = WORK_DIR, env = {}) => {
    return new Promise((resolve) => {
        exec(cmd, {
            cwd,
            timeout: 120000,
            maxBuffer: 1024 * 1024 * 10,
            env: { ...process.env, ...env }
        }, (err, stdout, stderr) => {
            const out = (stdout || '').trim()
            const errOut = (stderr || '').trim()
            if (err && !out) return resolve({ success: false, output: errOut || err.message })
            resolve({ success: true, output: out || errOut || 'Done.' })
        })
    })
}

const cloneRepo = async (url, folder = null) => {
    const name = folder || url.split('/').pop().replace(/\.git$/, '')
    const dest = path.join(WORK_DIR, name)
    if (fs.existsSync(dest)) return { success: false, output: `Folder "${name}" already exists in workspace.` }
    const res = await run(`git clone "${url}" "${name}"`)
    return { ...res, name }
}

const setupRepoRemote = async (repoFolder, githubUser, repoName, token) => {
    const dir = path.join(WORK_DIR, repoFolder)
    if (!fs.existsSync(dir)) return { success: false, output: `Folder "${repoFolder}" not found.` }

    const remoteUrl = `https://${token}@github.com/${githubUser}/${repoName}.git`

    await run(`git config user.name "Bera Bot"`, dir)
    await run(`git config user.email "bera-bot@github.local"`, dir)

    const remotes = await run(`git remote -v`, dir)
    if (remotes.output.includes('origin')) {
        await run(`git remote set-url origin "${remoteUrl}"`, dir)
    } else {
        await run(`git remote add origin "${remoteUrl}"`, dir)
    }

    const branch = await run(`git branch --show-current`, dir)
    const branchName = (branch.output || 'main').trim()
    await run(`git branch -M ${branchName}`, dir)

    return { success: true, output: `Remote set → github.com/${githubUser}/${repoName} (${branchName})` }
}

const gitPush = async (repoFolder, message = 'Update via Bera Bot') => {
    const dir = path.join(WORK_DIR, repoFolder)
    if (!fs.existsSync(dir)) return { success: false, output: `Repo folder "${repoFolder}" not found in workspace.\n\nWorkspace: ${listWorkspace().join(', ')}` }

    const r1 = await run(`git add -A`, dir)
    if (!r1.success) return r1

    const r2 = await run(`git commit -m "${message.replace(/"/g, "'")}"`, dir)
    if (!r2.success && !r2.output.includes('nothing to commit')) return r2

    const branch = await run(`git branch --show-current`, dir)
    const branchName = (branch.output || 'main').trim()

    const r3 = await run(`git push -u origin ${branchName}`, dir)
    return r3
}

const gitStatus = async (repoFolder) => {
    const dir = path.join(WORK_DIR, repoFolder)
    if (!fs.existsSync(dir)) return { success: false, output: `Folder "${repoFolder}" not found.` }
    return run(`git status`, dir)
}

const gitLog = async (repoFolder, n = 5) => {
    const dir = path.join(WORK_DIR, repoFolder)
    if (!fs.existsSync(dir)) return { success: false, output: `Folder "${repoFolder}" not found.` }
    return run(`git log --oneline -${n}`, dir)
}

const listWorkspace = () => {
    try {
        const items = fs.readdirSync(WORK_DIR).filter(i => fs.statSync(path.join(WORK_DIR, i)).isDirectory())
        return items.length ? items : []
    } catch { return [] }
}

const runShell = async (cmd) => {
    const blocked = ['rm -rf /', 'mkfs', 'dd if=', 'shutdown', 'reboot', 'halt', ':(){:|:&}']
    if (blocked.some(b => cmd.includes(b))) return { success: false, output: '⛔ Blocked command.' }
    return run(cmd)
}

module.exports = { cloneRepo, setupRepoRemote, gitPush, gitStatus, gitLog, listWorkspace, runShell, WORK_DIR }
