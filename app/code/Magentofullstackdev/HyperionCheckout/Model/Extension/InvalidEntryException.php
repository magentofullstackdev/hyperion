<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Extension;

/**
 * A pool entry that breaks one of the registration rules; the message is the
 * reason written to the log next to the entry name.
 */
class InvalidEntryException extends \InvalidArgumentException
{
}
