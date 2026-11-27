<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSamplePsp\Gateway;

use Magento\Framework\Phrase;

/**
 * The fake gateway's decision on a card payment.
 *
 * The storefront builds the nonce as `sample-<amount>-<currency>` from the
 * BASE totals of the checkout snapshot, the amount with two decimals and a
 * dot. The gateway refuses a nonce whose amount or currency is not the
 * order's base grand total, the way a real gateway refuses a token created
 * for another amount: an order placed in a display currency other than the
 * base currency only passes when the storefront read the base totals.
 *
 * Test cards: a number ending in 9 is declined; a number ending in 3 needs
 * the 3D Secure challenge (`sample_threeds` = `approved`).
 */
class NonceVerifier
{
    public const THREEDS_APPROVED = 'approved';

    /**
     * The nonce the gateway expects for an amount in a currency.
     *
     * @param float $baseAmount
     * @param string $baseCurrency ISO 4217
     * @return string
     */
    public function expectedNonce(float $baseAmount, string $baseCurrency): string
    {
        return sprintf('sample-%s-%s', number_format(round($baseAmount, 2), 2, '.', ''), strtoupper($baseCurrency));
    }

    /**
     * The refusal to show, null when the payment is accepted.
     *
     * @param string $nonce
     * @param string $last4
     * @param string $threeds
     * @param float $baseGrandTotal
     * @param string $baseCurrency
     * @return Phrase|null
     */
    public function verify(
        string $nonce,
        string $last4,
        string $threeds,
        float $baseGrandTotal,
        string $baseCurrency
    ): ?Phrase {
        if ($nonce === '' || !hash_equals($this->expectedNonce($baseGrandTotal, $baseCurrency), $nonce)) {
            return __('The sample payment amount does not match the order total.');
        }
        if (str_ends_with($last4, '9')) {
            return __('The sample card was declined.');
        }
        if (str_ends_with($last4, '3') && $threeds !== self::THREEDS_APPROVED) {
            return __('The sample card needs a verification.');
        }

        return null;
    }
}
