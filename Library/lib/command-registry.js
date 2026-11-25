'use strict'

// Library/lib/command-registry.js — Spec §18 (Phase 2).
//
// Strict command registry: Bera-vs-Bera name collisions fail loudly instead
// of being silently replaced by a later map.set(), help/menus are generated
// from the effective registry, and imported-command collisions resolve via
// a direct alias or `.beraextra <path>` (bera-command-collision-aliases.md).

class RegistryCollisionError extends Error {
    constructor(collisions) {
        super(`Command registry collision(s): ${collisions.map(c => `${c.name} (${c.owners.join(' vs ')})`).join('; ')}`)
        this.name = 'RegistryCollisionError'
        this.collisions = collisions
    }
}

const handlerLabel = (handler, fallback) => {
    if (!handler) return fallback || 'unknown'
    if (handler.importedMeta) return `imported:${handler.importedMeta.sourceFile || handler.importedMeta.name || 'unknown'}`
    if (typeof handler === 'function') return handler.name || fallback || 'function'
    return handler?.__source || fallback || 'handler'
}

const commandNamesOf = (handler) => {
    const cmds = Array.isArray(handler?.commands) ? handler.commands
        : Array.isArray(handler?.command) ? handler.command
        : [handler?.command].filter(Boolean)
    return [...new Set(cmds.map(c => String(c).toLowerCase()).filter(Boolean))]
}

// Build the registry. In strict mode (default) a name claimed by two
// *different* handlers throws RegistryCollisionError. The same handler
// re-registering the same name (shared aliases) is not a collision.
// In non-strict mode the first handler wins and every collision is
// returned in `collisions` so callers can log it loudly.
const buildCommandMap = (handlers, options = {}) => {
    const strict = options.strict !== false
    const map = new Map()
    const owners = new Map() // name -> { handler, label }
    const collisions = []
    for (const handler of handlers || []) {
        for (const name of commandNamesOf(handler)) {
            const label = handlerLabel(handler, name)
            if (!map.has(name)) {
                map.set(name, handler)
                owners.set(name, { handler, label })
            } else if (owners.get(name).handler !== handler) {
                const existing = owners.get(name)
                if (!collisions.some(c => c.name === name && c.owners.includes(label))) {
                    const entry = collisions.find(c => c.name === name)
                    if (entry) entry.owners.push(label)
                    else collisions.push({ name, owners: [existing.label, label] })
                }
            }
        }
    }
    if (strict && collisions.length) throw new RegistryCollisionError(collisions)
    return { map, collisions }
}

// Parse bera-command-collision-aliases.md into
// name -> { source, aliases: [direct aliases], beraextra: '.beraextra <path>' }.
// Rows with "None" have no direct alias and resolve via .beraextra.
const loadCollisionAliases = (markdown) => {
    const out = new Map()
    for (const line of String(markdown || '').split('\n')) {
        const match = line.match(/^\|\s*`\.([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*(.+?)\s*\|$/)
        if (!match) continue
        const [, name, source, aliasCell] = match
        const aliases = [...aliasCell.matchAll(/`\.([^`]+)`/g)].map(m => m[1].toLowerCase())
            .filter(alias => !/^beraextra\s/i.test(alias))
        out.set(name.toLowerCase(), {
            source,
            aliases,
            beraextra: `.beraextra ${source}`,
            route: aliases.length ? `.${aliases[0]}` : `.beraextra ${source}`,
        })
    }
    return out
}

// Resolve an imported command's invocation route: first direct alias, else
// `.beraextra <source-path>`. `collisionAliases` is the map from
// loadCollisionAliases(); `importedMeta` is a bridge command meta.
const resolveImportedRoute = (name, importedMeta, collisionAliases) => {
    const fromDoc = collisionAliases?.get(String(name || '').toLowerCase())
    if (fromDoc) return fromDoc.route
    const aliases = (importedMeta?.alias || []).map(a => String(a).toLowerCase()).filter(a => !/xadon/i.test(a))
    if (aliases.length) return `.${aliases[0]}`
    const source = importedMeta?.sourceFile || importedMeta?.sourceId
    return source ? `.beraextra ${source}` : `.beraextra ${name}`
}

const describeHandler = (handler) => {
    if (!handler) return ''
    if (handler.importedMeta) return String(handler.importedMeta.desc || handler.importedMeta.description || '')
    const value = [handler.desc, handler.description, handler.help].find(v => typeof v === 'string' && v.trim())
    if (value) return String(value).replace(/\s+/g, ' ').slice(0, 240)
    if (Array.isArray(handler.help)) return handler.help.slice(0, 3).join(' · ')
    return ''
}

const listCommands = (map) => {
    const seen = new Map()
    for (const [name, handler] of map.entries()) {
        const key = handler?.importedMeta ? `imported:${handler.importedMeta.sourceFile || handler.importedMeta.name}` : handler
        if (!seen.has(key)) seen.set(key, { handler, names: [] })
        seen.get(key).names.push(name)
    }
    return [...seen.values()].map(({ handler, names }) => ({
        name: names[0],
        aliases: names.slice(1),
        route: `.${names[0]}`,
        description: describeHandler(handler),
        usage: typeof handler?.usage === 'string' ? handler.usage.slice(0, 160) : '',
        category: typeof handler?.category === 'string' ? handler.category : (Array.isArray(handler?.tags) ? handler.tags[0] : ''),
        source: handler?.importedMeta ? 'Bera extra' : 'Bera',
    })).sort((a, b) => a.name.localeCompare(b.name))
}

// Registry-generated help/menu text. Categories come from handler tags /
// category fields; commands without one land in "General".
const generateHelp = (map, options = {}) => {
    const prefix = options.prefix || '.'
    const commands = listCommands(map)
    const groups = new Map()
    for (const cmd of commands) {
        const category = (cmd.category || 'General').trim() || 'General'
        if (!groups.has(category)) groups.set(category, [])
        groups.get(category).push(cmd)
    }
    const total = commands.reduce((n, cmd) => n + 1 + (cmd.aliases?.length || 0), 0)
    const lines = [`*Bera AI — Commands (${total})*`, '', `Prefix: ${prefix} · Use ${prefix}help <command> for details where supported`, '']
    for (const [category, items] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        lines.push(`*⟨ ${category.toUpperCase()} ⟩*`)
        for (const item of items) lines.push(`❯ ${prefix}${item.name}${item.aliases.length ? ` (${item.aliases.slice(0, 3).map(a => prefix + a).join(', ')})` : ''}${item.description ? ` — ${item.description.slice(0, 80)}` : ''}`)
        lines.push('')
    }
    lines.push(`Imported commands that collide with a Bera command are reached via their direct alias or ${prefix}beraextra <path> — see bera-command-collision-aliases.md.`)
    return lines.join('\n').trim()
}

module.exports = {
    RegistryCollisionError,
    buildCommandMap,
    loadCollisionAliases,
    resolveImportedRoute,
    listCommands,
    generateHelp,
    commandNamesOf,
}
