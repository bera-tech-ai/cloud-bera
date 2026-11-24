'use strict'

// ── Image generation (spec §16) ──────────────────────────────────────────────
// Retired explicitly: no verified Xcasper image-generation endpoint is
// currently available, so generateImage() always reports that instead of
// failing silently or returning a fake image. Callers (Commands/bera.js,
// Commands/media.js, Commands/gifted.js, Plugins/tools.js) surface
// IMAGE_GENERATION_UNAVAILABLE as the user-facing reply.

const IMAGE_GENERATION_UNAVAILABLE =
    'Image generation is disabled: no verified Xcasper image-generation endpoint is currently available.'

const generateImage = async () => ({
    success: false,
    error: IMAGE_GENERATION_UNAVAILABLE
})

module.exports = { generateImage, IMAGE_GENERATION_UNAVAILABLE }
