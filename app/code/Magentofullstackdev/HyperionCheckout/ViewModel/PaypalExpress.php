<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\ViewModel;

use Magento\Catalog\Model\Product;
use Magento\Catalog\Model\ProductTypes\ConfigInterface as ProductTypeConfig;
use Magento\Checkout\Helper\Data as CheckoutHelper;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Customer\Model\Context as CustomerContext;
use Magento\Framework\App\Http\Context as HttpContext;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\ObjectManagerInterface;
use Magento\Framework\Serialize\Serializer\Json;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Payment\Helper\Data as PaymentHelper;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\QuoteIdToMaskedQuoteIdInterface;
use Psr\Log\LoggerInterface;

/**
 * PayPal Express Checkout smart buttons (cart, mini-cart, product page),
 * bridged to Magento_Paypal without a hard dependency on it.
 *
 * The core classes are resolved by name at run time and only when the
 * module is enabled. The rules mirror the core shortcut blocks
 * (`Magento\Paypal\Block\Express\InContext\SmartButton`,
 * `...\Minicart\SmartButton`) and `Magento\Paypal\Helper\Shortcut\Validator`.
 *
 * The product context never reads the session: the product page is
 * cached, and the login state comes from the HTTP context the page cache
 * already varies on.
 */
class PaypalExpress implements ArgumentInterface
{
    public const CONTEXT_CART = 'cart';
    public const CONTEXT_MINICART = 'minicart';
    public const CONTEXT_PRODUCT = 'product';

    /**
     * Height of every smart button in px (the SDK accepts 25 to 55). Fixed,
     * because the SDK's responsive height follows the column width and the
     * placement must reserve its final height before the SDK renders
     * (zero layout shift); 45 px is the SDK's "large" size.
     */
    public const BUTTON_HEIGHT = 45;
    /** The SDK stacks vertical rows with a gap of 30 % of the button height (measured: 14 px at 45, 17 px at 55). */
    private const ROW_GAP_RATIO = 0.3;
    /** Funding sources the SDK stacks under the PayPal button unless the SDK URL disables them. */
    private const STACKED_FUNDING = ['paylater', 'card'];
    private const MODULE_NAME = 'Magento_Paypal';
    private const METHOD_CODE = 'paypal_express';
    private const CONFIG_CLASS = 'Magento\Paypal\Model\Config';
    private const SMART_BUTTON_CONFIG_CLASS = 'Magento\Paypal\Model\SmartButtonConfig';
    private const STYLE_PAGES = [
        self::CONTEXT_CART => 'cart',
        self::CONTEXT_MINICART => 'mini_cart',
        self::CONTEXT_PRODUCT => 'product',
    ];

    /**
     * @var object|null|false
     */
    private $paypalConfig = false;

