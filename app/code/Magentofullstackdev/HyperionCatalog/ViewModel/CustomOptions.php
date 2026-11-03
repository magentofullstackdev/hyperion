<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\ViewModel;

use Magento\Catalog\Block\Product\View\Options as OptionsBlock;
use Magento\Catalog\Model\Product;
use Magento\Catalog\Pricing\Price\FinalPrice;
use Magento\Directory\Model\Currency;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Locale\ResolverInterface as LocaleResolver;
use Magento\Framework\Pricing\PriceCurrencyInterface;
use Magento\Framework\Serialize\Serializer\Json;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Store\Model\ScopeInterface;

/**
 * Prices of the customizable options on the PDP.
 *
 * The amounts come from the core options block JSON config, so tax
 * display, catalog rules, percent prices and currency conversion match
 * what Magento charges in the cart.
 */
class CustomOptions implements ArgumentInterface
{
    /** @var array<int, array<int|string, mixed>> */
    private array $configByProduct = [];

    /**
     * @param PriceCurrencyInterface $priceCurrency
     * @param LocaleResolver $localeResolver
     * @param Json $json
     * @param ScopeConfigInterface $scopeConfig
     */
    public function __construct(
        private readonly PriceCurrencyInterface $priceCurrency,
        private readonly LocaleResolver $localeResolver,
        private readonly Json $json,
        private readonly ScopeConfigInterface $scopeConfig
    ) {
    }

    /**
     * Price the option (or one of its values) adds, in the display currency.
     *
     * @param OptionsBlock $optionsBlock
     * @param int $optionId
     * @param int|null $valueId
     * @return float
     */
    public function getPrice(OptionsBlock $optionsBlock, int $optionId, ?int $valueId = null): float
    {
        $config = $this->getConfig($optionsBlock)[$optionId] ?? [];
        if ($valueId !== null) {
            $config = $config[$valueId] ?? [];
        }

        return (float) ($config['prices']['finalPrice']['amount'] ?? 0.0);
    }

    /**
     * "+ 5,00 EUR" style notice, empty for free options.
     *
     * @param float $amount
     * @return string
     */
    public function formatNotice(float $amount): string
    {
        if ($amount == 0.0) {
            return '';
        }

        return ($amount > 0 ? '+' : '-') . $this->priceCurrency->format(abs($amount), false);
    }

    /**
     * Final price of the product before options, in the display currency.
     *
     * @param Product $product
     * @return float
     */
    public function getBasePrice(Product $product): float
    {
        return (float) $product->getPriceInfo()->getPrice(FinalPrice::PRICE_CODE)->getAmount()->getValue();
    }

    /**
     * Year limits for date options, only when the merchant configured a range.
     *
     * @return array{0: int, 1: int}|null
     */
    public function getYearRange(): ?array
    {
        $range = array_map('intval', explode(
            ',',
            (string) $this->scopeConfig->getValue('catalog/custom_options/year_range', ScopeInterface::SCOPE_STORE)
        ));
        if (empty($range[0]) && empty($range[1])) {
            return null;
        }
        $currentYear = (int) date('Y');

        return [$range[0] ?: $currentYear, ($range[1] ?? 0) ?: $currentYear];
    }

    /**
     * ISO currency code for Intl.NumberFormat.
     *
     * @return string
     */
    public function getCurrencyCode(): string
    {
        $currency = $this->priceCurrency->getCurrency();

        return $currency instanceof Currency ? (string) $currency->getCurrencyCode() : '';
    }

    /**
     * BCP 47 locale for Intl.NumberFormat.
     *
     * @return string
     */
    public function getLocale(): string
    {
        return str_replace('_', '-', (string) $this->localeResolver->getLocale());
    }

    /**
     * Decoded price config of the options block, memoized per product.
     *
     * @param OptionsBlock $optionsBlock
     * @return array<int|string, mixed>
     */
    private function getConfig(OptionsBlock $optionsBlock): array
    {
        $productId = (int) $optionsBlock->getProduct()->getId();
        if (!isset($this->configByProduct[$productId])) {
            $decoded = $this->json->unserialize($optionsBlock->getJsonConfig());
            $this->configByProduct[$productId] = is_array($decoded) ? $decoded : [];
        }

        return $this->configByProduct[$productId];
    }
}
