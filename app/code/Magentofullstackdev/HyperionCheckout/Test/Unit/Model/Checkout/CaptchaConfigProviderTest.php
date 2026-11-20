<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Checkout;

use Magento\Captcha\Helper\Data as CaptchaHelper;
use Magento\Captcha\Model\CaptchaInterface;
use Magento\Captcha\Model\DefaultModel;
use Magento\Customer\Api\Data\CustomerInterface;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\UrlInterface;
use Magentofullstackdev\HyperionCheckout\Model\Checkout\CaptchaConfigProvider;
use Magentofullstackdev\HyperionCore\ViewModel\Recaptcha;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionCheckout\Model\Checkout\CaptchaConfigProvider
 */
class CaptchaConfigProviderTest extends TestCase
{
    private const V3 = [
        'siteKey' => 'site-key-v3',
        'type' => 'v3',
        'action' => 'place_order',
        'badge' => 'inline',
        'theme' => 'light',
        'size' => 'normal',
        'hl' => 'it',
    ];

    private const FORM_OFF = [
        'isRequired' => false,
        'isCaseSensitive' => false,
        'imageHeight' => 50,
        'imageWidth' => 200,
    ];

    /**
     * @param array<string, array<string, string>> $byAction
     */
    private function recaptcha(array $byAction): Recaptcha
    {
        $recaptcha = $this->createStub(Recaptcha::class);
        $recaptcha->method('getClientConfig')->willReturnCallback(
            static fn (string $form): array => $byAction[$form] ?? []
        );
        return $recaptcha;
    }

    private function captchaModel(
        bool $required = false,
        bool $caseSensitive = false,
        int $height = 50,
        int $width = 200
    ): DefaultModel {
        $model = $this->createStub(DefaultModel::class);
        $model->method('isRequired')->willReturn($required);
        $model->method('isCaseSensitive')->willReturn($caseSensitive);
        $model->method('getHeight')->willReturn($height);
        $model->method('getWidth')->willReturn($width);
        return $model;
    }

    /**
     * @param array<string, CaptchaInterface> $byForm forms not listed get a model that requires nothing
     */
    private function captchaHelper(array $byForm = []): CaptchaHelper
    {
        $helper = $this->createStub(CaptchaHelper::class);
        $helper->method('getCaptcha')->willReturnCallback(
            fn (string $formId): CaptchaInterface => $byForm[$formId] ?? $this->captchaModel()
        );
        return $helper;
    }

    private function customerSession(?string $email = null): CustomerSession
    {
        $session = $this->createStub(CustomerSession::class);
        $session->method('isLoggedIn')->willReturn($email !== null);
        $customer = $this->createStub(CustomerInterface::class);
        $customer->method('getEmail')->willReturn($email);
        $session->method('getCustomerData')->willReturn($customer);
        return $session;
    }

    private function urlBuilder(): UrlInterface
    {
        $url = $this->createStub(UrlInterface::class);
        $url->method('getUrl')->willReturnCallback(
            static function (string $route, ?array $params = null): string {
                $query = isset($params['_query']) ? '?' . http_build_query($params['_query']) : '';
                return 'https://store.test/' . $route . '/' . $query;
            }
        );
        return $url;
    }

    private function moduleManager(bool $braintree): ModuleManager
    {
        $manager = $this->createStub(ModuleManager::class);
        $manager->method('isEnabled')->willReturnCallback(
            static fn (string $module): bool => $module === 'PayPal_Braintree' && $braintree
        );
        return $manager;
    }

    private function provider(
        Recaptcha $recaptcha,
        CaptchaHelper $helper,
        bool $braintree = false,
        ?CustomerSession $session = null,
        ?LoggerInterface $logger = null
    ): CaptchaConfigProvider {
        return new CaptchaConfigProvider(
            $recaptcha,
            $helper,
            $session ?? $this->customerSession(),
            $this->urlBuilder(),
            $this->moduleManager($braintree),
            $logger ?? $this->createStub(LoggerInterface::class)
        );
    }

    public function testWithEveryFormOffTheRecaptchaKeyIsAbsentAndNoImageFormIsRequired(): void
    {
        $config = $this->provider($this->recaptcha([]), $this->captchaHelper())->getConfig();

        self::assertSame(['hyperion'], array_keys($config));
        self::assertArrayNotHasKey('recaptcha', $config['hyperion']);
        self::assertSame(
            [
                'refreshUrl' => 'https://store.test/captcha/refresh/',
                'sectionUrl' => 'https://store.test/customer/section/load/?sections=captcha',
                'forms' => [
                    'user_login' => self::FORM_OFF,
                    'sales_rule_coupon_request' => self::FORM_OFF,
                    'payment_processing_request' => self::FORM_OFF,
                ],
            ],
            $config['hyperion']['captcha']
        );
    }

    public function testAProtectedActionIsEmittedInTheClientShapeAndTheOthersAreAbsent(): void
    {
        $config = $this->provider($this->recaptcha(['place_order' => self::V3]), $this->captchaHelper())->getConfig();

        self::assertSame(
            [
                'place_order' => [
                    'type' => 'v3',
                    'siteKey' => 'site-key-v3',
                    'badge' => 'inline',
                    'theme' => 'light',
                    'size' => 'normal',
                    'hl' => 'it',
                ],
            ],
            $config['hyperion']['recaptcha']
        );
    }