    /**
     * @param ModuleManager $moduleManager
     * @param ObjectManagerInterface $objectManager
     * @param CheckoutSession $checkoutSession
     * @param CheckoutHelper $checkoutHelper
     * @param PaymentHelper $paymentHelper
     * @param ProductTypeConfig $productTypeConfig
     * @param HttpContext $httpContext
     * @param QuoteIdToMaskedQuoteIdInterface $quoteIdToMaskedQuoteId
     * @param UrlInterface $urlBuilder
     * @param Json $json
     * @param LoggerInterface $logger
     * @SuppressWarnings(PHPMD.ExcessiveParameterList)
     */
    public function __construct(
        private readonly ModuleManager $moduleManager,
        private readonly ObjectManagerInterface $objectManager,
        private readonly CheckoutSession $checkoutSession,
        private readonly CheckoutHelper $checkoutHelper,
        private readonly PaymentHelper $paymentHelper,
        private readonly ProductTypeConfig $productTypeConfig,
        private readonly HttpContext $httpContext,
        private readonly QuoteIdToMaskedQuoteIdInterface $quoteIdToMaskedQuoteId,
        private readonly UrlInterface $urlBuilder,
        private readonly Json $json,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Whether Magento_Paypal is installed and enabled.
     *
     * @return bool
     */
    public function isAvailable(): bool
    {
        return $this->moduleManager->isEnabled(self::MODULE_NAME)
            && class_exists(self::SMART_BUTTON_CONFIG_CLASS)
            && class_exists(self::CONFIG_CLASS);
    }

    /**
     * Whether the smart buttons must be rendered for a placement.
     *
     * @param string $context One of the CONTEXT_* constants.
     * @param Product|null $product Current product, product context only.
     * @return bool
     */
    public function isVisible(string $context, ?Product $product = null): bool
    {
        if (!isset(self::STYLE_PAGES[$context])) {
            return false;
        }

        try {
            if (!$this->getFlag('in_context')) {
                return false;
            }

            if ($context === self::CONTEXT_PRODUCT) {
                return $this->getFlag('visible_on_product')
                    && $this->isProductEligible($product)
                    && $this->paymentHelper->getMethodInstance(self::METHOD_CODE)->isAvailable();
            }

            $quote = $this->checkoutSession->getQuote();

            return $this->getFlag('visible_on_cart')
                && $quote->getId()
                && $quote->hasItems()
                && $this->paymentHelper->getMethodInstance(self::METHOD_CODE)->isAvailable($quote);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion PaypalExpress: visibility check failed', ['exception' => $e]);
            return false;
        }
    }

    /**
     * Configuration of `<hyperion-paypal-buttons>` for a placement.
     *
     * Same keys the core widgets receive (`styles`, `sdkUrl`,
     * `dataAttributes`, the three URLs, `button`, `quoteId`, `customerId`),
     * plus `declined` when the visitor has to sign in first.
     *
     * @param string $context One of the CONTEXT_* constants.
     * @return array<string, mixed>
     */
    public function getConfig(string $context): array
    {
        $smartButtonConfig = $this->resolve(self::SMART_BUTTON_CONFIG_CLASS);
        if ($smartButtonConfig === null || !isset(self::STYLE_PAGES[$context])) {
            return [];
        }

        try {
            $core = (array) $smartButtonConfig->getConfig(self::STYLE_PAGES[$context]);
            $quoteId = '';
            $customerId = '';
            if ($context !== self::CONTEXT_PRODUCT) {
                $quote = $this->checkoutSession->getQuote();
                $quoteId = $this->getPublicQuoteId($quote);
                $customerId = (string) ($quote->getCustomerId() ?: '');
            }
            $guestAllowed = (bool) ($core['isGuestCheckoutAllowed'] ?? true);
            if ($guestAllowed && $context !== self::CONTEXT_PRODUCT) {
                $guestAllowed = $this->checkoutHelper->isAllowedGuestCheckout($this->checkoutSession->getQuote());
            }

            return [
                'context' => $context,
                'sdkUrl' => (string) ($core['sdkUrl'] ?? ''),
                'dataAttributes' => array_filter((array) ($core['dataAttributes'] ?? [])),
                'styles' => $this->normalizeStyles(array_filter((array) ($core['styles'] ?? []), [$this, 'isStyleValue'])),
                'button' => 1,
                'quoteId' => $quoteId,
                'customerId' => $customerId,
                'getTokenUrl' => $this->urlBuilder->getUrl('paypal/express/getTokenData', ['_secure' => true]),
                'onAuthorizeUrl' => $this->urlBuilder->getUrl('paypal/express/onAuthorization', ['_secure' => true]),
                'onCancelUrl' => $this->urlBuilder->getUrl('paypal/express/cancel', ['_secure' => true]),
                'declined' => !$guestAllowed && !$this->isLoggedIn(),
            ];
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion PaypalExpress: button config failed', ['exception' => $e]);
            return [];
        }
    }

    /**
     * JSON form of getConfig(), empty string when there is nothing to render.
     *
     * @param string $context
     * @return string
     */
    public function getConfigJson(string $context): string
    {
        return $this->serialize($this->getConfig($context));
    }

    /**
     * JSON form of a getConfig() array, empty string when there is nothing to render.
     *
     * @param array<string, mixed> $config
     * @return string
     */
    public function serialize(array $config): string
    {
        if ($config === [] || ($config['sdkUrl'] ?? '') === '') {
            return '';
        }

        try {
            return (string) $this->json->serialize($config);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion PaypalExpress: config serialization failed', ['exception' => $e]);
            return '';
        }
    }

    /**
     * Button styles with a fixed height: the SDK's responsive height follows
     * the width of the column, the reserved height below cannot. A horizontal
     * row drops the tagline, whose height the SDK does not publish; the Pay
     * Later message is the theme's financing text.
     *
     * @param array<string, mixed> $styles
     * @return array<string, mixed>
     */
    public function normalizeStyles(array $styles): array
    {
        $styles['height'] = isset($styles['height'])
            ? max(25, min(55, (int) $styles['height']))
            : self::BUTTON_HEIGHT;
        if (($styles['layout'] ?? 'vertical') === 'horizontal') {
            $styles['tagline'] = false;
        }

        return $styles;
    }

    /**
     * The height in px a placement reserves before the SDK renders: one row
     * per funding source the SDK stacks (PayPal, then Pay Later and the card
     * button unless the SDK URL disables them), the button height each, with
     * the SDK's gap between rows; one row for a horizontal layout. Venmo is
     * not counted (US buyers only): there the placement grows once.
     *
     * @param array<string, mixed> $config A getConfig() array.
     * @return int
     */
    public function getReservedHeight(array $config): int
    {
        $styles = (array) ($config['styles'] ?? []);
        $height = (int) ($styles['height'] ?? self::BUTTON_HEIGHT);
        $rows = 1;
        if (($styles['layout'] ?? 'vertical') !== 'horizontal') {
            $disabled = $this->getSdkFunding((string) ($config['sdkUrl'] ?? ''), 'disable-funding');
            foreach (self::STACKED_FUNDING as $source) {
                if (!in_array($source, $disabled, true)) {
                    $rows++;
                }
            }
        }

        return $rows * $height + ($rows - 1) * (int) round($height * self::ROW_GAP_RATIO);
    }

    /**
     * The funding sources a query parameter of the SDK URL lists.
     *
     * @param string $sdkUrl
     * @param string $param
     * @return string[]
     */
    private function getSdkFunding(string $sdkUrl, string $param): array
    {
        $query = [];
        // phpcs:ignore Magento2.Functions.DiscouragedFunction
        parse_str((string) parse_url($sdkUrl, PHP_URL_QUERY), $query);
        $value = $query[$param] ?? '';

        return is_string($value) && $value !== '' ? array_map('trim', explode(',', strtolower($value))) : [];
    }

    /**
     * Grand total of the cart in the base currency, 0.0 for an empty cart.
     *
     * The base currency is the currency of the PayPal SDK.
     *
     * @return float
     */
    public function getCartAmount(): float
    {
        try {
            $quote = $this->checkoutSession->getQuote();
            return $quote->hasItems() ? round((float) $quote->getBaseGrandTotal(), 2) : 0.0;
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion PaypalExpress: cart amount failed', ['exception' => $e]);
            return 0.0;
        }
    }

    /**
     * Final price of a product as displayed, 0.0 when it has none yet
     * (configurable sets, bundles with a dynamic price).
     *
     * @param Product $product
     * @return float
     */
    public function getProductAmount(Product $product): float
    {
        try {
            $amount = $product->getPriceInfo()->getPrice('final_price')->getAmount()->getValue();
            return round((float) $amount, 2);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion PaypalExpress: product amount failed', ['exception' => $e]);
            return 0.0;
        }
    }

    /**
     * Core rule for a product without a price.
     *
     * It only gets the button when the shopper still has to compose or
     * configure it.
     *
     * @param Product|null $product
     * @return bool
     */
    private function isProductEligible(?Product $product): bool
    {
        if ($product === null) {
            return true;
        }

        return !empty((float) $product->getFinalPrice())
            || $this->productTypeConfig->isProductSet($product->getTypeId())
            || $product->getTypeInstance()->canConfigure($product);
    }

    /**
     * Quote id as the web API expects it: masked for guests.
     *
     * @param Quote $quote
     * @return string
     */
    private function getPublicQuoteId(Quote $quote): string
    {
        $quoteId = (int) $quote->getId();
        if ($quoteId === 0) {
            return '';
        }
        if ($quote->getCustomerId()) {
            return (string) $quoteId;
        }

        try {
            return (string) $this->quoteIdToMaskedQuoteId->execute($quoteId);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion PaypalExpress: masked quote id failed', ['exception' => $e]);
            return '';
        }
    }

    /**
     * Login state as the page cache sees it.
     *
     * @return bool
     */
    private function isLoggedIn(): bool
    {
        return (bool) $this->httpContext->getValue(CustomerContext::CONTEXT_AUTH);
    }

    /**
     * Read a flag of the paypal_express method through the core config model.
     *
     * @param string $key
     * @return bool
     */
    private function getFlag(string $key): bool
    {
        if ($this->paypalConfig === false) {
            $config = $this->resolve(self::CONFIG_CLASS, true);
            if ($config !== null) {
                $config->setMethod(self::METHOD_CODE);
            }
            $this->paypalConfig = $config;
        }

        return $this->paypalConfig !== null && (bool) (int) $this->paypalConfig->getValue($key);
    }

    /**
     * Keep the style keys PayPal accepts: drop the unset ones.
     *
     * @param mixed $value
     * @return bool
     */
    private function isStyleValue(mixed $value): bool
    {
        return $value !== null && $value !== '';
    }

    /**
     * Instantiate an optional core class, null when it is not installed.
     *
     * @param string $className
     * @param bool $newInstance
     * @return object|null
     */
    private function resolve(string $className, bool $newInstance = false): ?object
    {
        if (!$this->isAvailable() || !class_exists($className)) {
            return null;
        }

        try {
            $instance = $newInstance
                ? $this->objectManager->create($className)
                : $this->objectManager->get($className);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion PaypalExpress: cannot build ' . $className, ['exception' => $e]);
            return null;
        }

        return is_object($instance) ? $instance : null;
    }
}
