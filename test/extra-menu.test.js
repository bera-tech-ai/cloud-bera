const test = require('node:test')
const assert = require('node:assert/strict')
const handle = require('../Commands/general')
const bridge = require('../Library/lib/xadon-bridge')

const runExtraPage = async page => {
  let response = ''
  await handle({ chat: 'test@s.whatsapp.net' }, {
    command: 'extra',
    args: [String(page)],
    prefix: '.',
    reply: async text => { response = String(text) }
  })
  return response
}

test('.extra list is grouped into readable category sections with compact pagination', async () => {
  const response = await runExtraPage(1)
  const pageCount = Math.ceil(bridge.allCommands.length / 20)
  assert.match(response, new RegExp(`Page 1/${pageCount} · ${bridge.allCommands.length} commands`))
  assert.match(response, /\*🧠 AI & AGENT\*/)
  assert.match(response, /❯ \.beraextra /)
  assert.match(response, /\.extra 2 ›/)
  assert.match(response, /Use \.extra <page> to browse/)
  assert.doesNotMatch(response, /XADON/i)
  const commandLines = response.split('\n').filter(line => line.startsWith('❯ '))
  assert.ok(commandLines.length <= 20)
  assert.ok(commandLines.every(line => line.length <= 180), 'command rows should stay compact on WhatsApp')
})

test('.extra later pages include a previous-page route', async () => {
  const response = await runExtraPage(2)
  assert.match(response, /Page 2\//)
  assert.match(response, /‹ \.extra 1/)
  assert.match(response, /\.extra 3 ›/)
})
