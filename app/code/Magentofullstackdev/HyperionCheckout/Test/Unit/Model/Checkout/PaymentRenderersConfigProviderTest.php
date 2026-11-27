<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Checkout;

use Magento\Checkout\Model\CompositeConfigProvider;
use Magento\Checkout\Model\ConfigProviderInterface;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\App\State;
use Magento\Payment\Api\Data\PaymentMethodInterface;
use Magento\Payment\Api\PaymentMethodListInterface;
use Magento\Quote\Model\Quote;
use Magento\Store\Api\Data\StoreInterface;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCheckout\Model\Checkout\PaymentRenderersConfigProvider;
use Magentofullstackdev\HyperionCheckout\Model\Payment\UnsupportedMethodsMonitor;
use Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Payment\RendererPoolTestCase;
use Psr\Log\LoggerInterface;

/**
 * The payment renderers of `checkoutConfig.hyperion`: entries of active
 * methods only, the static origins, the developer mode flag, and a merged
 * `hyperion` key that keeps every list single and every scalar a scalar.
 *
 * @covers \Magentofullstackdev\HyperionCheckout\Model\Checkout\PaymentRenderersConfigProvider
 */
class PaymentRenderersConfigProviderTest extends RendererPoolTestCase
{
    public function testEmitsOnlyTheEntriesOfActiveMethods(): void
    {
        $hyperion = $this->provider(['checkmo', 'free', 'braintree_cc_vault'])->getConfig()['hyperion'];

        self::assertSame(['offline', 'braintree_vault'], array_column($hyperion['paymentRenderers'], 'id'));
        self::assertSame([], $hyperion['staticOrigins']);
        self::assertSame(['showUnsupportedPayments' => false], $hyperion['debug']);
    }

    public function testListsTheStaticOriginOfAThirdPartyModule(): void
    {
        $renderers = self::FIRST_PARTY + [
            'vendor_psp_card' => [
                'method' => 'vendor_psp_card',
                'tag' => 'vendor-psp-card',
                'module' => 'Vendor_Psp::js/hyperion/card.js',
            ],
        ];
        $hyperion = $this->provider(['vendor_psp_card'], $renderers)->getConfig()['hyperion'];

        self::assertSame(['vendor_psp_card'], array_column($hyperion['paymentRenderers'], 'id'));
        self::assertSame(['https://cdn.test'], $hyperion['staticOrigins']);
    }

    public function testTheDebugFlagFollowsDeveloperMode(): void
    {
        $hyperion = $this->provider(['checkmo'], self::FIRST_PARTY, State::MODE_DEVELOPER)->getConfig()['hyperion'];

        self::assertTrue($hyperion['debug']['showUnsupportedPayments']);
    }

    public function testTheDebugFlagFollowsTheDiagnosticQueryParameter(): void
    {
        $shown = $this->provider(['checkmo'], self::FIRST_PARTY, State::MODE_PRODUCTION, true, null, '1');
        $hidden = $this->provider(['checkmo'], self::FIRST_PARTY, State::MODE_PRODUCTION, true, null, 'yes');

        self::assertTrue($shown->getConfig()['hyperion']['debug']['showUnsupportedPayments']);
        self::assertFalse($hidden->getConfig()['hyperion']['debug']['showUnsupportedPayments']);
    }

    public function testEmitsNothingWhileTheHyperionCheckoutIsOff(): void
    {
        self::assertSame([], $this->provider(['checkmo'], self::FIRST_PARTY, State::MODE_PRODUCTION, false)->getConfig());
    }

    public function testChecksTheHiddenMethodsOfTheStoreView(): void
    {
        $monitor = $this->createMock(UnsupportedMethodsMonitor::class);
        $monitor->expects(self::once())->method('check')->with(3, 'it')->willReturn(true);

        $this->provider(['checkmo'], self::FIRST_PARTY, State::MODE_PRODUCTION, true, $monitor)->getConfig();
    }

