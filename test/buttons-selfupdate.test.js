'use strict'
// 2026-11-27, two features Bera asked for together:
// (1) Native Yes/No buttons on staged-action confirmations — a tap on
//     "✅ Yes — do it" runs the same single-use token path as typing
//     ".wact confirm <token>"; the typed commands stay as fallback.
// (2) A working self-update: the old updater pointed at the WRONG repo
//     (bera-tech-ai/bera-ai). Library/actions/self-update.js targets
//     bera-tech-ai/cloud-bera; .update/.checkupdate/.restart and the
//     agent intents bot_update/bot_restart all run through it.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const waActions = require('../Library/lib/wa-actions')
const { detectIntent } = require('../Library/router')
const selfUpdate = require('../Library/actions/self-update')

test('confirmation buttons: shape, round-trip parse, junk rejected', () => {
    const buttons = waActions.confirmationButtons('AB12CD34')
    assert.deepEqual(buttons.map(b => b.id), ['wact_confirm_AB12CD34', 'wact_cancel_AB12CD34'])
    assert.match(buttons[0].text, /Yes/)
    assert.match(buttons[1].text, /No/)
    assert.deepEqual(waActions.parseConfirmationButtonId('wact_confirm_AB12CD34'), { kind: 'confirm', token: 'AB12CD34' })
    assert.deepEqual(waActions.parseConfirmationButtonId('wact_cancel_AB12CD34'), { kind: 'cancel', token: 'AB12CD34' })
    assert.equal(waActions.parseConfirmationButtonId('play_pick_1'), null)
    assert.equal(waActions.parseConfirmationButtonId('wact_confirm_'), null)
    assert.equal(waActions.parseConfirmationButtonId(''), null)
    assert.equal(waActions.parseConfirmationButtonId(undefined), null)
})

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

test('wiring: taps route through executeConfirmed; previews carry buttons; update is owner-gated', () => {
    const handler = fs.readFileSync(path.join(__dirname, '..', 'Handler', 'index.js'), 'utf8')
    assert.match(handler, /parseConfirmationButtonId\(btnId\)/)
    assert.match(handler, /executeConfirmed\(conn, sender, _wactTap\.token\)/)
    const waagent = fs.readFileSync(path.join(__dirname, '..', 'Plugins', 'waagent.js'), 'utf8')
    assert.match(waagent, /replyPreview\(conn, m, reply, formatPreview\(action, token\), token\)/)
    assert.match(waagent, /confirmationButtons\(token\)/)
    const dispatch = fs.readFileSync(path.join(__dirname, '..', 'Library', 'lib', 'agent-dispatch.js'), 'utf8')
    assert.match(dispatch, /'bot_update', 'bot_restart'/)
    assert.match(dispatch, /Updating or restarting the bot is owner-only/)
    assert.match(dispatch, /require\('\.\.\/actions\/self-update'\)/)
    assert.match(dispatch, /confirmationButtons\(token\)/)
    const updater = fs.readFileSync(path.join(__dirname, '..', 'Plugins', 'updater.js'), 'utf8')
    assert.match(updater, /require\('\.\.\/Library\/actions\/self-update'\)/)
    assert.match(updater, /'restart', 'reboot'/)
    assert.doesNotMatch(updater, /bera-tech-ai\/bera-ai/)
})
