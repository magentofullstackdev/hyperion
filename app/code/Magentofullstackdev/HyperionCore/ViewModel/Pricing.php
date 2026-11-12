<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\ViewModel;

use Magento\Catalog\Api\Data\ProductInterface;
use Magento\Catalog\Model\Product as CatalogProduct;
use Magento\Catalog\Pricing\Price\FinalPrice;
use Magento\Catalog\Pricing\Price\RegularPrice;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Pricing\Amount\AmountInterface;
use Magento\Framework\Pricing\PriceCurrencyInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Store\Model\ScopeInterface;
use Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse;
use Psr\Log\LoggerInterface;

/**
 * Compact price of a product for the tiles that have no price render block
 * (widget grid, cart cross-sell).
 *
 * Amounts come from the product's price info: they carry the tax adjustment
 * of the catalog tax display and are already in the display currency, so
 * they are formatted and never converted again.
 */
class Pricing implements ArgumentInterface
{
    private const TAX_DISPLAY_TYPE_PATH = 'tax/display/type';
    private const TAX_DISPLAY_BOTH = 3;
    private const TAX_ADJUSTMENT = 'tax';
    /** Types whose price is the lowest one the shopper can pay. */
    private const LOWEST_PRICE_TYPES = ['configurable', 'grouped', 'bundle'];

    public function __construct(
        private readonly PriceCurrencyInterface $priceCurrency,
        private readonly LoggerInterface $logger,
        private readonly DegradedResponse $degradedResponse,
        private readonly ScopeConfigInterface $scopeConfig
    ) {
    }

    /**
     * A base currency amount converted to the display currency: formatted,
     * or as a plain number when `$format` is false.
     */
    public function currency(float $amount, bool $format = true, bool $includeContainer = true): string
    {
        return $format
            ? (string) $this->priceCurrency->convertAndFormat($amount, $includeContainer)
            : (string) $this->priceCurrency->convert($amount);
    }

    /**
     * Render a product's price.
     *
     * Behavior:
     *  - Configurable: bare lowest variant price (no "From" prefix), struck regular price when lower.
     *  - Grouped / bundle: "Starting at" / "From" the minimal final price.
     *  - Discounted (catalog rule / special price): final bolder + regular struck-through.
     *  - Simple / everything else: single price.
     *  - Catalog tax display "both": the excluding amount follows, muted.
     */
    public function getProductPriceHtml(ProductInterface $product): string
    {
        try {
            return $this->renderProductPrice($product);
        } catch (\Throwable $e) {
            $this->logger->error(
                'Magentofullstackdev\HyperionCore Pricing: render failed for product '
                . (int) $product->getId() . ' -- ' . $e->getMessage()
            );
            // Shown once, never stored: see DegradedResponse.
            $this->degradedResponse->mark();
            return '<span class="price">--</span>';
        }
    }

    private function renderProductPrice(ProductInterface $product): string
    {
        if (!$product instanceof CatalogProduct) {
            // Only the catalog model carries a price info: its raw price is a base currency amount.
            return $this->wrap($this->escape($this->currency((float) $product->getPrice(), true, false)), 'hyperion-price');
        }

        $priceInfo = $product->getPriceInfo();
        $finalPrice = $priceInfo->getPrice(FinalPrice::PRICE_CODE);
        $type = (string) $product->getTypeId();
        $final = $finalPrice instanceof FinalPrice && in_array($type, self::LOWEST_PRICE_TYPES, true)
            ? $finalPrice->getMinimalPrice()
            : $finalPrice->getAmount();
        $finalValue = (float) $final->getValue();
        $excluding = $this->excludingTax($final);

        // Types whose own price is 0: the lowest price behind core's label for the type.
        $label = match ($type) {
            'grouped' => (string) __('Starting at'),
            'bundle' => (string) __('From'),
            default => null,
        };
        if ($label !== null) {
            $labelHtml = $finalValue > 0
                ? '<span class="text-sm font-normal text-muted">' . $this->escape($label) . '</span> '
                : '';

            return $this->wrap($labelHtml . '<span>' . $this->format($finalValue) . '</span>' . $excluding);
        }

        $regularValue = (float) $priceInfo->getPrice(RegularPrice::PRICE_CODE)->getAmount()->getValue();
        if ($finalValue > 0 && $regularValue > $finalValue) {
            return $this->wrap(
                '<span class="text-secondary font-extrabold">' . $this->format($finalValue) . '</span> '
                . '<span class="text-muted line-through font-normal">' . $this->format($regularValue) . '</span>'
                . $excluding,
                'hyperion-price hyperion-price--sale inline-flex items-baseline gap-2'
            );
        }

        return $excluding === ''
            ? $this->wrap($this->format($finalValue), 'hyperion-price')
            : $this->wrap('<span>' . $this->format($finalValue) . '</span>' . $excluding);
    }

    /**
     * The muted "Excl. Tax" amount that follows the price when the catalog
     * shows both, an empty string otherwise.
     */
    private function excludingTax(AmountInterface $amount): string
    {
        $displayType = (int) $this->scopeConfig->getValue(self::TAX_DISPLAY_TYPE_PATH, ScopeInterface::SCOPE_STORE);
        if ($displayType !== self::TAX_DISPLAY_BOTH) {
            return '';
        }

        return ' <span class="text-sm font-normal text-muted">'
            . $this->escape((string) __('Excl. Tax')) . ': '
            . $this->format((float) $amount->getValue(self::TAX_ADJUSTMENT))
            . '</span>';
    }

    /**
     * The parts are separated by a space in the markup: the flex gap is not
     * part of the text a screen reader or a copy reads.
     */
    private function wrap(string $inner, string $class = 'hyperion-price inline-flex items-baseline gap-1'): string
    {
        return '<span class="' . $class . '">' . $inner . '</span>';
    }

    /**
     * A display currency amount as escaped text.
     */
    private function format(float $amount): string
    {
        return $this->escape((string) $this->priceCurrency->format($amount, false));
    }

    private function escape(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
