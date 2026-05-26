// Plugins/notes.js — Notes system for Bera AI
const handle = async (m, { conn, text, reply, prefix, command, sender, chat, isOwner, args }) => {
    const react = (e) => conn.sendMessage(chat, { react: { text: e, key: m.key } }).catch(() => {})

    if (!global.db.data.notes) global.db.data.notes = {}
    const userNotes = global.db.data.notes[sender] || []

    // ── ADD NOTE ────────────────────────────────────────────────────────
    if (['addnote', 'note', 'savenote', 'remember'].includes(command)) {
        if (!text) return reply(`❌ Usage: ${prefix}addnote <your note>\n\nExample: ${prefix}addnote Buy groceries at 5pm`)
        const note = { id: Date.now(), text: text.trim(), createdAt: new Date().toISOString() }
        if (!global.db.data.notes[sender]) global.db.data.notes[sender] = []
        global.db.data.notes[sender].push(note)
        await global.db.write()
        return reply(`📝 Note saved! (#${global.db.data.notes[sender].length})\n\n"${text.trim()}"`)
    }

    // ── GET ALL NOTES ────────────────────────────────────────────────────
    if (['getnotes', 'notes', 'mynotes', 'listnotes'].includes(command)) {
        const notes = global.db.data.notes[sender] || []
        if (!notes.length) return reply(`📋 You have no saved notes.\nUse ${prefix}addnote <text> to save one.`)
        const list = notes.map((n, i) => `*${i + 1}.* ${n.text}\n    _ID: ${n.id}_`).join('\n\n')
        return reply(`╭══〘 *📝 MY NOTES (${notes.length})* 〙═⊷\n\n${list}\n\n╰══════════════════⊷\nTo delete: ${prefix}delnote <number>`)
    }

    // ── GET SPECIFIC NOTE ─────────────────────────────────────────────────
    if (['getnote', 'viewnote', 'shownote'].includes(command)) {
        const notes = global.db.data.notes[sender] || []
        if (!notes.length) return reply(`📋 You have no saved notes.`)
        const num = parseInt(text?.trim())
        if (isNaN(num) || num < 1 || num > notes.length) return reply(`❌ Invalid note number. You have ${notes.length} note(s).`)
        const n = notes[num - 1]
        return reply(`╭══〘 *📝 NOTE #${num}* 〙═⊷\n\n${n.text}\n\n_Saved: ${new Date(n.createdAt).toLocaleString()}_\n╰══════════════════⊷`)
    }

    // ── DELETE NOTE ───────────────────────────────────────────────────────
    if (['delnote', 'deletenote', 'removenote'].includes(command)) {
        const notes = global.db.data.notes[sender] || []
        if (!notes.length) return reply(`📋 You have no saved notes.`)
        const num = parseInt(text?.trim())
        if (isNaN(num) || num < 1 || num > notes.length) return reply(`❌ Invalid note number. You have ${notes.length} note(s).`)
        const removed = notes.splice(num - 1, 1)[0]
        global.db.data.notes[sender] = notes
        await global.db.write()
        return reply(`✅ Note #${num} deleted:\n"${removed.text}"`)
    }

    // ── DELETE ALL NOTES ──────────────────────────────────────────────────
    if (['delallnotes', 'clearnotes', 'deleteallnotes'].includes(command)) {
        const notes = global.db.data.notes[sender] || []
        if (!notes.length) return reply(`📋 You have no notes to delete.`)
        const count = notes.length
        global.db.data.notes[sender] = []
        await global.db.write()
        return reply(`✅ Deleted all *${count}* of your notes.`)
    }

    // ── ADMIN: VIEW ALL USERS NOTES ───────────────────────────────────────
    if (command === 'allnotes') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const allNotes = global.db.data.notes || {}
        const users = Object.keys(allNotes).filter(u => allNotes[u]?.length)
        if (!users.length) return reply(`📋 No notes saved by anyone yet.`)
        const summary = users.map(u => `• +${u.split('@')[0]}: ${allNotes[u].length} note(s)`).join('\n')
        return reply(`╭══〘 *📝 ALL USERS NOTES* 〙═⊷\n\n${summary}\n\n_Total users with notes: ${users.length}_\n╰══════════════════⊷`)
    }
}

handle.command = [
    'addnote', 'note', 'savenote', 'remember',
    'getnotes', 'notes', 'mynotes', 'listnotes',
    'getnote', 'viewnote', 'shownote',
    'delnote', 'deletenote', 'removenote',
    'delallnotes', 'clearnotes', 'deleteallnotes',
    'allnotes',
]
handle.tags = ['notes']

module.exports = handle
