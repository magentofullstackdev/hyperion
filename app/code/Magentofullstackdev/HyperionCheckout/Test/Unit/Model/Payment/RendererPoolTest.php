<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Payment;

use Magento\Framework\ObjectManagerInterface;
use Magento\Quote\Api\Data\CartInterface;
use Magentofullstackdev\HyperionCheckout\Api\ExtensionOptionsProviderInterface;
use Magentofullstackdev\HyperionCheckout\Model\Payment\RendererPool;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * The payment renderer pool: validation of the di.xml items, the matching
 * order, the emitted `PaymentRendererConfig` shape and the lazy, guarded
 * options providers.
 *
 * @covers \Magentofullstackdev\HyperionCheckout\Model\Payment\RendererPool
 */
class RendererPoolTest extends RendererPoolTestCase
{
    private const VALID_ELEMENT = [
        'method' => 'vendor_psp_card',
        'tag' => 'vendor-psp-card',
        'module' => 'Vendor_Psp::js/hyperion/card.js',
    ];

    /**
     * @return array<string, array{0: mixed, 1: bool}>
     */
    public static function itemProvider(): array
    {
        $element = self::VALID_ELEMENT;
        return [
            'a minimal element entry is valid' => [$element, true],
            'a pattern entry is valid' => [['pattern' => '^vendor_psp_(cc|wallet)$'] + array_diff_key($element, ['method' => 1]), true],
            'an item that is not an array' => ['vendor_psp_card', false],
            'no method and no pattern' => [array_diff_key($element, ['method' => 1]), false],
            'a method with a space' => [['method' => 'vendor psp'] + $element, false],
            'an invalid pattern' => [['pattern' => '^(vendor'] + array_diff_key($element, ['method' => 1]), false],
            'an unknown type' => [['type' => 'iframe'] + $element, false],
            'an element without a tag' => [array_diff_key($element, ['tag' => 1]), false],
            'an element without a module' => [array_diff_key($element, ['module' => 1]), false],
            'a tag without a hyphen' => [['tag' => 'vendorcard'] + $element, false],
            'a tag with an upper case letter' => [['tag' => 'Vendor-card'] + $element, false],
            'a tag with a reserved prefix' => [['tag' => 'payment-card'] + $element, false],
            'a tag with the hyperion prefix' => [['tag' => 'hyperion-card'] + $element, false],
            'a module that is not an asset id' => [['module' => 'https://cdn.test/card.js'] + $element, false],
            'a module that leaves its directory' => [['module' => 'Vendor_Psp::../card.js'] + $element, false],
            'a module that is not a script' => [['module' => 'Vendor_Psp::js/card.css'] + $element, false],
            'api version 1.2 is accepted' => [['api_version' => '1.2'] + $element, true],
            'api version 2 is refused' => [['api_version' => '2'] + $element, false],
            'a third party claiming internal keeps the prefix rule' => [
                ['internal' => true, 'tag' => 'payment-card'] + $element,
                false,
            ],
            'a built-in without internal' => [['method' => 'vendor', 'builtin' => 'offline'], false],
            'an internal built-in' => [['method' => 'checkmo', 'builtin' => 'offline', 'internal' => true], true],
            'an internal built-in with a reserved tag' => [
                ['method' => 'checkmo', 'builtin' => 'offline', 'internal' => true, 'tag' => 'hc-payment-offline'],
                true,
            ],
            'a redirect with a route' => [['method' => 'ideal', 'type' => 'redirect', 'redirect_route' => 'psp/checkout/redirect'], true],
            'a redirect with a config path' => [
                ['method' => 'ideal', 'type' => 'redirect', 'redirect_config_path' => 'payment.ideal.redirectUrl'],
                true,
            ],
            'a redirect with both targets' => [[
                'method' => 'ideal',
                'type' => 'redirect',
                'redirect_route' => 'psp/checkout/redirect',
                'redirect_config_path' => 'payment.ideal.redirectUrl',
            ], false],
            'a redirect without a target' => [['method' => 'ideal', 'type' => 'redirect'], false],
            'a redirect route that is a URL' => [
                ['method' => 'ideal', 'type' => 'redirect', 'redirect_route' => 'https://pay.test/start'],
                false,
            ],
            'a redirect before order with a route' => [
                ['method' => 'ideal', 'type' => 'redirect-before-order', 'redirect_route' => 'psp/checkout/start'],
                true,
            ],
            'a redirect before order with a config path only' => [
                ['method' => 'ideal', 'type' => 'redirect-before-order', 'redirect_config_path' => 'payment.ideal.url'],
                false,
            ],
            'a form without fields' => [['method' => 'invoice', 'type' => 'form'], false],
            'a form field with an invalid name' => [
                ['method' => 'invoice', 'type' => 'form', 'fields' => ['Date-Of-Birth' => ['label' => 'Date of birth']]],
                false,
            ],
            'a form field without a label' => [
                ['method' => 'invoice', 'type' => 'form', 'fields' => ['dob' => ['type' => 'date']]],
                false,
            ],
            'a form field with an unknown target' => [
                ['method' => 'invoice', 'type' => 'form', 'fields' => ['dob' => ['label' => 'Date', 'target' => 'customer']]],
                false,
            ],
            'two fields targeting the purchase order number' => [[
                'method' => 'invoice',
                'type' => 'form',
                'fields' => [
                    'po' => ['label' => 'PO', 'target' => 'po_number'],
                    'po_again' => ['label' => 'PO again', 'target' => 'po_number'],
                ],
            ], false],
            'a select field without options' => [
                ['method' => 'invoice', 'type' => 'form', 'fields' => ['plan' => ['label' => 'Plan', 'type' => 'select']]],
                false,
            ],
            'a valid form' => [
                ['method' => 'invoice', 'type' => 'form', 'fields' => ['dob' => ['label' => 'Date of birth', 'type' => 'date']]],
                true,
            ],
        ];
    }

