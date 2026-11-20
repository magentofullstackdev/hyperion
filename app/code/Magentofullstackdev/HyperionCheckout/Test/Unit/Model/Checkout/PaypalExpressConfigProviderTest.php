<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Checkout;

use Magento\Customer\Helper\Session\CurrentCustomer;
use Magento\Framework\Locale\ResolverInterface;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\ObjectManagerInterface;
use Magento\Framework\UrlInterface;
use Magentofullstackdev\HyperionCheckout\Model\Checkout\PaypalExpressConfigProvider;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The PayPal Express section of the checkout config: button styles keep
 * their scalar types, the billing agreement key follows core's rule, and the
 * section is absent without an available express method.
 *
 * The PayPal models are resolved by name, so plain objects stand in for
 * them; the provider only looks at the module when its classes exist.
 *
 * @covers \Magentofullstackdev\HyperionCheckout\Model\Checkout\PaypalExpressConfigProvider
 */
class PaypalExpressConfigProviderTest extends TestCase
{
    protected function setUp(): void
    {
        if (!class_exists('Magento\Paypal\Model\SmartButtonConfig')) {
            self::markTestSkipped('Magento_Paypal is not installed.');
        }
    }

    public function testButtonStylesKeepTheirScalarTypes(): void
    {
        $section = $this->section(
            ['paypal_express'],
            0,
            false,
            ['layout' => 'vertical', 'period' => 6, 'tagline' => false, 'size' => '', 'label' => null, 'nested' => ['x']]
        );

        self::assertSame(['layout' => 'vertical', 'period' => 6, 'tagline' => false], $section['styles']);
    }

    public function testDataAttributesAndUrlsAreStrings(): void
    {
        $section = $this->section(['paypal_express', 'payflow_express'], 0, false);

        self::assertSame(['data-partner-attribution-id' => 'Magento_2_Community', 'data-count' => '3'], $section['dataAttributes']);
        self::assertSame(
            [
                'paypal_express' => 'https://store.test/paypal/express/start',
                'payflow_express' => 'https://store.test/paypal/payflowexpress/start',
            ],
            $section['startUrls']
        );
        self::assertSame('https://store.test/paypal/express/getTokenData', $section['getTokenUrl']);
        self::assertSame('https://store.test/paypal/express/onAuthorization', $section['onAuthorizeUrl']);
        self::assertArrayNotHasKey('onCancelUrl', $section);
        self::assertTrue($section['inContext']);
    }

    /**
     * @param string[] $available
     * @param int $customerId
     * @param bool $shouldAsk
     * @param array<string, string> $expected
     */
    #[DataProvider('billingAgreementCases')]
    public function testTheBillingAgreementKeyFollowsTheCoreRule(
        array $available,
        int $customerId,
        bool $shouldAsk,
        array $expected
    ): void {
        self::assertSame($expected, $this->section($available, $customerId, $shouldAsk)['billingAgreementCode']);
    }

    /**
     * @return array<string, array{string[], int, bool, array<string, string>}>
     */
    public static function billingAgreementCases(): array
    {
        return [
            'a guest is never asked' => [['paypal_express'], 0, true, []],
            'a customer of a store that does not ask' => [['paypal_express'], 7, false, []],
            'a customer who may sign one' => [
                ['paypal_express'],
                7,
                true,
                ['paypal_express' => 'paypal_ec_create_ba'],
            ],
            'every available method is listed' => [
                ['paypal_express', 'payflow_express'],
                7,
                true,
                ['paypal_express' => 'paypal_ec_create_ba', 'payflow_express' => 'paypal_ec_create_ba'],
            ],
        ];
    }

    public function testTheHelperIsAskedForTheMethodAndTheCustomer(): void
    {
        $helper = $this->helper(true);
        $this->provider(['payflow_express'], 7, $helper)->getConfig();

        self::assertSame([['payflow_express', 7]], $helper->calls);
    }

    public function testNoSectionWithoutAnAvailableExpressMethod(): void
    {
        self::assertSame([], $this->provider([], 7, $this->helper(true))->getConfig());
    }

    public function testNoSectionWhenTheModuleIsDisabled(): void
    {
        self::assertSame([], $this->provider(['paypal_express'], 7, $this->helper(true), false)->getConfig());
    }

