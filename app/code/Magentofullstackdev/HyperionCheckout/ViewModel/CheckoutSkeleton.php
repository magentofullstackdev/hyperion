<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\ViewModel;

use Magento\Catalog\Helper\Product\ConfigurationPool;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Customer\Api\CustomerRepositoryInterface;
use Magento\Customer\Helper\Address as AddressHelper;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Quote\Model\Quote;
use Magento\Store\Model\ScopeInterface;
use Psr\Log\LoggerInterface;

/**
 * Geometry of the server rendered checkout skeleton (`checkout.phtml`).
 *
 * The skeleton fills `#checkout-root` until the Lit application replaces it,
 * and it has to occupy the same boxes: how many summary rows, which address
 * fields, a form or the saved address cards. Every answer comes from the
 * session quote and from the configuration paths the application itself is
 * fed with (`Model\ConfigProvider`, `Model\Checkout\NameFieldsConfigProvider`),
 * so both sides count the same fields.
 *
 * A skeleton is a placeholder: no method throws. A read that fails is logged
 * and answers the shape of an empty guest checkout.
 */
class CheckoutSkeleton implements ArgumentInterface
{
    /** Saved address cards drawn at most; a longer address book only makes the page longer. */
    public const MAX_SAVED_ADDRESSES = 4;

    /** Option lines drawn at most under one summary item. */
    public const MAX_OPTION_LINES = 6;

    private const STREET_LINES_PATH = 'customer/address/street_lines';
    private const COMPANY_SHOW_PATH = 'customer/address/company_show';
    private const TELEPHONE_SHOW_PATH = 'customer/address/telephone_show';
    private const FAX_SHOW_PATH = 'customer/address/fax_show';
    private const VAT_FRONTEND_VISIBILITY_PATH = 'customer/create_account/vat_frontend_visibility';
    private const GUEST_CHECKOUT_LOGIN_PATH = 'checkout/options/enable_guest_checkout_login';
    private const GIFT_ALLOW_ORDER_PATH = 'sales/gift_options/allow_order';
    private const GIFT_ALLOW_ITEMS_PATH = 'sales/gift_options/allow_items';
    private const AGREEMENTS_PATH = 'checkout/options/enable_agreements';
    private const CAPTCHA_ENABLE_PATH = 'customer/captcha/enable';
    private const CAPTCHA_MODE_PATH = 'customer/captcha/mode';
    private const CAPTCHA_FORMS_PATH = 'customer/captcha/forms';
    private const CAPTCHA_MODE_ALWAYS = 'always';
    private const CAPTCHA_MODE_AFTER_FAIL = 'after_fail';
    private const CAPTCHA_ATTEMPTS_PATH = 'customer/captcha/failed_attempts_login';
    private const CAPTCHA_ALWAYS_FOR_PATH = 'customer/captcha/always_for/';

    /** The image CAPTCHA forms of the checkout: inline login, coupon, place order. */
    private const CAPTCHA_FORMS = ['user_login', 'sales_rule_coupon_request', 'payment_processing_request'];
    private const GIFT_MESSAGE_MODULE = 'Magento_GiftMessage';

    private const DEFAULT_STREET_LINES = 2;

    private const FREE_METHOD = 'free';

    /** Braintree methods that cannot take a payment without a client token. */
    private const CLIENT_TOKEN_METHODS = ['braintree', 'braintree_paypal', 'braintree_googlepay'];

    /**
     * Payment method codes the application draws as a usable row. It is the
     * union of three lists of the checkout bundle
     * (`frontend/packages/module-checkout/src/components/payment-renderers/`):
     * the offline renderers of `payment-offline.ts`, the generic fallback of
     * `registry.ts` and the gateway modules of `lazy-renderers.ts`. Every
     * other method gets the taller "not supported" row. A test of the bundle
     * compares the lists.
     */
    public const SUPPORTED_PAYMENT_METHODS = [
        'checkmo',
        'banktransfer',
        'cashondelivery',
        'free',
        'purchaseorder',
        'braintree',
        'braintree_paypal',
        'braintree_cc_vault',
        'braintree_paypal_vault',
        'braintree_googlepay',
        'braintree_googlepay_vault',
        'paypal_express',
        'payflow_express',
    ];

