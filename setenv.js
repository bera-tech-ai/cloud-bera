process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN || ''
process.env.GITHUB_USERNAME = process.env.GITHUB_USERNAME || 'bera-tech-ai'
process.env.OWNER_NUMBER = process.env.OWNER_NUMBER || '254116763755'
process.env.PTERODACTYL_URL = process.env.PTERODACTYL_URL || 'https://lordeagle.tech'
process.env.PTERODACTYL_KEY = process.env.PTERODACTYL_KEY || ''
process.env.PTERODACTYL_APP_KEY = process.env.PTERODACTYL_APP_KEY || ''
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || ''
process.env.BERAHOST_API_URL = process.env.BERAHOST_API_URL || 'https://berahost-cywge4uc.manus.space'
process.env.BERAHOST_API_KEY = process.env.BERAHOST_API_KEY || process.env.BH_API_KEY || 'bh_ab73444632e249a425a7f0033621c7ae0fb779ae8319694a'
process.env.SKY_HOSTING_API_KEY = process.env.SKY_HOSTING_API_KEY || ''
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_Pze3DEpQXL0j@ep-delicate-fire-bdej3rw6-pooler.c-8.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
process.env.BERA_SESSION_ENCRYPTION_KEY = process.env.BERA_SESSION_ENCRYPTION_KEY || 'tbhkey bh_e26f7f3b6342e9862e6188e0dd11b3a8e90c0f150a2c34a bh_e26f7f3b6342e9862e6188e0dd11b3a8e90c0f150a2c34a1'
process.env.DB_POOL_MAX = process.env.DB_POOL_MAX || '5'

// One stable bot identity is enough to isolate all per-bot resources. BeraHost
// should ideally provide one of its deployment IDs; the workspace/hostname
// fallback keeps older deployments isolated without requiring three manual
// environment variables per customer.
const crypto = require('crypto')
const path = require('path')
const safeId = value => String(value || '').trim().replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 96)
const configuredBotId = safeId(
    process.env.BERA_BOT_ID ||
    process.env.BERAHOST_BOT_ID ||
    process.env.BERAHOST_DEPLOYMENT_ID ||
    process.env.BERA_DEPLOYMENT_ID ||
    process.env.DEPLOYMENT_ID ||
    process.env.INSTANCE_ID ||
    process.env.BOT_ID
)
const identitySource = configuredBotId || [
    process.env.BERA_WORKSPACE,
    process.env.BERAHOST_WORKSPACE,
    process.env.HOSTNAME,
    process.cwd()
].find(Boolean) || 'default'
const derivedBotId = configuredBotId || `bot-${crypto.createHash('sha256').update(String(identitySource)).digest('hex').slice(0, 16)}`
const botId = safeId(derivedBotId) || 'bot-default'

process.env.BERA_BOT_ID = process.env.BERA_BOT_ID || botId
process.env.BERA_TENANT_ID = process.env.BERA_TENANT_ID || botId
process.env.BERA_AUTH_SESSION_ID = process.env.BERA_AUTH_SESSION_ID || botId
// PostgreSQL remains available for bot application data, but WhatsApp
// credentials and duplicate-session leasing stay local unless explicitly
// enabled for a deployment.
process.env.BERA_DB_AUTH_STATE = process.env.BERA_DB_AUTH_STATE || 'false'
process.env.BERA_DB_SESSION_LEASE = process.env.BERA_DB_SESSION_LEASE || 'false'

// Keep the auth directory inside the deployed, writable application directory
// by default. Explicit BERA_SESSION_DIR remains supported for persistent
// volumes. The bot ID prevents collisions when several bots share a volume.
process.env.BERA_SESSION_DIR = process.env.BERA_SESSION_DIR || path.join('./sessions', botId)
