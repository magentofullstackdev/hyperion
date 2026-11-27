<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Plugin\Checkout;

use Magento\Quote\Api\Data\PaymentInterface;
use Magentofullstackdev\HyperionCheckout\Model\Newsletter\Config as NewsletterConfig;
use Magentofullstackdev\HyperionCheckout\Model\OrderComment\Config as OrderCommentConfig;
use Magentofullstackdev\HyperionCheckout\Model\OrderExtras;
use Psr\Log\LoggerInterface;

/**
 * Reads the order comment (`hyperion_order_comment`) and the newsletter
 * opt-in (`hyperion_newsletter_subscribe`) from the payment extension
 * attributes of the payment information calls, customer and guest, into
 * `Model\OrderExtras`.
 *
 * Declared on `Magento\Checkout\Api\PaymentInformationManagementInterface`
 * and `GuestPaymentInformationManagementInterface` in the global
 * `etc/di.xml`, because the REST calls run in the `webapi_rest` area. The
 * two interfaces take the payment at a different position, so the methods
 * find it among the arguments. A feature that is off ignores its attribute.
 * The comment is plain text: tags are stripped, white space trimmed, the
 * length cut at the configured maximum.
 */
class CaptureOrderExtras
{
    /**
     * @param OrderExtras $extras
     * @param OrderCommentConfig $commentConfig
     * @param NewsletterConfig $newsletterConfig
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly OrderExtras $extras,
        private readonly OrderCommentConfig $commentConfig,
        private readonly NewsletterConfig $newsletterConfig,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Captures the extras before the payment is saved and the order placed.
     *
     * @param object $subject
     * @param mixed ...$arguments
     * @return null
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function beforeSavePaymentInformationAndPlaceOrder(object $subject, mixed ...$arguments)
    {
        $this->capture($arguments);
        return null;
    }

    /**
     * Captures the extras before the payment is saved.
     *
     * @param object $subject
     * @param mixed ...$arguments
     * @return null
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function beforeSavePaymentInformation(object $subject, mixed ...$arguments)
    {
        $this->capture($arguments);
        return null;
    }

    /**
     * @param array<int|string, mixed> $arguments
     * @return void
     */
    private function capture(array $arguments): void
    {
        try {
            $payment = null;
            foreach ($arguments as $argument) {
                if ($argument instanceof PaymentInterface) {
                    $payment = $argument;
                    break;
                }
            }
            $attributes = $payment?->getExtensionAttributes();
            if ($attributes === null) {
                return;
            }
            if ($this->commentConfig->isEnabled() && method_exists($attributes, 'getHyperionOrderComment')) {
                $this->extras->setComment($this->sanitize($attributes->getHyperionOrderComment()));
            }
            if ($this->newsletterConfig->isEnabled() && method_exists($attributes, 'getHyperionNewsletterSubscribe')) {
                $this->extras->setSubscribe((bool) $attributes->getHyperionNewsletterSubscribe());
            }
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion checkout: the order comment and opt-in could not be read', [
                'exception' => $e,
            ]);
        }
    }

    /**
     * Plain text, trimmed, at most the configured length; null when empty.
     *
     * @param mixed $comment
     * @return string|null
     */
    private function sanitize(mixed $comment): ?string
    {
        if (!is_string($comment)) {
            return null;
        }
        $comment = trim(strip_tags($comment));
        $comment = (string) preg_replace('/[^\P{C}\n\t]/u', '', $comment);
        if ($comment === '') {
            return null;
        }
        return trim(mb_substr($comment, 0, $this->commentConfig->getMaxLength()));
    }
}
