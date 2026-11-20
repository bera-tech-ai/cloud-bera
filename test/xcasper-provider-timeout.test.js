'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const repoRoot = path.resolve(__dirname, '..')
const clientPath = path.join(repoRoot, 'Library/actions/xcasper.js')

const runTimeoutProbe = providerTimeout => {
    const script = `
        const assert = require('node:assert/strict')
        const axios = require('axios')
        const xcasper = require(${JSON.stringify(clientPath)})
        let requestTimeout = null
        axios.get = async (_url, options) => {
            requestTimeout = options.timeout
            return { data: { reply: 'OK' } }
        }
        ;(async () => {
            const result = await xcasper.chat([{ role: 'user', content: 'Reply OK' }], { timeout: 45000 })
            assert.equal(result.success, true)
            assert.equal(result.text, 'OK')
            assert.equal(requestTimeout, ${providerTimeout})
            console.log('XCASPER_PROVIDER_TIMEOUT_OK')
        })().catch(error => { console.error(error); process.exitCode = 1 })
    `
    const env = { ...process.env }
    if (providerTimeout === 30000) delete env.XCASPER_PROVIDER_TIMEOUT_MS
    else env.XCASPER_PROVIDER_TIMEOUT_MS = String(providerTimeout)
    const output = execFileSync(process.execPath, ['-e', script], { cwd: repoRoot, env, encoding: 'utf8' })
    assert.match(output, /XCASPER_PROVIDER_TIMEOUT_OK/)
}

test('Xcasper uses a 30-second default provider timeout and honors its environment override', () => {
    runTimeoutProbe(30000)
    runTimeoutProbe(8000)
})
