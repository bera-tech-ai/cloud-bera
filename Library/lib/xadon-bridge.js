'use strict'

const path = require('path')
const { downloadMediaMessage } = require('@whiskeysockets/baileys')
const packRoot = path.resolve(__dirname, '../xadon-pack')
const loader = require(path.join(packRoot, 'src/loader'))
const ui = require(path.join(packRoot, 'src/lib/ui'))
const premium = require(path.join(packRoot, 'src/lib/premium'))
const config = require(path.join(packRoot, 'config'))
const commands = loader.load()
config.botName = 'Bera AI'
config.ownerName = 'Bera'
if (config.channel) config.channel.name = 'Bera AI Updates'
if (config.ai) config.ai.system = 'You are Bera AI, a helpful WhatsApp assistant. Reply clearly and briefly.'

const BERA_NATIVE_EVAL_FILE = 'owner/eval.js'
const activeCommands = (loader.allCommands || [...commands.values()])
  .filter(cmd => cmd.sourceFile !== BERA_NATIVE_EVAL_FILE && cmd.name !== 'xadon')
const rebrand = text => String(text).replace(/\bXADON(?:\s+AI)?\b/gi, 'Bera AI')
const VISIBLE_TEXT_KEYS = new Set([
  'text', 'caption', 'footer', 'title', 'description', 'name', 'fileName',
  'buttonText', 'displayText', 'newsletterName', 'displayName', 'body', 'payload', 'html'
])
function rebrandContent(value, key = '') {
  if (typeof value === 'string') {
    if (!VISIBLE_TEXT_KEYS.has(key)) return value
    if (key === 'payload' && /^[A-Za-z0-9+/=]+$/.test(value)) {
      try {
        const decoded = Buffer.from(value, 'base64').toString('utf8')
        if (/\bXADON(?:\s+AI)?\b/i.test(decoded)) return Buffer.from(rebrand(decoded)).toString('base64')
      } catch {}
    }
    return rebrand(value)
  }
  if (!value || typeof value !== 'object' || Buffer.isBuffer(value) || value instanceof Uint8Array) return value
  if (Array.isArray(value)) return value.map(item => rebrandContent(item, key))
  return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, rebrandContent(child, childKey)]))
}
function brandedConnection(conn) {
  if (!conn) return conn
  return new Proxy(conn, {
    get(target, key) {
      const value = Reflect.get(target, key, target)
      if (typeof value !== 'function') return value
      if (key === 'sendMessage' || key === 'relayMessage') {
        return (...args) => {
          if (args.length > 1) args[1] = rebrandContent(args[1])
          return value.apply(target, args)
        }
      }
      return value.bind(target)
    }
  })
}

const PRIVILEGED_NAMES = new Set([
  'eval', 'exec', 'shell', 'sh', 'update', 'selfupdate', 'restart', 'reboot',
  'backup', 'restore', 'cleanup', 'clean', 'delvar', 'setvar', 'setenv', 'getenv'
])
const isPrivileged = cmd => Boolean(cmd.owner || cmd.category === 'owner' || PRIVILEGED_NAMES.has(cmd.name))
const enabledPrivileged = cmd => {
  if (!cmd) return false
  const allowlist = new Set(String(process.env.BERA_IMPORTED_PRIVILEGED_ALLOWLIST || '')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean))
  return allowlist.has(String(cmd.sourceFile || '').toLowerCase()) || allowlist.has(String(cmd.sourceId || '').toLowerCase())
}

const xadonDb = {
  get(key, fallback) {
    const state = global.db?.data
    const store = state?.xadon || {}
    return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : fallback
  },
  set(key, value) {
    if (!global.db?.data) throw new Error('Bera database is not initialized')
    if (!global.db.data.xadon) global.db.data.xadon = {}
    global.db.data.xadon[key] = value
    Promise.resolve(global.db.write?.()).catch(error => console.error('[Bera extra commands DB]', error.message))
    return value
  },
  delete(key) {
    if (!global.db?.data?.xadon) return
    delete global.db.data.xadon[key]
    Promise.resolve(global.db.write?.()).catch(error => console.error('[Bera extra commands DB]', error.message))
  },
  all() { return { ...(global.db?.data?.xadon || {}) } }
}

