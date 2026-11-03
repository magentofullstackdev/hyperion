<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Checkout;

use Magento\Checkout\Model\ConfigProviderInterface;
use Magento\Config\Model\Config\Source\Nooptreq;
use Magento\Customer\Helper\Address as AddressHelper;

/**
 * Name prefix / middle name / suffix settings for the Lit checkout
 * address form (`checkoutConfig.hyperion.nameFields`).
 *
 * Reads the same `customer/address/*` values the Knockout checkout gets
 * through the customer address attribute metadata: `prefix_show` and
 * `suffix_show` are no / opt / req, `middlename_show` is a yes / no flag
 * (core never requires the middle name). `prefix_options` and
 * `suffix_options` are semicolon lists; an empty list means a free text
 * input. The option labels are translated but not HTML escaped: they
 * travel as JSON and Lit escapes them on render.
 */
class NameFieldsConfigProvider implements ConfigProviderInterface
{
    private const SHOW_NO = 'no';
    private const SHOW_OPTIONAL = 'opt';
    private const SHOW_REQUIRED = 'req';

    /**
     * @param AddressHelper $addressHelper
     */
    public function __construct(
        private readonly AddressHelper $addressHelper
    ) {
    }

    /**
     * @inheritdoc
     *
     * @return array<string, mixed>
     */
    public function getConfig(): array
    {
        return [
            'hyperion' => [
                'nameFields' => [
                    'prefix' => [
                        'show' => $this->readShow('prefix_show'),
                        'options' => $this->readOptions('prefix_options'),
                    ],
                    'middlename' => [
                        'show' => $this->addressHelper->getConfig('middlename_show')
                            ? self::SHOW_OPTIONAL
                            : self::SHOW_NO,
                    ],
                    'suffix' => [
                        'show' => $this->readShow('suffix_show'),
                        'options' => $this->readOptions('suffix_options'),
                    ],
                ],
            ],
        ];
    }

    /**
     * Normalised no / opt / req value of a `customer/address/*_show` setting.
     *
     * @param string $key
     * @return string
     */
    private function readShow(string $key): string
    {
        return match ((string)$this->addressHelper->getConfig($key)) {
            Nooptreq::VALUE_REQUIRED => self::SHOW_REQUIRED,
            Nooptreq::VALUE_OPTIONAL => self::SHOW_OPTIONAL,
            default => self::SHOW_NO,
        };
    }

    /**
     * Translated, trimmed entries of a semicolon separated option list.
     *
     * @param string $key
     * @return string[]
     */
    private function readOptions(string $key): array
    {
        $raw = trim((string)$this->addressHelper->getConfig($key));
        if ($raw === '') {
            return [];
        }

        $options = [];
        foreach (explode(';', $raw) as $value) {
            $label = trim((string)__(trim($value)));
            if ($label !== '') {
                $options[] = $label;
            }
        }

        return $options;
    }
}
