<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Checkout;

use Magento\Captcha\Helper\Data as CaptchaHelper;
use Magento\Captcha\Model\DefaultModel;
use Magento\Checkout\Model\ConfigProviderInterface;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\UrlInterface;
use Magentofullstackdev\HyperionCore\ViewModel\Recaptcha;
use Psr\Log\LoggerInterface;

/**
 * The anti-abuse configuration of the Lit checkout, both mechanisms:
 *
 * - `checkoutConfig.hyperion.recaptcha`: Google reCAPTCHA per protected
 *   action (`place_order`, `coupon_code`, `customer_login`, and `braintree`
 *   when the Braintree module is enabled), each as `{ type, siteKey, badge,
 *   theme, size, hl }` with the client type names `v3`, `v2-invisible`,
 *   `v2-checkbox`. An action without protection has no entry, and the key
 *   itself is absent when no action is protected (an empty PHP array would
 *   serialize as a JSON list where the client expects a map).
 * - `checkoutConfig.hyperion.captcha`: Magento's image CAPTCHA for the forms
 *   the checkout can meet. Core's own `checkoutConfig.captcha` carries the
 *   login form only and generates an image on every page load; here the three
 *   forms are described without generating anything, the client asks
 *   `refreshUrl` for an image when a form requires one and `sectionUrl` for
 *   the current requirement after a failed attempt.
 */
class CaptchaConfigProvider implements ConfigProviderInterface
{
    /** The reCAPTCHA form keys of core the checkout can meet. */
    private const RECAPTCHA_ACTIONS = ['place_order', 'coupon_code', 'customer_login'];

    /** The reCAPTCHA form key the Braintree module registers for its card form. */
    private const RECAPTCHA_BRAINTREE = 'braintree';

    private const BRAINTREE_MODULE = 'PayPal_Braintree';

    /** The keys of one action the client reads. */
    private const RECAPTCHA_KEYS = ['type', 'siteKey', 'badge', 'theme', 'size', 'hl'];

    /** The image CAPTCHA forms: inline login, coupon, place order. */
    private const CAPTCHA_FORMS = ['user_login', 'sales_rule_coupon_request', 'payment_processing_request'];

    /** Image size of core's captcha model when the configuration cannot be read. */
    private const DEFAULT_IMAGE_HEIGHT = 50;
    private const DEFAULT_IMAGE_WIDTH = 200;

    public function __construct(
        private readonly Recaptcha $recaptcha,
        private readonly CaptchaHelper $captchaHelper,
        private readonly CustomerSession $customerSession,
        private readonly UrlInterface $urlBuilder,
        private readonly ModuleManager $moduleManager,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @inheritdoc
     *
     * @return array<string, mixed>
     */
    public function getConfig(): array
    {
        $hyperion = [];
        $recaptcha = $this->buildRecaptcha();
        if ($recaptcha !== []) {
            $hyperion['recaptcha'] = $recaptcha;
        }
        $hyperion['captcha'] = [
            'refreshUrl' => $this->urlBuilder->getUrl('captcha/refresh'),
            'sectionUrl' => $this->urlBuilder->getUrl(
                'customer/section/load',
                ['_query' => ['sections' => 'captcha']]
            ),
            'forms' => $this->buildCaptchaForms(),
        ];

        return ['hyperion' => $hyperion];
    }

    /**
     * @return array<string, array<string, string>>
     */
    private function buildRecaptcha(): array
    {
        $actions = self::RECAPTCHA_ACTIONS;
        if ($this->moduleManager->isEnabled(self::BRAINTREE_MODULE)) {
            $actions[] = self::RECAPTCHA_BRAINTREE;
        }

        $config = [];
        foreach ($actions as $action) {
            $client = $this->recaptcha->getClientConfig($action);
            if ($client === []) {
                continue;
            }
            $entry = [];
            foreach (self::RECAPTCHA_KEYS as $key) {
                $entry[$key] = $client[$key];
            }
            $config[$action] = $entry;
        }
        return $config;
    }

    /**
     * @return array<string, array{isRequired: bool, isCaseSensitive: bool, imageHeight: int, imageWidth: int}>
     */
    private function buildCaptchaForms(): array
    {
        $login = $this->resolveLogin();
        $forms = [];
        foreach (self::CAPTCHA_FORMS as $formId) {
            $forms[$formId] = $this->buildCaptchaForm($formId, $login);
        }
        return $forms;
    }

    /**
     * The state of one form. Reads the model only: no word and no image are
     * generated here.
     *
     * @return array{isRequired: bool, isCaseSensitive: bool, imageHeight: int, imageWidth: int}
     */
    private function buildCaptchaForm(string $formId, ?string $login): array
    {
        $form = [
            'isRequired' => false,
            'isCaseSensitive' => false,
            'imageHeight' => self::DEFAULT_IMAGE_HEIGHT,
            'imageWidth' => self::DEFAULT_IMAGE_WIDTH,
        ];
        try {
            $captcha = $this->captchaHelper->getCaptcha($formId);
            if (!$captcha instanceof DefaultModel) {
                return $form;
            }
            return [
                'isRequired' => (bool)$captcha->isRequired($login),
                'isCaseSensitive' => (bool)$captcha->isCaseSensitive(),
                'imageHeight' => (int)$captcha->getHeight() ?: self::DEFAULT_IMAGE_HEIGHT,
                'imageWidth' => (int)$captcha->getWidth() ?: self::DEFAULT_IMAGE_WIDTH,
            ];
        } catch (\Throwable $e) {
            $this->logger->error(
                'Hyperion checkout: captcha state of "' . $formId . '" unavailable: ' . $e->getMessage(),
                ['exception' => $e]
            );
            return $form;
        }
    }

    /**
     * The login core counts failed attempts against: the customer email, null
     * for a guest.
     */
    private function resolveLogin(): ?string
    {
        try {
            if (!$this->customerSession->isLoggedIn()) {
                return null;
            }
            $email = trim((string)$this->customerSession->getCustomerData()->getEmail());
            return $email === '' ? null : $email;
        } catch (\Throwable $e) {
            $this->logger->error(
                'Hyperion checkout: customer email for the captcha state unavailable: ' . $e->getMessage(),
                ['exception' => $e]
            );
            return null;
        }
    }
}
