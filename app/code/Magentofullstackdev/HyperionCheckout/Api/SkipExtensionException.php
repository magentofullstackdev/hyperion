<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Api;

/**
 * Thrown by an options provider (`ExtensionOptionsProviderInterface`) or a
 * value provider to say "this entry does not apply to this page" (a feature
 * switched off, a shopper who already subscribed). The pool drops the entry
 * without logging; any other exception drops it and is logged.
 *
 * @api
 * @since 0.9.0
 */
class SkipExtensionException extends \RuntimeException
{
}
