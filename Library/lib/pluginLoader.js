// ── Plugin Loader with Hot Reload ─────────────────────────────────────────────
// Drop .js files into Plugins/ with this shape:
//
//   module.exports = {
//     name: 'my-plugin',
//     description: 'What it does',
//     triggers: ['keyword', /regex/, 'another phrase'],
//     handler: async (ctx) => {
//       // ctx: { text, m, conn, reply, sender, isOwner }
//       return { success: true, output: 'result' }
//     }
//   }
//
// Plugins are hot-reloaded on file save — no bot restart needed.

const fs   = require('fs')
const path = require('path')

const PLUGINS_DIR = path.join(__dirname, '../../Plugins')
const plugins     = new Map()   // name → plugin object
let   watcher     = null

// ── Ensure Plugins/ dir exists ────────────────────────────────────────────────
try { fs.mkdirSync(PLUGINS_DIR, { recursive: true }) } catch {}

// ── Load / reload a single plugin file ───────────────────────────────────────
const loadPlugin = (filePath) => {
    try {
        const resolved = require.resolve(filePath)
        delete require.cache[resolved]
        const plugin = require(filePath)
        if (!plugin || typeof plugin !== 'object' || !plugin.name || typeof plugin.handler !== 'function') {
            // Not a plugin file — skip silently (old-format command files live here too)
            return false
        }
        plugin._file = filePath
        plugin._loaded = Date.now()
        plugins.set(plugin.name, plugin)
        console.log(`[PLUGINS] ✅ Loaded: ${plugin.name}`)
        return true
    } catch (e) {
        // Only warn for files that look like they intend to be plugins
        const name = path.basename(filePath)
        if (!name.startsWith('example') && !name.startsWith('_')) {
            // Silent — many non-plugin files live in Plugins/ folder
        }
        return false
    }
}

// ── Remove a plugin by file path ──────────────────────────────────────────────
const unloadByFile = (filePath) => {
    for (const [name, plugin] of plugins.entries()) {
        if (plugin._file === filePath) {
            plugins.delete(name)
            console.log(`[PLUGINS] 🗑️  Unloaded: ${name}`)
        }
    }
    try { delete require.cache[require.resolve(filePath)] } catch {}
}

// ── Load all plugins from directory ──────────────────────────────────────────
const loadAll = () => {
    plugins.clear()
    try {
        const files = fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js') && !f.startsWith('_'))
        for (const file of files) loadPlugin(path.join(PLUGINS_DIR, file))
    } catch (e) {
        console.error('[PLUGINS] Scan error:', e.message)
    }
    return plugins.size
}

// ── Hot-reload watcher ────────────────────────────────────────────────────────
const startWatcher = () => {
    if (watcher) return
    try {
        watcher = fs.watch(PLUGINS_DIR, { persistent: false }, (event, filename) => {
            if (!filename || !filename.endsWith('.js') || filename.startsWith('_')) return
            const filePath = path.join(PLUGINS_DIR, filename)

            setTimeout(() => {
                if (event === 'rename') {
                    if (fs.existsSync(filePath)) {
                        console.log(`[PLUGINS] 🔄 Hot-loading: ${filename}`)
                        loadPlugin(filePath)
                    } else {
                        unloadByFile(filePath)
                    }
                } else if (event === 'change') {
                    console.log(`[PLUGINS] 🔄 Hot-reloading: ${filename}`)
                    loadPlugin(filePath)
                }
            }, 200) // debounce
        })
        console.log(`[PLUGINS] 👀 Watching ${PLUGINS_DIR} for changes...`)
    } catch (e) {
        console.error('[PLUGINS] Watcher error:', e.message)
    }
}

// ── Match user message to a plugin ───────────────────────────────────────────
const matchPlugin = (text) => {
    if (!text || !plugins.size) return null
    const t = text.toLowerCase().trim()
    for (const [, plugin] of plugins.entries()) {
        const triggers = Array.isArray(plugin.triggers) ? plugin.triggers : []
        for (const trigger of triggers) {
            if (typeof trigger === 'string'  && t.includes(trigger.toLowerCase())) return plugin
            if (trigger instanceof RegExp    && trigger.test(t))                   return plugin
        }
    }
    return null
}

// ── Execute a plugin ──────────────────────────────────────────────────────────
const executePlugin = async (plugin, ctx) => {
    if (typeof plugin.handler !== 'function')
        return { success: false, output: `Plugin '${plugin.name}' has no handler function.` }
    try {
        const result = await plugin.handler(ctx)
        return result || { success: true, output: 'Done' }
    } catch (e) {
        return { success: false, output: `Plugin '${plugin.name}' error: ${e.message}` }
    }
}

// ── List loaded plugins ───────────────────────────────────────────────────────
const getPlugins   = () => [...plugins.values()]
const getPluginMap = () => plugins

// ── Init ──────────────────────────────────────────────────────────────────────
const count = loadAll()
startWatcher()
console.log(`[PLUGINS] Initialized — ${count} plugin(s) ready`)

module.exports = {
    PLUGINS_DIR,
    loadPlugin,
    loadAll,
    startWatcher,
    matchPlugin,
    executePlugin,
    getPlugins,
    getPluginMap
}
