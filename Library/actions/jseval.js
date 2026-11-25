const { exec } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { safeChildEnv } = require('../lib/agent-sandbox')

const BLOCKED = ['process.exit', 'fs.unlink', 'fs.rmSync', 'fs.rmdirSync',
    'child_process', 'process.kill', 'mkfs', 'rm -rf', '__dirname + \'/..']

const evalJS = (code, opts = {}) => {
    return new Promise((resolve) => {
        const isBlocked = BLOCKED.some(b => code.includes(b))
        if (isBlocked) return resolve({ success: false, output: '⛔ Blocked: unsafe operation detected.' })

        // The code runs through eval() inside the child so its completion
        // value is returned (matching the old in-process eval() behaviour:
        // `1 + 1` prints `2`), while statements, console.log and await all
        // keep working. The child process — not the bot process — runs it.
        const wrapped = `
;(async () => {
try {
    const result = await eval(${JSON.stringify(code)})
    if (result !== undefined) {
        process.stdout.write(typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result))
    }
} catch(e) { process.stderr.write('Error: ' + e.message) }
})()
`
        const tmpFile = path.join(os.tmpdir(), `nick_eval_${Date.now()}.js`)
        fs.writeFileSync(tmpFile, wrapped, 'utf8')

        exec(`node "${tmpFile}"`, {
            timeout: 15000,
            maxBuffer: 1024 * 512,
            // Phase 1 sandbox: evaluated code runs without bot credentials.
            env: safeChildEnv(),
            cwd: opts.cwd || process.cwd()
        }, (err, stdout, stderr) => {
            fs.unlink(tmpFile, () => {})
            const out = (stdout || '').trim()
            const errOut = (stderr || '').trim()
            if (out) return resolve({ success: true, output: out })
            if (errOut) return resolve({ success: false, output: errOut })
            resolve({ success: true, output: '(no output)' })
        })
    })
}

module.exports = { evalJS }