function adaptMessage(m, ctx) {
  const message = Object.create(m || null)
  const raw = m?.message ? { key: m.key, message: m.message, messageTimestamp: m.messageTimestamp, pushName: m.pushName } : m
  const contextInfo = m?.msg?.contextInfo || m?.message?.extendedTextMessage?.contextInfo || {}
  const mentions = contextInfo.mentionedJid || m?.mentionedJid || []
  Object.assign(message, {
    raw,
    key: m?.key,
    id: m?.key?.id,
    chat: ctx.chat,
    sender: ctx.sender,
    number: String(ctx.sender || '').split('@')[0].split(':')[0],
    isGroup: Boolean(ctx.isGroup),
    body: ctx.text || '',
    mentions,
    pushName: m?.pushName || 'User',
    type: m?.mtype || '',
    message: m?.message || {},
    isMedia: Boolean(m?.mimetype && !String(m.mimetype).startsWith('text/')),
    download: async () => downloadMediaMessage(raw, 'buffer', {}),
    quoted: m?.quoted ? {
      ...m.quoted,
      body: m.quoted.body || m.quoted.text || '',
      mentions: m.quoted.mentionedJid || [],
      download: async () => {
        const quotedRaw = { key: m.quoted.key, message: m.quoted.message }
        return downloadMediaMessage(quotedRaw, 'buffer', {})
      }
    } : null
  })
  return message
}

function makeContext(cmd, m, ctx, override = {}) {
  const args = override.args || ctx.args || []
  const text = override.text ?? args.join(' ')
  const xadonMessage = adaptMessage(m, { ...ctx, text })
  const safeConn = brandedConnection(ctx.conn)
  const mentions = xadonMessage.mentions || []
  const target = () => mentions[0] || xadonMessage.quoted?.sender ||
    (args.find(value => /^@?\+?\d{7,15}$/.test(value || '')) || '').replace(/\D/g, '')
  return {
    sock: safeConn,
    conn: safeConn,
    m: xadonMessage,
    args,
    text,
    rawText: ctx.text || text,
    command: override.command || (ctx.command && ctx.command !== 'beraextra' ? ctx.command : cmd.name),
    used: ctx.command,
    prefix: ctx.prefix,
    isOwner: Boolean(ctx.isOwner),
    isHardOwner: Boolean(ctx.isOwner),
    isMod: false,
    isSudo: Boolean(ctx.isSudo),
    role: ctx.role,
    isAdmin: Boolean(ctx.isSenderAdmin),
    isBotAdmin: Boolean(ctx.isBotAdmin),
    group: ctx.metadata || null,
    target,
    reply: (value, extra = {}) => ctx.reply(typeof value === 'string' ? rebrand(value) : value, rebrandContent(extra)),
    fail: (_title, value) => ctx.reply(rebrand(String(value || _title || 'Command failed.'))),
    db: xadonDb,
    ui,
    config,
    premium,
    stats: global.db?.data?.stats || {},
    loader,
    ...override
  }
}

async function invoke(cmd, m, ctx, argsOverride) {
  if (cmd.sourceFile === BERA_NATIVE_EVAL_FILE) return ctx.reply('Use Bera owner commands .eval, .>, .#, or .sh for code and shell execution.')
  const privileged = isPrivileged(cmd)
  if (privileged && !enabledPrivileged(cmd)) {
    return ctx.reply(`⛔ Owner command *${cmd.name}* is disabled until reviewed. Add only its source path (${cmd.sourceFile}) to BERA_IMPORTED_PRIVILEGED_ALLOWLIST after review.`)
  }
  if (privileged && !ctx.isOwner) return ctx.reply('⛔ This command is restricted to the Bera owner.')
  if (cmd.group && !ctx.isGroup) return ctx.reply('⛔ This command is available in groups only.')
  if (cmd.admin && !ctx.isSenderAdmin && !ctx.isOwner) return ctx.reply('⛔ This command requires group admin privileges.')
  if (cmd.botAdmin && !ctx.isBotAdmin) return ctx.reply('⛔ Bera needs to be a group admin to use this command.')
  const args = argsOverride?.args || ctx.args || []
  const xctx = makeContext(cmd, m, ctx, { ...(argsOverride || {}), args })
  if (typeof cmd.run === 'function') return cmd.run(xctx)
  if (typeof cmd.execute === 'function') return cmd.execute(xctx.conn, xctx.m, { ...xctx, sock: xctx.conn, m: xctx.m })
  return ctx.reply('⛔ This imported command has no supported entry point.')
}

