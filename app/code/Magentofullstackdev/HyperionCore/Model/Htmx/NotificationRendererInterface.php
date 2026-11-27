<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Model\Htmx;

/**
 * Renders the `#hyperion-notification` toast that htmx action responses swap
 * over the page's single placeholder (`hx-target="#hyperion-notification"
 * hx-swap="outerHTML"`), or carry out of band.
 *
 * Tones map to the `[data-tone]` rules of the theme: success, error, warning, info.
 *
 * @api
 * @since 0.9.0
 */
interface NotificationRendererInterface
{
    public const TONE_SUCCESS = 'success';
    public const TONE_ERROR = 'error';
    public const TONE_WARNING = 'warning';
    public const TONE_INFO = 'info';

    /**
     * The toast; the hidden placeholder when the message is empty.
     *
     * @param string $html Message body, already escaped (see MessageCollector).
     * @param string $tone One of the TONE_* constants; an unknown tone reads as success.
     * @param bool $oob Emit `hx-swap-oob="outerHTML"` so the toast can ride along a
     *                  response whose main swap targets something else.
     * @return string
     */
    public function render(string $html, string $tone = self::TONE_SUCCESS, bool $oob = false): string;

    /**
     * Hidden placeholder: keeps the swap target on the page when there is nothing to say.
     *
     * @param bool $oob
     * @return string
     */
    public function renderPlaceholder(bool $oob = false): string;
}
