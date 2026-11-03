<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\ViewModel;

use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\ObjectManagerInterface;
use Magento\Framework\Serialize\Serializer\Json;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Psr\Log\LoggerInterface;

/**
 * PayPal Pay Later messaging, bridged to Magento_Paypal without a hard
 * dependency on it (classes resolved by name, only when the module is
 * enabled).
 *
 * Placements are the core ones: `home`, `category`, `product`, `cart`
 * and `checkout_payment`; positions `header`, `sidebar` and
 * `near_pp_button`. The rules mirror `Magento\Paypal\Block\PayLater\Banner`.
 */
class PaypalPayLater implements ArgumentInterface
{
    public const POSITION_HEADER = 'header';
    public const POSITION_SIDEBAR = 'sidebar';
    public const POSITION_NEAR_BUTTON = 'near_pp_button';

    private const MODULE_NAME = 'Magento_Paypal';
    private const PAY_LATER_CONFIG_CLASS = 'Magento\Paypal\Model\PayLaterConfig';
    private const SDK_URL_CLASS = 'Magento\Paypal\Model\SdkUrl';
    private const CONFIG_CLASS = 'Magento\Paypal\Model\Config';

    /**
     * @param ModuleManager $moduleManager
     * @param ObjectManagerInterface $objectManager
     * @param Json $json
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly ModuleManager $moduleManager,
        private readonly ObjectManagerInterface $objectManager,
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
            && class_exists(self::PAY_LATER_CONFIG_CLASS)
            && class_exists(self::SDK_URL_CLASS);
    }

    /**
     * Whether the merchant wants a message for the placement, at the position.
     *
     * @param string $placement
     * @param string $position
     * @return bool
     */
    public function isEnabled(string $placement, string $position): bool
    {
        $config = $this->resolve(self::PAY_LATER_CONFIG_CLASS);
        if ($config === null || $placement === '') {
            return false;
        }

        try {
            return $config->isEnabled($placement)
                && (string) $config->getSectionConfig($placement, 'position') === $position;
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion PaypalPayLater: enabled check failed', ['exception' => $e]);
            return false;
        }
    }

    /**
     * Whether the merchant wants a message for the placement, at any position.
     *
     * @param string $placement
     * @return bool
     */
    public function isPlacementEnabled(string $placement): bool
    {
        $config = $this->resolve(self::PAY_LATER_CONFIG_CLASS);
        if ($config === null || $placement === '') {
            return false;
        }

        try {
            return (bool) $config->isEnabled($placement);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion PaypalPayLater: placement check failed', ['exception' => $e]);
            return false;
        }
    }

    /**
     * Position the merchant configured for a placement.
     *
     * @param string $placement
     * @return string
     */
    public function getPosition(string $placement): string
    {
        $config = $this->resolve(self::PAY_LATER_CONFIG_CLASS);
        if ($config === null || $placement === '') {
            return '';
        }

        try {
            return (string) $config->getSectionConfig($placement, 'position');
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion PaypalPayLater: position failed', ['exception' => $e]);
            return '';
        }
    }

    /**
     * The `data-pp-*` attributes of the message.
     *
     * Configured styles and the placement; unset styles are left out.
     *
     * @param string $placement
     * @return array<string, string>
     */
    public function getAttributes(string $placement): array
    {
        $config = $this->resolve(self::PAY_LATER_CONFIG_CLASS);
        if ($config === null || $placement === '') {
            return [];
        }

        try {
            $attributes = [];
            foreach ((array) $config->getSectionConfig($placement, 'style') as $name => $value) {
                if ($value !== null && $value !== '' && str_starts_with((string) $name, 'data-pp-')) {
                    $attributes[(string) $name] = (string) $value;
                }
            }
            $attributes['data-pp-placement'] = $placement;
            return $attributes;
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion PaypalPayLater: style attributes failed', ['exception' => $e]);
            return [];
        }
    }

    /**
     * JSON form of getAttributes().
     *
     * @param string $placement
     * @return string
     */
    public function getAttributesJson(string $placement): string
    {
        return $this->serialize($this->getAttributes($placement));
    }

    /**
     * Whether the amount is sent to PayPal.
     *
     * Core rule: not when billing agreements are enabled.
     *
     * @return bool
     */
    public function canDisplayAmount(): bool
    {
        $config = $this->resolve(self::PAY_LATER_CONFIG_CLASS);
        if ($config === null) {
            return false;
        }

        try {
            return !$config->isPPBillingAgreementEnabled();
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion PaypalPayLater: billing agreement check failed', ['exception' => $e]);
            return false;
        }
    }

    /**
     * URL of the PayPal JavaScript SDK (same one the smart buttons use).
     *
     * @return string
     */
    public function getSdkUrl(): string
    {
        $sdkUrl = $this->resolve(self::SDK_URL_CLASS);
        if ($sdkUrl === null) {
            return '';
        }

        try {
            return (string) $sdkUrl->getUrl();
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion PaypalPayLater: SDK url failed', ['exception' => $e]);
            return '';
        }
    }

    /**
     * Attributes of the SDK `<script>` tag, as JSON.
     *
     * @return string
     */
    public function getSdkAttributesJson(): string
    {
        $config = $this->resolve(self::CONFIG_CLASS);
        if ($config === null) {
            return '{}';
        }

        try {
            return $this->serialize(array_filter([
                'data-partner-attribution-id' => (string) $config->getBuildNotationCode(),
                'data-csp-nonce' => (string) $config->getCspNonce(),
            ]));
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion PaypalPayLater: SDK attributes failed', ['exception' => $e]);
            return '{}';
        }
    }

    /**
     * JSON object of a list of attributes.
     *
     * @param array<string, string> $data
     * @return string
     */
    private function serialize(array $data): string
    {
        try {
            return $data === [] ? '{}' : (string) $this->json->serialize($data);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion PaypalPayLater: serialization failed', ['exception' => $e]);
            return '{}';
        }
    }

    /**
     * Instantiate an optional core class, null when it is not installed.
     *
     * @param string $className
     * @return object|null
     */
    private function resolve(string $className): ?object
    {
        if (!$this->isAvailable() || !class_exists($className)) {
            return null;
        }

        try {
            $instance = $this->objectManager->get($className);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion PaypalPayLater: cannot build ' . $className, ['exception' => $e]);
            return null;
        }

        return is_object($instance) ? $instance : null;
    }
}
