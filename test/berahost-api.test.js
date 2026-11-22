'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')

const calls = []
let pollCount = 0
const server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
        const bodyText = Buffer.concat(chunks).toString()
        calls.push({ method: req.method, url: req.url, key: req.headers['x-api-key'], body: bodyText })
        res.setHeader('content-type', 'application/json')
        if (req.url.endsWith('/forbidden')) {
            res.statusCode = 403
            return res.end(JSON.stringify({ error: 'API key missing required scope' }))
        }
        if (req.url.endsWith('/unauthorized')) {
            res.statusCode = 401
            return res.end(JSON.stringify({ error: 'Invalid or expired API key' }))
        }
        if (req.url === '/api/bots') return res.end(JSON.stringify({ bots: [{ id: 1, name: 'Sample' }] }))
        if (req.url === '/api/deployments/poll-1') {
            pollCount++
            return res.end(JSON.stringify(pollCount === 1 ? { status: 'building' } : { status: 'running', url: 'https://app.example.test' }))
        }
        if (req.url === '/api/deployments' && req.method === 'POST') return res.end(JSON.stringify({ id: 42, status: 'starting' }))
        return res.end(JSON.stringify({ ok: true, method: req.method, url: req.url }))
    })
})

test('BeraHost customer API client uses documented URL, auth, methods, paths, and scope errors', async t => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address()
    process.env.BERAHOST_API_URL = 'https://legacy-host.replit.app'
    global.db = { data: { settings: { bhApiUrl: 'https://legacy-host.replit.app' } } }
    const bh = require('../Library/actions/berahost')
    assert.equal(bh.BH_API(), 'https://berahost-cywge4uc.manus.space/api')

    process.env.BERAHOST_API_URL = `http://127.0.0.1:${port}/api/`
    process.env.BH_API_KEY = 'test-scoped-key'
    delete process.env.BERAHOST_API_KEY
    global.db = undefined
    t.after(async () => {
        server.close()
        delete process.env.BERAHOST_API_URL
        delete process.env.BH_API_KEY
        delete process.env.BERAHOST_API_KEY
    })

    assert.equal(bh.BH_API(), `http://127.0.0.1:${port}/api`)

    const publicBots = await bh.listBots()
    assert.equal(publicBots.success, true)
    assert.deepEqual(publicBots.bots, [{ id: 1, name: 'Sample' }])
    assert.equal(calls.at(-1).url, '/api/bots')
    assert.equal(calls.at(-1).key, undefined)

    const created = await bh.requestCustomerApi('deployment.create', {
        body: { botId: 1, envVars: { SESSION_ID: 'session-value' } }
    })
    assert.equal(created.success, true)
    assert.equal(created.data.id, 42)
    assert.equal(calls.at(-1).method, 'POST')
    assert.equal(calls.at(-1).url, '/api/deployments')
    assert.equal(JSON.parse(calls.at(-1).body).envVars.SESSION_ID, 'session-value')
    assert.equal(calls.at(-1).key, 'test-scoped-key')

    const detail = await bh.requestCustomerApi('deployment.get', { id: 'dep/42' })
    assert.equal(detail.success, true)
    assert.match(calls.at(-1).url, /\/api\/deployments\/dep%2F42$/)

    const polled = await bh.pollDeployment('poll-1', 100, 0)
    assert.equal(polled.success, true)
    assert.equal(polled.deployment.status, 'running')
    assert.equal(polled.deployment.url, 'https://app.example.test')
    assert.equal(pollCount, 2)

    const missingId = await bh.requestCustomerApi('deployment.get', {})
    assert.equal(missingId.success, false)
    assert.match(missingId.error, /Missing required BeraHost parameter: id/)

    const unsupported = await bh.requestCustomerApi('arbitrary.path', {})
    assert.equal(unsupported.success, false)
    assert.match(unsupported.error, /Unsupported BeraHost customer API action/)

    const noScope = await bh.requestCustomerApi('deployment.get', { id: 'forbidden' })
    assert.equal(noScope.success, false)
    assert.match(noScope.error, /403.*required read, write, or payments scope/)

    const badKey = await bh.requestCustomerApi('deployment.get', { id: 'unauthorized' })
    assert.equal(badKey.success, false)
    assert.match(badKey.error, /rejected the API key \(401\)/)

    delete process.env.BH_API_KEY
    const noKey = await bh.requestCustomerApi('deployments')
    assert.equal(noKey.success, false)
    assert.match(noKey.error, /NO_BH_KEY/)
})