    private ?Quote $quote = null;
    private bool $quoteLoaded = false;

    /** @var array<int, array{options: int}>|null */
    private ?array $items = null;

    /** @var array<int, array{lines: int}>|null */
    private ?array $savedAddressCards = null;

    /**
     * @param CheckoutSession $checkoutSession
     * @param CustomerSession $customerSession
     * @param CustomerRepositoryInterface $customerRepository
     * @param ScopeConfigInterface $scopeConfig
     * @param AddressHelper $addressHelper
     * @param ConfigurationPool $configurationPool
     * @param ModuleManager $moduleManager
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly CheckoutSession $checkoutSession,
        private readonly CustomerSession $customerSession,
        private readonly CustomerRepositoryInterface $customerRepository,
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly AddressHelper $addressHelper,
        private readonly ConfigurationPool $configurationPool,
        private readonly ModuleManager $moduleManager,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * One entry per visible quote item, with the number of option lines the
     * summary prints under its name (the same options core's checkout
     * configuration lists for the item).
     *
     * @return array<int, array{options: int}>
     */
    public function getItems(): array
    {
        if ($this->items !== null) {
            return $this->items;
        }
        $this->items = [];
        $quote = $this->getQuote();
        if ($quote === null) {
            return $this->items;
        }
        try {
            foreach ($quote->getAllVisibleItems() as $item) {
                $this->items[] = ['options' => $this->countOptionLines($item)];
            }
        } catch (\Throwable $e) {
            $this->logger->error('CheckoutSkeleton::getItems -- ' . $e->getMessage());
        }
        return $this->items;
    }

    /**
     * @return int
     */
    public function getItemCount(): int
    {
        return count($this->getItems());
    }

    /**
     * A virtual quote has no shipping section and enters its address in the payment section.
     *
     * @return bool
     */
    public function isVirtual(): bool
    {
        try {
            return (bool) $this->getQuote()?->isVirtual();
        } catch (\Throwable $e) {
            $this->logger->error('CheckoutSkeleton::isVirtual -- ' . $e->getMessage());
            return false;
        }
    }

