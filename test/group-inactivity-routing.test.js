const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { detectIntent } = require('../Library/router')
const { parseGroupInactiveRequest } = require('../Library/actions/command-intent')
const { generateAdvancedReply } = require('../Library/actions/beraai')
const activity = require('../Library/xadon-pack/src/lib/cody/plugin_groupActivity')

const group = '1234567890-123456@g.us'

const withTempCwd = async (fn) => {
  const original = process.cwd()
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bera-group-activity-'))
  try {
    process.chdir(directory)
    return await fn()
  } finally {
    process.chdir(original)
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

test('the reported WhatsApp request routes to group activity, not generic chat', () => {
  const request = 'I need to know all inactive member in this group'
  assert.equal(detectIntent(request), 'group_activity')
  assert.deepEqual(parseGroupInactiveRequest(request), { days: 30 })
  assert.deepEqual(parseGroupInactiveRequest('List members with no activity in the past 2 weeks'), { days: 14 })
  assert.equal(parseGroupInactiveRequest('Tell me about group members'), null)
})

test('the exact request produces a read-only inactive list from observed history', async () => {
  await withTempCwd(async () => {
    const now = Date.now()
    const old = now - 31 * 24 * 60 * 60 * 1000
    const originalNow = Date.now
    const staleId = '1111111111@s.whatsapp.net'
    const activeId = '2222222222@s.whatsapp.net'
    Date.now = () => old
    try {
      activity.trackGroupMessage(
        { chat: group, sender: staleId },
        { key: { remoteJid: group, participant: staleId, id: 'stale-message' }, message: { conversation: 'older message' } }
      )
    } finally {
      Date.now = originalNow
    }
    activity.trackGroupMessage(
      { chat: group, sender: activeId },
      { key: { remoteJid: group, participant: activeId, id: 'recent-message' }, message: { conversation: 'recent message' } }
    )

    const conn = {
      groupMetadata: async () => ({
        subject: 'Test group',
        participants: [
          { id: staleId, pushName: 'Inactive Member' },
          { id: activeId, pushName: 'Active Member' },
        ],
      }),
    }
    const message = { chat: group, sender: '3333333333@s.whatsapp.net', isGroup: true }
    const result = await generateAdvancedReply('I need to know all inactive member in this group', group, conn, message)
    assert.equal(result.success, true)
    assert.match(result.reply, /Members with no recorded messages in the last 30 days: 1 of 2/)
    assert.match(result.reply, /Inactive Member/)
    assert.doesNotMatch(result.reply, /Active Member/)
    assert.match(result.reply, /Read-only — no members were removed/)
  })
})

test('the report does not guess when 30 days of history are not available', async () => {
  await withTempCwd(async () => {
    const conn = {
      groupMetadata: async () => ({ participants: [{ id: '1111111111@s.whatsapp.net', pushName: 'New member' }] }),
    }
    const message = { chat: group, sender: '2222222222@s.whatsapp.net', isGroup: true }
    const result = await generateAdvancedReply('Show inactive members in this group', group, conn, message)
    assert.equal(result.success, true)
    assert.match(result.reply, /can’t reliably identify members inactive for 30 days yet/i)
    assert.match(result.reply, /No activity history has been recorded/i)
    assert.match(result.reply, /read-only and will not remove anyone/i)
  })
})