    public function testTheJsonOfTheActionsIsAMapKeyedByAction(): void
    {
        $checkbox = [
            'siteKey' => 'site-key-v2',
            'type' => 'v2-checkbox',
            'action' => 'customer_login',
            'badge' => 'bottomright',
            'theme' => 'dark',
            'size' => 'compact',
            'hl' => '',
        ];
        $config = $this->provider(
            $this->recaptcha(['place_order' => self::V3, 'customer_login' => $checkbox]),
            $this->captchaHelper()
        )->getConfig();

        self::assertSame(
            '{"place_order":{"type":"v3","siteKey":"site-key-v3","badge":"inline","theme":"light",'
            . '"size":"normal","hl":"it"},"customer_login":{"type":"v2-checkbox","siteKey":"site-key-v2",'
            . '"badge":"bottomright","theme":"dark","size":"compact","hl":""}}',
            json_encode($config['hyperion']['recaptcha'], JSON_THROW_ON_ERROR)
        );
    }

    public function testTheBraintreeActionIsNotAskedForWhenTheModuleIsAbsent(): void
    {
        $braintree = ['siteKey' => 'site-key-bt', 'action' => 'braintree'] + self::V3;
        $recaptcha = $this->recaptcha(['place_order' => self::V3, 'braintree' => $braintree]);

        $without = $this->provider($recaptcha, $this->captchaHelper(), false)->getConfig();
        $with = $this->provider($recaptcha, $this->captchaHelper(), true)->getConfig();

        self::assertSame(['place_order'], array_keys($without['hyperion']['recaptcha']));
        self::assertSame(['place_order', 'braintree'], array_keys($with['hyperion']['recaptcha']));
        self::assertSame('site-key-bt', $with['hyperion']['recaptcha']['braintree']['siteKey']);
    }

    public function testARequiredImageFormCarriesItsStateAndTheOthersStayOff(): void
    {
        $helper = $this->captchaHelper(['sales_rule_coupon_request' => $this->captchaModel(true, true, 60, 230)]);

        $forms = $this->provider($this->recaptcha([]), $helper)->getConfig()['hyperion']['captcha']['forms'];

        self::assertSame(
            ['isRequired' => true, 'isCaseSensitive' => true, 'imageHeight' => 60, 'imageWidth' => 230],
            $forms['sales_rule_coupon_request']
        );
        self::assertSame(self::FORM_OFF, $forms['user_login']);
        self::assertSame(self::FORM_OFF, $forms['payment_processing_request']);
    }

    public function testTheRequirementIsAskedWithTheCustomerEmailAndWithNullForAGuest(): void
    {
        $logins = [];
        $model = $this->createStub(DefaultModel::class);
        $model->method('isRequired')->willReturnCallback(
            static function ($login = null) use (&$logins): bool {
                $logins[] = $login;
                return $login === 'roni_cost@example.com';
            }
        );
        $helper = $this->captchaHelper(['user_login' => $model]);

        $customer = $this->provider(
            $this->recaptcha([]),
            $helper,
            false,
            $this->customerSession('roni_cost@example.com')
        )->getConfig();
        $guest = $this->provider($this->recaptcha([]), $helper)->getConfig();

        self::assertSame(['roni_cost@example.com', null], $logins);
        self::assertTrue($customer['hyperion']['captcha']['forms']['user_login']['isRequired']);
        self::assertFalse($guest['hyperion']['captcha']['forms']['user_login']['isRequired']);
    }

    public function testNoImageIsGeneratedForARequiredForm(): void
    {
        $model = $this->createMock(DefaultModel::class);
        $model->method('isRequired')->willReturn(true);
        $model->method('getHeight')->willReturn(50);
        $model->method('getWidth')->willReturn(200);
        $model->expects(self::never())->method('generate');
        $model->expects(self::never())->method('getImgSrc');
        $helper = $this->captchaHelper([
            'user_login' => $model,
            'sales_rule_coupon_request' => $model,
            'payment_processing_request' => $model,
        ]);

        $forms = $this->provider($this->recaptcha([]), $helper)->getConfig()['hyperion']['captcha']['forms'];

        self::assertTrue($forms['payment_processing_request']['isRequired']);
    }

    public function testAHelperFailureYieldsAFormThatRequiresNothingAndALogLine(): void
    {
        $helper = $this->createStub(CaptchaHelper::class);
        $helper->method('getCaptcha')->willReturnCallback(
            function (string $formId): CaptchaInterface {
                if ($formId === 'user_login') {
                    throw new \RuntimeException('captcha type missing');
                }
                return $this->captchaModel(true);
            }
        );
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())
            ->method('error')
            ->with(self::stringContains('"user_login" unavailable: captcha type missing'));

        $forms = $this->provider($this->recaptcha([]), $helper, false, null, $logger)
            ->getConfig()['hyperion']['captcha']['forms'];

        self::assertSame(self::FORM_OFF, $forms['user_login']);
        self::assertTrue($forms['sales_rule_coupon_request']['isRequired']);
        self::assertTrue($forms['payment_processing_request']['isRequired']);
    }

    public function testACaptchaModelWithoutARequirementApiRequiresNothing(): void
    {
        $helper = $this->captchaHelper(['user_login' => $this->createStub(CaptchaInterface::class)]);

        $forms = $this->provider($this->recaptcha([]), $helper)->getConfig()['hyperion']['captcha']['forms'];

        self::assertSame(self::FORM_OFF, $forms['user_login']);
    }
}
