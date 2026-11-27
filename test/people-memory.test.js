// People memory (2026-11-27): Bera AI had a per-chat memory the agent
// could write with tools, but nothing learned automatically from
// conversation and people could not see/delete what was stored.
// Library/actions/people-memory.js adds the loop for ChatBera chats:
// strict self-fact extraction after a reply, per-PERSON storage in
// db.data.peopleMemory, prompt recall, and .memory/.forgetme commands.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const pm = require('../Library/actions/people-memory')

const JID = '254700000001@s.whatsapp.net'
const ALT = '111111111111111@lid'

const freshDb = () => {
    let writes = 0
    global.db = { data: {}, write: () => { writes++; return Promise.resolve() } }
    return () => writes
}
const cleanup = () => { delete global.db; delete process.env.BERA_PEOPLE_MEMORY }

test('store: add, dedupe, read back under either JID form, format for prompt', () => {
    freshDb()
    try {
        assert.equal(pm.addFacts(JID, ['Lives in Westlands', 'Runs a barber shop'], ALT, '2026-11-27'), 2)
        // duplicate (case-insensitive) is not stored twice
        assert.equal(pm.addFacts(JID, ['lives in westlands'], ALT, '2026-11-27'), 0)
        const facts = pm.getFacts(ALT, JID) // read with both JID forms, as the Handler passes them
        assert.equal(facts.length, 2)
        assert.equal(facts[0].at, '2026-11-27')
        const prompt = pm.formatForPrompt(JID)
        assert.match(prompt, /Facts I remember about this person:/)
        assert.match(prompt, /- Lives in Westlands/)
    } finally { cleanup() }
})

test('store: cap of 25 facts keeps the newest', () => {
    freshDb()
    try {
        const many = Array.from({ length: 30 }, (_, i) => `Fact number ${i + 1} about this person`)
        pm.addFacts(JID, many.slice(0, 20), null, '2026-11-27')
        pm.addFacts(JID, many.slice(20), null, '2026-11-27')
        const facts = pm.getFacts(JID)
        assert.equal(facts.length, 25)
        assert.equal(facts[facts.length - 1].fact, 'Fact number 30 about this person')
    } finally { cleanup() }
})

test('store: forget removes every JID form', () => {
    freshDb()
    try {
        pm.addFacts(JID, ['Has a dog called Simba'], ALT)
        assert.equal(pm.forgetPerson(ALT, JID), true)
        assert.equal(pm.getFacts(JID).length, 0)
        assert.equal(pm.forgetPerson(JID), false)
    } finally { cleanup() }
})

test('parseExtraction: strict JSON array only, cleaned and capped', () => {
    assert.deepEqual(pm.parseExtraction('["Lives in Westlands","Runs a salon"]'), ['Lives in Westlands', 'Runs a salon'])
    assert.deepEqual(pm.parseExtraction('Here you go: ["Works at a bank in CBD"] hope that helps'), ['Works at a bank in CBD'])
    assert.deepEqual(pm.parseExtraction('[]'), [])
    assert.deepEqual(pm.parseExtraction('no facts here'), [])
    assert.deepEqual(pm.parseExtraction('{"fact":"not an array"}'), [])
    assert.deepEqual(pm.parseExtraction('["ok"]'), []) // too short to be a fact
    assert.equal(pm.parseExtraction('["Fact one here","Fact two here","Fact three here","Fact four here"]').length, 3)
    assert.deepEqual(pm.parseExtraction('[42, "Valid fact here", null]'), ['Valid fact here'])
})

test('learnFromMessage: learns self-facts via the AI call, stores them dated', async () => {
    freshDb()
    try {
        const callAI = async (messages) => {
            assert.match(messages[0].content, /durable facts/i)
            return '["Lives in Westlands", "Runs a barber shop called Kings Kutz"]'
        }
        const res = await pm.learnFromMessage({ jid: JID, altJid: ALT, text: 'I live in Westlands and I run a barber shop called Kings Kutz', callAI })
        assert.equal(res.learned, 2)
        assert.equal(pm.getFacts(JID).length, 2)
    } finally { cleanup() }
})

