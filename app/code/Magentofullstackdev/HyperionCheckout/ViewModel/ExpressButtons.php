<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\ViewModel;

use Magento\Catalog\Api\Data\ProductInterface;
use Magento\Framework\Serialize\Serializer\Json;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magentofullstackdev\HyperionCheckout\Model\Payment\ExpressButtonPool;
use Magentofullstackdev\HyperionCore\ViewModel\Purchase;
use Psr\Log\LoggerInterface;

/**
 * One `<hyperion-express-slot>`: the buttons of a placement, their
 * configuration as JSON for the express slot's `data-hyperion-express` attribute and
 * the height the express slot reserves before any button renders.
 *
 * The purchase rules (catalog mode) gate every express button here, in one
 * place: when the visitor may not buy, a slot has no button and the template
 * prints nothing.
 */
class ExpressButtons implements ArgumentInterface
{
    /** Vertical gap between two buttons of a slot, in px (`space-y-2`). */
    public const GAP = 8;

    /**
     * @param ExpressButtonPool $pool
     * @param Purchase $purchase
     * @param Json $json
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly ExpressButtonPool $pool,
        private readonly Purchase $purchase,
        private readonly Json $json,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * The slot of a placement.
     *
     * `reservedHeight` is the sum of the buttons' heights plus the gap between two buttons;
     * 0 with no button.
     *
     * @param string $placement `product`, `cart`, `minicart` or `checkout-top`
     * @param ProductInterface|null $product the current product, product placement only
     * @return array{buttons: array<int, array<string, mixed>>, json: string, reservedHeight: int}
     */
    public function getSlot(string $placement, ?ProductInterface $product = null): array
    {
        $empty = ['buttons' => [], 'json' => '', 'reservedHeight' => 0];
        try {
            if (!$this->purchase->canPurchase()) {
                return $empty;
            }
            $buttons = $this->pool->getButtons($placement, $product);
            if ($buttons === []) {
                return $empty;
            }
            $height = 0;
            foreach ($buttons as $button) {
                $height += (int) $button['reservedHeight'];
            }
            $height += self::GAP * (count($buttons) - 1);

            // An empty map is an object in the browser, not a list.
            $payload = array_map(static function (array $button): array {
                foreach (['options', 'phrases'] as $key) {
                    if (($button[$key] ?? []) === []) {
                        $button[$key] = new \stdClass();
                    }
                }
                return $button;
            }, $buttons);

            return [
                'buttons' => $buttons,
                'json' => (string) $this->json->serialize($payload),
                'reservedHeight' => $height,
            ];
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion express buttons: the express slot cannot be built', [
                'placement' => $placement,
                'exception' => $e,
            ]);
            return $empty;
        }
    }
}
