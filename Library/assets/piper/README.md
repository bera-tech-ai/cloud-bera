# Piper voice assets (not committed)

The bot's voice notes use a local Piper neural voice when these files are
present, and fall back to Google TTS when they are not. The binary and
voice models are ~150 MB, so they are deliberately NOT in git — install
them on the host that runs the bot:

1. Piper binary (linux x86_64), from
   https://github.com/rhasspy/piper/releases — extract the tarball so the
   layout is `piper/piper` (binary) next to this README. Or set
   `BERA_PIPER_BIN` to the binary's path.
2. Voice model(s) from https://huggingface.co/rhasspy/piper-voices, e.g.
   `en/en_US/lessac/medium/en_US-lessac-medium.onnx` (+ the `.onnx.json`
   next to it) under `voices/`. Or set `BERA_PIPER_MODEL_EN` to a model
   path.

Current setup (verified 2026-11-24): `en_US-lessac-medium` for English
and for Swahili/Sheng too — the Piper Swahili model (sw_CD lanfrica)
crashes on every input with this Piper build ("Phonemes must be one
codepoint"), so it is not used. Microsoft Edge neural voices were also
tried: the voices list answers, but the synthesis WebSocket 403s from
this host, so Edge is unusable here.
