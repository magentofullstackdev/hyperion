<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\ViewModel;

use Magento\Catalog\Model\Product;
use Magento\Catalog\Pricing\Price\FinalPrice;
use Magento\Catalog\Pricing\Price\TierPrice;
use Magento\Framework\Pricing\PriceCurrencyInterface;
use Magento\Framework\Pricing\Render as PriceRender;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse;
use Psr\Log\LoggerInterface;

/**
 * Price-rendering ViewModel.
 *
 * Templates and tile blocks call this instead of computing prices in PHP.
 * All work is delegated to Magento's
 * \Magento\Framework\Pricing\Render which honors the
 * `catalog_product_prices` layout handle and emits the canonical class
 * hooks that web/css/source/_pricing.css styles:
 *
 *   .price-box.price-final_price
 *     .price-container
 *       .special-price > .price-wrapper > .price        <- active price
 *       .old-price     > .price-wrapper > .price        <- struck through
 *     .minimal-price-link                                 <- "as low as"
 *
 * Two zones are exposed:
 *   * item_list  -- PLP tiles, related/upsell/crosssell carousels, mini-cart.
 *   * item_view  -- PDP main price block (also activates schema.org meta).
 */
class Pricing implements ArgumentInterface
{
    public function __construct(
        private readonly PriceRender $priceRender,
        private readonly LoggerInterface $logger,
        private readonly PriceCurrencyInterface $priceCurrency,
        private readonly DegradedResponse $degradedResponse
    ) {
    }

    /**
     * Render the FinalPrice box for use inside a PLP / carousel tile.
     *
     * The FinalPriceBox handles the special-vs-regular branching itself --
     * templates do NOT need to test for `getSpecialPrice()` or read
     * `$priceModel->getAmount()`, they just render this string verbatim.
     */
    public function getTileHtml(Product $product): string
    {
        return $this->renderFinalPrice($product, [
            'zone' => PriceRender::ZONE_ITEM_LIST,
            'display_minimal_price' => true,
            'use_link_for_as_low_as' => true,
            'price_id' => 'product-price-' . (int) $product->getId(),
        ]);
    }

    /**
     * Render the FinalPrice box for the PDP main price area.
     *
     * `zone => item_view` activates schema.org/Offer meta tags inside the
     * price-amount template (priceCurrency, price). The price_id is used
     * by <hyperion-swatches> when configurable variants change selection
     * so it can replace the inner `.price` span text without re-fetching.
     */
    public function getPdpHtml(Product $product): string
    {
        return $this->renderFinalPrice($product, [
            'zone' => PriceRender::ZONE_ITEM_VIEW,
            'display_minimal_price' => true,
            'use_link_for_as_low_as' => false,
            'price_id' => 'product-price-pdp-' . (int) $product->getId(),
            'include_container' => true,
        ]);
    }

    /**
     * The FinalPrice box of a compare list cell (core's `getProductPrice($item, $suffix)`
     * arguments, guarded like the other boxes).
     */
    public function getCompareHtml(Product $product, string $idSuffix): string
    {
        return $this->renderFinalPrice($product, [
            'zone' => PriceRender::ZONE_ITEM_LIST,
            'display_minimal_price' => true,
            'use_link_for_as_low_as' => true,
            'price_id_suffix' => $idSuffix,
        ]);
    }

    /**
     * Quantity discounts of the product itself ("Buy 5 for 20.00 each and save 10%").
     *
     * Amounts come from the core tier price model, so customer group, website,
     * tax display and currency are already applied. Configurable variants keep
     * their own tiers on the child products; those are not listed here.
     *
     * @param Product $product
     * @return array<int, array{qty: float, price: string, save_percent: int}>
     */
    public function getTierPrices(Product $product): array
    {
        try {
            $tierPrice = $product->getPriceInfo()->getPrice(TierPrice::PRICE_CODE);
            if (!$tierPrice instanceof TierPrice) {
                return [];
            }
            $tiers = [];
            foreach ($tierPrice->getTierPriceList() as $tier) {
                $tiers[] = [
                    'qty' => (float) $tier['price_qty'],
                    'price' => (string) $this->priceCurrency->format($tier['price']->getValue(), false),
                    'save_percent' => (int) round((float) $tierPrice->getSavePercent($tier['price'])),
                ];
            }
            return $tiers;
        } catch (\Throwable $e) {
            $this->logger->error(
                'Magentofullstackdev\Catalog Pricing: tier prices failed for product ' . (int) $product->getId(),
                ['exception' => $e]
            );
            return [];
        }
    }

    /**
     * Generic escape hatch -- same as the two helpers above but with
     * caller-supplied params. Reserved for the rare template that needs a
     * non-default zone (e.g. cart line items).
     *
     * @param array<string, mixed> $arguments
     */
    public function getCustomHtml(Product $product, array $arguments = []): string
    {
        return $this->renderFinalPrice($product, $arguments);
    }

    /**
     * @param array<string, mixed> $arguments
     */
    private function renderFinalPrice(Product $product, array $arguments): string
    {
        try {
            return (string) $this->priceRender->render(
                FinalPrice::PRICE_CODE,
                $product,
                $arguments
            );
        } catch (\Throwable $e) {
            $this->logger->error(
                'Magentofullstackdev\Catalog Pricing: render failed for product '
                . (int) $product->getId() . ' -- ' . $e->getMessage()
            );
            $this->degradedResponse->mark();
            return '<span class="price">--</span>';
        }
    }
}
