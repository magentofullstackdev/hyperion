<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Checkout;

use Magento\Checkout\Model\ConfigProviderInterface;
use Magento\Framework\Locale\ResolverInterface;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\ObjectManagerInterface;
use Magento\Framework\UrlInterface;
use Psr\Log\LoggerInterface;

/**
 * PayPal Express Checkout settings for the Lit checkout
 * (`checkoutConfig.hyperion.paypalExpress`).
 *
 * Magento_Paypal stays optional: its classes are resolved by name at run
 * time and only when the module is enabled. The section is absent when
 * neither `paypal_express` nor `payflow_express` is available, so the
 * renderer has nothing to work with and the methods stay unselectable.
 *
 * The values come from the same core models the Knockout checkout reads
 * (`ExpressConfigProvider`, `SmartButtonConfig`, `PayLaterConfig`), in a
 * flat shape: core nests them under `payment.paypalExpress` together with
 * RequireJS component names the Lit checkout has no use for.
 */
class PaypalExpressConfigProvider implements ConfigProviderInterface
{
    private const MODULE_NAME = 'Magento_Paypal';
    private const CONFIG_FACTORY_CLASS = 'Magento\Paypal\Model\ConfigFactory';
    private const SMART_BUTTON_CONFIG_CLASS = 'Magento\Paypal\Model\SmartButtonConfig';
    private const PAY_LATER_CONFIG_CLASS = 'Magento\Paypal\Model\PayLaterConfig';

    private const METHOD_EXPRESS = 'paypal_express';
    private const METHOD_PAYFLOW_EXPRESS = 'payflow_express';
    private const START_ROUTES = [
        self::METHOD_EXPRESS => 'paypal/express/start',
        self::METHOD_PAYFLOW_EXPRESS => 'paypal/payflowexpress/start',
    ];

    private const SMART_BUTTON_PAGE = 'checkout';
    private const PAY_LATER_SECTION = 'checkout_payment';
    private const PAY_LATER_PLACEMENT = 'payment';

    /**
     * @param ModuleManager $moduleManager
     * @param ObjectManagerInterface $objectManager
     * @param UrlInterface $urlBuilder
     * @param ResolverInterface $localeResolver
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly ModuleManager $moduleManager,
        private readonly ObjectManagerInterface $objectManager,
        private readonly UrlInterface $urlBuilder,
        private readonly ResolverInterface $localeResolver,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Checkout config slice, empty when PayPal Express is not available.
     *
     * @return array<string, mixed>
     */
    public function getConfig(): array
    {
        if (!$this->isModuleAvailable()) {
            return [];
        }

        try {
            $section = $this->buildSection();
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion PayPal Express: building the checkout config failed -- ' . $e->getMessage());
            return [];
        }

        return $section === null ? [] : ['hyperion' => ['paypalExpress' => $section]];
    }

    /**
     * Whether the core PayPal module is installed and enabled.
     *
     * @return bool
     */
    private function isModuleAvailable(): bool
    {
        return $this->moduleManager->isEnabled(self::MODULE_NAME)
            && class_exists(self::SMART_BUTTON_CONFIG_CLASS);
    }

    /**
     * Assemble the section, null when no express method is available.
     *
     * @return array<string, mixed>|null
     */
    private function buildSection(): ?array
    {
        $config = $this->objectManager->get(self::CONFIG_FACTORY_CLASS)->create();

        $startUrls = [];
        foreach (self::START_ROUTES as $code => $route) {
            if ($config->isMethodAvailable($code)) {
                $startUrls[$code] = $this->urlBuilder->getUrl($route);
            }
        }
        if ($startUrls === []) {
            return null;
        }

        $config->setMethod(self::METHOD_EXPRESS);
        $smartButton = $this->objectManager->get(self::SMART_BUTTON_CONFIG_CLASS)
            ->getConfig(self::SMART_BUTTON_PAGE);

        return [
            'inContext' => isset($startUrls[self::METHOD_EXPRESS]) && (bool)(int)$config->getValue('in_context'),
            'sdkUrl' => (string)($smartButton['sdkUrl'] ?? ''),
            'dataAttributes' => $this->stringMap($smartButton['dataAttributes'] ?? []),
            'styles' => $this->stringMap($smartButton['styles'] ?? []),
            'getTokenUrl' => $this->urlBuilder->getUrl('paypal/express/getTokenData'),
            'onAuthorizeUrl' => $this->urlBuilder->getUrl('paypal/express/onAuthorization'),
            'onCancelUrl' => $this->urlBuilder->getUrl('paypal/express/cancel'),
            'startUrls' => $startUrls,
            'markImageUrl' => (string)$config->getPaymentMarkImageUrl($this->localeResolver->getLocale()),
            'whatIsPaypalUrl' => (string)$config->getPaymentMarkWhatIsPaypalUrl($this->localeResolver),
            'payLater' => $this->buildPayLater(),
        ];
    }

    /**
     * Pay Later message of the payment step, null when it is switched off.
     *
     * @return array<string, mixed>|null
     */
    private function buildPayLater(): ?array
    {
        if (!class_exists(self::PAY_LATER_CONFIG_CLASS)) {
            return null;
        }

        $payLater = $this->objectManager->get(self::PAY_LATER_CONFIG_CLASS);
        if (!$payLater->isEnabled(self::PAY_LATER_SECTION)) {
            return null;
        }

        $attributes = $this->stringMap($payLater->getSectionConfig(self::PAY_LATER_SECTION, 'style'));
        $attributes['data-pp-placement'] = self::PAY_LATER_PLACEMENT;

        return [
            'enabled' => true,
            'position' => (string)$payLater->getSectionConfig(self::PAY_LATER_SECTION, 'position'),
            'displayAmount' => !$payLater->isPPBillingAgreementEnabled(),
            'attributes' => $attributes,
        ];
    }

    /**
     * Keep the scalar entries of a core config array, as strings.
     *
     * @param mixed $values
     * @return array<string, string>
     */
    private function stringMap(mixed $values): array
    {
        $map = [];
        foreach (is_array($values) ? $values : [] as $key => $value) {
            if (is_scalar($value) && (string)$value !== '') {
                $map[(string)$key] = (string)$value;
            }
        }

        return $map;
    }
}
