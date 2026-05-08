# Bera AI WhatsApp Bot

A powerful, modular WhatsApp bot built with `toxic-baileys`, developed by **Bera Tech**.

## Features
- **Bera AI** — intelligent conversational AI with memory
- **Own key/auth system** — generate and control all access
- **Authorized users only** — no key, no access
- Image understanding, reminders, quoted message context
- Group management, anti-spam, anti-link, welcome messages
- Media downloads (TikTok, Instagram, Twitter, Facebook)
- Music download & playback
- Image generation & vision analysis
- Web search, translation
- GitHub integration, shell access (owner)
- Auto-bio rotation, scheduled messages

## Tech Stack
- **Runtime**: Node.js 20
- **WhatsApp Library**: `toxic-baileys`
- **Database**: `lowdb` v1.0.0 (JSON file)
- **AI**: Bera AI via configured API endpoint

## Project Structure
```
Connection/start.js   - WhatsApp connection entry point
Config/index.js       - Bot settings (name, prefix, owner, API endpoint)
Database/index.js     - lowdb JSON database
Auth/index.js         - Key generation, validation, revocation
Handler/index.js      - Message routing and command dispatch
Commands/
  general.js          - ping, menu, info, sticker, download
  key.js              - genkey, activate, revokekey, extendkey, listkeys, checkkey
  bera.js             - bera AI chat, intent routing, all smart commands
  group.js            - kick, add, promote, demote, antilink, welcome, tagall
  admin.js            - ban, broadcast, backup, stats, autoreply, schedule
  media.js            - imagine, play, tl, see, search
Library/lib/bera.js   - Bera AI API caller
session/              - WhatsApp session files (auto-created, gitignored)
Database/db.json      - Database file (auto-created, gitignored)
```

## Configuration
Edit `Config/index.js` or set environment variables:
- `OWNER_NUMBER` — your WhatsApp number (digits only, e.g. `254712345678`)
- `NICK_API` — Bera AI endpoint
- `NICK_API_KEY` — API key (optional)

## Installation
```bash
npm install --legacy-peer-deps
npm start
```

## Key Commands
| Command | Description |
|---|---|
| `.genkey <number> <days>` | Generate a key (owner only) |
| `.activate <KEY>` | Activate your key |
| `.checkkey` | Check your key status |

## Bera AI Commands
| Command | Description |
|---|---|
| `.bera <message>` | Chat with Bera AI |
| `.nickreset` | Clear conversation memory |
| `.nickmemory` | View stored history |

## Developer
Built by **Bera Tech** — [github.com/bera-tech-ai](https://github.com/bera-tech-ai)
