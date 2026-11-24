const config = {
    botName: 'Bera AI',
    prefix: '.',
    owner: process.env.OWNER_NUMBER || '254116763755',
    ownerNumber: process.env.OWNER_NUMBER || '254116763755',
    // ── AI endpoint ─────────────────────────────────────────────────────────
    // AI is served by the Xcasper client (Library/actions/xcasper.js, base URL
    // https://apiz.xcasper.space, override with XCASPER_BASE_URL). There is no
    // hardcoded legacy-provider default: NICK_API may still override the
    // endpoint for legacy callers, but when it is unset no AI endpoint is
    // configured here and getAiEndpoint() throws instead of silently falling
    // back to a legacy provider.
    nickApiEndpoint: process.env.NICK_API || '',
    nickApiEndpointFallback: '',
    getAiEndpoint() {
        if (!config.nickApiEndpoint) throw new Error('No AI endpoint is configured. Set NICK_API or configure the Xcasper client (XCASPER_BASE_URL).')
        return config.nickApiEndpoint
    },
    nickApiKey: process.env.NICK_API_KEY || '',
    sessionDir: './session',
    dbPath: './Database/db.json',
    databaseUrl: process.env.DATABASE_URL || '',
    databaseProvider: process.env.DATABASE_URL ? 'postgresql' : 'json',
    maxHistory: 20,
    readReceipts: true,
    publicMode: false,
    pterodactylUrl: process.env.PTERODACTYL_URL || '',
    pterodactylKey: process.env.PTERODACTYL_KEY || '',
    pterodactylAppKey: process.env.PTERODACTYL_APP_KEY || '',
    berahostApiKey: process.env.BERAHOST_API_KEY || '',
    berahostApiUrl: process.env.BERAHOST_API_URL || '',
    version: '3.0.0',

    // ── Developer Identity (Bruce Bera) ─────────────────────────────────────
    // This is the real person behind Bera AI. The bot always knows and reveals
    // this identity when asked about its developer/creator/owner.
    developerOrganization: 'Bera Tech',
    developer: 'Bruce Bera',
    developerFullName: 'Bruce Bera',
    developerRole: 'Kenyan software engineer and GitHub developer',
    developerPhone: '254116763755',
    developerEmail: 'beratech00@gmail.com',
    developerAge: 21,
    developerCountry: 'Kenya',
    developerCity: 'Nairobi',
    developerGithub: 'bera-tech-ai',
    developerGithubUrl: 'https://github.com/bera-tech-ai',
    developerBio: 'Kenyan developer, 21 years old, creator of Bera AI. Software engineer & GitHub developer.',
    github: 'https://github.com/bera-tech-ai',
}

module.exports = config
