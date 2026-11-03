<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\ViewModel;

use Magento\Catalog\Helper\Image;
use Magento\Catalog\Helper\Product\ConfigurationPool;
use Magento\Checkout\Model\Session;
use Magento\Customer\Model\Address as CustomerAddress;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\Pricing\PriceCurrencyInterface;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Quote\Model\Quote\Address;
use Magento\Quote\Model\Quote\Item as QuoteItem;
use Magento\Store\Model\ScopeInterface;
use Magento\Tax\Model\Config as TaxConfig;
use Magentofullstackdev\HyperionCheckout\Model\WeeeBridge;
use Magentofullstackdev\HyperionCore\Model\Purchase\Availability;
use Psr\Log\LoggerInterface;

class CartData implements ArgumentInterface
{
    private const WISHLIST_MODULE = 'Magento_Wishlist';
    private const WISHLIST_ACTIVE_PATH = 'wishlist/general/active';
    private const DEFAULT_COUNTRY_PATH = 'general/country/default';

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
        private readonly Availability $availability
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
     * default country.
     *
     * @return array{country_id: string, region_id: string, region: string, postcode: string}
     */
    public function getEstimateAddress(): array
    {
        try {
            $address = $this->checkoutSession->getQuote()->getShippingAddress();
            $estimate = $this->destinationOf($address);
            if (!$this->hasDestination($estimate)) {
                $estimate = $this->getCustomerDefaultShippingAddress() ?? $estimate;
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
     * The shipping method currently applied to the quote (`carrier_method`), empty when none.
     */
    public function getSelectedShippingMethod(): string
    {
        try {
            return (string) $this->checkoutSession->getQuote()->getShippingAddress()->getShippingMethod();
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
     * @return int
     */
    public function getItemCount(): int
    {
        try {
            return (int) $this->checkoutSession->getQuote()->getItemsQty();
        } catch (\Throwable $e) {
            $this->loadFailed = true;
            $this->logger->error('CartData::getItemCount -- ' . $e->getMessage());
            return 0;
        }
    }

    /**
     * @return string
     */
    public function getItemCountDisplay(): string
    {
        $count = $this->getItemCount();
        return $count === 0 ? '' : (string) $count;
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
            $quote = $this->checkoutSession->getQuote();
            $address = $quote->isVirtual() ? $quote->getBillingAddress() : $quote->getShippingAddress();
            return (float) $address->getDiscountAmount();
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
            return (float) $this->checkoutSession->getQuote()->getShippingAddress()->getShippingAmount();
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
            return (float) $this->checkoutSession->getQuote()->getShippingAddress()->getTaxAmount();
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
     * Cart totals as display rows, following Stores > Configuration > Sales >
     * Tax > Shopping Cart Display Settings (excl. / incl. / both for subtotal
     * and shipping, tax inside the grand total, full tax summary, zero tax).
     *
     * @return array<int, array{code: string, label: string, note: string, value: string, kind: string}>
     */
    public function getTotalsRows(): array
    {
        try {
            $quote = $this->checkoutSession->getQuote();
            $address = $quote->isVirtual() ? $quote->getBillingAddress() : $quote->getShippingAddress();
            $store = $quote->getStore();
            $rows = [];

            $this->addExclInclRows(
                $rows,
                'subtotal',
                (string) __('Subtotal'),
                (float) $address->getSubtotal(),
                (float) $address->getSubtotalInclTax(),
                $this->taxConfig->displayCartSubtotalBoth($store),
                $this->taxConfig->displayCartSubtotalInclTax($store)
            );

            $fpt = $this->weee->getTotal($quote);
            if ($fpt > 0 && !$this->weee->isIncludedInSubtotal((int) $quote->getStoreId())) {
                $rows[] = $this->row('weee_tax', (string) __('FPT'), $fpt);
            }

            $discount = (float) $address->getDiscountAmount();
            if ($discount < 0) {
                $rows[] = $this->row('discount', (string) __('Discount'), $discount, 'discount', (string) $quote->getCouponCode());
            }

            if (!$quote->isVirtual() && $address->getShippingMethod()) {
                $this->addExclInclRows(
                    $rows,
                    'shipping',
                    (string) __('Shipping'),
                    (float) $address->getShippingAmount(),
                    (float) $address->getShippingInclTax(),
                    $this->taxConfig->displayCartShippingBoth($store),
                    $this->taxConfig->displayCartShippingInclTax($store)
                );
            }

            $tax = (float) $address->getTaxAmount();
            if ($tax > 0 || $this->taxConfig->displayCartZeroTax($store)) {
                if ($this->taxConfig->displayCartFullSummary($store)) {
                    foreach ($this->getAppliedTaxRates($address) as $rate) {
                        $rows[] = $this->row('tax_rate', $rate['label'], $rate['amount'], 'detail');
                    }
                }
                $rows[] = $this->row('tax', (string) __('Tax'), $tax);
            }

            $grandTotal = (float) $quote->getGrandTotal();
            if ($this->taxConfig->displayCartTaxWithGrandTotal($store)) {
                $rows[] = $this->row('grand_total_excl', (string) __('Order Total Excl. Tax'), $grandTotal - $tax);
                $rows[] = $this->row('grand_total', (string) __('Order Total Incl. Tax'), $grandTotal, 'grand');
            } else {
                $rows[] = $this->row('grand_total', (string) __('Order Total'), $grandTotal, 'grand');
            }

            return $rows;
        } catch (\Throwable $e) {
            $this->loadFailed = true;
            $this->logger->error('CartData::getTotalsRows failed', ['exception' => $e]);
            return [];
        }
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
            $address = $quote->isVirtual() ? $quote->getBillingAddress() : $quote->getShippingAddress();
            return (float) $address->getSubtotalInclTax();
        }

        return (float) $quote->getSubtotal();
    }

    /**
     * Add one row (excl. or incl.) or both labelled rows for an amount.
     *
     * @param array $rows
     * @param string $code
     * @param string $label
     * @param float $excl
     * @param float $incl
     * @param bool $both
     * @param bool $inclOnly
     * @return void
     */
    private function addExclInclRows(
        array &$rows,
        string $code,
        string $label,
        float $excl,
        float $incl,
        bool $both,
        bool $inclOnly
    ): void {
        if ($both) {
            $rows[] = $this->row($code . '_excl', (string) __('%1 (Excl. Tax)', $label), $excl);
            $rows[] = $this->row($code . '_incl', (string) __('%1 (Incl. Tax)', $label), $incl);
            return;
        }
        $rows[] = $this->row($code, $label, $inclOnly ? $incl : $excl);
    }

    /**
     * One totals row.
     *
     * @param string $code
     * @param string $label
     * @param float $amount
     * @param string $kind regular, detail, discount or grand
     * @param string $note
     * @return array{code: string, label: string, note: string, value: string, kind: string}
     */
    private function row(string $code, string $label, float $amount, string $kind = 'regular', string $note = ''): array
    {
        return [
            'code' => $code,
            'label' => $label,
            'note' => $note,
            'value' => $this->formatCurrency($amount),
            'kind' => $kind,
        ];
    }

    /**
     * Applied tax rates of the address for the full tax summary.
     *
     * @param Address $address
     * @return array<int, array{label: string, amount: float}>
     */
    private function getAppliedTaxRates(Address $address): array
    {
        $rates = [];
        foreach ((array) $address->getAppliedTaxes() as $applied) {
            $titles = [];
            foreach ((array) ($applied['rates'] ?? []) as $rate) {
                $percent = isset($rate['percent']) ? ' (' . (float) $rate['percent'] . '%)' : '';
                $titles[] = ($rate['title'] ?? '') . $percent;
            }
            $rates[] = ['label' => implode(', ', $titles), 'amount' => (float) ($applied['amount'] ?? 0)];
        }

        return $rates;
    }

    /**
     * Quote amounts (totals, row totals, shipping rates) are already stored in
     * the quote currency, so they are formatted without conversion; the
     * pricing helper's currency() would convert base to display a second time.
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
     * @return array
     */
    public function getItems(): array
    {
        try {
            $quote = $this->checkoutSession->getQuote();
            $items = [];

            foreach ($quote->getAllVisibleItems() as $item) {
                try {
                    $product = $item->getProduct();
                    $imageUrl = '';

                    try {
                        $imageUrl = (string) $this->imageHelper
                            ->init($product, 'mini_cart_product_thumbnail')
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
                            $value = is_array($option['value'] ?? null)
                                ? implode(', ', array_map($this->toPlainText(...), $option['value']))
                                : (string) ($option['value'] ?? '');
                            if ($label !== '') {
                                $options[$label] = $value;
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
                        'product_url' => (string) $product->getProductUrl(),
                        'row_total' => (float) $item->getRowTotal(),
                        'row_total_display' => $this->formatCurrency((float) $item->getRowTotal()),
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
     * Shipping rates collected for the quote's shipping address. Used by
     * the checkout fragment to render the shipping-methods radio list.
     *
     * @return array<int,array{code:string,title:string,price:float,formatted_price:string}>
     */
    public function getShippingRates(): array
    {
        try {
            $quote = $this->checkoutSession->getQuote();
            if (!$quote->getId()) {
                return [];
            }
            $address = $quote->getShippingAddress();
            // The rates are the ones stored with the address: the estimate
            // controller collects and saves them. One exception, like Luma's
            // estimator on load: a customer whose quote has no destination yet
            // sees the rates of the default shipping address, collected in
            // memory on the quote address (core's ShippingMethodManagement
            // does the same for the REST estimate) and never saved, so the
            // quote keeps no destination until the shopper picks a rate.
            $grouped = $address->getGroupedAllShippingRates();
            if ($grouped === [] && !$quote->isVirtual() && !$this->hasDestination($this->destinationOf($address))) {
                $default = $this->getCustomerDefaultShippingAddress();
                if ($default !== null) {
                    $address->setCountryId($default['country_id']);
                    $address->setRegionId($default['region_id'] !== '' ? (int) $default['region_id'] : null);
                    $address->setRegion($default['region'] !== '' ? $default['region'] : null);
                    $address->setPostcode($default['postcode'] !== '' ? $default['postcode'] : null);
                    $address->setCollectShippingRates(true);
                    $address->collectShippingRates();
                    $grouped = $address->getGroupedAllShippingRates();
                }
            }
            $rates = [];
            foreach ($grouped as $carrierRates) {
                foreach ($carrierRates as $rate) {
                    $price = (float) $rate->getPrice();
                    $rates[] = [
                        'code' => (string) $rate->getCode(),
                        'title' => trim(
                            (string) $rate->getCarrierTitle() . ' -- ' . (string) $rate->getMethodTitle(),
                            ' --'
                        ),
                        'price' => $price,
                        'formatted_price' => $this->formatCurrency($price),
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

    /**
     * Country, region and postcode of a quote address, in the estimator's shape.
     *
     * @param Address $address
     * @return array{country_id: string, region_id: string, region: string, postcode: string}
     */
    private function destinationOf(Address $address): array
    {
        return [
            'country_id' => (string) $address->getCountryId(),
            'region_id' => (int) $address->getRegionId() > 0 ? (string) (int) $address->getRegionId() : '',
            'region' => (string) $address->getRegion(),
            'postcode' => (string) $address->getPostcode(),
        ];
    }

    /**
     * A destination is more than a country: a region or a postcode.
     *
     * @param array<string, string> $estimate country_id, region_id, region, postcode
     */
    private function hasDestination(array $estimate): bool
    {
        return $estimate['region_id'] !== '' || $estimate['region'] !== '' || $estimate['postcode'] !== '';
    }

    /**
     * The logged-in customer's default shipping address with a country, null
     * for a guest or a customer without one. The cart blocks are
     * `cacheable="false"`, so the customer session is not depersonalized here.
     *
     * @return array{country_id: string, region_id: string, region: string, postcode: string}|null
     */
    private function getCustomerDefaultShippingAddress(): ?array
    {
        if (!$this->customerSession->isLoggedIn()) {
            return null;
        }
        $default = $this->customerSession->getCustomer()->getDefaultShippingAddress();
        if (!$default instanceof CustomerAddress) {
            return null;
        }
        $data = $default->getDataModel();
        $country = (string) $data->getCountryId();
        if ($country === '') {
            return null;
        }
        $region = $data->getRegion();
        $regionId = $region !== null ? (int) $region->getRegionId() : 0;
        return [
            'country_id' => $country,
            'region_id' => $regionId > 0 ? (string) $regionId : '',
            'region' => $region !== null ? (string) $region->getRegion() : '',
            'postcode' => (string) $data->getPostcode(),
        ];
    }
}
