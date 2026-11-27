'use strict'
// 2026-11-27: a working self-update — the old updater pointed at the
// WRONG repo (bera-tech-ai/bera-ai). Library/actions/self-update.js
// targets bera-tech-ai/cloud-bera; .update/.checkupdate/.restart and
// the agent intents bot_update/bot_restart all run through it.
// (Native Yes/No confirmation buttons shipped the same day in
// PRs #69-#72 and were removed hours later at Bera's call: the bot
// runs as a linked device of his own account, and WhatsApp does not
// let a sender tap buttons on their own messages. Confirmation
// previews are plain text again, confirmed by typing the token.)
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { detectIntent } = require('../Library/router')
const selfUpdate = require('../Library/actions/self-update')

test('router: self update/restart phrases classify; lookalikes keep their meanings', () => {
    assert.equal(detectIntent('update yourself'), 'bot_update')
    assert.equal(detectIntent('update'), 'bot_update')
    assert.equal(detectIntent('upgrade to the latest version'), 'bot_update')
    assert.equal(detectIntent('please update the bot'), 'bot_update')
    assert.equal(detectIntent('restart'), 'bot_restart')
    assert.equal(detectIntent('please restart'), 'bot_restart')
    assert.equal(detectIntent('restart yourself'), 'bot_restart')
    assert.equal(detectIntent('restart now'), 'bot_restart')
    // Not the bot talking about itself — existing intents must win.
    assert.notEqual(detectIntent('update my status'), 'bot_update')
    assert.notEqual(detectIntent('restart my project'), 'bot_restart')
    assert.equal(detectIntent('update this message'), 'edit_msg')
})

test('self-update: correct repo, exclusion rules, archive top-folder detection', () => {
    assert.equal(selfUpdate.REPO, 'bera-tech-ai/cloud-bera')
    assert.equal(selfUpdate.isExcluded('session/creds.json'), true)
    assert.equal(selfUpdate.isExcluded('Database/db.json'), true)
    assert.equal(selfUpdate.isExcluded('node_modules/axios/index.js'), true)
    assert.equal(selfUpdate.isExcluded('.env'), true)
    assert.equal(selfUpdate.isExcluded('Library/actions/tts.js'), false)
    assert.equal(selfUpdate.isExcluded('Plugins/updater.js'), false)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bera-zip-'))
    try {
        assert.equal(selfUpdate.findTopFolder(dir), null)
        fs.mkdirSync(path.join(dir, 'cloud-bera-main'))
        assert.equal(selfUpdate.findTopFolder(dir), path.join(dir, 'cloud-bera-main'))
    } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('wiring: previews are plain text (buttons removed); update is owner-gated', () => {
    const handler = fs.readFileSync(path.join(__dirname, '..', 'Handler', 'index.js'), 'utf8')
    assert.doesNotMatch(handler, /parseConfirmationButtonId/)
    const waagent = fs.readFileSync(path.join(__dirname, '..', 'Plugins', 'waagent.js'), 'utf8')
    assert.match(waagent, /replyPreview\(conn, m, reply, formatPreview\(action, token\), token\)/)
    assert.doesNotMatch(waagent, /sendNativeButtons|confirmationButtons/)
    const dispatch = fs.readFileSync(path.join(__dirname, '..', 'Library', 'lib', 'agent-dispatch.js'), 'utf8')
    assert.match(dispatch, /'bot_update', 'bot_restart'/)
    assert.match(dispatch, /Updating or restarting the bot is owner-only/)
    assert.match(dispatch, /require\('\.\.\/actions\/self-update'\)/)
    assert.doesNotMatch(dispatch, /sendNativeButtons|confirmationButtons/)
    const updater = fs.readFileSync(path.join(__dirname, '..', 'Plugins', 'updater.js'), 'utf8')
    assert.match(updater, /require\('\.\.\/Library\/actions\/self-update'\)/)
    assert.match(updater, /'restart', 'reboot'/)
    assert.doesNotMatch(updater, /bera-tech-ai\/bera-ai/)
    const btns = require('../Library/actions/btns')
    assert.equal(btns.sendNativeButtons, undefined)
})