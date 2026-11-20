'use strict'

const parseParams = value => {
    if (typeof value !== 'string' || !value.trim()) return null
    try {
        const parsed = JSON.parse(value)
        return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
        return null
    }
}

const getInteractiveReply = message => {
    if (!message || typeof message !== 'object') return ''

    const directId = message.buttonsResponseMessage?.selectedButtonId ||
        message.buttonResponseMessage?.selectedButtonId ||
        message.templateButtonReplyMessage?.selectedId ||
        message.listResponseMessage?.singleSelectReply?.selectedRowId
    if (typeof directId === 'string' && directId.trim()) return directId.trim()

    const nativeReply = message.interactiveResponseMessage?.nativeFlowResponseMessage ||
        message.nativeFlowResponseMessage
    const params = parseParams(nativeReply?.paramsJson || nativeReply?.buttonParamsJson)
    const id = params?.id || params?.selected_id || params?.selectedButtonId
    return typeof id === 'string' ? id.trim() : ''
}

module.exports = { getInteractiveReply }
