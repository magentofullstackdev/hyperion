// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Currency formatting per `checkoutConfig.priceFormat`.
 *
 * Magento ships a sprintf-style pattern (e.g. `"€%s"`), a decimal
 * separator (e.g. `"."`), a group separator (e.g. `","`), a group
 * length, and a precision. We hand-format rather than using
 * `Intl.NumberFormat` because Magento's locale-to-format mapping
 * doesn't always line up with browser locales, and admin can
 * customize the pattern in `currency/options/format`.
 *
 * Magento serialises money as DECIMAL STRINGS (`"52.0000"`); we parse
 * via `Number(value)`. Inputs that aren't finite parse to NaN and
 * format as the pattern with empty value -- a visible bug signal
 * rather than a silent `"$NaN"`.
 */
import type { PriceFormat } from '../types/config.js';

export function formatMoney(
    amount: number | string,
    format: PriceFormat
): string {
    const n = typeof amount === 'string' ? Number(amount) : amount;
    if (!Number.isFinite(n)) {
        return format.pattern.replace('%s', '');
    }

    const precision = Math.max(0, format.requiredPrecision ?? format.precision ?? 2);
    const fixed = Math.abs(n).toFixed(precision);

    const [intPart, fracPart = ''] = fixed.split('.');
    const groupLength = format.groupLength > 0 ? format.groupLength : 3;
    const reversed = (intPart ?? '0').split('').reverse();
    const grouped: string[] = [];
    for (let i = 0; i < reversed.length; i += groupLength) {
        grouped.push(reversed.slice(i, i + groupLength).reverse().join(''));
    }
    grouped.reverse();

    let num = grouped.join(format.groupSymbol);
    if (fracPart.length > 0) {
        num = `${num}${format.decimalSymbol}${fracPart}`;
    }

    const formatted = format.pattern.replace('%s', num);
    return n < 0 ? `-${formatted}` : formatted;
}
