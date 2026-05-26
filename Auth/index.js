const config = require('../Config')

const isAuthorized = (sender) => {
    const db = global.db
    const phoneNumber = sender.split('@')[0].split(':')[0]
    const ownerNumber = config.owner.replace(/[^0-9]/g, '')
    if (phoneNumber === ownerNumber) return { authorized: true, isOwner: true }
    const user = db.data?.users?.[sender]
    if (user?.banned) return { authorized: false, isOwner: false }
    const mode = db.data?.settings?.mode || 'public'
    if (mode === 'public') return { authorized: true, isOwner: false }
    // Private mode — also allow sudo users
    const sudoList = db.data?.sudo || []
    const isSudo = sudoList.includes(sender) || sudoList.includes(phoneNumber + '@s.whatsapp.net')
    if (isSudo) return { authorized: true, isOwner: false }
    return { authorized: false, isOwner: false }
}

module.exports = { isAuthorized }
