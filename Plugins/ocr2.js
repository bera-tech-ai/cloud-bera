'use strict'

module.exports = {
    commands: ['ocr', 'readtext'],
    description: 'OCR is disabled until a verified Xcasper OCR endpoint is available.',
    permission: 'public',
    group: true,
    private: true,
    run: async (sock, message, args, ctx) => {
        await ctx.reply('❌ OCR is currently disabled because no verified Xcasper OCR endpoint is available.')
    }
}
