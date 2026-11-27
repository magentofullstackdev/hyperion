<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Cart\TotalRow;

use Magentofullstackdev\HyperionCheckout\Api\Cart\TotalRowRendererInterface;

/**
 * Former name of the cart total row renderer contract, kept for one release.
 *
 * It extends the public interface and adds nothing, so a renderer written
 * against this name is still accepted by TotalRowPool. Implement
 * TotalRowRendererInterface instead.
 *
 * @deprecated 0.9.0 Use \Magentofullstackdev\HyperionCheckout\Api\Cart\TotalRowRendererInterface.
 * @see TotalRowRendererInterface
 */
interface RendererInterface extends TotalRowRendererInterface
{
}
