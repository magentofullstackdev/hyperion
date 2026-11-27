<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model;

/**
 * What the shopper sent with the order request besides the payment: the
 * order comment and the newsletter opt-in. Request scoped (a shared
 * instance): `Plugin\Checkout\CaptureOrderExtras` fills it from the payment
 * extension attributes, the order observers read it in the same request.
 */
class OrderExtras
{
    private ?string $comment = null;

    private bool $subscribe = false;

    /**
     * The sanitized order comment, null when none was sent.
     *
     * @param string|null $comment
     * @return void
     */
    public function setComment(?string $comment): void
    {
        $this->comment = $comment === '' ? null : $comment;
    }

    /**
     * @return string|null
     */
    public function getComment(): ?string
    {
        return $this->comment;
    }

    /**
     * Whether the shopper ticked the newsletter opt-in.
     *
     * @param bool $subscribe
     * @return void
     */
    public function setSubscribe(bool $subscribe): void
    {
        $this->subscribe = $subscribe;
    }

    /**
     * @return bool
     */
    public function shouldSubscribe(): bool
    {
        return $this->subscribe;
    }
}
