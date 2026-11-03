<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\ViewModel;

use Magento\Customer\Helper\Address as AddressHelper;
use Magento\Directory\Helper\Data as DirectoryHelper;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Psr\Log\LoggerInterface;

/**
 * Hyperion address-form view model.
 *
 * Feeds the address forms (address book, registration) and the
 * <hyperion-region-select> component: the country -> regions JSON map,
 * the country option list, the regions of one country for the
 * server-rendered select, and the directory flags (state required,
 * optional zip, optional state shown). Delegates to Magento's core
 * DirectoryHelper so country eligibility (allowed countries,
 * state-required flags) stays consistent with the rest of the
 * platform and with the checkout address form.
 */
class AddressForm implements ArgumentInterface
{
    public function __construct(
        private readonly DirectoryHelper $directoryHelper,
        private readonly LoggerInterface $logger,
        private readonly AddressHelper $addressHelper
    ) {
    }

    /**
     * Whether the VAT number field is shown on the storefront address forms
     * (`customer/create_account/vat_frontend_visibility`).
     */
    public function isVatVisible(): bool
    {
        try {
            return (bool) $this->addressHelper->isVatAttributeVisible();
        } catch (\Throwable $e) {
            $this->logger->error('AddressForm::isVatVisible failed', ['exception' => $e]);
            return false;
        }
    }

    /**
     * Core's validation classes of an address attribute (`required-entry`,
     * `validate-length maximum-length-...`), empty when unknown.
     */
    public function getAttributeValidationClass(string $attributeCode): string
    {
        try {
            return (string) $this->addressHelper->getAttributeValidationClass($attributeCode);
        } catch (\Throwable $e) {
            $this->logger->error('AddressForm::getAttributeValidationClass failed', ['exception' => $e]);
            return '';
        }
    }

    /**
     * Pre-encoded JSON map { "<countryId>": { "regions": [...] }, ... }
     * ready to paste into a `data-` attribute.
     */
    public function getRegionsJson(): string
    {
        try {
            return $this->directoryHelper->getRegionJson();
        } catch (\Throwable $e) {
            $this->logger->error('AddressForm::getRegionsJson: region JSON lookup failed', ['exception' => $e]);
            return '{}';
        }
    }

    /**
     * List of ISO codes (e.g. 'US', 'CA') whose regions are treated as
     * required per store config. Consumed by the template to decide
     * whether the state select should carry a `required` attribute.
     *
     * @return string[]
     */
    public function getCountriesWithRequiredStates(): array
    {
        try {
            $countries = $this->directoryHelper->getCountriesWithStatesRequired();
            return array_values(array_filter(array_map('strval', (array) $countries)));
        } catch (\Throwable $e) {
            $this->logger->error(
                'AddressForm::getCountriesWithRequiredStates: directory lookup failed',
                ['exception' => $e]
            );
            return [];
        }
    }

    /**
     * Regions of one country as `[['id' => '12', 'name' => 'California'], ...]`,
     * sorted by name, for the server-rendered region select.
     *
     * @param string $countryId
     * @return array<int, array{id: string, name: string}>
     */
    public function getRegionsForCountry(string $countryId): array
    {
        try {
            $regions = [];
            foreach ((array) ($this->directoryHelper->getRegionData()[$countryId] ?? []) as $regionId => $region) {
                $name = is_array($region) ? (string) ($region['name'] ?? '') : (string) $region;
                if ($name !== '') {
                    $regions[] = ['id' => (string) $regionId, 'name' => $name];
                }
            }
            usort($regions, static fn (array $a, array $b): int => strnatcasecmp($a['name'], $b['name']));

            return $regions;
        } catch (\Throwable $e) {
            $this->logger->error('AddressForm::getRegionsForCountry: region lookup failed', ['exception' => $e]);
            return [];
        }
    }

    /**
     * Allowed countries of the store as `[['value' => 'US', 'label' => 'United States'], ...]`,
     * the configured top destinations first.
     *
     * @return array<int, array{value: string, label: string}>
     */
    public function getCountryOptions(): array
    {
        try {
            $options = $this->directoryHelper->getCountryCollection()
                ->setForegroundCountries($this->directoryHelper->getTopCountryCodes())
                ->toOptionArray(false);
            $result = [];
            foreach ($options as $option) {
                $value = (string) ($option['value'] ?? '');
                if ($value !== '') {
                    $result[] = ['value' => $value, 'label' => (string) ($option['label'] ?? $value)];
                }
            }

            return $result;
        } catch (\Throwable $e) {
            $this->logger->error('AddressForm::getCountryOptions: country lookup failed', ['exception' => $e]);
            return [];
        }
    }

    /**
     * Countries whose postcode is optional (`general/country/optional_zip_countries`).
     *
     * @return string[]
     */
    public function getCountriesWithOptionalZip(): array
    {
        try {
            $countries = $this->directoryHelper->getCountriesWithOptionalZip();
            return array_values(array_filter(array_map('strval', (array) $countries)));
        } catch (\Throwable $e) {
            $this->logger->error('AddressForm::getCountriesWithOptionalZip: directory lookup failed', ['exception' => $e]);
            return [];
        }
    }

    /**
     * `general/region/display_all`: show the region select for a country
     * that has regions but does not require one.
     */
    public function isOptionalRegionAllowed(): bool
    {
        try {
            return (bool) $this->directoryHelper->isShowNonRequiredState();
        } catch (\Throwable $e) {
            $this->logger->error('AddressForm::isOptionalRegionAllowed: config lookup failed', ['exception' => $e]);
            return true;
        }
    }

    public function isRegionRequired(): bool
    {
        try {
            return (bool) $this->directoryHelper->isRegionRequired(
                $this->directoryHelper->getDefaultCountry()
            );
        } catch (\Throwable $e) {
            $this->logger->error(
                'AddressForm::isRegionRequired: default country region check failed',
                ['exception' => $e]
            );
            return false;
        }
    }
}