    #[DataProvider('itemProvider')]
    public function testValidatesEachItem(mixed $item, bool $valid): void
    {
        $entries = $this->pool(['entry' => $item])->getEntries();

        self::assertSame($valid, isset($entries['entry']));
        if ($valid) {
            self::assertSame([], $this->loggedAt('error'));
        } else {
            self::assertNotEmpty($this->loggedAt('error'), 'a dropped entry is logged');
            self::assertStringContainsString('"entry" dropped', (string)end($this->logged)['message']);
        }
    }

    public function testAnUnknownKeyIsIgnoredWithANotice(): void
    {
        $entries = $this->pool(['entry' => ['client_gate' => 'apple-pay'] + self::VALID_ELEMENT])->getEntries();

        self::assertArrayHasKey('entry', $entries);
        self::assertArrayNotHasKey('client_gate', $entries['entry']);
        self::assertCount(1, $this->loggedAt('notice'));
        self::assertStringContainsString('"client_gate"', $this->loggedAt('notice')[0]);
        self::assertSame([], $this->loggedAt('error'));
    }

    public function testAnInvalidOptionalValueFallsBackToItsDefault(): void
    {
        $entries = $this->pool([
            'entry' => ['saves_on_selection' => 'sometimes', 'sort_order' => 'first'] + self::VALID_ELEMENT,
        ])->getEntries();

        self::assertTrue($entries['entry']['saves_on_selection']);
        self::assertSame(0, $entries['entry']['sort_order']);
        self::assertCount(2, $this->loggedAt('error'));
    }