    public function testAFailingCheckKeepsTheRenderers(): void
    {
        $monitor = $this->createStub(UnsupportedMethodsMonitor::class);
        $monitor->method('check')->willThrowException(new \RuntimeException('flag table locked'));

        $hyperion = $this->provider(['checkmo'], self::FIRST_PARTY, State::MODE_PRODUCTION, true, $monitor)
            ->getConfig()['hyperion'];

        self::assertSame(['offline'], array_column($hyperion['paymentRenderers'], 'id'));
    }

    public function testTheMergedHyperionKeyHasNoDoubledListAndNoListedScalar(): void
    {
        $core = $this->createStub(ConfigProviderInterface::class);
        $core->method('getConfig')->willReturn([
            'hyperion' => ['extensionApi' => '1.0-beta', 'enabled' => true, 'topDestinations' => ['IT']],
        ]);
        $express = $this->createStub(ConfigProviderInterface::class);
        $express->method('getConfig')->willReturn([
            'hyperion' => ['expressButtons' => [], 'staticOrigins' => ['https://cdn.test']],
        ]);
        $composite = new CompositeConfigProvider([
            'core' => $core,
            'payment' => $this->provider(['checkmo', 'purchaseorder', 'vendor_psp_card'], self::FIRST_PARTY + [
                'vendor_psp_card' => [
                    'method' => 'vendor_psp_card',
                    'tag' => 'vendor-psp-card',
                    'module' => 'Vendor_Psp::js/hyperion/card.js',
                ],
            ]),
            'express' => $express,
        ]);

        $hyperion = $composite->getConfig()['hyperion'];

        self::assertSame('1.0-beta', $hyperion['extensionApi']);
        self::assertTrue($hyperion['enabled']);
        self::assertSame(['vendor_psp_card', 'offline', 'purchaseorder'], array_column($hyperion['paymentRenderers'], 'id'));
        self::assertTrue(array_is_list($hyperion['paymentRenderers']));
        self::assertSame(['showUnsupportedPayments' => false], $hyperion['debug']);
        self::assertSame(['https://cdn.test'], array_values(array_unique($hyperion['staticOrigins'])));
        $decoded = json_decode((string)json_encode($hyperion['paymentRenderers']), true);
        self::assertSame('vendor-psp-card', $decoded[0]['tag']);
        self::assertSame('po_number', $decoded[2]['fields'][0]['target']);
    }

    /**
     * @param string[] $activeCodes
     * @param array<string, mixed> $renderers
     */
    private function provider(
        array $activeCodes,
        array $renderers = self::FIRST_PARTY,
        string $mode = State::MODE_PRODUCTION,
        bool $enabled = true,
        ?UnsupportedMethodsMonitor $monitor = null,
        ?string $debugParam = null
    ): PaymentRenderersConfigProvider {
        $methods = [];
        foreach ($activeCodes as $code) {
            $method = $this->createStub(PaymentMethodInterface::class);
            $method->method('getCode')->willReturn($code);
            $methods[] = $method;
        }
        $methodList = $this->createStub(PaymentMethodListInterface::class);
        $methodList->method('getActiveList')->willReturn($methods);

        $store = $this->createStub(StoreInterface::class);
        $store->method('getId')->willReturn(3);
        $store->method('getCode')->willReturn('it');
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getStore')->willReturn($store);

        $session = $this->createStub(CheckoutSession::class);
        $session->method('getQuote')->willReturn($this->createStub(Quote::class));
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('isSetFlag')->willReturn($enabled);
        $state = $this->createStub(State::class);
        $state->method('getMode')->willReturn($mode);
        $request = $this->createStub(RequestInterface::class);
        $request->method('getParam')->willReturn($debugParam);

        return new PaymentRenderersConfigProvider(
            $this->pool($renderers),
            $methodList,
            $storeManager,
            $session,
            $scopeConfig,
            $state,
            $monitor ?? $this->createStub(UnsupportedMethodsMonitor::class),
            $this->createStub(LoggerInterface::class),
            $request
        );
    }
}
