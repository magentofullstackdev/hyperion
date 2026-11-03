<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Exception;

use RuntimeException;

/**
 * Raised by HyperionImage encoders when the source can't be read,
 * the target can't be written, or the requested format isn't
 * supported on the current PHP installation.
 *
 * Extends `\RuntimeException` (not `Magento\Framework\Exception\LocalizedException`)
 * because the messages are diagnostic strings aimed at logs and
 * developers rather than end users -- the queue consumer catches them
 * and writes them to the Magento log; nothing surfaces to the
 * customer.
 */
class EncoderException extends RuntimeException
{
}
