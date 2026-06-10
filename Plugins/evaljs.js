'use strict';

const { exec } = require('child_process');

function shell(cmd, opts = {}) {
    return new Promise((resolve) => {
        exec(cmd, { timeout: 15000, maxBuffer: 1024 * 1024 * 4, ...opts }, (err, stdout, stderr) => {
            resolve({ stdout: stdout || '', stderr: stderr || '', err });
        });
    });
}

function makeCapture() {
    const logs = [];
    const logger = (...args) => logs.push(args.map(a =>
        typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
    ).join(' '));
    return { logger, getLogs: () => logs.join('\n') };
}

module.exports = {
    commands:    ['eval', 'exec', '$', 'js'],
    description: 'Execute JavaScript with full bot access (owner only)',
    usage:       '.eval <code>',
    permission:  'owner',
    group:       true,
    private:     true,

    run: async (sock, message, args, ctx) => {
        const { jid, contextInfo, isOwner, reply, conn } = ctx;
        if (!isOwner) return reply('⛔ Owner only.');

        const code = args.join(' ').trim();
        if (!code) return sock.sendMessage(jid, {
            text: '❌ No code given.\n\n*Examples:*\n`.eval sock.user`\n`.eval global.db.data.stats`\n`.eval require("fs").readdirSync("Plugins").length`',
            contextInfo
        }, { quoted: message });

        const start = Date.now();
        let result, isError = false;
        const { logger, getLogs } = makeCapture();

        try {
            const _eval = eval;
            const _result = await _eval(`(async () => {
                const console = { log: logger, error: logger, warn: logger, info: logger };
                ${code}
            })()`);
            const logs = getLogs();
            result = logs || _result;
        } catch (e) {
            result   = `${e.constructor?.name || 'Error'}: ${e.message}`;
            isError  = true;
        }

        const elapsed = Date.now() - start;
        const label   = isError ? '❌ Error' : '✅ Result';
        const out     = result === undefined ? 'undefined'
                      : typeof result === 'object' ? JSON.stringify(result, null, 2)
                      : String(result);
        const trimmed = out.length > 3500 ? out.slice(0, 3500) + '\n…[truncated]' : out;

        return sock.sendMessage(jid, {
            text: `${label} _(${elapsed}ms)_\n\`\`\`\n${trimmed}\n\`\`\``,
            contextInfo
        }, { quoted: message });
    }
};
