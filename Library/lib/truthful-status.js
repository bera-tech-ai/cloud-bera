'use strict'

// Library/lib/truthful-status.js — Spec §23 truthful execution status.
//
// A Baileys sendMessage (and friends) only confirms *acceptance* by Baileys,
// not device-side visibility. Callers must pass the return value through
// assertAccepted() and report exactly the wording below on acceptance-only.
// On a falsy result assertAccepted() throws, so the caller reports failure
// and never claims success. A throw from the Baileys call itself must be
// caught by the caller and reported the same way — never swallowed.

// Spec §23 acceptance-only wording.
const BAILEYS_ACCEPTED_MESSAGE = 'Request accepted by Baileys. Final device-side visibility depends on WhatsApp processing.'

// Spec §8 pin wording — owner preference (2026-11-25): plain success wording,
// no "by Baileys" qualifier. Baileys acceptance is still enforced by
// assertAccepted() before this string is ever returned.
const PIN_ACCEPTED_MESSAGE = '✅ Pinned successfully as requested.'

const assertAccepted = (result, actionLabel, acceptedMessage = BAILEYS_ACCEPTED_MESSAGE) => {
    if (!result) {
        throw new Error(`Baileys did not accept the ${actionLabel || 'request'}.`)
    }
    return acceptedMessage
}

module.exports = {
    BAILEYS_ACCEPTED_MESSAGE,
    PIN_ACCEPTED_MESSAGE,
    assertAccepted,
}
