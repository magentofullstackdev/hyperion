<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\ViewModel;

use Magento\Catalog\Helper\Product\Configuration\ConfigurationInterface;
use Magento\Catalog\Helper\Product\ConfigurationPool;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Customer\Api\CustomerRepositoryInterface;
use Magento\Customer\Api\Data\AddressInterface;
use Magento\Customer\Api\Data\CustomerInterface;
use Magento\Customer\Helper\Address as AddressHelper;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Exception\NoSuchEntityException;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address as QuoteAddress;
use Magento\Quote\Model\Quote\Item as QuoteItem;
use Magentofullstackdev\HyperionCheckout\Model\Checkout\CaptchaConfigProvider;
use Magentofullstackdev\HyperionCheckout\ViewModel\CheckoutSkeleton;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The geometry the checkout skeleton is drawn from: summary rows from the
 * quote items, address rows from the address settings, the saved address
 * cards of a customer, and safe answers when the quote cannot be read.
 *
 * @covers \Magentofullstackdev\HyperionCheckout\ViewModel\CheckoutSkeleton
 */
class CheckoutSkeletonTest extends TestCase
{
    public function testOneSummaryRowPerVisibleItemWithItsOptionLines(): void
    {
        $skeleton = $this->skeleton(['quote' => $this->quote(['items' => [0, 2, 9]])]);

        self::assertSame(
            [['options' => 0], ['options' => 2], ['options' => CheckoutSkeleton::MAX_OPTION_LINES]],
            $skeleton->getItems()
        );
        self::assertSame(3, $skeleton->getItemCount());
    }

    public function testTheStockAddressSettingsGiveTheDefaultForm(): void
    {
        $skeleton = $this->skeleton([]);

        self::assertSame(
            ['name', 'company', 'country', 'street', 'street', 'postcode_city_region', 'telephone'],
            array_column($skeleton->getAddressRows(), 'field')
        );
        self::assertSame([2, 1, 1, 1, 1, 3, 1], array_column($skeleton->getAddressRows(), 'columns'));
        self::assertSame(2, $skeleton->getStreetLines());
    }

    public function testTheSignInLineOfTheEmailStepFollowsTheGuestLoginOption(): void
    {
        self::assertFalse($this->skeleton([])->isGuestLoginOffered());
        self::assertTrue(
            $this->skeleton(['flags' => ['checkout/options/enable_guest_checkout_login' => true]])
                ->isGuestLoginOffered()
        );
    }

    public function testEveryOptionalFieldAddsItsRow(): void
    {
        $skeleton = $this->skeleton([
            'config' => [
                'customer/address/street_lines' => '3',
                'customer/address/company_show' => 'req',
                'customer/address/telephone_show' => 'opt',
                'customer/address/fax_show' => 'opt',
            ],
            'flags' => ['customer/create_account/vat_frontend_visibility' => true],
            'name' => ['prefix_show' => 'opt', 'middlename_show' => '1', 'suffix_show' => 'req'],
        ]);
        $rows = $skeleton->getAddressRows();

        self::assertSame(
            [
                'prefix', 'name', 'middlename', 'suffix', 'company', 'country', 'street', 'street', 'street',
                'postcode_city_region', 'telephone', 'fax', 'vat_id',
            ],
            array_column($rows, 'field')
        );
        self::assertSame(
            ['prefix', 'suffix'],
            array_column(array_filter($rows, static fn (array $row): bool => $row['narrow']), 'field')
        );
    }

    public function testHiddenFieldsLeaveTheForm(): void
    {
        $skeleton = $this->skeleton([
            'config' => [
                'customer/address/street_lines' => '1',
                'customer/address/company_show' => '',
                'customer/address/telephone_show' => '',
            ],
        ]);

        self::assertSame(
            ['name', 'country', 'street', 'postcode_city_region'],
            array_column($skeleton->getAddressRows(), 'field')
        );
    }

    public function testAGuestHasNoSavedAddress(): void
    {
        $skeleton = $this->skeleton([]);

        self::assertFalse($skeleton->isLoggedIn());
        self::assertSame(0, $skeleton->getSavedAddressCount());
    }

