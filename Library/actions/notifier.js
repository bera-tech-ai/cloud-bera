'use strict'
/**
 * Notifier action library — send external notifications.
 * Supports: email (nodemailer), webhooks (HTTP POST), Telegram bots.
 */
const axios = require('axios')

/**
 * Send an email.
 * @param {object} opts
 *   transport: { host, port, secure, user, pass } — SMTP credentials
 *   from: string
 *   to: string
 *   subject: string
 *   text: string
 *   html: string (optional)
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
const sendEmail = async (opts = {}) => {
    let nodemailer
    try { nodemailer = require('nodemailer') } catch {
        return { success: false, error: 'nodemailer not installed. Run: npm install nodemailer' }
    }

    const transport = opts.transport || {}
    if (!transport.user || !transport.pass) {
        return { success: false, error: 'SMTP credentials missing. Provide transport.user and transport.pass.' }
    }

    const transporter = nodemailer.createTransport({
        host: transport.host || 'smtp.gmail.com',
        port: transport.port || 587,
        secure: transport.secure !== undefined ? transport.secure : false,
        auth: { user: transport.user, pass: transport.pass }
    })

    try {
        const info = await transporter.sendMail({
            from: opts.from || transport.user,
            to: opts.to,
            subject: opts.subject || '(No subject)',
            text: opts.text || '',
            html: opts.html || undefined
        })
        return { success: true, messageId: info.messageId }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

/**
 * Call a webhook (POST).
 * @param {string} url  Webhook URL
 * @param {object|string} payload  Body to send
 * @param {object} headers  Optional custom headers
 * @returns {Promise<{ success: boolean, status: number, body: string, error?: string }>}
 */
const callWebhook = async (url, payload = {}, headers = {}) => {
    if (!url || !url.startsWith('http')) {
        return { success: false, status: 0, body: '', error: 'Invalid webhook URL' }
    }

    try {
        const res = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json', ...headers },
            timeout: 10000,
            validateStatus: () => true
        })
        const body = typeof res.data === 'string' ? res.data.slice(0, 2000) : JSON.stringify(res.data).slice(0, 2000)
        return { success: res.status >= 200 && res.status < 300, status: res.status, body }
    } catch (e) {
        return { success: false, status: 0, body: '', error: e.message }
    }
}

/**
 * Send a message via Telegram bot.
 * @param {string} botToken  Telegram bot token
 * @param {string|number} chatId  Telegram chat ID
 * @param {string} text  Message text
 * @returns {Promise<{ success: boolean, messageId?: number, error?: string }>}
 */
const sendTelegram = async (botToken, chatId, text) => {
    if (!botToken || !chatId) return { success: false, error: 'Bot token and chat ID required.' }

    try {
        const res = await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            chat_id: chatId,
            text,
            parse_mode: 'Markdown'
        }, { timeout: 10000 })

        if (res.data?.ok) {
            return { success: true, messageId: res.data.result?.message_id }
        }
        return { success: false, error: res.data?.description || 'Telegram API error' }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

/**
 * Send a Discord webhook message.
 * @param {string} webhookUrl  Discord webhook URL
 * @param {string} content  Message content
 * @param {object} opts  Optional: username, avatar_url, embeds
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
const sendDiscord = async (webhookUrl, content, opts = {}) => {
    if (!webhookUrl?.includes('discord.com/api/webhooks')) {
        return { success: false, error: 'Invalid Discord webhook URL.' }
    }

    try {
        const payload = { content, ...opts }
        const res = await axios.post(webhookUrl, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,
            validateStatus: () => true
        })
        return { success: res.status === 204 || res.status === 200 }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

module.exports = { sendEmail, callWebhook, sendTelegram, sendDiscord }