    public function testFlagsDefaultsAndSavesOnSelectionOptOut(): void
    {
        $entries = $this->pool([
            'defaults' => self::VALID_ELEMENT,
            'opt_out' => ['method' => 'other', 'saves_on_selection' => false] + self::VALID_ELEMENT,
        ])->getEntries();

        self::assertFalse($entries['defaults']['owns_place_order']);
        self::assertFalse($entries['defaults']['eager']);
        self::assertFalse($entries['defaults']['awaits_ready']);
        self::assertTrue($entries['defaults']['saves_on_selection']);
        self::assertSame('1', $entries['defaults']['api_version']);
        self::assertFalse($entries['opt_out']['saves_on_selection']);
    }

    public function testInvalidRedirectHostsAreIgnoredOneByOne(): void
    {
        $entries = $this->pool([
            'entry' => ['redirect_hosts' => [
                'acs' => '3ds.vendor-psp.example',
                'scheme' => 'https://pay.example',
                'upper' => 'Pay.Example',
                'wildcard' => '*.example',
                'path' => 'pay.example/start',
            ]] + self::VALID_ELEMENT,
        ])->getEntries();

        self::assertSame(['3ds.vendor-psp.example'], $entries['entry']['redirect_hosts']);
        self::assertCount(4, $this->loggedAt('error'));
    }

    public function testExactMethodWinsOverAnyPattern(): void
    {
        $pool = $this->pool([
            'pattern_first' => ['pattern' => 'vendor_.*', 'sort_order' => '1'] + array_diff_key(self::VALID_ELEMENT, ['method' => 1]),
            'exact' => ['sort_order' => '99'] + self::VALID_ELEMENT,
        ]);

        self::assertSame('exact', $pool->match('vendor_psp_card')['id'] ?? null);
        self::assertSame('pattern_first', $pool->match('vendor_other')['id'] ?? null);
        self::assertNull($pool->match('checkmo'));
        self::assertFalse($pool->isSupported('checkmo'));
        self::assertTrue($pool->isSupported('vendor_other'));
        self::assertCount(1, $this->loggedAt('notice'), 'the shadowed pattern entry is logged');
    }

    public function testTheLowerSortOrderWinsBetweenPatterns(): void
    {
        $base = array_diff_key(self::VALID_ELEMENT, ['method' => 1]);
        $pool = $this->pool([
            'a_late' => ['pattern' => 'psp_.*', 'sort_order' => '50'] + $base,
            'z_early' => ['pattern' => '^psp_card$', 'sort_order' => '5'] + $base,
        ]);

        self::assertSame('z_early', $pool->match('psp_card')['id'] ?? null);
        self::assertSame('a_late', $pool->match('psp_wallet')['id'] ?? null);
        self::assertSame(['z_early', 'a_late'], array_keys($pool->getEntries()));
    }

    public function testAPatternMatchesTheWholeCodeLikeTheBrowser(): void
    {
        $base = array_diff_key(self::VALID_ELEMENT, ['method' => 1]);
        $pool = $this->pool(['prefix' => ['pattern' => '^psp_'] + $base]);

        self::assertNull($pool->match('psp_card'), 'a prefix alone does not match the whole code');
        self::assertNull(RendererPool::matchEmitted([['id' => 'p', 'method' => null, 'pattern' => 'psp']], 'psp_card'));
        self::assertSame('p', RendererPool::matchEmitted([['id' => 'p', 'method' => null, 'pattern' => 'psp_(card|wallet)']], 'psp_card')['id'] ?? null);
    }

    public function testMethodWinsOverPatternInsideOneItem(): void
    {
        $entries = $this->pool(['entry' => ['pattern' => '^vendor_'] + self::VALID_ELEMENT])->getEntries();

        self::assertSame('vendor_psp_card', $entries['entry']['method']);
        self::assertNull($entries['entry']['pattern']);
    }

    public function testNothingIsInstantiatedUntilTheConfigurationIsBuilt(): void
    {
        $objectManager = $this->createMock(ObjectManagerInterface::class);
        $objectManager->expects(self::never())->method('get');
        $objectManager->expects(self::never())->method('create');

        $pool = $this->pool([
            'entry' => ['options_provider' => 'Vendor\Psp\Model\Missing'] + self::VALID_ELEMENT,
        ], $objectManager);
        $pool->getEntries();
        $pool->match('vendor_psp_card');
        $pool->getRendererConfig($this->createStub(CartInterface::class), ['checkmo']);
    }