    /**
     * @param int $addresses
     * @param int $expected
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('addressBookProvider')]
    public function testTheSavedAddressCardsAreCapped(int $addresses, int $expected): void
    {
        $skeleton = $this->skeleton(['customerAddresses' => $addresses]);

        self::assertTrue($skeleton->isLoggedIn());
        self::assertSame($expected, $skeleton->getSavedAddressCount());
    }

    /**
     * @return array<string, array{int, int}>
     */
    public static function addressBookProvider(): array
    {
        return [
            'an empty address book shows the form' => [0, 0],
            'two addresses' => [2, 2],
            'a long address book' => [7, CheckoutSkeleton::MAX_SAVED_ADDRESSES],
        ];
    }

    public function testASavedAddressCardHasOneLinePerPrintedAddressLine(): void
    {
        $skeleton = $this->skeleton(['customerAddresses' => [
            ['company' => null, 'telephone' => '555-0100'],
            ['company' => 'Acme', 'telephone' => '555-0100'],
            ['company' => ' ', 'telephone' => null],
        ]]);

        self::assertSame([['lines' => 5], ['lines' => 6], ['lines' => 4]], $skeleton->getSavedAddressCards());
        self::assertFalse($skeleton->hasSaveInAddressBook(), 'the cards replace the form');
    }

    public function testOnlyACustomerWhoTypesAnAddressGetsTheSaveInAddressBookLine(): void
    {
        self::assertTrue($this->skeleton(['customerAddresses' => 0])->hasSaveInAddressBook());
        self::assertFalse($this->skeleton([])->hasSaveInAddressBook());
    }

    public function testThePaymentRowsAreTheMethodsThePageStartsWith(): void
    {
        $skeleton = $this->skeleton([]);
        $config = $skeleton->readConfig((string) json_encode([
            'totalsData' => ['grand_total' => 59.0],
            'vault' => [
                'braintree_cc_vault' => ['is_enabled' => true],
                'braintree_paypal_vault' => ['is_enabled' => true],
                'other_vault' => ['is_enabled' => true],
            ],
            'payment' => ['vault' => [
                'braintree_cc_vault_0' => ['config' => ['code' => 'braintree_cc_vault', 'publicHash' => 'a']],
                'braintree_cc_vault_1' => ['config' => ['code' => 'braintree_cc_vault', 'publicHash' => 'b']],
                'other_vault_0' => ['config' => ['code' => 'other_vault', 'publicHash' => 'c']],
            ]],
            'paymentMethods' => [['code' => 'banktransfer', 'title' => 'Ignored: the initial state wins']],
            'hyperion' => ['initial' => ['paymentMethods' => [
                ['code' => 'checkmo', 'title' => 'Check / Money order'],
                ['code' => 'braintree_cc_vault', 'title' => 'Stored Cards'],
                ['code' => 'other_vault', 'title' => 'Other Stored Cards'],
                ['code' => 'braintree_paypal_vault', 'title' => 'Stored PayPal'],
                ['code' => 'braintree', 'title' => 'Credit Card'],
                ['code' => 'payment_services_paypal_fastlane', 'title' => 'Fastlane'],
                ['code' => 'free', 'title' => 'No Payment Information Required'],
            ]]],
        ]));

        self::assertSame(
            [
                ['title' => 'Stored Cards', 'supported' => true],
                ['title' => 'Stored Cards', 'supported' => true],
                ['title' => 'Check / Money order', 'supported' => true],
                ['title' => 'Credit Card', 'supported' => true],
                ['title' => 'Fastlane', 'supported' => false],
                ['title' => 'No Payment Information Required', 'supported' => true],
            ],
            $skeleton->getPaymentRows($config),
            'a vault method has one row per stored token when the bundle can pay with it, first in the list;'
            . ' a method without a renderer is marked'
        );
    }

