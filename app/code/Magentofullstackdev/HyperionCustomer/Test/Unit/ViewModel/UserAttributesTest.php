<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\Test\Unit\ViewModel;

use Magento\Customer\Model\Attribute;
use Magento\Customer\Model\AttributeMetadataDataProvider;
use Magento\Eav\Model\Entity\Attribute\Source\AbstractSource;
use Magento\Framework\Api\AttributeInterface;
use Magento\Framework\Api\CustomAttributesDataInterface;
use Magento\Framework\DataObject;
use Magento\Framework\Stdlib\DateTime\TimezoneInterface;
use Magentofullstackdev\HyperionCustomer\ViewModel\UserAttributes;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class UserAttributesTest extends TestCase
{
    public function testOnlyVisibleUserDefinedAttributesOutsideTheDenyList(): void
    {
        $viewModel = $this->viewModel([
            $this->attribute('fiscal_code'),
            $this->attribute('sdi_code'),
            $this->attribute('firstname', 'text', false),
            $this->attribute('hidden_flag', 'text', true, false),
        ], ['sdi_code']);

        $codes = array_column($viewModel->getFields('customer', 'customer_account_create'), 'code');

        $this->assertSame(['fiscal_code'], $codes);
    }

    public function testFileInputIsSkippedAndLoggedOnce(): void
    {
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects($this->once())
            ->method('debug')
            ->with($this->stringContains('id_scan'));
        $viewModel = $this->viewModel([$this->attribute('id_scan', 'file'), $this->attribute('note')], [], $logger);

        $first = $viewModel->getFields('customer', 'customer_account_edit');
        $second = $viewModel->getFields('customer', 'customer_account_edit');

        $this->assertSame(['note'], array_column($first, 'code'));
        $this->assertSame(['note'], array_column($second, 'code'));
    }

    public function testOptionValuesAreStringsAndEmptyOptionsAreDropped(): void
    {
        $viewModel = $this->viewModel([
            $this->attribute('customer_type', 'select', true, true, [
                ['value' => '', 'label' => ' '],
                ['value' => 12, 'label' => 'Business'],
                ['value' => 13, 'label' => 'Private'],
            ]),
        ]);

        $field = $viewModel->getFields('customer', 'customer_account_create')[0];

        $this->assertSame(
            [['value' => '12', 'label' => 'Business'], ['value' => '13', 'label' => 'Private']],
            $field['options']
        );
        $this->assertSame('select', $field['input']);
        $this->assertTrue($field['required']);
    }

    public function testValuesComeFromTheEntityShapedForTheInput(): void
    {
        $viewModel = $this->viewModel([
            $this->attribute('fiscal_code'),
            $this->attribute('sectors', 'multiselect', true, true, [
                ['value' => 4, 'label' => 'Retail'],
                ['value' => 7, 'label' => 'Wholesale'],
            ]),
            $this->attribute('lines', 'multiline'),
            $this->attribute('founded', 'date'),
        ]);
        $entity = new DataObject([
            'fiscal_code' => 'RSSMRA80A01H501U',
            'sectors' => '4,7',
            'lines' => "first\nsecond",
            'founded' => '2001-02-03 00:00:00',
        ]);

        $fields = $viewModel->getFields('customer', 'customer_account_edit', $entity);

        $this->assertSame('RSSMRA80A01H501U', $fields[0]['value']);
        $this->assertSame(['4', '7'], $fields[1]['value']);
        $this->assertSame(['first', 'second'], $fields[2]['value']);
        $this->assertSame(2, $fields[2]['lines']);
        $this->assertSame('2001-02-03', $fields[3]['value']);
    }

    public function testValueFromCustomAttributesOfADataModel(): void
    {
        $viewModel = $this->viewModel([$this->attribute('fiscal_code')]);
        $customAttribute = $this->createStub(AttributeInterface::class);
        $customAttribute->method('getValue')->willReturn('ABC123');
        $customer = $this->createStub(CustomAttributesDataInterface::class);
        $customer->method('getCustomAttribute')->willReturn($customAttribute);

        $field = $viewModel->getFields('customer', 'customer_account_edit', $customer)[0];

        $this->assertSame('ABC123', $field['value']);
    }

    public function testValidationRulesArePassedThrough(): void
    {
        $attribute = $this->attribute('fiscal_code', 'text', true, true, [], [
            'min_text_length' => '16',
            'max_text_length' => '16',
            'input_validation' => 'alphanumeric',
            'unknown_rule' => 'x',
        ]);

        $field = $this->viewModel([$attribute])->getFields('customer', 'customer_account_create')[0];

        $this->assertSame(
            ['min_text_length' => 16, 'max_text_length' => 16, 'input_validation' => 'alphanumeric'],
            $field['rules']
        );
    }

    /**
     * @param Attribute[] $attributes
     * @param string[] $excluded
     */
    private function viewModel(array $attributes, array $excluded = [], ?LoggerInterface $logger = null): UserAttributes
    {
        $provider = $this->createStub(AttributeMetadataDataProvider::class);
        $provider->method('loadAttributesCollection')->willReturn($attributes);

        return new UserAttributes(
            $provider,
            $this->createStub(TimezoneInterface::class),
            $logger ?? $this->createStub(LoggerInterface::class),
            $excluded
        );
    }

    /**
     * @param array<int, array<string, mixed>> $options
     * @param array<string, string> $rules
     */
    private function attribute(
        string $code,
        string $input = 'text',
        bool $userDefined = true,
        bool $visible = true,
        array $options = [],
        array $rules = []
    ): Attribute {
        $attribute = $this->createStub(Attribute::class);
        $attribute->method('getAttributeCode')->willReturn($code);
        $attribute->method('getFrontendInput')->willReturn($input);
        $attribute->method('getIsUserDefined')->willReturn($userDefined ? '1' : '0');
        $attribute->method('getIsVisible')->willReturn($visible ? '1' : '0');
        $attribute->method('getIsRequired')->willReturn($input === 'select' ? '1' : '0');
        $attribute->method('getStoreLabel')->willReturn(ucfirst(str_replace('_', ' ', $code)));
        $attribute->method('getValidateRules')->willReturn($rules);
        $attribute->method('getMultilineCount')->willReturn($input === 'multiline' ? '2' : null);
        if ($options !== []) {
            $source = $this->createStub(AbstractSource::class);
            $source->method('getAllOptions')->willReturn($options);
            $attribute->method('getSource')->willReturn($source);
        }
        return $attribute;
    }
}