    /**
     * @return bool
     */
    public function isLoggedIn(): bool
    {
        try {
            return (bool) $this->customerSession->isLoggedIn();
        } catch (\Throwable $e) {
            $this->logger->error('CheckoutSkeleton::isLoggedIn -- ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Saved addresses of the customer, at most MAX_SAVED_ADDRESSES; 0 for a guest.
     *
     * With at least one the application shows the address cards instead of the form.
     *
     * @return int
     */
    public function getSavedAddressCount(): int
    {
        return count($this->getSavedAddressCards());
    }

    /**
     * One entry per saved address card, with the text lines the card prints:
     * the name, the street, the city line and the country, plus the company
     * and the telephone when the address has them.
     *
     * @return array<int, array{lines: int}>
     */
    public function getSavedAddressCards(): array
    {
        if ($this->savedAddressCards !== null) {
            return $this->savedAddressCards;
        }
        $this->savedAddressCards = [];
        if (!$this->isLoggedIn()) {
            return $this->savedAddressCards;
        }
        try {
            $addresses = $this->customerRepository
                ->getById((int) $this->customerSession->getCustomerId())
                ->getAddresses();
            foreach (array_slice($addresses ?? [], 0, self::MAX_SAVED_ADDRESSES) as $address) {
                $lines = 4;
                if (trim((string) $address->getCompany()) !== '') {
                    $lines++;
                }
                if (trim((string) $address->getTelephone()) !== '') {
                    $lines++;
                }
                $this->savedAddressCards[] = ['lines' => $lines];
            }
        } catch (\Throwable $e) {
            $this->logger->error('CheckoutSkeleton::getSavedAddressCards -- ' . $e->getMessage());
        }
        return $this->savedAddressCards;
    }

    /**
     * The checkout configuration the page hands to the application, decoded
     * once so the skeleton counts the very lists the application starts with.
     *
     * @param string $configJson
     * @return array<string, mixed>
     */
    public function readConfig(string $configJson): array
    {
        try {
            $config = json_decode($configJson, true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable $e) {
            $this->logger->error('CheckoutSkeleton::readConfig -- ' . $e->getMessage());
            return [];
        }
        return is_array($config) ? $config : [];
    }

    /**
     * The rows of the payment method list at the application's first frame,
     * top to bottom: the methods the configuration already carries (the
     * initial state of a quote with a confirmed shipping method, or core's
     * list for a virtual quote). Empty when the application starts without
     * a list.
     *
     * The same rules as the application: at a zero grand total only `free`
     * is listed when it is offered; a vault method has no row of its own but
     * one per stored token of the customer, ahead of the other methods, when
     * the bundle has a module for it; a method its gateway module marks as
     * not presentable (`payment.<code>.isVisible` false) has no row.
     * `supported` false marks the row that carries the "not supported" line.
     *
     * @param array<string, mixed> $config
     * @return array<int, array{title: string, supported: bool}>
     */
    public function getPaymentRows(array $config): array
    {
        $initial = $config['hyperion']['initial'] ?? null;
        $methods = is_array($initial) ? ($initial['paymentMethods'] ?? null) : null;
        if (!is_array($methods)) {
            $methods = $config['paymentMethods'] ?? [];
        }
        if (!is_array($methods)) {
            return [];
        }
        $vault = $this->vaultTokenCounts($config);
        $tokenRows = [];
        $rows = [];
        $free = null;
        foreach ($methods as $method) {
            $code = is_array($method) ? (string) ($method['code'] ?? '') : '';
            if ($code === '' || !$this->isPresentable($config, $code)) {
                continue;
            }
            if (isset($vault[$code])) {
                $tokens = in_array($code, self::SUPPORTED_PAYMENT_METHODS, true) ? $vault[$code] : 0;
                for ($i = 0; $i < $tokens; $i++) {
                    $tokenRows[] = ['title' => (string) ($method['title'] ?? ''), 'supported' => true];
                }
                continue;
            }
            $row = [
                'title' => (string) ($method['title'] ?? ''),
                'supported' => in_array($code, self::SUPPORTED_PAYMENT_METHODS, true),
            ];
            if ($code === self::FREE_METHOD) {
                $free = $row;
            }
            $rows[] = $row;
        }
        $grandTotal = $config['totalsData']['grand_total'] ?? null;
        if ($free !== null && is_numeric($grandTotal) && abs((float) $grandTotal) < 0.005) {
            return [$free];
        }
        return array_merge($tokenRows, $rows);
    }

    /**
     * The entries of the shipping method list at the application's first
     * frame, top to bottom: `rate` for a method row, `heading` for the
     * subheading of a carrier that offers several methods, `text` for the
     * one line shown while the address is not enough for rates, `loading`
     * for a placeholder row while the rates of a known address are asked.
     *
     * @param array<string, mixed> $config
     * @return array<int, string>
     */
    public function getShippingRows(array $config): array
    {
        $initial = $config['hyperion']['initial'] ?? null;
        $methods = is_array($initial) ? ($initial['shippingMethods'] ?? null) : null;
        if (!is_array($methods) || $methods === []) {
            return $this->getSavedAddressCount() > 0 ? ['loading', 'loading'] : ['text'];
        }
        $perCarrier = [];
        foreach ($methods as $method) {
            if ($this->isUsableRate($method)) {
                $carrier = (string) ($method['carrier_code'] ?? '');
                $perCarrier[$carrier] = ($perCarrier[$carrier] ?? 0) + 1;
            }
        }
        $rows = [];
        $headed = [];
        foreach ($methods as $method) {
            $carrier = is_array($method) ? (string) ($method['carrier_code'] ?? '') : '';
            if ($this->isUsableRate($method) && ($perCarrier[$carrier] ?? 0) > 1 && !isset($headed[$carrier])) {
                $headed[$carrier] = true;
                $rows[] = 'heading';
            }
            $rows[] = 'rate';
        }
        return $rows;
    }

    /**
     * The "see our shipping policy" line under the shipping methods.
     *
     * @param array<string, mixed> $config
     * @return bool
     */
    public function hasShippingPolicy(array $config): bool
    {
        $policy = $config['shippingPolicy'] ?? null;

        return is_array($policy)
            && !empty($policy['isEnabled'])
            && trim(strip_tags((string) ($policy['shippingPolicyContent'] ?? ''))) !== '';
    }

    /**
     * A customer who types an address (none saved yet) gets the "save in
     * address book" box under the form.
     *
     * @return bool
     */
    public function hasSaveInAddressBook(): bool
    {
        return $this->isLoggedIn() && $this->getSavedAddressCount() === 0;
    }

    /**
     * Rows of the address form, top to bottom, in the order the application
     * renders them. `columns` is the number of fields side by side from the
     * `md` breakpoint (they stack below it); `narrow` marks a field that does
     * not take the full width (prefix, suffix).
     *
     * @return array<int, array{field: string, columns: int, narrow: bool}>
     */
    public function getAddressRows(): array
    {
        $rows = [];
        if ($this->isNameFieldShown('prefix_show')) {
            $rows[] = $this->row('prefix', 1, true);
        }
        $rows[] = $this->row('name', 2);
        if ($this->isNameFieldShown('middlename_show')) {
            $rows[] = $this->row('middlename', 1);
        }
        if ($this->isNameFieldShown('suffix_show')) {
            $rows[] = $this->row('suffix', 1, true);
        }
        if ($this->isShown(self::COMPANY_SHOW_PATH, true)) {
            $rows[] = $this->row('company', 1);
        }
        // The country comes before the fields it decides.
        $rows[] = $this->row('country', 1);
        for ($line = 0; $line < $this->getStreetLines(); $line++) {
            $rows[] = $this->row('street', 1);
        }
        // The region keeps its place whether it is a list, a text field or
        // hidden for the country, so this row never depends on the country.
        $rows[] = $this->row('postcode_city_region', 3);
        if ($this->isShown(self::TELEPHONE_SHOW_PATH, true)) {
            $rows[] = $this->row('telephone', 1);
        }
        if ($this->isShown(self::FAX_SHOW_PATH, false)) {
            $rows[] = $this->row('fax', 1);
        }
        if ($this->isVatShown()) {
            $rows[] = $this->row('vat_id', 1);
        }
        return $rows;
    }

    /**
     * Whether the email step of a guest keeps a line for the "an account
     * exists, sign in" notice (`checkout/options/enable_guest_checkout_login`).
     *
     * @return bool
     */
    public function isGuestLoginOffered(): bool
    {
        return $this->scopeConfig->isSetFlag(self::GUEST_CHECKOUT_LOGIN_PATH, ScopeInterface::SCOPE_STORE);
    }

    /**
     * Street lines of the address form (`customer/address/street_lines`, 2 when unset).
     *
     * @return int
     */
    public function getStreetLines(): int
    {
        $lines = (int) $this->scopeConfig->getValue(self::STREET_LINES_PATH, ScopeInterface::SCOPE_STORE);

        return $lines > 0 ? $lines : self::DEFAULT_STREET_LINES;
    }

    /**
     * Rows of the totals list before the grand total: the subtotal, the
     * shipping line of a quote that ships, a discount and a tax line when
     * the quote carries the amount.
     *
     * @return int
     */
    public function getTotalsRowCount(): int
    {
        $rows = 1;
        try {
            $quote = $this->getQuote();
            if ($quote === null) {
                return $rows;
            }
            $virtual = (bool) $quote->isVirtual();
            if (!$virtual) {
                $rows++;
            }
            $address = $virtual ? $quote->getBillingAddress() : $quote->getShippingAddress();
            if (abs((float) $address->getData('discount_amount')) > 0.0001) {
                $rows++;
            }
            if ((float) $address->getData('tax_amount') > 0.0001) {
                $rows++;
            }
        } catch (\Throwable $e) {
            $this->logger->error('CheckoutSkeleton::getTotalsRowCount -- ' . $e->getMessage());
        }
        return $rows;
    }

    /**
     * An applied coupon shows as a two line box instead of the "have a code" link.
     *
     * @return bool
     */
    public function hasCoupon(): bool
    {
        try {
            return trim((string) $this->getQuote()?->getData('coupon_code')) !== '';
        } catch (\Throwable $e) {
            $this->logger->error('CheckoutSkeleton::hasCoupon -- ' . $e->getMessage());
            return false;
        }
    }

    /**
     * The gift options link between the shipping and the payment sections.
     *
     * @return bool
     */
    public function hasGiftOptions(): bool
    {
        if (!$this->moduleManager->isEnabled(self::GIFT_MESSAGE_MODULE)) {
            return false;
        }
        return $this->scopeConfig->isSetFlag(self::GIFT_ALLOW_ORDER_PATH, ScopeInterface::SCOPE_STORE)
            || $this->scopeConfig->isSetFlag(self::GIFT_ALLOW_ITEMS_PATH, ScopeInterface::SCOPE_STORE);
    }

    /**
     * The optional parts of the application this store shows, by the names
     * `Block\Checkout::getPreloadUrls()` takes: the gift options, the terms
     * to accept and the image CAPTCHA field of a store that always asks for
     * it on a form of the checkout. The application loads their chunks on
     * the same switches; a preload that turns out unused costs one request.
     *
     * @return string[]
     */
    public function getOptionalSections(): array
    {
        $sections = [];
        if ($this->hasGiftOptions()) {
            $sections[] = 'gift-options';
        }
        if ($this->scopeConfig->isSetFlag(self::AGREEMENTS_PATH, ScopeInterface::SCOPE_STORE)) {
            $sections[] = 'agreements';
        }
        if ($this->isCaptchaShownFromTheStart()) {
            $sections[] = 'captcha';
        }
        return $sections;
    }

    /**
     * @param string $field
     * @param int $columns
     * @param bool $narrow
     * @return array{field: string, columns: int, narrow: bool}
     */
    private function row(string $field, int $columns, bool $narrow = false): array
    {
        return ['field' => $field, 'columns' => $columns, 'narrow' => $narrow];
    }

    /**
     * A no / opt / req setting: shown unless it says no; an unknown value falls back to the default.
     *
     * @param string $path
     * @param bool $default
     * @return bool
     */
    private function isShown(string $path, bool $default): bool
    {
        $raw = (string) $this->scopeConfig->getValue($path, ScopeInterface::SCOPE_STORE);
        if ($raw === 'req' || $raw === 'opt') {
            return true;
        }
        if ($raw === '' || $raw === '0') {
            return false;
        }
        return $default;
    }

    /**
     * Prefix, middle name and suffix follow the customer address settings.
     *
     * @param string $key
     * @return bool
     */
    private function isNameFieldShown(string $key): bool
    {
        try {
            $value = (string) $this->addressHelper->getConfig($key);
        } catch (\Throwable $e) {
            $this->logger->error('CheckoutSkeleton::isNameFieldShown -- ' . $e->getMessage());
            return false;
        }
        return $value !== '' && $value !== '0';
    }

    /**
     * @return bool
     */
    private function isVatShown(): bool
    {
        return $this->scopeConfig->isSetFlag(self::VAT_FRONTEND_VISIBILITY_PATH, ScopeInterface::SCOPE_STORE);
    }

    /**
     * The image CAPTCHA is on for a form of the checkout and core shows it
     * without waiting for refused attempts: the mode asks every time, the
     * allowed number of attempts is zero, or the form is listed under
     * `always_for`.
     *
     * @return bool
     */
    private function isCaptchaShownFromTheStart(): bool
    {
        if (!$this->scopeConfig->isSetFlag(self::CAPTCHA_ENABLE_PATH, ScopeInterface::SCOPE_STORE)) {
            return false;
        }
        $enabled = array_map(
            'trim',
            explode(',', (string) $this->scopeConfig->getValue(self::CAPTCHA_FORMS_PATH, ScopeInterface::SCOPE_STORE))
        );
        $forms = array_intersect(self::CAPTCHA_FORMS, $enabled);
        if ($forms === []) {
            return false;
        }
        $mode = (string) $this->scopeConfig->getValue(self::CAPTCHA_MODE_PATH, ScopeInterface::SCOPE_STORE);
        if ($mode === self::CAPTCHA_MODE_ALWAYS) {
            return true;
        }
        $attempts = $this->scopeConfig->getValue(self::CAPTCHA_ATTEMPTS_PATH, ScopeInterface::SCOPE_STORE);
        if ($mode === self::CAPTCHA_MODE_AFTER_FAIL && $attempts !== null && (int) $attempts === 0) {
            return true;
        }
        foreach ($forms as $form) {
            if ($this->scopeConfig->isSetFlag(self::CAPTCHA_ALWAYS_FOR_PATH . $form, ScopeInterface::SCOPE_STORE)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Whether the application lists the method: not when its gateway module
     * marks it as not presentable, and not a Braintree method that is
     * inactive or has no client token.
     *
     * @param array<string, mixed> $config
     */
    private function isPresentable(array $config, string $code): bool
    {
        $slice = $config['payment'][$code] ?? null;
        if (!is_array($slice)) {
            return true;
        }
        if (($slice['isVisible'] ?? null) === false) {
            return false;
        }
        if (!in_array($code, self::CLIENT_TOKEN_METHODS, true)) {
            return true;
        }
        return !empty($slice['isActive']) && is_string($slice['clientToken'] ?? null) && $slice['clientToken'] !== '';
    }

    /**
     * The vault methods with the number of stored tokens of the customer:
     * the active methods the configuration lists (0 without a token) and the
     * ones the tokens name.
     *
     * @param array<string, mixed> $config
     * @return array<string, int>
     */
    private function vaultTokenCounts(array $config): array
    {
        $counts = [];
        $active = $config['vault'] ?? null;
        if (is_array($active)) {
            foreach (array_keys($active) as $code) {
                $counts[(string) $code] = 0;
            }
        }
        $tokens = $config['payment']['vault'] ?? null;
        if (is_array($tokens)) {
            foreach ($tokens as $token) {
                $code = is_array($token) ? (string) ($token['config']['code'] ?? '') : '';
                $hash = is_array($token) ? (string) ($token['config']['publicHash'] ?? '') : '';
                if ($code !== '' && $hash !== '') {
                    $counts[$code] = ($counts[$code] ?? 0) + 1;
                }
            }
        }
        return $counts;
    }

    /**
     * @param mixed $method
     * @return bool
     */
    private function isUsableRate($method): bool
    {
        return is_array($method)
            && ($method['available'] ?? true) !== false
            && trim((string) ($method['method_code'] ?? '')) !== '';
    }

    /**
     * @param \Magento\Quote\Model\Quote\Item $item
     * @return int
     */
    private function countOptionLines($item): int
    {
        try {
            $options = $this->configurationPool
                ->getByProductType((string) $item->getProductType())
                ->getOptions($item);

            return min(self::MAX_OPTION_LINES, count($options));
        } catch (\Throwable $e) {
            $this->logger->error('CheckoutSkeleton::countOptionLines -- ' . $e->getMessage());
            return 0;
        }
    }

    /**
     * @return Quote|null
     */
    private function getQuote(): ?Quote
    {
        if (!$this->quoteLoaded) {
            $this->quoteLoaded = true;
            try {
                $this->quote = $this->checkoutSession->getQuote();
            } catch (\Throwable $e) {
                $this->logger->error('CheckoutSkeleton::getQuote -- ' . $e->getMessage());
            }
        }
        return $this->quote;
    }
}
