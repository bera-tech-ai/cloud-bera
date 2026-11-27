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
    // Previews go through the DIRECT native sender: gifted-btns throws
    // against Baileys v7 and silently degraded to text (live finding
    // 2026-11-27), so confirmations no longer route through sendBtn.
    assert.match(waagent, /sendNativeButtons/)
    assert.match(dispatch, /sendNativeButtons/)
})

test('sendNativeButtons builds a real interactive message with the token ids', async () => {
    const { sendNativeButtons } = require('../Library/actions/btns')
    const relayed = []
    const conn = {
        user: { id: '254116763755@s.whatsapp.net' },
        relayMessage: async (jid, message, opts) => { relayed.push({ jid, message, opts }); return {} },
        sendMessage: async () => { throw new Error('fallback must not run') }
    }
    await sendNativeButtons(conn, '254743982206@s.whatsapp.net', {
        text: 'Confirmation preview — nothing was sent yet', footer: 'Bera AI',
        buttons: waActions.confirmationButtons('AB12CD34')
    })
    assert.equal(relayed.length, 1)
    const im = relayed[0].message.viewOnceMessage.message.interactiveMessage
    assert.match(im.body.text, /Confirmation preview/)
    const params = im.nativeFlowMessage.buttons.map(b => JSON.parse(b.buttonParamsJson))
    assert.deepEqual(params.map(p => p.id), ['wact_confirm_AB12CD34', 'wact_cancel_AB12CD34'])
    assert.match(params[0].display_text, /Yes/)
    // The relay MUST carry WhatsApp's binary wrapper nodes or clients
    // silently drop the buttons: biz > interactive(native_flow) >
    // native_flow(v=9, mixed), plus a bot node in private chats.
    const nodes = relayed[0].opts.additionalNodes
    const biz = nodes.find(n => n.tag === 'biz')
    assert.ok(biz, 'biz wrapper node present')
    const interactive = biz.content.find(n => n.tag === 'interactive')
    assert.equal(interactive.attrs.type, 'native_flow')
    const flow = interactive.content.find(n => n.tag === 'native_flow')
    assert.deepEqual(flow.attrs, { v: '9', name: 'mixed' })
    const bot = nodes.find(n => n.tag === 'bot')
    assert.equal(bot?.attrs?.biz_bot, '1', 'bot node present in a private chat')
})

test('sendNativeButtons omits the bot node in group chats', async () => {
    const { sendNativeButtons } = require('../Library/actions/btns')
    const relayed = []
    const conn = {
        user: { id: '254116763755@s.whatsapp.net' },
        relayMessage: async (jid, message, opts) => { relayed.push({ jid, message, opts }); return {} },
        sendMessage: async () => { throw new Error('fallback must not run') }
    }
    await sendNativeButtons(conn, '120363000000000000@g.us', {
        text: 'Confirmation preview — group', buttons: waActions.confirmationButtons('AB12CD34')
    })
    const nodes = relayed[0].opts.additionalNodes
    assert.ok(nodes.some(n => n.tag === 'biz'), 'biz node present in group')
    assert.ok(!nodes.some(n => n.tag === 'bot'), 'no bot node in group')
})

test('sendNativeButtons falls back to numbered text when relaying fails', async () => {
    const { sendNativeButtons } = require('../Library/actions/btns')
    const sent = []
    const conn = {
        user: { id: '254116763755@s.whatsapp.net' },
        relayMessage: async () => { throw new Error('relay boom') },
        sendMessage: async (jid, content) => { sent.push(content); return {} }
    }
    const origErr = console.error; console.error = () => {}
    try {
        await sendNativeButtons(conn, '254743982206@s.whatsapp.net', {
            text: 'Confirmation preview X', buttons: waActions.confirmationButtons('AB12CD34')
        })
    } finally { console.error = origErr }
    assert.equal(sent.length, 1)
    assert.match(sent[0].text, /Confirmation preview X/)
    assert.match(sent[0].text, /\[1\] ✅ Yes/)
})
