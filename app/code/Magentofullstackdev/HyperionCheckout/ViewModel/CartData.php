<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\ViewModel;

use Magento\Catalog\Helper\Image;
use Magento\Catalog\Helper\Product\Configuration as ProductConfiguration;
use Magento\Catalog\Helper\Product\ConfigurationPool;
use Magento\Catalog\Model\Product;
use Magento\Catalog\Model\Product\Configuration\Item\ItemResolverInterface;
use Magento\CatalogInventory\Api\StockRegistryInterface;
use Magento\Checkout\Model\Session;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\DataObject;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\Pricing\PriceCurrencyInterface;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Quote\Model\Cart\ShippingMethodConverter;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address;
use Magento\Quote\Model\Quote\Item as QuoteItem;
use Magento\Quote\Model\Quote\Item\Option as QuoteItemOption;
use Magento\Store\Model\ScopeInterface;
use Magento\Tax\Helper\Data as TaxHelper;
use Magento\Tax\Model\Config as TaxConfig;
use Magentofullstackdev\HyperionCheckout\Model\Cart\CheckoutBlocker;
use Magentofullstackdev\HyperionCheckout\Model\Cart\EstimateDestination;
use Magentofullstackdev\HyperionCheckout\Model\Cart\TotalRowPool;
use Magentofullstackdev\HyperionCheckout\Model\WeeeBridge;
use Magentofullstackdev\HyperionCore\Model\Purchase\Availability;
use Psr\Log\LoggerInterface;

class CartData implements ArgumentInterface
{
    private const WISHLIST_MODULE = 'Magento_Wishlist';
    private const WISHLIST_ACTIVE_PATH = 'wishlist/general/active';
    private const DEFAULT_COUNTRY_PATH = 'general/country/default';
    private const CART_LINK_USE_QTY_PATH = 'checkout/cart_link/use_qty';
    /** The smallest quantity a decimal product without a minimum or an increment accepts. */
    private const DECIMAL_QTY_MIN = 0.0001;

    /**
     * Set once a read of the quote or of its totals failed in this request:
     * the getters then answer 0, '' or [] and a broken cart would look like
     * an empty one. The cart templates ask `hasLoadFailure()` before they
     * print the empty cart text.
     */
    private bool $loadFailed = false;

    /**
     * @param Session $checkoutSession
     * @param PriceCurrencyInterface $priceCurrency
     * @param UrlInterface $urlBuilder
     * @param Image $imageHelper
     * @param ConfigurationPool $configurationPool
     * @param LoggerInterface $logger
     * @param TaxConfig $taxConfig
     * @param WeeeBridge $weee
     * @param CustomerSession $customerSession
     * @param ModuleManager $moduleManager
     * @param ScopeConfigInterface $scopeConfig
     * @param Availability $availability
     * @param ShippingMethodConverter $shippingMethodConverter
     * @param TaxHelper $taxHelper
     * @param StockRegistryInterface $stockRegistry
     * @param TotalRowPool $totalRowPool
     * @param CheckoutBlocker $checkoutBlocker
     * @param EstimateDestination $estimateDestination
     * @param ItemResolverInterface $itemResolver
     * @param ProductConfiguration $productConfiguration
     * @SuppressWarnings(PHPMD.ExcessiveParameterList)
     */
    public function __construct(
        private readonly Session $checkoutSession,
        private readonly PriceCurrencyInterface $priceCurrency,
        private readonly UrlInterface $urlBuilder,
        private readonly Image $imageHelper,
        private readonly ConfigurationPool $configurationPool,
        private readonly LoggerInterface $logger,
        private readonly TaxConfig $taxConfig,
        private readonly WeeeBridge $weee,
        private readonly CustomerSession $customerSession,
        private readonly ModuleManager $moduleManager,
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly Availability $availability,
        private readonly ShippingMethodConverter $shippingMethodConverter,
        private readonly TaxHelper $taxHelper,
        private readonly StockRegistryInterface $stockRegistry,
        private readonly TotalRowPool $totalRowPool,
        private readonly CheckoutBlocker $checkoutBlocker,
        private readonly EstimateDestination $estimateDestination,
        private readonly ItemResolverInterface $itemResolver,
        private readonly ProductConfiguration $productConfiguration
    ) {
    }