    public function testAThrowingOptionsProviderDropsOnlyItsEntry(): void
    {
        $throwing = $this->createStub(ExtensionOptionsProviderInterface::class);
        $throwing->method('getOptions')->willThrowException(new \RuntimeException('gateway down'));
        $working = $this->createStub(ExtensionOptionsProviderInterface::class);
        $working->method('getOptions')->willReturn(['brand' => 'Live', 'extra' => 1]);
        $objectManager = $this->createStub(ObjectManagerInterface::class);
        $objectManager->method('get')->willReturnMap([
            ['Vendor\Throwing', $throwing],
            ['Vendor\Working', $working],
            ['Vendor\NotAProvider', new \stdClass()],
        ]);

        $config = $this->pool([
            'broken' => ['method' => 'a', 'options_provider' => 'Vendor\Throwing'] + self::VALID_ELEMENT,
            'wrong' => ['method' => 'b', 'options_provider' => 'Vendor\NotAProvider'] + self::VALID_ELEMENT,
            'fine' => [
                'method' => 'c',
                'options' => ['brand' => 'Static', 'kept' => true],
                'options_provider' => 'Vendor\Working',
            ] + self::VALID_ELEMENT,
        ], $objectManager)->getRendererConfig($this->createStub(CartInterface::class), ['a', 'b', 'c']);

        self::assertSame(['fine'], array_column($config['renderers'], 'id'));
        self::assertSame(['brand' => 'Live', 'kept' => true, 'extra' => 1], $config['renderers'][0]['options']);
        self::assertCount(2, $this->loggedAt('error'));
    }

    public function testOnlyEntriesOfActiveMethodsAreEmitted(): void
    {
        $config = $this->pool(self::FIRST_PARTY)->getRendererConfig(null, ['checkmo', 'free', 'purchaseorder']);

        self::assertSame(['offline', 'purchaseorder'], array_column($config['renderers'], 'id'));
        self::assertSame([], $config['staticOrigins']);
    }

    public function testModuleUrlsFromTheStaticOriginAreListedAndForeignOnesDropped(): void
    {
        $config = $this->pool([
            'cdn' => self::VALID_ELEMENT,
            'foreign' => ['method' => 'other', 'module' => 'Foreign_Psp::js/card.js'] + self::VALID_ELEMENT,
        ])->getRendererConfig(null, ['vendor_psp_card', 'other']);

        self::assertSame(['cdn'], array_column($config['renderers'], 'id'));
        self::assertSame(
            'https://cdn.test/static/frontend/Vendor/theme/en_US/Vendor_Psp/js/hyperion/card.js',
            $config['renderers'][0]['moduleUrl']
        );
        self::assertSame(['https://cdn.test'], $config['staticOrigins']);
        self::assertCount(1, $this->loggedAt('error'));
    }

