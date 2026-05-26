'use strict'
/**
 * Developer math & conversion library.
 * Uses mathjs for expression evaluation, convert-units for unit conversion,
 * and the exchange-rate API for currency conversion.
 */

let math
try { math = require('mathjs') } catch { math = null }

let convertUnits
try { convertUnits = require('convert-units') } catch { convertUnits = null }

const axios = require('axios')

/**
 * Evaluate a math expression safely.
 * @param {string} expr  e.g. "2^10", "sin(45 deg)", "sqrt(144)", "1km in m"
 * @returns {Promise<{ success: boolean, result: string, expression: string, error?: string }>}
 */
const evalMath = async (expr) => {
    if (!math) return { success: false, result: '', expression: expr, error: 'mathjs not installed' }
    const clean = (expr || '').trim()
    if (!clean) return { success: false, result: '', expression: expr, error: 'Empty expression' }

    try {
        const result = math.evaluate(clean)
        let resultStr
        if (typeof result === 'object' && result?.entries) {
            resultStr = result.entries.map(r => math.format(r, { precision: 14 })).join(', ')
        } else {
            resultStr = math.format(result, { precision: 14 })
        }
        return { success: true, result: resultStr, expression: clean }
    } catch (e) {
        return { success: false, result: '', expression: clean, error: e.message }
    }
}

/**
 * Convert units.
 * @param {number} value  The quantity to convert
 * @param {string} from   Source unit (e.g. "km", "kg", "celsius")
 * @param {string} to     Target unit (e.g. "miles", "lb", "fahrenheit")
 * @returns {{ success: boolean, result: number, formatted: string, error?: string }}
 */
const convertUnit = (value, from, to) => {
    if (!convertUnits) {
        // fallback: try mathjs
        if (math) {
            try {
                const r = math.evaluate(`${value} ${from} to ${to}`)
                return { success: true, result: Number(r), formatted: `${value} ${from} = ${math.format(r, { precision: 10 })} ${to}` }
            } catch {}
        }
        return { success: false, result: 0, formatted: '', error: 'convert-units not installed' }
    }

    try {
        let cu = convertUnits
        if (typeof cu === 'function') {
            const result = cu(value).from(from).to(to)
            return {
                success: true,
                result,
                formatted: `${value} ${from} = ${Number(result.toFixed(6))} ${to}`
            }
        }
        return { success: false, result: 0, formatted: '', error: 'convert-units API mismatch' }
    } catch (e) {
        return { success: false, result: 0, formatted: '', error: e.message }
    }
}

/**
 * List all available units (with descriptions).
 * @returns {string[]}
 */
const listUnits = () => {
    if (!convertUnits) return []
    try {
        const cu = convertUnits()
        return typeof cu.possibilities === 'function' ? cu.possibilities() : []
    } catch { return [] }
}

/**
 * Currency conversion using exchangerate.host (free, no key needed).
 * @param {number} amount
 * @param {string} from  e.g. "USD"
 * @param {string} to    e.g. "KES"
 * @returns {Promise<{ success: boolean, result: number, rate: number, formatted: string, error?: string }>}
 */
const convertCurrency = async (amount, from, to) => {
    const fromUC = from.toUpperCase()
    const toUC = to.toUpperCase()

    const apis = [
        `https://api.exchangerate-api.com/v4/latest/${fromUC}`,
        `https://open.er-api.com/v6/latest/${fromUC}`,
        `https://api.fxratesapi.com/latest?base=${fromUC}&currencies=${toUC}&amount=${amount}`
    ]

    for (const url of apis) {
        try {
            const res = await axios.get(url, { timeout: 8000 })
            const rates = res.data?.rates || res.data?.conversion_rates
            if (rates && rates[toUC]) {
                const rate = rates[toUC]
                const result = Number((amount * rate).toFixed(4))
                return {
                    success: true,
                    result,
                    rate,
                    formatted: `${amount} ${fromUC} = *${result} ${toUC}*\n_Rate: 1 ${fromUC} = ${rate} ${toUC}_`
                }
            }
        } catch {}
    }

    return { success: false, result: 0, rate: 0, formatted: '', error: 'Could not fetch exchange rates. Try again.' }
}

module.exports = { evalMath, convertUnit, listUnits, convertCurrency }