    /**
     * Whether the cart may offer "Move to Wishlist": a logged-in customer, the
     * wishlist feature on, and purchasing not restricted (the wishlist is the
     * way back into a cart, so a restricted visitor does not get it either).
     */
    public function canMoveToWishlist(): bool
    {
        try {
            return $this->customerSession->isLoggedIn()
                && $this->moduleManager->isOutputEnabled(self::WISHLIST_MODULE)
                && $this->scopeConfig->isSetFlag(self::WISHLIST_ACTIVE_PATH, ScopeInterface::SCOPE_STORE)
                && $this->availability->canPurchase();
        } catch (\Throwable $e) {
            $this->logger->error('CartData::canMoveToWishlist -- ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Core's wishlist/index/fromcart: moves one quote item into the wishlist.
     */
    public function getMoveToWishlistUrl(): string
    {
        try {
            return (string) $this->urlBuilder->getUrl('wishlist/index/fromcart');
        } catch (\Throwable $e) {
            $this->logger->error('CartData::getMoveToWishlistUrl -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * The address the shipping estimator starts from: what the quote's
     * shipping address already carries; while the quote has no destination
     * yet (no region, no postcode), a customer's default shipping address
     * (the address the tax row is already computed from); else the store's
     * default country. A customer's cart in a session that is not signed in
     * (a persistent cart restored for a remembered visitor) starts from the
     * store's default country, until this session enters a destination
     * (`EstimateDestination::ofQuote()`).
     *
     * @return array{country_id: string, region_id: string, region: string, postcode: string}
     */
    public function getEstimateAddress(): array
    {
        try {
            $estimate = $this->estimateDestination->ofQuote($this->checkoutSession->getQuote());
            if (!$this->estimateDestination->isSet($estimate)) {
                $estimate = $this->estimateDestination->customerDefault() ?? $estimate;
            }
            if ($estimate['country_id'] === '') {
                $estimate['country_id'] = (string) $this->scopeConfig->getValue(
                    self::DEFAULT_COUNTRY_PATH,
                    ScopeInterface::SCOPE_STORE
                );
            }
            return $estimate;
        } catch (\Throwable $e) {
            $this->loadFailed = true;
            $this->logger->error('CartData::getEstimateAddress -- ' . $e->getMessage());
            return ['country_id' => '', 'region_id' => '', 'region' => '', 'postcode' => ''];
        }
    }

    /**
     * The shipping method currently applied to the quote (`carrier_method`),
     * empty when none, or when the estimator does not show the quote's
     * destination (`EstimateDestination::mayShow()`).
     */
    public function getSelectedShippingMethod(): string
    {
        try {
            $quote = $this->checkoutSession->getQuote();
            if (!$this->estimateDestination->mayShow($quote)) {
                return '';
            }
            return (string) $quote->getShippingAddress()->getShippingMethod();
        } catch (\Throwable $e) {
            $this->loadFailed = true;
            $this->logger->error('CartData::getSelectedShippingMethod -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * Whether the estimator has something to show: rates were collected for
     * an address with a country, or a method is already applied.
     */
    public function hasEstimate(): bool
    {
        return $this->getSelectedShippingMethod() !== '' || $this->getShippingRates() !== [];
    }

    /**
     * Whether the quote holds nothing to ship: no shipping estimate applies.
     * A quote that cannot be read answers true, so nothing is offered for it.
     *
     * @return bool
     */
    public function isVirtual(): bool
    {
        try {
            return (bool) $this->checkoutSession->getQuote()->isVirtual();
        } catch (\Throwable $e) {
            $this->loadFailed = true;
            $this->logger->error('CartData::isVirtual -- ' . $e->getMessage());
            return true;
        }
    }

    /**
     * Whether the estimator should ask for the rates of the customer's
     * default shipping address once its panel is opened: the quote ships,
     * has no rates and no destination yet, and the customer has a default
     * address. Collecting carrier rates is the expensive part of the cart,
     * so the page render never does it.
     *
     * @return bool
     */
    public function canPrefillShippingRates(): bool
    {
        try {
            $quote = $this->checkoutSession->getQuote();
            if (!$quote->getId() || $quote->isVirtual()) {
                return false;
            }

            return $this->estimateDestination->canPrefill($quote->getShippingAddress());
        } catch (\Throwable $e) {
            $this->logger->error('CartData::canPrefillShippingRates -- ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Why the cart cannot go to the checkout yet, null when it can: a total
     * below the minimum order amount (`minimum_amount`) or an error on the
     * quote (`quote_error`), with the texts to show. Core's checkout
     * controller sends the shopper back to the cart on the same conditions.
     *
     * @return array{reason: string, messages: string[]}|null
     */
    public function getCheckoutBlocker(): ?array
    {
        try {
            return $this->checkoutBlocker->forQuote($this->checkoutSession->getQuote());
        } catch (\Throwable $e) {
            $this->logger->error('CartData::getCheckoutBlocker -- ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Fixed Product Tax lines of the quote items keyed by item id, empty when
     * FPT is off. Each line: title, formatted unit and row amounts.
     *
     * @return array<int, array<int, array{title: string, amount_display: string, row_amount_display: string}>>
     */
    public function getFptLines(): array
    {
        $lines = [];
        try {
            $quote = $this->checkoutSession->getQuote();
            if (!$this->weee->isEnabled((int) $quote->getStoreId())) {
                return [];
            }
            foreach ($quote->getAllVisibleItems() as $item) {
                $applied = $this->weee->getAppliedForItem($item);
                if ($applied === []) {
                    continue;
                }
                $lines[(int) $item->getId()] = array_map(fn (array $line): array => [
                    'title' => $line['title'],
                    'amount_display' => $this->formatCurrency($line['amount']),
                    'row_amount_display' => $this->formatCurrency($line['row_amount']),
                ], $applied);
            }
        } catch (\Throwable $e) {
            $this->loadFailed = true;
            $this->logger->error('CartData::getFptLines -- ' . $e->getMessage());
        }
        return $lines;
    }

    /**
     * The cart count the header and the mini-cart show, like core's cart
     * link: the sum of the quantities when `checkout/cart_link/use_qty` is on
     * (at most two decimals, a whole sum is an int), the number of lines
     * otherwise.
     *
     * @return float|int
     */
    public function getItemCount(): float|int
    {
        try {
            $quote = $this->checkoutSession->getQuote();
            if (!$this->scopeConfig->isSetFlag(self::CART_LINK_USE_QTY_PATH, ScopeInterface::SCOPE_STORE)) {
                return (int) $quote->getItemsCount();
            }
            $qty = round((float) $quote->getItemsQty(), 2);

            return $qty === floor($qty) ? (int) $qty : $qty;
        } catch (\Throwable $e) {
            $this->loadFailed = true;
            $this->logger->error('CartData::getItemCount -- ' . $e->getMessage());
            return 0;
        }
    }

    /**
     * The count as text without trailing zeros, empty for an empty cart.
     *
     * @return string
     */
    public function getItemCountDisplay(): string
    {
        $count = $this->getItemCount();
        return $count > 0 ? (string) $count : '';
    }

    /**
     * @return float
     */
    public function getSubtotal(): float
    {
        try {
            return (float) $this->checkoutSession->getQuote()->getSubtotal();
        } catch (\Throwable $e) {
            $this->loadFailed = true;
            $this->logger->error('CartData::getSubtotal -- ' . $e->getMessage());
            return 0.0;
        }
    }

    /**
     * @return string
     */
    public function getFormattedSubtotal(): string
    {
        try {
            return $this->formatCurrency($this->getDisplaySubtotal());
        } catch (\Throwable $e) {
            $this->loadFailed = true;
            $this->logger->error('CartData::getFormattedSubtotal -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @return float
     */
    public function getGrandTotal(): float
    {
        try {
            return (float) $this->checkoutSession->getQuote()->getGrandTotal();
        } catch (\Throwable $e) {
            $this->loadFailed = true;
            $this->logger->error('CartData::getGrandTotal -- ' . $e->getMessage());
            return 0.0;
        }
    }

    /**
     * @return float
     */
    public function getDiscountAmount(): float
    {
        try {
            return (float) $this->totalsAddress($this->checkoutSession->getQuote())->getDiscountAmount();
        } catch (\Throwable $e) {
            $this->loadFailed = true;
            $this->logger->error('CartData::getDiscountAmount -- ' . $e->getMessage());
            return 0.0;
        }
    }

    public function getFormattedDiscount(): string
    {
        return $this->formatCurrency($this->getDiscountAmount());
    }

    public function getAppliedCoupon(): string
    {
        try {
            return (string) $this->checkoutSession->getQuote()->getCouponCode();
        } catch (\Throwable $e) {
            $this->loadFailed = true;
            $this->logger->error('CartData::getAppliedCoupon -- ' . $e->getMessage());
            return '';
        }
    }

    public function getShippingAmount(): float
    {
        try {
            return (float) $this->totalsAddress($this->checkoutSession->getQuote())->getShippingAmount();
        } catch (\Throwable $e) {
            $this->loadFailed = true;
            $this->logger->error('CartData::getShippingAmount -- ' . $e->getMessage());
            return 0.0;
        }
    }

    public function getFormattedShipping(): string
    {
        return $this->formatCurrency($this->getShippingAmount());
    }

    public function getTaxAmount(): float
    {
        try {
            return (float) $this->totalsAddress($this->checkoutSession->getQuote())->getTaxAmount();
        } catch (\Throwable $e) {
            $this->loadFailed = true;
            $this->logger->error('CartData::getTaxAmount -- ' . $e->getMessage());
            return 0.0;
        }
    }

    public function getFormattedTax(): string
    {
        return $this->formatCurrency($this->getTaxAmount());
    }

    /**
     * Cart totals as display rows: every total the quote collected, in the
     * store's totals sort order (see TotalRowPool). The first-party rows
     * follow Stores > Configuration > Sales > Tax > Shopping Cart Display
     * Settings (excl. / incl. / both for subtotal and shipping, tax inside
     * the grand total, full tax summary, zero tax).
     *
     * @return array<int, array{code: string, label: string, note: string, value: string, kind: string}>
     */
    public function getTotalsRows(): array
    {
        try {
            return $this->totalRowPool->getRows($this->checkoutSession->getQuote());
        } catch (\Throwable $e) {
            $this->loadFailed = true;
            $this->logger->error('CartData::getTotalsRows failed', ['exception' => $e]);
            return [];
        }
    }

    /**
     * The address that carries the totals: billing for a virtual quote,
     * shipping otherwise.
     *
     * @param Quote $quote
     * @return Address
     */
    private function totalsAddress(Quote $quote): Address
    {
        return $quote->isVirtual() ? $quote->getBillingAddress() : $quote->getShippingAddress();
    }

    /**
     * Subtotal the way the cart is configured to show it (incl. tax when the
     * display setting is "including" or "both").
     *
     * @return float
     */
    private function getDisplaySubtotal(): float
    {
        $quote = $this->checkoutSession->getQuote();
        $store = $quote->getStore();
        if ($this->taxConfig->displayCartSubtotalInclTax($store) || $this->taxConfig->displayCartSubtotalBoth($store)) {
            return (float) $this->totalsAddress($quote)->getSubtotalInclTax();
        }

        return (float) $quote->getSubtotal();
    }

    /**
     * Quote amounts (totals, item prices and row totals) are already stored in
     * the quote currency, so they are formatted without conversion; the
     * pricing helper's currency() would convert base to display a second time.
     * A shipping rate carries a BASE currency price: it is converted first
     * (see getShippingRates()) and only then formatted here.
     *
     * @param float $amount
     * @return string
     */
    private function formatCurrency(float $amount): string
    {
        try {
            $quote = $this->checkoutSession->getQuote();

            return (string) $this->priceCurrency->format(
                $amount,
                false,
                PriceCurrencyInterface::DEFAULT_PRECISION,
                $quote->getStore(),
                $quote->getQuoteCurrencyCode() ?: null
            );
        } catch (\Throwable $e) {
            $this->loadFailed = true;
            $this->logger->error('CartData::formatCurrency -- ' . $e->getMessage());
            return '';
        }
    }

    public function getFormattedGrandTotal(): string
    {
        try {
            return $this->formatCurrency($this->getGrandTotal());
        } catch (\Throwable $e) {
            $this->loadFailed = true;
            $this->logger->error('CartData::getFormattedGrandTotal -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * The visible lines of the cart. `options` is a list of label / value
     * pairs in the order core gives them (two options may share a label),
     * the values as plain text. `product_url` is empty when the line has no
     * page to link to.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getItems(): array
    {
        try {
            $quote = $this->checkoutSession->getQuote();
            $store = $quote->getStore();
            $priceMode = $this->cartPriceMode($store);
            $items = [];

            foreach ($quote->getAllVisibleItems() as $item) {
                try {
                    $product = $item->getProduct();
                    $imageUrl = '';

                    try {
                        // The product core shows for the line: the chosen variant or the parent,
                        // as the cart thumbnail settings of configurable and grouped products ask.
                        $thumbnailProduct = $this->itemResolver->getFinalProduct($item);
                        $imageUrl = (string) $this->imageHelper
                            ->init(
                                $thumbnailProduct instanceof Product ? $thumbnailProduct : $product,
                                'mini_cart_product_thumbnail'
                            )
                            ->getUrl();
                    } catch (\Throwable $e) {
                        $this->logger->warning(
                            'CartData::getItems image fetch failed for item id=' . $item->getId()
                            . ' -- ' . $e->getMessage()
                        );
                    }

                    $options = [];
                    try {
                        $helper = $this->configurationPool->getByProductType((string) $product->getTypeId());
                        foreach ($helper->getOptions($item) as $option) {
                            $label = (string) ($option['label'] ?? '');
                            if ($label !== '') {
                                $options[] = ['label' => $label, 'value' => $this->optionValue((array) $option)];
                            }
                        }
                    } catch (\Throwable $e) {
                        $this->logger->warning(
                            'CartData::getItems option parse failed for item id=' . $item->getId()
                            . ' -- ' . $e->getMessage()
                        );
                    }

                    $items[] = [
                        'id' => (int) $item->getId(),
                        'fpt' => $this->weee->getAppliedForItem($item) !== []
                            ? array_map(fn (array $line): array => [
                                'title' => $line['title'],
                                'amount_display' => $this->formatCurrency($line['amount']),
                                'row_amount_display' => $this->formatCurrency($line['row_amount']),
                            ], $this->weee->getAppliedForItem($item))
                            : [],
                        'product_id' => (int) $item->getData('product_id'),
                        'name' => (string) $item->getName(),
                        'sku' => (string) $item->getSku(),
                        'qty' => (float) $item->getQty(),
                        'image_url' => $imageUrl,
                        'product_url' => $this->productUrl($item),
                        'row_total' => (float) $item->getRowTotal(),
                        'row_total_incl' => (float) $item->getRowTotalInclTax(),
                        ...$this->itemPrices($item, $priceMode),
                        ...$this->quantityRules($item, $quote),
                        'options' => $options,
                        'messages' => $this->itemMessages($item),
                        'remove_url' => (string) $this->urlBuilder->getUrl(
                            'checkout/cart/delete',
                            ['id' => $item->getId()]
                        ),
                        'update_url' => (string) $this->urlBuilder->getUrl('checkout/cart/updatePost'),
                    ];
                } catch (\Throwable $e) {
                    // A line that cannot be read is missing from the cart: a load failure, not an empty cart.
                    $this->loadFailed = true;
                    $this->logger->warning(
                        'CartData::getItems skipped malformed item -- ' . $e->getMessage()
                    );
                }
            }

            return $items;
        } catch (\Throwable $e) {
            $this->loadFailed = true;
            $this->logger->error('CartData::getItems -- ' . $e->getMessage());
            return [];
        }
    }

    /**
     * How the cart shows item prices (`tax/cart_display/price`).
     *
     * @param mixed $store
     * @return string `incl`, `both` or `excl`
     */
    private function cartPriceMode($store): string
    {
        if ($this->taxConfig->displayCartPricesBoth($store)) {
            return 'both';
        }

        return $this->taxConfig->displayCartPricesInclTax($store) ? 'incl' : 'excl';
    }

    /**
     * Unit price and row total of a line the way the cart is configured to
     * show them: including tax, excluding tax, or including tax with the
     * excluding amounts beside them. FPT is added when the store shows cart
     * prices including it (see WeeeBridge::getIncludedInPrice()).
     *
     * @param QuoteItem $item
     * @param string $mode `incl`, `both` or `excl`
     * @return array{
     *     price_display: string,
     *     price_display_excl: string|null,
     *     row_total_display: string,
     *     row_total_display_excl: string|null
     * }
     */
    private function itemPrices(QuoteItem $item, string $mode): array
    {
        $fpt = $this->weee->getIncludedInPrice($item);
        $priceExcl = (float) $item->getCalculationPrice() + ($fpt['unit'] ?? 0.0);
        $rowExcl = (float) $item->getRowTotal() + ($fpt['row'] ?? 0.0);
        if ($mode === 'excl') {
            return [
                'price_display' => $this->formatCurrency($priceExcl),
                'price_display_excl' => null,
                'row_total_display' => $this->formatCurrency($rowExcl),
                'row_total_display_excl' => null,
            ];
        }
        $priceIncl = (float) $item->getPriceInclTax() + ($fpt['unit_incl_tax'] ?? 0.0);
        $rowIncl = (float) $item->getRowTotalInclTax() + ($fpt['row_incl_tax'] ?? 0.0);
        $both = $mode === 'both';

        return [
            'price_display' => $this->formatCurrency($priceIncl),
            'price_display_excl' => $both ? $this->formatCurrency($priceExcl) : null,
            'row_total_display' => $this->formatCurrency($rowIncl),
            'row_total_display_excl' => $both ? $this->formatCurrency($rowExcl) : null,
        ];
    }

    /**
     * What the quantity input of a line accepts, from the stock item of the
     * product that is sold (the chosen variant of a configurable line).
     * `qty_step` is the quantity increment when increments are on, otherwise
     * 1 for a whole-unit product and `any` for a decimal one; `qty_min` is
     * the minimum sale quantity (raised to the first increment), `qty_max`
     * the maximum sale quantity or null. A stock item that cannot be read
     * leaves the whole-unit defaults.
     *
     * @param QuoteItem $item
     * @param Quote $quote
     * @return array{is_qty_decimal: bool, qty_step: float|int|string, qty_min: float|int, qty_max: float|int|null}
     */
    private function quantityRules(QuoteItem $item, Quote $quote): array
    {
        $rules = ['is_qty_decimal' => false, 'qty_step' => 1, 'qty_min' => 1, 'qty_max' => null];
        try {
            $variant = $item->getOptionByCode('simple_product');
            $variantProduct = $variant instanceof QuoteItemOption ? $variant->getProduct() : null;
            $productId = (int) ($variantProduct?->getId() ?: $item->getData('product_id'));
            if ($productId <= 0) {
                return $rules;
            }
            $stockItem = $this->stockRegistry->getStockItem($productId, $quote->getStore()->getWebsiteId());
            $decimal = (bool) $stockItem->getIsQtyDecimal();
            $increment = (float) $stockItem->getQtyIncrements();
            $min = (float) $stockItem->getMinSaleQty();
            $max = (float) $stockItem->getMaxSaleQty();

            if ($increment > 0) {
                // The browser counts steps from `min`: keep it on the increment grid.
                $min = max(1, (int) ceil(round($min / $increment, 4))) * $increment;
            } elseif ($min <= 0) {
                $min = $decimal ? self::DECIMAL_QTY_MIN : 1.0;
            } elseif (!$decimal) {
                $min = max(1.0, ceil($min));
            }

            $rules = [
                'is_qty_decimal' => $decimal,
                'qty_step' => $increment > 0 ? $this->plainNumber($increment) : ($decimal ? 'any' : 1),
                'qty_min' => $this->plainNumber($min),
                'qty_max' => $max > 0 && $max >= $min ? $this->plainNumber($max) : null,
            ];
        } catch (\Throwable $e) {
            $this->logger->warning(
                'CartData::quantityRules stock item unavailable for item id=' . $item->getId()
                . ' -- ' . $e->getMessage()
            );
        }

        return $rules;
    }

    /**
     * A whole number as int, anything else as float, so the templates print
     * `2` and `1.5`, never `2.0`.
     */
    private function plainNumber(float $value): float|int
    {
        return $value === floor($value) ? (int) $value : $value;
    }

    /**
     * The messages core attached to the line, as Luma's item renderer prints them under it:
     * the stock validator sets them on every load and on a quantity update ("The requested
     * qty is not available", "This product is out of stock"), and core's UpdatePost saves a
     * refused quantity without any page message. Type `error` while the
     * item carries the error flag, `notice` otherwise.
     *
     * @return array<int, array{text: string, type: string}>
     */
    private function itemMessages(QuoteItem $item): array
    {
        $type = $item->getData('has_error') ? 'error' : 'notice';
        $messages = [];
        foreach ((array) $item->getMessage(false) as $message) {
            $text = trim((string) $message);
            if ($text !== '') {
                $messages[] = ['text' => $text, 'type' => $type];
            }
        }

        return $messages;
    }

    /**
     * The page of the line, by core's cart rule: the redirect URL of the
     * item when it has one, else the page of its product, or of the parent
     * the `product_type` option names (the child of a grouped product has no
     * page of its own). Empty when that product is not visible in the site.
     *
     * @param QuoteItem $item
     * @return string
     */
    private function productUrl(QuoteItem $item): string
    {
        $redirectUrl = (string) $item->getData('redirect_url');
        if ($redirectUrl !== '') {
            return $redirectUrl;
        }
        $product = $item->getProduct();
        $parent = $item->getOptionByCode('product_type');
        if ($parent instanceof QuoteItemOption && $parent->getProduct() instanceof Product) {
            $product = $parent->getProduct();
        }
        if (!$this->isVisibleInSite($product)) {
            return '';
        }

        return (string) $product->getProductUrl();
    }

    /**
     * Whether the product has a page in this store: by its visibility, or by
     * the visibility of the URL rewrite core attached to it.
     *
     * @param Product $product
     * @return bool
     */
    private function isVisibleInSite(Product $product): bool
    {
        if ($product->isVisibleInSiteVisibility()) {
            return true;
        }
        $urlData = $product->getData('url_data_object');
        if (!$urlData instanceof DataObject) {
            return false;
        }

        return in_array($urlData->getData('visibility'), $product->getVisibleInSiteVisibilities());
    }

    /**
     * The value of a configured option as plain text. A list (bundle
     * selections, downloadable links) is joined with commas; an option with
     * a customized view (an uploaded file) uses the value the catalog
     * configuration helper formats for it, core's link to the file, of which
     * the file name and its dimensions remain.
     *
     * @param array<string, mixed> $option
     * @return string
     */
    private function optionValue(array $option): string
    {
        $value = $option['value'] ?? '';
        if (is_array($value)) {
            return implode(', ', array_map($this->toPlainText(...), $value));
        }
        if (!empty($option['custom_view'])) {
            $formatted = $this->productConfiguration->getFormattedOptionValue($option);
            $value = $formatted['value'] ?? $value;
        }

        return $this->toPlainText($value);
    }

    /**
     * Type helpers (bundle selections, downloadable links) return list values as core prints them:
     * HTML escaped, with the price in a span. The templates escape on output, so hand them text.
     *
     * @param mixed $value
     * @return string
     */
    private function toPlainText($value): string
    {
        $text = html_entity_decode(strip_tags((string) $value), ENT_QUOTES | ENT_HTML5, 'UTF-8');

        return trim((string) preg_replace('/\s+/u', ' ', $text));
    }

    /**
     * @return string
     */
    public function getCheckoutUrl(): string
    {
        try {
            return (string) $this->urlBuilder->getUrl('checkout');
        } catch (\Throwable $e) {
            $this->logger->error('CartData::getCheckoutUrl -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @return string
     */
    public function getCartUrl(): string
    {
        try {
            return (string) $this->urlBuilder->getUrl('checkout/cart');
        } catch (\Throwable $e) {
            $this->logger->error('CartData::getCartUrl -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @return string
     */
    public function getMinicartFragmentUrl(): string
    {
        try {
            return (string) $this->urlBuilder->getUrl('hyperion/minicart/fragment');
        } catch (\Throwable $e) {
            $this->logger->error('CartData::getMinicartFragmentUrl -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @return bool
     */
    public function hasItems(): bool
    {
        return $this->getItemCount() > 0;
    }

    /**
     * Whether a read of the quote or of its totals failed in this request.
     * Distinguishes a broken cart (quote load, totals, an unreadable line)
     * from an empty one: both answer 0 items.
     *
     * @return bool
     */
    public function hasLoadFailure(): bool
    {
        return $this->loadFailed;
    }

    /**
     * Shipping rates the quote's shipping address already holds, for the cart
     * estimator: this getter never asks the carriers. The estimate controller
     * collects them, for a posted destination or, once the panel is opened,
     * for the customer's default address (see canPrefillShippingRates()).
     * Each rate goes through core's converter (the object the REST
     * estimate returns): the amounts are in the quote currency, with and
     * without tax, and the shipping tax display setting picks the one shown
     * (`formatted_price_excl` is set only when both are shown). A rate the
     * carrier answered with an error stays in the list as `available = false`
     * with its `error_message` and no price: it is information, not a choice.
     * No rate is listed while the estimator does not show the quote's
     * destination (`EstimateDestination::mayShow()`): the rates belong to it.
     *
     * @return array<int, array{
     *     code: string,
     *     title: string,
     *     price: float,
     *     formatted_price: string,
     *     formatted_price_excl: string|null,
     *     available: bool,
     *     error_message: string
     * }>
     */
    public function getShippingRates(): array
    {
        try {
            $quote = $this->checkoutSession->getQuote();
            if (!$quote->getId() || !$this->estimateDestination->mayShow($quote)) {
                return [];
            }
            $address = $quote->getShippingAddress();
            $grouped = $address->getGroupedAllShippingRates();
            $rates = [];
            $currencyCode = (string) $quote->getQuoteCurrencyCode();
            $both = $this->taxHelper->displayShippingBothPrices();
            $inclTax = $both || $this->taxHelper->displayShippingPriceIncludingTax();
            foreach ($grouped as $carrierRates) {
                foreach ($carrierRates as $rate) {
                    $method = $this->shippingMethodConverter->modelToDataObject($rate, $currencyCode);
                    $available = (bool) $method->getAvailable() && (string) $rate->getMethod() !== '';
                    $excl = (float) $method->getPriceExclTax();
                    $price = $inclTax ? (float) $method->getPriceInclTax() : $excl;
                    $rates[] = [
                        'code' => (string) $rate->getCode(),
                        'title' => trim(
                            (string) $rate->getCarrierTitle() . ' -- ' . (string) $rate->getMethodTitle(),
                            ' --'
                        ),
                        'price' => $available ? $price : 0.0,
                        'formatted_price' => $available ? $this->formatCurrency($price) : '',
                        'formatted_price_excl' => $available && $both ? $this->formatCurrency($excl) : null,
                        'available' => $available,
                        'error_message' => $available ? '' : (string) ($method->getErrorMessage() ?: ''),
                    ];
                }
            }
            return $rates;
        } catch (\Throwable $e) {
            $this->loadFailed = true;
            $this->logger->error('CartData::getShippingRates -- ' . $e->getMessage());
            return [];
        }
    }
}