const wrapped = new Map()
for (const cmd of activeCommands) {
  const handler = async (m, ctx) => invoke(cmd, m, ctx)
  handler.command = [cmd.name, ...(cmd.alias || []).filter(alias => !/xadon/i.test(String(alias)))]
  handler.importedMeta = cmd
  wrapped.set(cmd.sourceFile || cmd.sourceId || cmd.name, handler)
}

async function namespaceHandler(m, ctx) {
  const [requested, ...rest] = ctx.args || []
  if (!requested || ['help', 'list'].includes(String(requested).toLowerCase())) {
    const page = Math.max(1, Number(rest[0]) || 1)
    const size = 100
    const items = activeCommands.slice((page - 1) * size, page * size)
    const names = items.map(cmd => /xadon/i.test(cmd.sourceFile) ? cmd.name : `${cmd.sourceFile} (${cmd.name})`)
    return ctx.reply(`Bera extra commands: ${activeCommands.length} · page ${page}/${Math.max(1, Math.ceil(activeCommands.length / size))}\n${names.join('\n')}\n\nUsage: ${ctx.prefix}beraextra <command-or-path> [arguments]`)
  }
  const key = String(requested).toLowerCase().replace(/\.js$/, '')
  const visibleAliases = cmd => (cmd.alias || []).map(alias => String(alias).toLowerCase()).filter(alias => !/xadon/i.test(alias))
  const cmd = activeCommands.find(item => item.sourceFile.replace(/\.js$/, '').toLowerCase() === key || item.sourceId === key) ||
    activeCommands.find(item => item.name === key) ||
    activeCommands.find(item => visibleAliases(item).includes(key)) ||
    (['eval', '>', '#', 'sh'].includes(key) ? loader.find(key) : null)
  if (!cmd || cmd.name === 'xadon') return ctx.reply('Unknown Bera extra command. Use .beraextra list to browse commands.')
  const aliases = visibleAliases(cmd)
  const aliasRequested = String(requested).toLowerCase() !== cmd.name && aliases.includes(String(requested).toLowerCase())
  const aliasArg = rest[0] && aliases.includes(String(rest[0]).toLowerCase())
  const command = aliasRequested ? String(requested).toLowerCase() : aliasArg ? String(rest[0]).toLowerCase() : cmd.name
  const args = aliasArg && !aliasRequested ? rest.slice(1) : rest
  return invoke(cmd, m, { ...ctx, command, args, text: args.join(' ') }, { args, text: args.join(' '), command })
}
namespaceHandler.command = ['beraextra']

function register(map) {
  const beraOwnsNamespace = map.has('beraextra')
  let direct = 0
  for (const [name, cmd] of commands) {
    if (cmd.sourceFile === BERA_NATIVE_EVAL_FILE || /xadon/i.test(name)) continue
    const handler = wrapped.get(cmd.sourceFile || cmd.sourceId || name)
    if (!handler) continue
    if (!map.has(name)) { map.set(name, handler); direct++ }
    for (const alias of handler.command.slice(1)) {
      const key = String(alias).toLowerCase()
      if (!/xadon/i.test(key) && !map.has(key)) map.set(key, handler)
    }
  }
  if (!beraOwnsNamespace) map.set('beraextra', namespaceHandler)
  return { total: activeCommands.length, direct, privileged: activeCommands.filter(isPrivileged).length }
}

module.exports = { register, commands, allCommands: activeCommands, wrapped, isPrivileged, enabledPrivileged, rebrandContent }
