<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Cart;

use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Validator\MinimumOrderAmount\ValidationMessage;

/**
 * Why a cart with items cannot go to the checkout yet: the conditions on
 * which core's checkout controller sends the shopper back to the cart (a
 * quote error, a total below the minimum order amount), with the texts
 * that explain them.
 */
class CheckoutBlocker
{
    public const REASON_MINIMUM_AMOUNT = 'minimum_amount';
    public const REASON_QUOTE_ERROR = 'quote_error';

    /**
     * @param ValidationMessage $minimumAmountMessage
     */
    public function __construct(
        private readonly ValidationMessage $minimumAmountMessage
    ) {
    }

    /**
     * The blocker of the quote, null when the checkout is open to it.
     *
     * The reason is `quote_error` whenever the quote carries an error; the
     * minimum order text is listed with the error texts when both apply.
     *
     * @param Quote $quote
     * @return array{reason: string, messages: string[]}|null
     */
    public function forQuote(Quote $quote): ?array
    {
        if (!$quote->hasItems()) {
            return null;
        }
        $hasError = (bool) $quote->getData('has_error');
        $belowMinimum = !$quote->validateMinimumAmount();
        if (!$hasError && !$belowMinimum) {
            return null;
        }

        $messages = [];
        if ($hasError) {
            foreach ($quote->getErrors() as $error) {
                $text = trim((string) $error->getText());
                if ($text !== '') {
                    $messages[] = $text;
                }
            }
            if ($messages === []) {
                $messages[] = (string) __('Some items in your cart need attention before you can check out.');
            }
        }
        if ($belowMinimum) {
            $messages[] = trim((string) $this->minimumAmountMessage->getMessage());
        }

        return [
            'reason' => $hasError ? self::REASON_QUOTE_ERROR : self::REASON_MINIMUM_AMOUNT,
            'messages' => array_values(array_unique(array_filter($messages, static fn (string $m): bool => $m !== ''))),
        ];
    }
}