test('learnFromMessage: gates — short text, plain chat, commands, provider failure, kill switch', async () => {
    freshDb()
    try {
        let calls = 0
        const callAI = async () => { calls++; return '["Some durable fact"]' }
        // too short
        assert.equal((await pm.learnFromMessage({ jid: JID, text: 'my shop', callAI })).learned, 0)
        // no first-person marker → no AI call spent
        assert.equal((await pm.learnFromMessage({ jid: JID, text: 'send it tomorrow morning please', callAI })).learned, 0)
        // a bot command is not conversation
        assert.equal((await pm.learnFromMessage({ jid: JID, text: 'Agent, remember my shop is in Westlands', callAI })).learned, 0)
        assert.equal(calls, 0)
        // provider throws → nothing learned, no crash
        const throwing = async () => { throw new Error('provider down') }
        assert.equal((await pm.learnFromMessage({ jid: JID, text: 'I live in Westlands nowadays', callAI: throwing })).learned, 0)
        // kill switch
        process.env.BERA_PEOPLE_MEMORY = '0'
        assert.equal((await pm.learnFromMessage({ jid: JID, text: 'I live in Westlands nowadays', callAI })).learned, 0)
        assert.equal(pm.formatForPrompt(JID), '')
        delete process.env.BERA_PEOPLE_MEMORY
    } finally { cleanup() }
})

test('agent path: stripTrigger learns facts stated after the "Agent," trigger', async () => {
    freshDb()
    try {
        const callAI = async () => '["Has a shop in Westlands"]'
        // Without stripping, an Agent-prefixed message is a command: no learning.
        assert.equal((await pm.learnFromMessage({ jid: JID, text: 'Agent, my shop is in Westlands, build me a site', callAI })).learned, 0)
        // With stripping (the agent wiring), the fact after the trigger is learned.
        assert.equal((await pm.learnFromMessage({ jid: JID, text: 'Agent, my shop is in Westlands, build me a site', callAI, stripTrigger: true })).learned, 1)
        assert.equal(pm.getFacts(JID)[0].fact, 'Has a shop in Westlands')
    } finally { cleanup() }
})

test('wiring: the AGENT also recalls and learns (generateAdvancedReply), not just ChatBera', () => {
    const beraai = fs.readFileSync(path.join(__dirname, '..', 'Library', 'actions', 'beraai.js'), 'utf8')
    // Recall inside the advanced/agent reply: people facts join Stored memory.
    assert.match(beraai, /peopleMemStr = require\('\.\/people-memory'\)\.formatForPrompt\(m\?\.sender/)
    assert.match(beraai, /const memStr = baseMemStr \+ peopleMemStr/)
    // Learn at the top of the advanced reply, owner sessions excluded.
    assert.match(beraai, /if \(!m\?\.fromMe && m\?\.sender\)/)
    assert.match(beraai, /learnFromMessage\(\{ jid: m\.sender, altJid: m\?\.key\?\.remoteJidAlt, text, stripTrigger: true \}\)/)
})

test('wiring: Handler recalls and learns in the ChatBera branch; beraai merges peopleMemStr; plugin commands exist', () => {
    const handler = fs.readFileSync(path.join(__dirname, '..', 'Handler', 'index.js'), 'utf8')
    assert.match(handler, /people-memory'\)\.formatForPrompt\(sender/)
    assert.match(handler, /peopleMemStr/)
    assert.match(handler, /learnFromMessage\(\{ jid: sender/)
    const beraai = fs.readFileSync(path.join(__dirname, '..', 'Library', 'actions', 'beraai.js'), 'utf8')
    assert.match(beraai, /opts\?\.peopleMemStr/)
    const plugin = fs.readFileSync(path.join(__dirname, '..', 'Plugins', 'people-memory.js'), 'utf8')
    assert.match(plugin, /'memory', 'forgetme'/)
    assert.match(plugin, /isOwner/)
})