    /**
     * @param string[] $available
     * @param int $customerId
     * @param bool $shouldAsk
     * @param array<string, mixed>|null $styles
     * @return array<string, mixed>
     */
    private function section(array $available, int $customerId, bool $shouldAsk, ?array $styles = null): array
    {
        $config = $this->provider($available, $customerId, $this->helper($shouldAsk), true, $styles)->getConfig();

        return $config['hyperion']['paypalExpress'];
    }

    private function helper(bool $shouldAsk): object
    {
        return new class ($shouldAsk) {
            /** @var array<int, array{string, int}> */
            public array $calls = [];

            public function __construct(private readonly bool $shouldAsk)
            {
            }

            public function shouldAskToCreateBillingAgreement(mixed $config, int $customerId): bool
            {
                $this->calls[] = [$config->method, $customerId];

                return $this->shouldAsk;
            }
        };
    }

    /**
     * @param string[] $available
     * @param int $customerId
     * @param object $helper
     * @param bool $moduleEnabled
     * @param array<string, mixed>|null $styles
     * @return PaypalExpressConfigProvider
     */
    private function provider(
        array $available,
        int $customerId,
        object $helper,
        bool $moduleEnabled = true,
        ?array $styles = null
    ): PaypalExpressConfigProvider {
        $config = new class ($available) {
            public string $method = '';

            /**
             * @param string[] $available
             */
            public function __construct(private readonly array $available)
            {
            }

            public function isMethodAvailable(string $code): bool
            {
                return in_array($code, $this->available, true);
            }

            public function setMethod(string $code): void
            {
                $this->method = $code;
            }

            public function getValue(string $key): string
            {
                return $key === 'in_context' ? '1' : '';
            }

            public function getPaymentMarkImageUrl(string $locale): string
            {
                return 'https://www.paypalobjects.com/mark-' . $locale . '.png';
            }

            public function getPaymentMarkWhatIsPaypalUrl(object $localeResolver): string
            {
                return 'https://www.paypal.com/what-is';
            }
        };
        $configFactory = new class ($config) {
            public function __construct(private readonly object $config)
            {
            }

            public function create(): object
            {
                return $this->config;
            }
        };
        $smartButton = new class ($styles ?? ['layout' => 'vertical']) {
            /**
             * @param array<string, mixed> $styles
             */
            public function __construct(private readonly array $styles)
            {
            }

            /**
             * @return array<string, mixed>
             */
            public function getConfig(string $page): array
            {
                return [
                    'sdkUrl' => 'https://www.paypal.com/sdk/js?client-id=X',
                    'dataAttributes' => ['data-partner-attribution-id' => 'Magento_2_Community', 'data-count' => 3],
                    'styles' => $this->styles,
                ];
            }
        };
        $payLater = new class {
            public function isEnabled(string $section): bool
            {
                return false;
            }
        };

        $moduleManager = $this->createStub(ModuleManager::class);
        $moduleManager->method('isEnabled')->willReturn($moduleEnabled);

        $objectManager = $this->createStub(ObjectManagerInterface::class);
        $objectManager->method('get')->willReturnMap([
            ['Magento\Paypal\Model\ConfigFactory', $configFactory],
            ['Magento\Paypal\Model\SmartButtonConfig', $smartButton],
            ['Magento\Paypal\Model\PayLaterConfig', $payLater],
            ['Magento\Paypal\Helper\Data', $helper],
        ]);

        $urlBuilder = $this->createStub(UrlInterface::class);
        $urlBuilder->method('getUrl')->willReturnCallback(
            static fn (string $route): string => 'https://store.test/' . $route
        );

        $localeResolver = $this->createStub(ResolverInterface::class);
        $localeResolver->method('getLocale')->willReturn('en_US');

        $currentCustomer = $this->createStub(CurrentCustomer::class);
        $currentCustomer->method('getCustomerId')->willReturn($customerId === 0 ? null : $customerId);

        return new PaypalExpressConfigProvider(
            $moduleManager,
            $objectManager,
            $urlBuilder,
            $localeResolver,
            $currentCustomer,
            $this->createStub(LoggerInterface::class)
        );
    }
}
