# Imported command-name collisions with Bera

> **Status (Phase 2, 2026-11-24): resolved-via-registry.** `Library/lib/command-registry.js`
> now owns collision handling: `buildCommandMap()` fails loudly
> (`RegistryCollisionError`, or a loud log + first-handler-wins at startup
> while pre-existing Bera-vs-Bera collisions remain — see
> `test/phase2-registry.test.js`) instead of silently replacing a handler
> with a later `map.set()`, and `resolveImportedRoute()` resolves each
> imported command below to its direct alias or `.beraextra <source-path>`.
> This inventory is the data source for that resolution
> (`loadCollisionAliases()`); the routes in the table remain the effective
> routes for imported commands.


Generated from the current Bera command map and imported command registration. **104 source declarations** have a canonical command name already owned by Bera; those represent **96 unique command names**.

The colliding canonical name continues to invoke Bera’s command. Use a listed direct alias to invoke the imported implementation. If the alias column says “None”, use `.beraextra <source-path>` instead. These alternatives do not bypass owner/admin gates or other command restrictions.

| Imported command name | Imported source path | Direct imported alias(es) |
|---|---|---|
| `.upscale` | `Media-Modifier/Upscale.js` | None — use `.beraextra Media-Modifier/Upscale.js` |
| `.enhance` | `Media-Modifier/enhance.js` | `.autofix`, `.hdphoto`, `.improve` |
| `.ai` | `ai/ai.js` | `.ask`, `.gpt`, `.chat` |
| `.chatbot` | `ai/chatbot.js` | `.aichat`, `.cb` |
| `.define` | `ai/define.js` | None — use `.beraextra ai/define.js` |
| `.imagine` | `ai/imagine.js` | `.img`, `.genimg` |
| `.translate` | `ai/translate.js` | `.trt` |
| `.weather` | `ai/weather.js` | `.wt`, `.forecast` |
| `.anticall` | `anti/anticall.js` | `.anticallx` |
| `.antidelete` | `anti/antidelete.js` | `.antideletex` |
| `.antidemote` | `anti/antidemote.js` | `.antidemotex` |
| `.antiedit` | `anti/antiedit.js` | `.antieditx` |
| `.antipromote` | `anti/antipromote.js` | `.antipromotex` |
| `.antispam` | `anti/antispam.js` | `.antispamx` |
| `.fbdl` | `downloader/fbdl.js` | `.fbdown` |
| `.igdl` | `downloader/igdl.js` | `.igdown` |
| `.play` | `downloader/play.js` | `.ytplay` |
| `.tiktok` | `downloader/tiktok.js` | `.ttdl` |
| `.yts` | `downloader/yts.js` | None — use `.beraextra downloader/yts.js` |
| `.balance` | `economy/balance.js` | `.balx` |
| `.pay` | `economy/pay.js` | `.payx` |
| `.coin` | `fun/coin.js` | `.toss`, `.flip`, `.heads` |
| `.ping` | `general/Ping.js` | `.speed`, `.p` |
| `.help` | `general/help.js` | `.h`, `.how`, `.usage` |
| `.info` | `general/info.js` | `.about` |
| `.menu` | `general/menu.js` | `.main` |
| `.owner` | `general/owner.js` | `.creator` |
| `.stats` | `general/stats.js` | None — use `.beraextra general/stats.js` |
| `.add` | `group/add.js` | `.adduser`, `.addmember` |
| `.antilink` | `group/antilink.js` | `.linkguard` |
| `.del` | `group/del.js` | `.unsend` |
| `.demote` | `group/demote.js` | `.unadmin`, `.deadmin` |
| `.groupinfo` | `group/groupinfo.js` | None — use `.beraextra group/groupinfo.js` |
| `.groupstats` | `group/groupstats.js` | `.gcstats`, `.groupstat` |
| `.groupstatus` | `group/groupstatus.js` | `.gstatus` |
| `.hidetag` | `group/hidetag.js` | `.silenttag` |
| `.kick` | `group/kick.js` | None — use `.beraextra group/kick.js` |
| `.kickall` | `group/kickall.js` | `.masskick`, `.removeall` |
| `.kickinactive` | `group/kickinactive.js` | `.inactivex` |
| `.listadmins` | `group/listadmins.js` | `.adminsx` |
| `.mute` | `group/mute.js` | None — use `.beraextra group/mute.js` |
| `.poll` | `group/poll.js` | `.askgroup` |
| `.promote` | `group/promote.js` | `.admin`, `.makeadmin` |
| `.recall` | `group/recall.js` | `.reinvite`, `.unrude` |
| `.rejectall` | `group/rejectall.js` | `.denyall`, `.rejectx` |
| `.revoke` | `group/revoke.js` | None — use `.beraextra group/revoke.js` |
| `.schedule` | `group/schedule.js` | `.sched`, `.remindin`, `.delaymsg` |
| `.setdesc` | `group/setdesc.js` | `.description`, `.setdescription` |
| `.tagadmins` | `group/tagadmins.js` | `.admintag` |
| `.tagall` | `group/tagall.js` | None — use `.beraextra group/tagall.js` |
| `.unmute` | `group/unmute.js` | None — use `.beraextra group/unmute.js` |
| `.welcome` | `group/welcome.js` | None — use `.beraextra group/welcome.js` |
| `.whois` | `group/whois.js` | `.member`, `.who` |
| `.kickinactive` | `group2/kickinactive.js` | None — use `.beraextra group2/kickinactive.js` |
| `.listadmins` | `group2/listadmins.js` | None — use `.beraextra group2/listadmins.js` |
| `.emojimix` | `media/emojimix.js` | None — use `.beraextra media/emojimix.js` |
| `.autobio` | `owner/autobio.js` | `.bioauto` |
| `.autoreply` | `owner/autoreply.js` | `.dmreply`, `.autodm` |
| `.autotyping` | `owner/autotyping.js` | `.typing` |
| `.backup` | `owner/backup.js` | `.savedb`, `.exportdb` |
| `.ban` | `owner/ban.js` | `.blockuser`, `.banuser` |
| `.block` | `owner/block.js` | `.blk`, `.blocknum` |
| `.broadcast` | `owner/broadcast.js` | `.bc`, `.announce` |
| `.delsudo` | `owner/delsudo.js` | `.remsudo`, `.delsudos` |
| `.leavegroup` | `owner/leavegroup.js` | `.leavex` |
| `.listsudo` | `owner/listsudo.js` | `.sudos`, `.showsudo` |
| `.mention` | `owner/mention.js` | `.mentions`, `.tagme`, `.ownertag` |
| `.premium` | `owner/premium.js` | `.badge`, `.badges` |
| `.setbio` | `owner/setbio.js` | None — use `.beraextra owner/setbio.js` |
| `.setsudo` | `owner/setsudo.js` | `.sudoadd` |
| `.unban` | `owner/unban.js` | `.unblockuser`, `.pardon` |
| `.unblock` | `owner/unblock.js` | `.unblk`, `.unblocknum` |
| `.update` | `owner/update.js` | `.upgrade`, `.syncbot`, `.updateme` |
| `.wallpaper` | `owner/wallpaper.js` | `.wallpaperids`, `.wplist` |
| `.leavegroup` | `owner2/leavegroup.js` | None — use `.beraextra owner2/leavegroup.js` |
| `.setbio` | `owner2/setbio.js` | None — use `.beraextra owner2/setbio.js` |
| `.listmenu` | `rich/listmenu.js` | `.listx` |
| `.bible` | `search/bible.js` | None — use `.beraextra search/bible.js` |
| `.dictionary` | `search/dictionary.js` | `.dictfind` |
| `.iplookup` | `search/iplookup.js` | None — use `.beraextra search/iplookup.js` |
| `.lyrics` | `search/lyrics.js` | `.lyricfind` |
| `.movie` | `search/movie.js` | `.tvshow` |
| `.news` | `search/news.js` | None — use `.beraextra search/news.js` |
| `.tiktoksearch` | `search/tiktoksearch.js` | `.tiktoks` |
| `.web` | `search/web.js` | `.askweb` |
| `.wiki` | `search/wiki.js` | None — use `.beraextra search/wiki.js` |
| `.animesearch` | `tools/animesearch.js` | None — use `.beraextra tools/animesearch.js` |
| `.currency` | `tools/currency.js` | `.fxrate` |
| `.encrypt` | `tools/encrypt.js` | `.encx` |
| `.fancy` | `tools/fancy.js` | `.fancytxt`, `.style` |
| `.genkey` | `tools/genkey.js` | `.apikey`, `.token` |
| `.getpp` | `tools/getpp.js` | `.pp`, `.avatar` |
| `.open` | `tools/open.js` | `.view`, `.website`, `.url` |
| `.password` | `tools/password.js` | `.pass`, `.pw` |
| `.qr` | `tools/qr.js` | `.makeqr` |
| `.remind` | `tools/remind.js` | `.alarm` |
| `.screenshot` | `tools/screenshot.js` | `.ss`, `.webshot`, `.snap` |
| `.sticker` | `tools/sticker.js` | None — use `.beraextra tools/sticker.js` |
| `.tinyurl` | `tools/tinyurl.js` | `.short2`, `.minilink` |
| `.viewonce` | `tools/vv.js` | `.vv`, `.vvopen` |
| `.animesearch` | `tools2/animesearch.js` | None — use `.beraextra tools2/animesearch.js` |
| `.currency` | `tools2/currency.js` | None — use `.beraextra tools2/currency.js` |
| `.encrypt` | `tools2/encrypt.js` | None — use `.beraextra tools2/encrypt.js` |
| `.viewonce` | `tools2/vv.js` | None — use `.beraextra tools2/vv.js` |

Direct aliases must be used with the bot’s configured prefix (normally `.`). Duplicate rows are retained where separate imported source files declare the same command name.
