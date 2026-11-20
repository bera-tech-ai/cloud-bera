const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const { executeToolCall, parseToolCalls, generateAdvancedReply } = require('../Library/actions/beraai')
const { executeStep } = require('../Library/actions/agent')
const { parseMovieLookupTitle, isGitHubStatusQuery } = require('../Library/actions/command-intent')
const github = require('../Library/actions/github')

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

test('movie lookup parser recognizes search phrasing and keeps only the title', () => {
  assert.equal(parseMovieLookupTitle('search for the movie Dune?'), 'Dune')
  assert.equal(parseMovieLookupTitle('Bera, search for the movie Dune and show me the results'), 'Dune')
  assert.equal(parseMovieLookupTitle('find me a film “Arrival”'), 'Arrival')
  assert.equal(parseMovieLookupTitle('search Dune movie'), 'Dune')
  assert.equal(parseMovieLookupTitle('search the web for movie news'), null)
  assert.equal(isGitHubStatusQuery('Is my GitHub account connected?'), true)
  assert.equal(isGitHubStatusQuery('save my GitHub token'), false)
})

test('Bera AI search-for-movie wording dispatches movie command instead of generic web search', async () => {
  let received
  await withHandlerStub({
    runCommand: async (...args) => {
      received = args
      return { success: true, message: 'Dune movie details' }
    }
  }, async () => {
    const message = { sender: '1111111111@s.whatsapp.net', chat: 'chat' }
    const result = await generateAdvancedReply('Bera, search for the movie Dune and show me the results', 'movie-test-chat', {}, message)
    assert.equal(result.success, true)
    assert.equal(result.reply, 'Dune movie details')
    assert.equal(received[0], 'movie')
    assert.equal(received[1], 'Dune')
    assert.equal(received[2], message)
    assert.equal(received[4].captureOnly, true)
  })
})

test('Agent OS registered-command action dispatches the parsed movie title through Handler', async () => {
  let received
  const title = parseMovieLookupTitle('search for the movie Dune')
  await withHandlerStub({
    runCommand: async (...args) => {
      received = args
      return { success: true, message: 'Dune movie details' }
    }
  }, async () => {
    const message = { sender: '1111111111@s.whatsapp.net' }
    const result = await executeStep({ action: 'run_bot_command', args: { command: 'movie', args: title }, desc: 'movie lookup' }, {}, 'chat', message)
    assert.equal(result.success, true)
    assert.equal(result.output, 'Dune movie details')
    assert.equal(received[0], 'movie')
    assert.equal(received[1], 'Dune')
    assert.equal(received[4].captureOnly, true)
  })
})

test('GitHub status tool reports missing credentials without claiming an account is connected', async () => {
  const previousDb = global.db
  const envNames = ['GITHUB_TOKEN', 'GIT_TOKEN', 'GITHUB_PERSONAL_ACCESS_TOKEN']
  const previousEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]))
  try {
    envNames.forEach(name => delete process.env[name])
    global.db = { data: { settings: {} } }
    const owner = String(require('../Config').owner || '').replace(/\D/g, '') || '0000000000'
    const jid = `${owner}@s.whatsapp.net`
    const message = { sender: jid, chat: jid, key: { remoteJid: jid } }
    const result = await executeToolCall({ tool: 'github', action: 'whoami' }, jid, {}, message)
    assert.match(result, /not connected|no token is configured/i)
    assert.doesNotMatch(result, /authenticated as|full access/i)
    const routed = await generateAdvancedReply('Is my GitHub account connected?', jid, {}, message)
    assert.match(routed.reply, /not connected|no token is configured/i)
    assert.doesNotMatch(routed.reply, /authenticated as|full access/i)
    const agentStatus = await executeStep({ action: 'github_manage', args: { action: 'whoami' }, desc: 'verify GitHub' }, {}, jid, message, { userId: jid })
    assert.equal(agentStatus.success, false)
    assert.match(agentStatus.output, /no GitHub token configured|setghkey/i)
  } finally {
    global.db = previousDb
    for (const name of envNames) {
      if (previousEnv[name] === undefined) delete process.env[name]
      else process.env[name] = previousEnv[name]
    }
  }
})

test('shared GitHub token getter reads the .setghkey database field and compatible environment names', () => {
  const previousDb = global.db
  const envNames = ['GITHUB_TOKEN', 'GIT_TOKEN', 'GITHUB_PERSONAL_ACCESS_TOKEN']
  const previousEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]))
  try {
    envNames.forEach(name => delete process.env[name])
    global.db = { data: { settings: { githubToken: 'unit-test-placeholder' } } }
    assert.equal(github.getToken(), 'unit-test-placeholder')
    global.db.data.settings = { gitToken: 'legacy-placeholder' }
    assert.equal(github.getToken(), 'legacy-placeholder')
    global.db.data.settings = {}
    process.env.GITHUB_PERSONAL_ACCESS_TOKEN = 'env-placeholder'
    assert.equal(github.getToken(), 'env-placeholder')
    process.env.GIT_TOKEN = 'git-token-placeholder'
    assert.equal(github.getToken(), 'git-token-placeholder')
    process.env.GITHUB_TOKEN = 'github-token-placeholder'
    assert.equal(github.getToken(), 'github-token-placeholder')
  } finally {
    global.db = previousDb
    for (const name of envNames) {
      if (previousEnv[name] === undefined) delete process.env[name]
      else process.env[name] = previousEnv[name]
    }
  }
})
