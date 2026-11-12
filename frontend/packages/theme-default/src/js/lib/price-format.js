// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Price formatting with Magento's own number format.
 *
 * A component that REPLACES a server-rendered price must print the amount the
 * way PHP printed it for the same store view and currency. Magento hands that
 * format to the browser as `priceFormat` (`Magento\Framework\Locale\Format::
 * getPriceFormat()`, part of the configurable product JSON config): `pattern`
 * ("%s €"), `precision` / `requiredPrecision`, `decimalSymbol`, `groupSymbol`,
 * `groupLength`, `integerRequired`. `formatPrice()` is a port of the algorithm
 * of core's `Magento_Catalog/js/price-utils` `formatPrice` (the symbol based
 * one, not `Intl`): sign, rounding to the precision, zero padding of the
 * integer part, grouping, decimal symbol, pattern.
 */

const DEFAULTS = {
    requiredPrecision: 2,
    integerRequired: 1,
    decimalSymbol: ',',
    groupSymbol: '.',
    groupLength: 3,
};

// Rounds half away from zero on the decimal representation, so 1.005 gives
// 1.01 where `toFixed()` gives 1.00.
function roundTo(value, precision) {
    return Number(`${Math.round(`${value}e+${precision}`)}e-${precision}`);
}

function absoluteNumber(value, fallback) {
    const number = Math.abs(Number(value));
    return Number.isNaN(number) ? fallback : number;
}

/**
 * @param {number|string} amount
 * @param {object|null|undefined} priceFormat Magento's price format; when it is missing the amount
 *     is printed with two decimals and a dot inside `fallbackPattern`.
 * @param {string} [fallbackPattern] sprintf-style pattern ("$%s") used without a price format.
 * @returns {string}
 */
export function formatPrice(amount, priceFormat, fallbackPattern = '%s') {
    const value = Number(amount) || 0;
    if (!priceFormat || typeof priceFormat !== 'object') {
        return String(fallbackPattern || '%s').replace('%s', value.toFixed(2));
    }

    const precision = absoluteNumber(priceFormat.requiredPrecision ?? DEFAULTS.requiredPrecision, 2);
    const integerRequired = absoluteNumber(priceFormat.integerRequired ?? DEFAULTS.integerRequired, 1);
    const decimalSymbol = priceFormat.decimalSymbol ?? DEFAULTS.decimalSymbol;
    const groupSymbol = priceFormat.groupSymbol ?? DEFAULTS.groupSymbol;
    const groupLength = Number(priceFormat.groupLength ?? DEFAULTS.groupLength) || DEFAULTS.groupLength;
    const sign = value < 0 ? '-' : '';
    let pattern = String(priceFormat.pattern || '%s');
    pattern = pattern.includes('{sign}') ? pattern.replace('{sign}', sign) : sign + pattern;

    const rounded = roundTo(Math.abs(value), precision);
    let integer = String(Math.trunc(rounded));
    if (integer.length < integerRequired) {
        integer = integer.padStart(integerRequired, '0');
    }
    const head = integer.length > groupLength ? integer.length % groupLength : 0;
    const groups = new RegExp(`(\\d{${groupLength}})(?=\\d)`, 'g');
    const fraction = roundTo(Math.abs(rounded - Number(integer)), precision);
    const number = (head ? integer.slice(0, head) + groupSymbol : '')
        + integer.slice(head).replace(groups, `$1${groupSymbol}`)
        + (precision ? decimalSymbol + fraction.toFixed(precision).slice(2) : '');

    return pattern.replace('%s', number).trim();
}
