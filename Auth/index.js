const { normalizeJid, normalizePhoneNumber, isDeveloper } = require('../Library/lib/identity')

const isAuthorized = (sender) => {
    const db = global.db
    const normalizedSender = normalizeJid(sender)
    const phoneNumber = normalizePhoneNumber(normalizedSender)
    if (isDeveloper(normalizedSender)) return { authorized: true, isOwner: true }
    const user = db?.data?.users?.[normalizedSender] || db?.data?.users?.[sender]
    if (user?.banned) return { authorized: false, isOwner: false }
    const mode = db?.data?.settings?.mode || 'public'
    if (mode === 'public') return { authorized: true, isOwner: false }
    // Private mode — also allow sudo users
    const sudoList = db?.data?.settings?.sudo || []
    const isSudo = sudoList.some((entry) =>
        normalizeJid(entry) === normalizedSender ||
        normalizePhoneNumber(entry) === phoneNumber
    )
    if (isSudo) return { authorized: true, isOwner: false }
    return { authorized: false, isOwner: false }
}

module.exports = { isAuthorized }
