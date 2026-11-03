<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\ViewModel\Sales;

use Magento\Framework\View\Element\BlockInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Payment\Block\Info;
use Magento\Payment\Block\Info\Instructions;
use Magento\Sales\Api\Data\OrderPaymentInterface;

/**
 * Payment details of an order for the Hyperion order templates.
 *
 * Core renders them through the method's info block (`payment_info` child
 * of Magento\Sales\Block\Order\Info and the print blocks) with Luma tables
 * and definition lists. This view model reads the same sources (the
 * instructions block, the payment's additional information written by
 * Magento_OfflinePayments, the purchase order number and the method's
 * specific information) and returns plain rows so the templates own the
 * markup. Values are raw text: escape them in the template, multiline
 * rows keep their line breaks.
 */
class PaymentInfo implements ArgumentInterface
{
    /**
     * Rows to show under the payment method title.
     *
     * @param BlockInterface|false|null $infoBlock the `payment_info` child, when the block has one
     * @param OrderPaymentInterface|null $payment
     * @return array<int, array{label: string, value: string, multiline: bool}>
     */
    public function getDetails(BlockInterface|false|null $infoBlock, ?OrderPaymentInterface $payment): array
    {
        $rows = [];
        if ($infoBlock instanceof Instructions) {
            $this->addRow($rows, '', (string) $infoBlock->getInstructions());
        }
        if ($payment !== null) {
            $this->addRow($rows, (string) __('Make Check payable to'), $this->additional($payment, 'payable_to'));
            $this->addRow($rows, (string) __('Send Check to'), $this->additional($payment, 'mailing_address'));
            $this->addRow($rows, (string) __('Purchase Order Number'), (string) $payment->getPoNumber());
        }
        if ($infoBlock instanceof Info) {
            foreach ($infoBlock->getSpecificInformation() as $label => $value) {
                $this->addRow($rows, (string) $label, implode("\n", $infoBlock->getValueAsArray($value)));
            }
        }

        return $rows;
    }

    /**
     * @param array<int, array{label: string, value: string, multiline: bool}> $rows
     * @param string $label
     * @param string $value
     */
    private function addRow(array &$rows, string $label, string $value): void
    {
        $value = trim($value);
        if ($value === '') {
            return;
        }
        foreach ($rows as $row) {
            if ($row['label'] === $label && $row['value'] === $value) {
                return;
            }
        }
        $rows[] = ['label' => $label, 'value' => $value, 'multiline' => str_contains($value, "\n")];
    }

    /**
     * @param OrderPaymentInterface $payment
     * @param string $key
     * @return string
     */
    private function additional(OrderPaymentInterface $payment, string $key): string
    {
        $value = $payment->getAdditionalInformation()[$key] ?? null;

        return is_scalar($value) ? (string) $value : '';
    }
}
