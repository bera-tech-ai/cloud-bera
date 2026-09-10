'use strict'

// Runtime configuration must come from the host environment or Replit Secrets.
// Never add fallback credentials here.
for (const name of [
    'GITHUB_TOKEN',
    'GITHUB_USERNAME',
    'OWNER_NUMBER',
    'DEVELOPER_NUMBERS',
    'DEVELOPER_PHONE',
    'PTERODACTYL_URL',
    'PTERODACTYL_KEY',
    'PTERODACTYL_APP_KEY',
    'GROQ_API_KEY',
    'BERAHOST_API_URL',
    'BERAHOST_API_KEY',
    'BH_API_KEY',
    'SKY_HOSTING_API_KEY',
    'SKY_API_KEY',
    'VERCEL_TOKEN',
    'OPENROUTER_API_KEY',
    'BERA_API_KEY',
    'GIFTED_API_KEY',
    'VIEW_ONCE_DESTINATION'
]) {
    if (process.env[name] === undefined) process.env[name] = ''
}
