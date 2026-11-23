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
process.env.BERA_AUTH_SESSION_ID = process.env.BERA_AUTH_SESSION_ID || 'whatsapp'
// Keep the auth directory inside the deployed, writable application directory by
// default. BeraHost can still provide BERA_SESSION_DIR when it has a persistent
// volume; never assume /persistent exists or is writable in every runtime.
process.env.BERA_SESSION_DIR = process.env.BERA_SESSION_DIR || './session'
process.env.DB_POOL_MAX = process.env.DB_POOL_MAX || '5'
