<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Model\Htmx;

use Magento\Framework\Escaper;

/**
 * Renders the `#hyperion-notification` toast element that every HTMX
 * action response swaps over the page's persistent placeholder
 * (`hx-target="#hyperion-notification" hx-swap="outerHTML"`).
 *
 * Tones map 1:1 to the `[data-tone]` rules in the theme's
 * `_components.css`: success, error, warning, info.
 */
class NotificationRenderer
{
    public const TONE_SUCCESS = 'success';
    public const TONE_ERROR = 'error';
    public const TONE_WARNING = 'warning';
    public const TONE_INFO = 'info';

    private const AUTO_CLOSE_MS = 8000;
    private const AUTO_CLOSE_SUCCESS_MS = 3500;

    public function __construct(
        private readonly Escaper $escaper
    ) {
    }

    /**
     * @param string $html Message body, already escaped (see MessageCollector).
     * @param string $tone One of the TONE_* constants.
     * @param bool $oob Emit `hx-swap-oob="outerHTML"` so the toast can ride
     *                  along a response whose main swap targets something
     *                  else (cart body, coupon form, ...).
     */
    public function render(string $html, string $tone = self::TONE_SUCCESS, bool $oob = false): string
    {
        if (trim($html) === '') {
            return $this->renderPlaceholder($oob);
        }

        if (!in_array($tone, [self::TONE_SUCCESS, self::TONE_ERROR, self::TONE_WARNING, self::TONE_INFO], true)) {
            $tone = self::TONE_SUCCESS;
        }

        return sprintf(
            '<hyperion-notification id="hyperion-notification" data-hyperion-notification%s'
            . ' role="%s" aria-live="%s" data-tone="%s" auto-close="%d" close-label="%s">'
            . '<p class="font-medium">%s</p></hyperion-notification>',
            $oob ? ' hx-swap-oob="outerHTML"' : '',
            $tone === self::TONE_ERROR ? 'alert' : 'status',
            $tone === self::TONE_ERROR ? 'assertive' : 'polite',
            $tone,
            $tone === self::TONE_SUCCESS ? self::AUTO_CLOSE_SUCCESS_MS : self::AUTO_CLOSE_MS,
            $this->escaper->escapeHtmlAttr((string) __('Dismiss notification')),
            $html
        );
    }

    /**
     * Hidden placeholder: keeps the swap target on the page when there is
     * nothing to say, so the next HTMX request can still find it.
     */
    public function renderPlaceholder(bool $oob = false): string
    {
        return '<hyperion-notification id="hyperion-notification" data-hyperion-notification'
            . ($oob ? ' hx-swap-oob="outerHTML"' : '')
            . ' role="status" aria-live="polite" auto-close="0" hidden></hyperion-notification>';
    }
}
