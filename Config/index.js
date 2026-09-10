const config = {
    botName: 'Bera',
    prefix: '.',
    owner: process.env.OWNER_NUMBER || '254116763755',
    ownerNumber: process.env.OWNER_NUMBER || '254116763755',
    nickApiEndpoint: process.env.NICK_API || 'https://apiskeith.top/ai/gpt41Nano',
    nickApiEndpointFallback: 'https://apiskeith.top/ai/gpt',
    nickApiKey: process.env.NICK_API_KEY || '',
    sessionDir: './session',
    dbPath: './Database/db.json',
    maxHistory: 20,
    readReceipts: true,
    publicMode: false,
    pterodactylUrl: process.env.PTERODACTYL_URL || '',
    pterodactylKey: process.env.PTERODACTYL_KEY || '',
    pterodactylAppKey: process.env.PTERODACTYL_APP_KEY || '',
    berahostApiKey: process.env.BERAHOST_API_KEY || '',
    berahostApiUrl: process.env.BERAHOST_API_URL || 'https://kingvon-bot-hosting.replit.app/api',
    botImage: process.env.BOT_IMAGE || './assets/bera-ai-profile.png',
    version: '2.0.0',

    // ── Developer Identity (Bruce Bera) ─────────────────────────────────────
    // This is the real person behind Bera AI. The bot always knows and reveals
    // this identity when asked about its developer/creator/owner.
    developer: 'Bruce Bera',
    developerFullName: 'Bruce Bera',
    developerPhone: process.env.DEVELOPER_PHONE || '254116763755',
    developerAge: 21,
    developerCountry: 'Kenya',
    developerCity: 'Nairobi',
    developerGithub: 'bera-tech-ai',
    developerGithubUrl: 'https://github.com/bera-tech-ai',
    developerBio: 'Kenyan developer, 21 years old, creator of Bera AI. Software engineer & GitHub developer.',
    github: 'https://github.com/bera-tech-ai',
}

module.exports = config
