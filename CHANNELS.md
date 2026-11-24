# Channels (spec §15) — Phase 4 decision

## Decision

Channels are **partially supported**: the operations the installed Baileys
runtime actually exposes are implemented; the operations it does not expose
are answered as explicitly unsupported, never simulated and never left
silent.

## What was verified

Checked against the installed runtime, `@whiskeysockets/baileys 7.0.0-rc14`
(the version the repo's `package-lock.json` resolves; `package.json` still
says `^7.0.0-rc13` — see the PR notes). The socket exposes these newsletter
(channel) methods (`lib/Socket/newsletter.js`):

`newsletterMetadata`, `newsletterFollow`, `newsletterUnfollow`,
`newsletterMute`, `newsletterUnmute`, `newsletterFetchMessages`,
`newsletterReactMessage`, `newsletterCreate`, `newsletterSubscribers`,
`newsletterUpdateName/Description/Picture`, `newsletterAdminCount`,
`newsletterChangeOwner`, `newsletterDemote`, `newsletterDelete`.

Posting to a channel is a plain `sendMessage` to the channel's
`@newsletter` JID.

There is **no** API in the installed Baileys for: channel discovery or
search (no fetch-all), channel polls, scheduled channel posts, or
report/spam flows. Those are unsupported until a Baileys version adds them.

## Feature table

| Feature | Status | Notes |
|---|---|---|
| Channel information | Supported | `newsletterMetadata` by JID or invite link |
| Channel follow / unfollow | Supported | `newsletterFollow` / `newsletterUnfollow` |
| Channel recent messages | Supported | `newsletterFetchMessages` |
| Channel message reactions | Supported | `newsletterReactMessage` |
| Channel mute / unmute | Supported | `newsletterMute` / `newsletterUnmute` |
| Channel posts | Accepted-only | `sendMessage` to `@newsletter` JID; only Baileys acceptance is reported, never device-side delivery |
| Channel discovery | Unsupported | No Baileys discovery API |
| Channel polls | Unsupported | No Baileys channel poll API |
| Scheduled channel posts | Unsupported | No Baileys scheduled-post API |
| Channel report / spam | Unsupported | No Baileys report/spam API; do it in the WhatsApp app |

## Commands (owner-only)

- `.channel status` — capability report for the connected socket
- `.channel info <channel ID | @newsletter JID | invite link>`
- `.channel follow <id|link>` / `.channel unfollow <id|link>`
- `.channel recent <id|link> [count]`
- `.channel react <id|link> <message id> [emoji]`
- `.channel post <id|link> | <text>` — preview + confirmation token, then
  `.channel confirm <token>` (posts are public, so they are never sent
  without a token, same flow as `.wact`)
- `.channel discover` / `.channel poll` / `.channel schedule` /
  `.channel report` — explicit unsupported answers in the spec §25 format
  (what / why / alternative / retry)

## What is still untested

- **Live WhatsApp verification.** No channel info, follow, post or reaction
  has been executed against a real session in this phase. The operations
  are covered by unit tests against fake sockets only. Before calling any
  channel operation "verified", run `.channel status`, `.channel info`,
  `.channel follow` and `.channel post` (confirm flow) against a real
  linked device and record the results.
- Channel posting in particular: `sendMessage` to a `@newsletter` JID is
  the documented Baileys approach, but whether WhatsApp accepts a post
  from this socket — and for which channel roles — has not been observed
  live.
