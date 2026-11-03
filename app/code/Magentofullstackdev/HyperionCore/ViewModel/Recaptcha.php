<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\ViewModel;

use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\ReCaptchaUi\Model\CaptchaTypeResolverInterface;
use Magento\ReCaptchaUi\Model\IsCaptchaEnabledInterface;
use Magento\ReCaptchaUi\Model\UiConfigResolverInterface;
use Psr\Log\LoggerInterface;

/**
 * Read model over Magento's reCAPTCHA configuration for the storefront.
 *
 * Magento's own frontend implementation (Magento_ReCaptchaFrontendUi) is a
 * Knockout / RequireJS component, which Hyperion does not ship. The
 * backend side (per-form observers, the webapi validators, the Google
 * siteverify call) is framework-agnostic and is reused as is: the theme
 * only has to put a `g-recaptcha-response` value into the POST body (or
 * an `X-ReCaptcha` header for REST calls). This view model tells the
 * templates and the checkout config provider what to render for a given
 * form key (`customer_login`, `contact`, `place_order`, ...).
 */
class Recaptcha implements ArgumentInterface
{
    public const TYPE_V3 = 'recaptcha_v3';
    public const TYPE_V2_CHECKBOX = 'recaptcha';
    public const TYPE_V2_INVISIBLE = 'invisible';

    /** Client-side type names understood by <hyperion-recaptcha>. */
    private const CLIENT_TYPES = [
        self::TYPE_V3 => 'v3',
        self::TYPE_V2_CHECKBOX => 'v2-checkbox',
        self::TYPE_V2_INVISIBLE => 'v2-invisible',
    ];

    public function __construct(
        private readonly IsCaptchaEnabledInterface $isCaptchaEnabled,
        private readonly UiConfigResolverInterface $uiConfigResolver,
        private readonly CaptchaTypeResolverInterface $captchaTypeResolver,
        private readonly LoggerInterface $logger
    ) {
    }

    public function isEnabledFor(string $formKey): bool
    {
        try {
            return $this->isCaptchaEnabled->isCaptchaEnabledFor($formKey);
        } catch (\Throwable $e) {
            $this->logger->warning('Recaptcha::isEnabledFor(' . $formKey . ')', ['exception' => $e]);
            return false;
        }
    }

    /**
     * Magento's type code for the form (`recaptcha_v3`, `recaptcha`,
     * `invisible`), or an empty string when the form has no reCAPTCHA.
     */
    public function getTypeFor(string $formKey): string
    {
        if (!$this->isEnabledFor($formKey)) {
            return '';
        }
        try {
            return (string) ($this->captchaTypeResolver->getCaptchaTypeFor($formKey) ?? '');
        } catch (\Throwable $e) {
            $this->logger->warning('Recaptcha::getTypeFor(' . $formKey . ')', ['exception' => $e]);
            return '';
        }
    }

    /**
     * The UI config Magento computes for the form: `['rendering' =>
     * ['sitekey' => ..., ...], 'invisible' => bool]`. Empty when disabled.
     *
     * @return array<string, mixed>
     */
    public function getUiConfig(string $formKey): array
    {
        if (!$this->isEnabledFor($formKey)) {
            return [];
        }
        try {
            return $this->uiConfigResolver->get($formKey);
        } catch (\Throwable $e) {
            $this->logger->warning('Recaptcha::getUiConfig(' . $formKey . ')', ['exception' => $e]);
            return [];
        }
    }

    /**
     * Flattened attributes for the <hyperion-recaptcha> element, or an
     * empty array when the form has no reCAPTCHA or no site key.
     *
     * @return array{siteKey: string, type: string, action: string, badge: string, theme: string, size: string, hl: string}|array{}
     */
    public function getClientConfig(string $formKey): array
    {
        $type = $this->getTypeFor($formKey);
        if ($type === '') {
            return [];
        }
        $rendering = (array) ($this->getUiConfig($formKey)['rendering'] ?? []);
        $siteKey = (string) ($rendering['sitekey'] ?? '');
        if ($siteKey === '') {
            return [];
        }

        return [
            'siteKey' => $siteKey,
            'type' => self::CLIENT_TYPES[$type] ?? 'v3',
            'action' => $formKey,
            'badge' => (string) ($rendering['badge'] ?? 'bottomright'),
            'theme' => (string) ($rendering['theme'] ?? 'light'),
            'size' => (string) ($rendering['size'] ?? 'normal'),
            'hl' => (string) ($rendering['hl'] ?? ''),
        ];
    }
}
