const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const { executeToolCall, parseToolCalls, generateAdvancedReply } = require('../Library/actions/beraai')

const handlerPath = require.resolve('../Handler')
const withHandlerStub = async (exports, fn) => {
  const previous = require.cache[handlerPath]
  require.cache[handlerPath] = {
    id: handlerPath,
    filename: handlerPath,
    loaded: true,
    exports
  }
  try { return await fn() }
  finally {
    if (previous) require.cache[handlerPath] = previous
    else delete require.cache[handlerPath]
  }
}

test('parser recognizes command search and execution tool aliases', () => {
  const calls = parseToolCalls('[{"tool":"search_commands","query":"movie"},{"tool":"execute_bot_command","command":"tvshow","args":"Dune"}]')
  assert.equal(calls[0].tool, 'find_commands')
  assert.equal(calls[1].tool, 'run_bot_command')
  assert.equal(calls[1].command, 'tvshow')
  assert.equal(calls[1].args, 'Dune')
})

test('command discovery uses the runtime catalog helper and returns its result', async () => {
  await withHandlerStub({ findCommands: (query, limit) => ({ success: true, query, limit, commands: [{ name: 'tvshow', route: '.tvshow' }] }) }, async () => {
    const result = JSON.parse(await executeToolCall({ tool: 'find_commands', query: 'movie', limit: 8 }, 'chat', {}, {}))
    assert.equal(result.query, 'movie')
    assert.equal(result.limit, 8)
    assert.equal(result.commands[0].route, '.tvshow')
  })
})

test('command execution calls only runCommand and requests captured replies', async () => {
  let received
  await withHandlerStub({
    runCommand: async (...args) => {
      received = args
      return { success: true, message: 'Gold price result' }
    }
  }, async () => {
    const message = { sender: '1111111111@s.whatsapp.net' }
    const result = JSON.parse(await executeToolCall({ tool: 'run_bot_command', command: '.gold', args: ['bera'] }, 'chat', {}, message))
    assert.equal(result.message, 'Gold price result')
    assert.equal(received[0], 'gold')
    assert.equal(received[1], 'bera')
    assert.equal(received[2], message)
    assert.equal(received[4].captureOnly, true)
  })
})

test('command execution accepts a full prefixed command line for namespaced routes', async () => {
  let received
  await withHandlerStub({
    runCommand: async (...args) => {
      received = args
      return { success: true, message: 'Namespaced command ran' }
    }
  }, async () => {
    await executeToolCall({ tool: 'run_bot_command', command: '.beraextra titlemaker My title' }, 'chat', {}, { sender: '111@s.whatsapp.net' })
    assert.equal(received[0], 'beraextra')
    assert.equal(received[1], 'titlemaker My title')
    assert.equal(received[4].captureOnly, true)
  })
})

test('raw shell AI tool rejects non-owners before executing', async () => {
  const message = { sender: '1111111111@s.whatsapp.net', key: { remoteJid: '1111111111@s.whatsapp.net' } }
  const result = await executeToolCall({ tool: 'bash', cmd: 'printf SHOULD_NOT_RUN' }, 'chat', {}, message)
  assert.match(result, /restricted to the bot owner/i)
  assert.doesNotMatch(result, /SHOULD_NOT_RUN/)
})

test('natural-language shell pre-dispatch rejects non-owners before running a process', async () => {
  const result = await generateAdvancedReply('shell printf SHOULD_NOT_RUN', 'chat', {}, {
    sender: '1111111111@s.whatsapp.net', key: { remoteJid: '1111111111@s.whatsapp.net' }
  })
  assert.equal(result.success, false)
  assert.match(result.reply, /restricted to the bot owner/i)
})

test('runtime registry finds imported commands and native dispatcher rejects unauthorized shell aliases', () => {
  const root = path.resolve(__dirname, '..')
  const script = String.raw`
    global.db = { data: { settings: { mode: 'public' } } }
    const config = require('./Config')
    let phone = '000000000000'
    if (phone === String(config.owner || '').replace(/\D/g, '')) phone = '111111111111'
    const jid = phone + '@s.whatsapp.net'
    const handler = require('./Handler')
    const search = handler.findCommands('movie', 15)
    const message = { sender: jid, chat: jid, key: { remoteJid: jid } }
    Promise.all([
      handler.runCommand('sh', 'printf SHOULD_NOT_RUN', message, {}, { captureOnly: true }),
      handler.runCommand('agent', 'hello', message, {}, { captureOnly: true }),
      handler.runCommand('beraextra', 'list', message, {}, { captureOnly: true })
    ]).then(([result, recursive, namespace]) => {
        console.log('__AGENT_COMMAND_TEST__' + JSON.stringify({ search, result, recursive, namespace }))
        process.exit(0)
      })
      .catch(error => { console.error(error); process.exit(1) })
  `
  const stdout = execFileSync(process.execPath, ['-e', script], { cwd: root, encoding: 'utf8', timeout: 30000 })
  const marker = stdout.split('\n').find(line => line.startsWith('__AGENT_COMMAND_TEST__'))
  assert.ok(marker, 'integration child returned its result')
  const { search, result, recursive, namespace } = JSON.parse(marker.slice('__AGENT_COMMAND_TEST__'.length))
  assert.ok(search.commands.some(command => command.name === 'movie' && command.route.includes('.tvshow') && command.usage.startsWith('.tvshow ') && /Search films and shows/i.test(command.description)))
  assert.equal(result.success, false)
  assert.match(result.error, /owner|sudo/i)
  assert.equal(recursive.success, false)
  assert.match(recursive.error, /blocked from AI invocation/i)
  assert.equal(namespace.success, true)
  assert.match(namespace.message, /Bera extra commands:/)
})
