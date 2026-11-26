'use strict'

// Bring-your-own credentials: per-user GitHub tokens / BeraHost keys live in
// global.db.data.userSecrets[bareNumber]. Resolution rules under test:
//   own linked credential wins → owner-only global fallback → '' / null for
//   a non-owner with nothing linked (never the owner's account).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const axios = require('axios')

const github = require('../Library/actions/github')
const berahost = require('../Library/actions/berahost')
const githubPlugin = require('../Plugins/github')
const { lifecycle } = require('../Library/actions/project-lifecycle')
const ownerBare = String(require('../Config').owner || '').replace(/[^0-9]/g, '')

const USER = '254700000099'
const USER_JID = `${USER}@s.whatsapp.net`
const OWNER_JID = `${ownerBare}@s.whatsapp.net`

const ENV_KEYS = ['GITHUB_TOKEN', 'GIT_TOKEN', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'BH_API_KEY', 'BERAHOST_API_KEY']

const withStubDb = async (data, fn) => {
    const previousDb = global.db
    const savedEnv = {}
    for (const key of ENV_KEYS) { savedEnv[key] = process.env[key]; delete process.env[key] }
    global.db = { data, write: async () => {} }
    try { return await fn() } finally {
        global.db = previousDb
        for (const key of ENV_KEYS) {
            if (savedEnv[key] === undefined) delete process.env[key]
            else process.env[key] = savedEnv[key]
        }
    }
}

const baseData = () => ({
    settings: { githubToken: 'ghp_global_owner', bhApiKey: 'bh_global_owner' },
    userSecrets: {
        [USER]: { githubToken: 'ghp_user_own', berahostKey: 'bh_user_own' }
    }
})

test('getTokenFor: owner without a linked token falls back to the global token', async () => {
    await withStubDb(baseData(), async () => {
        assert.equal(github.getTokenFor(OWNER_JID), 'ghp_global_owner')
        assert.equal(github.getToken(), 'ghp_global_owner')
    })
})

test('getTokenFor: a linked per-user token wins, for owner and non-owner alike', async () => {
    const data = baseData()
    data.userSecrets[ownerBare] = { githubToken: 'ghp_owner_linked' }
    await withStubDb(data, async () => {
        assert.equal(github.getTokenFor(OWNER_JID), 'ghp_owner_linked')
        assert.equal(github.getTokenFor(USER_JID), 'ghp_user_own')
        // Bare numbers and device-suffixed JIDs resolve to the same entry.
        assert.equal(github.getTokenFor(USER), 'ghp_user_own')
        assert.equal(github.getTokenFor(`${USER}:4@s.whatsapp.net`), 'ghp_user_own')
    })
})

test('getTokenFor: non-owner with no token of their own gets an empty string — never the owner token', async () => {
    await withStubDb(baseData(), async () => {
        assert.equal(github.getTokenFor('254700000077@s.whatsapp.net'), '')
    })
})

test('getTokenFor: no specific requester keeps the historical global behaviour', async () => {
    await withStubDb(baseData(), async () => {
        assert.equal(github.getTokenFor(), 'ghp_global_owner')
        assert.equal(github.getTokenFor('shared'), 'ghp_global_owner')
    })
})

test('getKeyFor mirrors getTokenFor for BeraHost keys', async () => {
    const data = baseData()
    data.userSecrets[ownerBare] = { berahostKey: 'bh_owner_linked' }
    await withStubDb(data, async () => {
        assert.equal(berahost.getKeyFor(OWNER_JID), 'bh_owner_linked')
        assert.equal(berahost.getKeyFor(USER_JID), 'bh_user_own')
        assert.equal(berahost.getKeyFor('254700000077@s.whatsapp.net'), null)
        assert.equal(berahost.getKeyFor(), 'bh_global_owner')
        assert.equal(berahost.getKeyFor('shared'), 'bh_global_owner')
    })
    const noLinkedOwner = baseData()
    await withStubDb(noLinkedOwner, async () => {
        assert.equal(berahost.getKeyFor(OWNER_JID), 'bh_global_owner')
    })
})

test('.setghtoken from a non-owner links only their own account', async () => {
    const previousAdapter = axios.defaults.adapter
    axios.defaults.adapter = async config => ({
        data: { login: 'some-user', name: 'Some User', public_repos: 3, followers: 1 },
        status: 200, statusText: 'OK', headers: {}, config
    })
    try {
        await withStubDb({ settings: {}, userSecrets: {} }, async () => {
            const replies = []
            const m = { key: { id: 't' }, isGroup: false }
            const ctx = {
                conn: { sendMessage: async () => {} },
                command: 'setghtoken', args: ['ghp_some_user_token'], text: 'ghp_some_user_token',
                prefix: '.', isOwner: false, chat: USER_JID, sender: USER_JID,
                reply: async value => replies.push(String(value))
            }
            await githubPlugin(m, ctx)
            assert.equal(global.db.data.settings.githubToken, undefined)
            assert.equal(global.db.data.userSecrets[USER].githubToken, 'ghp_some_user_token')
            assert.match(replies.join('\n'), /linked to \*your\* GitHub account/i)
            assert.doesNotMatch(replies.join('\n'), /ghp_some_user_token/)
        })
    } finally { axios.defaults.adapter = previousAdapter }
})

test('lifecycle publish gate: non-owner without a token fails honestly and the built project stays intact', async () => {
    const stateFile = path.join(__dirname, '..', 'Database', 'project_lifecycle.json')
    const stateBackup = fs.existsSync(stateFile) ? fs.readFileSync(stateFile, 'utf8') : null
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bera-gate-'))
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><body><main>Gate test</main></body></html>')
    try {
        await withStubDb({ settings: { githubToken: 'ghp_global_owner' }, userSecrets: {} }, async () => {
            const result = await lifecycle({
                userId: USER_JID,
                name: 'gate-test-app',
                projectId: 'gate-test-app-test1',
                projectDir: dir,
                deploy: false
            })
            assert.equal(result.success, false)
            assert.match(result.error, /\.setghtoken/)
            assert.match(result.error, /built and saved locally/i)
            // The record and the locally built project survive the blocked publish.
            assert.equal(result.record.name, 'gate-test-app')
            assert.equal(result.record.github, null)
            assert.equal(result.record.errors.at(-1).error, result.error)
            assert.ok(fs.existsSync(path.join(dir, 'index.html')))
        })
    } finally {
        if (stateBackup === null) { try { fs.unlinkSync(stateFile) } catch {} }
        else fs.writeFileSync(stateFile, stateBackup)
        fs.rmSync(dir, { recursive: true, force: true })
    }
})