    public function testEmitsTheContractShapeOfAThirdPartyEntry(): void
    {
        $config = $this->pool([
            'vendor_psp_card' => [
                'method' => 'vendor_psp_card',
                'type' => 'element',
                'tag' => 'vendor-psp-card',
                'module' => 'Vendor_Psp::js/hyperion/card.js',
                'api_version' => '1',
                'owns_place_order' => false,
                'eager' => false,
                'awaits_ready' => true,
                'saves_on_selection' => true,
                'sort_order' => '10',
                'options' => ['brand' => 'Vendor PSP'],
                'phrases' => ['card_number' => 'Card number'],
                'redirect_hosts' => ['acs' => '3ds.vendor-psp.example'],
            ],
            'vendor_psp_ideal' => [
                'method' => 'vendor_psp_ideal',
                'type' => 'redirect',
                'redirect_route' => 'vendorpsp/checkout/redirect',
                'redirect_hosts' => ['pay' => 'pay.vendor-psp.example'],
            ],
            'vendor_invoice' => [
                'method' => 'vendor_invoice',
                'type' => 'form',
                'fields' => [
                    'dob' => ['label' => 'Date of birth', 'type' => 'date', 'required' => true, 'target' => 'additional_data'],
                ],
            ],
        ])->getRendererConfig(null, ['vendor_psp_card', 'vendor_psp_ideal', 'vendor_invoice']);

        self::assertJsonStringEqualsJsonString(
            (string)json_encode([
                [
                    'id' => 'vendor_invoice', 'method' => 'vendor_invoice', 'pattern' => null, 'type' => 'form',
                    'tag' => null, 'moduleUrl' => null, 'builtin' => null, 'apiVersion' => '1',
                    'ownsPlaceOrder' => false, 'eager' => false, 'awaitsReady' => false,
                    'savesOnSelection' => true, 'sortOrder' => 0, 'options' => new \stdClass(),
                    'phrases' => new \stdClass(), 'redirectHosts' => [], 'redirect' => null,
                    'fields' => [[
                        'name' => 'dob', 'label' => 'Date of birth', 'type' => 'date', 'required' => true,
                        'pattern' => null, 'options' => [], 'target' => 'additional_data',
                    ]],
                ],
                [
                    'id' => 'vendor_psp_ideal', 'method' => 'vendor_psp_ideal', 'pattern' => null,
                    'type' => 'redirect', 'tag' => null, 'moduleUrl' => null, 'builtin' => null,
                    'apiVersion' => '1', 'ownsPlaceOrder' => false, 'eager' => false, 'awaitsReady' => false,
                    'savesOnSelection' => true, 'sortOrder' => 0, 'options' => new \stdClass(),
                    'phrases' => new \stdClass(), 'redirectHosts' => ['pay.vendor-psp.example'],
                    'redirect' => ['route' => 'https://shop.test/vendorpsp/checkout/redirect/', 'configPath' => null],
                    'fields' => [],
                ],
                [
                    'id' => 'vendor_psp_card', 'method' => 'vendor_psp_card', 'pattern' => null,
                    'type' => 'element', 'tag' => 'vendor-psp-card',
                    'moduleUrl' => 'https://cdn.test/static/frontend/Vendor/theme/en_US/Vendor_Psp/js/hyperion/card.js',
                    'builtin' => null, 'apiVersion' => '1', 'ownsPlaceOrder' => false, 'eager' => false,
                    'awaitsReady' => true, 'savesOnSelection' => true, 'sortOrder' => 10,
                    'options' => ['brand' => 'Vendor PSP'], 'phrases' => ['Card number' => 'Card number'],
                    'redirectHosts' => ['3ds.vendor-psp.example'], 'redirect' => null, 'fields' => [],
                ],
            ]),
            (string)json_encode($config['renderers'])
        );
        self::assertSame(['https://cdn.test'], $config['staticOrigins']);
    }

    public function testEmitsTheFirstPartyEntriesWhenEveryFirstPartyMethodIsActive(): void
    {
        $config = $this->pool(self::FIRST_PARTY)->getRendererConfig(null, [
            'checkmo', 'banktransfer', 'cashondelivery', 'free', 'purchaseorder', 'braintree',
            'braintree_paypal', 'braintree_googlepay', 'braintree_cc_vault', 'braintree_paypal_vault',
            'braintree_googlepay_vault', 'paypal_express', 'payflow_express',
        ]);

        self::assertJsonStringEqualsJsonString(
            (string)file_get_contents(__DIR__ . '/_files/first-party-payment-renderers.json'),
            (string)json_encode($config['renderers'])
        );
        self::assertSame([], $config['staticOrigins']);
        self::assertSame([], $this->logged);
    }
}
