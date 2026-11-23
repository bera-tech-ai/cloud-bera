const config = require('../Config')

const isAuthorized = (sender) => {
    const db = global.db
    const senderValues = typeof sender === 'string'
        ? [sender]
        : [sender?.sender, ...(sender?.alternates || [])].filter(Boolean)
    const phoneNumbers = senderValues.map(value => String(value).split('@')[0].split(':')[0].replace(/[^0-9]/g, '')).filter(Boolean)
    const phoneNumber = phoneNumbers[0] || ''
    const ownerNumber = config.owner.replace(/[^0-9]/g, '')
    if (phoneNumbers.includes(ownerNumber)) return { authorized: true, isOwner: true }
    const user = db.data?.users?.[senderValues[0]]
    if (user?.banned) return { authorized: false, isOwner: false }
    const mode = db.data?.settings?.mode || 'public'
    if (mode === 'public') return { authorized: true, isOwner: false }
    // Private mode — also allow sudo users
    const sudoList = db.data?.settings?.sudo || []
    const isSudo = senderValues.some(value => sudoList.includes(value)) || phoneNumbers.some(number => sudoList.includes(number + '@s.whatsapp.net'))
    if (isSudo) return { authorized: true, isOwner: false }
    return { authorized: false, isOwner: false }
}

module.exports = { isAuthorized }