    public function testAtAZeroTotalOnlyTheFreeMethodHasARow(): void
    {
        $skeleton = $this->skeleton([]);
        $methods = [['code' => 'checkmo', 'title' => 'Check'], ['code' => 'free', 'title' => 'Free']];

        self::assertSame(
            [['title' => 'Free', 'supported' => true]],
            $skeleton->getPaymentRows(['totalsData' => ['grand_total' => '0.0000'], 'paymentMethods' => $methods])
        );
        self::assertCount(
            1,
            $skeleton->getPaymentRows([
                'totalsData' => ['grand_total' => 0],
                'paymentMethods' => [['code' => 'checkmo', 'title' => 'Check']],
            ]),
            'a zero total without the free method keeps what is offered'
        );
    }

    public function testAMethodItsGatewayMarksAsNotPresentableHasNoRow(): void
    {
        $skeleton = $this->skeleton([]);
        $config = $skeleton->readConfig((string) json_encode([
            'totalsData' => ['grand_total' => 59.0],
            'payment' => [
                'payment_services_paypal_smart_buttons' => ['isVisible' => false],
                'checkmo' => ['isVisible' => true],
                'braintree' => ['isActive' => true, 'clientToken' => null],
            ],
            'paymentMethods' => [
                ['code' => 'checkmo', 'title' => 'Check / Money order'],
                ['code' => 'braintree', 'title' => 'Credit Card'],
                ['code' => 'payment_services_paypal_smart_buttons', 'title' => 'PayPal'],
            ],
        ]));

        self::assertSame([['title' => 'Check / Money order', 'supported' => true]], $skeleton->getPaymentRows($config));
    }

    public function testWithoutAListThePaymentBlockShowsNoRow(): void
    {
        $skeleton = $this->skeleton([]);

        self::assertSame([], $skeleton->getPaymentRows([]));
        self::assertSame([], $skeleton->getPaymentRows(['hyperion' => ['initial' => null]]));
        self::assertSame([], $skeleton->getPaymentRows($skeleton->readConfig('{broken')));
    }

    /**
     * @return array<string, array{0: bool, 1: list<array{title: string, supported: bool}>}>
     */
    public static function rendererListProvider(): array
    {
        $served = [
            ['title' => 'Stored Cards', 'supported' => true],
            ['title' => 'Stored Cards', 'supported' => true],
            ['title' => 'Check / Money order', 'supported' => true],
            ['title' => 'Credit Card', 'supported' => true],
        ];
        $tail = [['title' => 'No Payment Information Required', 'supported' => true]];
        return [
            'a method no entry serves has no row' => [false, array_merge($served, $tail)],
            'the diagnostic flag keeps its taller row' => [
                true,
                array_merge($served, [['title' => 'Fastlane', 'supported' => false]], $tail),
            ],
        ];
    }

    /**
     * @param list<array{title: string, supported: bool}> $expected
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('rendererListProvider')]
    public function testThePaymentRowsFollowTheRendererEntriesOfThePage(bool $showUnsupported, array $expected): void
    {
        $skeleton = $this->skeleton([]);
        $config = $this->paymentConfig(
            $this->firstPartyRenderers(),
            ['showUnsupportedPayments' => $showUnsupported]
        );

        self::assertSame($expected, $skeleton->getPaymentRows($config));
    }

    public function testAThirdPartyEntryServesItsMethod(): void
    {
        $renderers = array_merge($this->firstPartyRenderers(), [[
            'id' => 'fastlane', 'method' => 'payment_services_paypal_fastlane', 'pattern' => null,
            'type' => 'element', 'tag' => 'vendor-fastlane', 'sortOrder' => 0,
        ]]);

        self::assertContains(
            ['title' => 'Fastlane', 'supported' => true],
            $this->skeleton([])->getPaymentRows($this->paymentConfig($renderers, []))
        );
    }

    public function testAnEmptyRendererListHidesEveryMethodLikeTheApplication(): void
    {
        self::assertSame([], $this->skeleton([])->getPaymentRows($this->paymentConfig([], [])));
    }

    public function testAPageWithoutTheRendererListKeepsTheFirstPartyRowsAndLogs(): void
    {
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('warning')->with(self::stringContains('paymentRenderers'));
        $config = $this->paymentConfig([], []);
        unset($config['hyperion']['paymentRenderers']);

        self::assertContains(
            ['title' => 'Fastlane', 'supported' => false],
            $this->skeleton([], $logger)->getPaymentRows($config),
            'without the list the rows are drawn as before: a method outside the first-party list keeps its note'
        );
    }

    /**
     * The first-party entries as the renderer pool emits them on a store where they are all active.
     *
     * @return list<array<string, mixed>>
     */
    private function firstPartyRenderers(): array
    {
        $json = (string) file_get_contents(dirname(__DIR__) . '/Model/Payment/_files/first-party-payment-renderers.json');
        return json_decode($json, true, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * @param array<mixed> $renderers
     * @param array<string, bool> $debug
     * @return array<string, mixed>
     */
    private function paymentConfig(array $renderers, array $debug): array
    {
        return [
            'totalsData' => ['grand_total' => 59.0],
            'vault' => ['braintree_cc_vault' => ['is_enabled' => true], 'other_vault' => ['is_enabled' => true]],
            'payment' => ['vault' => [
                'braintree_cc_vault_0' => ['config' => ['code' => 'braintree_cc_vault', 'publicHash' => 'a']],
                'braintree_cc_vault_1' => ['config' => ['code' => 'braintree_cc_vault', 'publicHash' => 'b']],
                'other_vault_0' => ['config' => ['code' => 'other_vault', 'publicHash' => 'c']],
            ]],
            'hyperion' => [
                'paymentRenderers' => $renderers,
                'debug' => $debug,
                'initial' => ['paymentMethods' => [
                    ['code' => 'checkmo', 'title' => 'Check / Money order'],
                    ['code' => 'braintree_cc_vault', 'title' => 'Stored Cards'],
                    ['code' => 'other_vault', 'title' => 'Other Stored Cards'],
                    ['code' => 'braintree', 'title' => 'Credit Card'],
                    ['code' => 'payment_services_paypal_fastlane', 'title' => 'Fastlane'],
                    ['code' => 'free', 'title' => 'No Payment Information Required'],
                ]],
            ],
        ];
    }

    public function testTheShippingRowsFollowTheStoredRatesAndTheKindOfVisitor(): void
    {
        $rate = static fn (string $carrier, string $method, bool $available = true): array => [
            'carrier_code' => $carrier,
            'method_code' => $method,
            'available' => $available,
        ];
        $initial = static fn (array $rates): array => ['hyperion' => ['initial' => ['shippingMethods' => $rates]]];
        $guest = $this->skeleton([]);

        self::assertSame(['text'], $guest->getShippingRows([]), 'a guest without rates is asked for the address');
        self::assertSame(
            ['loading', 'loading'],
            $this->skeleton(['customerAddresses' => 1])->getShippingRows([]),
            'the rates of a saved address are on their way'
        );
        self::assertSame(['rate'], $guest->getShippingRows($initial([$rate('flatrate', 'flatrate')])));
        self::assertSame(
            ['heading', 'rate', 'rate', 'rate', 'rate'],
            $guest->getShippingRows($initial([
                $rate('ups', 'GND'),
                $rate('ups', '2DA'),
                $rate('flatrate', 'flatrate'),
                $rate('fedex', '', false),
            ])),
            'one subheading for the carrier with several usable methods'
        );
    }

    public function testTheShippingPolicyLineNeedsTheSwitchAndAText(): void
    {
        $skeleton = $this->skeleton([]);
        $policy = static fn (bool $enabled, string $content): array => [
            'shippingPolicy' => ['isEnabled' => $enabled, 'shippingPolicyContent' => $content],
        ];

        self::assertTrue($skeleton->hasShippingPolicy($policy(true, '<p>Ships in two days.</p>')));
        self::assertFalse($skeleton->hasShippingPolicy($policy(false, 'Ships in two days.')));
        self::assertFalse($skeleton->hasShippingPolicy($policy(true, '<p> </p>')));
        self::assertFalse($skeleton->hasShippingPolicy([]));
    }

    public function testTheOptionalSectionsFollowTheStoreSwitches(): void
    {
        self::assertSame([], $this->skeleton([])->getOptionalSections());
        self::assertSame(
            ['gift-options', 'agreements'],
            $this->skeleton([
                'giftModule' => true,
                'flags' => ['sales/gift_options/allow_items' => true, 'checkout/options/enable_agreements' => true],
            ])->getOptionalSections()
        );
        $captcha = static fn (string $mode, string $forms): array => [
            'flags' => ['customer/captcha/enable' => true],
            'config' => ['customer/captcha/mode' => $mode, 'customer/captcha/forms' => $forms],
        ];
        self::assertSame(
            ['captcha'],
            $this->skeleton($captcha('always', 'user_create,sales_rule_coupon_request'))->getOptionalSections()
        );
        self::assertSame(
            [],
            $this->skeleton($captcha('after_fail', 'sales_rule_coupon_request'))->getOptionalSections(),
            'a CAPTCHA that only shows after refused attempts is loaded when it shows'
        );
        self::assertSame([], $this->skeleton($captcha('always', 'user_create'))->getOptionalSections());
        $afterFail = $captcha('after_fail', 'payment_processing_request');
        $afterFail['config']['customer/captcha/failed_attempts_login'] = '0';
        self::assertSame(['captcha'], $this->skeleton($afterFail)->getOptionalSections(), 'no attempt is allowed');
        $alwaysFor = $captcha('after_fail', 'payment_processing_request');
        $alwaysFor['flags']['customer/captcha/always_for/payment_processing_request'] = true;
        self::assertSame(['captcha'], $this->skeleton($alwaysFor)->getOptionalSections());
    }

    public function testTheRecaptchaClientIsAnOptionalSectionOfAStoreThatProtectsAnAction(): void
    {
        self::assertSame(['recaptcha'], $this->skeleton(['recaptcha' => true])->getOptionalSections());
        self::assertSame(
            ['agreements', 'recaptcha'],
            $this->skeleton([
                'recaptcha' => true,
                'flags' => ['checkout/options/enable_agreements' => true],
            ])->getOptionalSections()
        );
    }

    /**
     * @param array<string, mixed> $config
     * @param string[] $expected
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('bodySectionProvider')]
    public function testTheSectionsOfTheConfigurationFollowWhatTheApplicationAwaitsBeforeTheMount(
        array $config,
        bool $virtual,
        array $expected
    ): void {
        $skeleton = $this->skeleton(['quote' => $this->quote(['virtual' => $virtual])]);
        self::assertSame($expected, $skeleton->getBodySections($config));
    }

    /**
     * @return array<string, array{0: array<string, mixed>, 1: bool, 2: string[]}>
     */
    public static function bodySectionProvider(): array
    {
        $offline = [
            'id' => 'offline',
            'method' => null,
            'pattern' => '^(checkmo|banktransfer|cashondelivery|free)$',
            'builtin' => 'offline',
            'sortOrder' => 10,
        ];
        $card = ['id' => 'braintree_card', 'method' => 'braintree', 'pattern' => null, 'builtin' => 'braintree-card'];
        $config = static fn (array $methods, string $total = '25.0000', array $extra = []): array => [
            'totalsData' => ['grand_total' => $total],
            'hyperion' => array_merge([
                'paymentRenderers' => [$offline, $card],
                'initial' => ['paymentMethods' => $methods],
            ], $extra),
        ];
        $checkmo = ['code' => 'checkmo', 'title' => 'Check'];
        $free = ['code' => 'free', 'title' => 'No Payment Information Required'];
        $braintree = ['code' => 'braintree', 'title' => 'Card'];
        return [
            'the only offered offline method is selected' => [$config([$checkmo]), false, ['payment-host']],
            'free at a zero total is selected' => [$config([$checkmo, $free], '0.0000'), false, ['payment-host']],
            'free above zero selects nothing' => [$config([$checkmo, $free]), false, []],
            'several methods select nothing' => [$config([$checkmo, $braintree]), false, []],
            'a gateway is never selected' => [$config([$braintree]), false, []],
            'a virtual quote has no initial state to select from' => [$config([$checkmo]), true, []],
            'without an initial state nothing is selected' => [['hyperion' => ['paymentRenderers' => [$offline]]], false, []],
            'a method no entry serves is not selected' => [
                ['hyperion' => ['paymentRenderers' => [$card], 'initial' => ['paymentMethods' => [$checkmo]]]],
                false,
                [],
            ],
            'the diagnostic rows need the host' => [
                $config([$checkmo, $braintree], '25.0000', ['debug' => ['showUnsupportedPayments' => true]]),
                false,
                ['payment-host'],
            ],
            'declared address fields' => [
                $config([$checkmo, $braintree], '25.0000', ['addressFields' => [['code' => 'fiscal_code']]]),
                false,
                ['address-fields'],
            ],
            'no declared address field' => [$config([$checkmo, $braintree], '25.0000', ['addressFields' => []]), false, []],
        ];
    }

    public function testAnUnreadableRecaptchaSetupIsLoggedAndPreloadsNothing(): void
    {
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(self::stringContains('hasRecaptcha'));

        self::assertSame([], $this->skeleton(['recaptcha' => null], $logger)->getOptionalSections());
    }

    public function testACustomerThatCannotBeLoadedCountsNoAddress(): void
    {
        $skeleton = $this->skeleton(['customerAddresses' => null]);

        self::assertSame(0, $skeleton->getSavedAddressCount());
    }

    public function testTheTotalsRowsFollowTheQuote(): void
    {
        self::assertSame(2, $this->skeleton(['quote' => $this->quote([])])->getTotalsRowCount());
        self::assertSame(
            4,
            $this->skeleton(['quote' => $this->quote(['discount' => -5.0, 'tax' => 1.2])])->getTotalsRowCount()
        );
        self::assertSame(
            1,
            $this->skeleton(['quote' => $this->quote(['virtual' => true])])->getTotalsRowCount(),
            'a virtual quote has no shipping row'
        );
    }

    public function testVirtualQuoteAndCouponAreReadFromTheQuote(): void
    {
        $skeleton = $this->skeleton(['quote' => $this->quote(['virtual' => true, 'coupon' => 'H20'])]);

        self::assertTrue($skeleton->isVirtual());
        self::assertTrue($skeleton->hasCoupon());
        self::assertFalse($this->skeleton(['quote' => $this->quote([])])->hasCoupon());
    }

    public function testGiftOptionsNeedTheModuleAndOneOfTheSettings(): void
    {
        $on = ['sales/gift_options/allow_items' => true];

        self::assertTrue($this->skeleton(['flags' => $on, 'giftModule' => true])->hasGiftOptions());
        self::assertFalse($this->skeleton(['flags' => $on, 'giftModule' => false])->hasGiftOptions());
        self::assertFalse($this->skeleton(['giftModule' => true])->hasGiftOptions());
    }

    public function testAQuoteThatCannotBeReadIsLoggedOnceAndGivesAnEmptyGuestCheckout(): void
    {
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(self::stringContains('getQuote'));
        $skeleton = $this->skeleton(['quote' => null], $logger);

        self::assertSame([], $skeleton->getItems());
        self::assertFalse($skeleton->isVirtual());
        self::assertFalse($skeleton->hasCoupon());
        self::assertSame(1, $skeleton->getTotalsRowCount());
    }

    /**
     * @param array{items?: int[], virtual?: bool, coupon?: string, discount?: float, tax?: float} $shape
     *        `items`: the number of options of each visible item
     */
    private function quote(array $shape): Quote
    {
        $items = [];
        foreach ($shape['items'] ?? [] as $options) {
            $item = $this->createStub(QuoteItem::class);
            $item->method('getProductType')->willReturn('options-' . $options);
            $items[] = $item;
        }
        $address = $this->createStub(QuoteAddress::class);
        $address->method('getData')->willReturnMap([
            ['discount_amount', null, $shape['discount'] ?? 0.0],
            ['tax_amount', null, $shape['tax'] ?? 0.0],
        ]);

        $quote = $this->createStub(Quote::class);
        $quote->method('getAllVisibleItems')->willReturn($items);
        $quote->method('isVirtual')->willReturn($shape['virtual'] ?? false);
        $quote->method('getData')->willReturnMap([['coupon_code', null, $shape['coupon'] ?? null]]);
        $quote->method('getShippingAddress')->willReturn($address);
        $quote->method('getBillingAddress')->willReturn($address);

        return $quote;
    }

    /**
     * @param array{
     *     quote?: Quote|null,
     *     config?: array<string, string>,
     *     flags?: array<string, bool>,
     *     name?: array<string, string>,
     *     customerAddresses?: int|array<int, array{company?: ?string, telephone?: ?string}>|null,
     *     giftModule?: bool,
     *     recaptcha?: bool|null
     * } $state `quote` null: the session throws; `customerAddresses` absent: a guest, null: the customer
     *          cannot be loaded, a number: that many addresses, a list: one address per entry with
     *          its company and telephone; `recaptcha` null: its setup cannot be read; settings that
     *          are not listed keep their stock values
     * @param LoggerInterface|null $logger
     */
    private function skeleton(array $state, ?LoggerInterface $logger = null): CheckoutSkeleton
    {
        $checkoutSession = $this->createStub(CheckoutSession::class);
        if (array_key_exists('quote', $state) && $state['quote'] === null) {
            $checkoutSession->method('getQuote')->willThrowException(new NoSuchEntityException());
        } else {
            $checkoutSession->method('getQuote')->willReturn($state['quote'] ?? $this->quote([]));
        }

        $loggedIn = array_key_exists('customerAddresses', $state);
        $customerSession = $this->createStub(CustomerSession::class);
        $customerSession->method('isLoggedIn')->willReturn($loggedIn);
        $customerSession->method('getCustomerId')->willReturn($loggedIn ? 5 : null);

        $customerRepository = $this->createStub(CustomerRepositoryInterface::class);
        if ($loggedIn && $state['customerAddresses'] === null) {
            $customerRepository->method('getById')->willThrowException(new NoSuchEntityException());
        } else {
            $book = $state['customerAddresses'] ?? 0;
            $addresses = [];
            foreach (is_array($book) ? $book : array_fill(0, $book, []) as $lines) {
                $address = $this->createStub(AddressInterface::class);
                $address->method('getCompany')->willReturn($lines['company'] ?? null);
                $address->method('getTelephone')->willReturn($lines['telephone'] ?? null);
                $addresses[] = $address;
            }
            $customer = $this->createStub(CustomerInterface::class);
            $customer->method('getAddresses')->willReturn($addresses);
            $customerRepository->method('getById')->willReturn($customer);
        }

        $config = ($state['config'] ?? []) + [
            'customer/address/street_lines' => '2',
            'customer/address/company_show' => 'opt',
            'customer/address/telephone_show' => 'req',
            'customer/address/fax_show' => '',
        ];
        $flags = $state['flags'] ?? [];
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')
            ->willReturnCallback(static fn (string $path): ?string => $config[$path] ?? null);
        $scopeConfig->method('isSetFlag')
            ->willReturnCallback(static fn (string $path): bool => $flags[$path] ?? false);

        $name = $state['name'] ?? [];
        $addressHelper = $this->createStub(AddressHelper::class);
        $addressHelper->method('getConfig')
            ->willReturnCallback(static fn (string $key): string => $name[$key] ?? '');

        $configurationPool = $this->createStub(ConfigurationPool::class);
        $configurationPool->method('getByProductType')->willReturnCallback(
            function (string $type): ConfigurationInterface {
                $helper = $this->createStub(ConfigurationInterface::class);
                $helper->method('getOptions')
                    ->willReturn(array_fill(0, (int) substr($type, strlen('options-')), ['label' => 'Size']));
                return $helper;
            }
        );

        $moduleManager = $this->createStub(ModuleManager::class);
        $moduleManager->method('isEnabled')->willReturn($state['giftModule'] ?? false);

        $captchaConfigProvider = $this->createStub(CaptchaConfigProvider::class);
        if (array_key_exists('recaptcha', $state) && $state['recaptcha'] === null) {
            $captchaConfigProvider->method('hasRecaptcha')->willThrowException(new \RuntimeException('unreadable'));
        } else {
            $captchaConfigProvider->method('hasRecaptcha')->willReturn($state['recaptcha'] ?? false);
        }

        return new CheckoutSkeleton(
            $checkoutSession,
            $customerSession,
            $customerRepository,
            $scopeConfig,
            $addressHelper,
            $configurationPool,
            $moduleManager,
            $logger ?? $this->createStub(LoggerInterface::class),
            $captchaConfigProvider
        );
    }
}
