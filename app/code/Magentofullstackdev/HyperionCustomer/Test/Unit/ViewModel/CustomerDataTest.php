<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\Test\Unit\ViewModel;

use Magento\Customer\Model\Session as CustomerSession;
use Magento\Customer\Model\Url as CustomerUrl;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Url\EncoderInterface;
use Magento\Framework\UrlInterface;
use Magento\Wishlist\Helper\Data as WishlistHelper;
use Magentofullstackdev\HyperionCore\Model\Htmx\RequestContext;
use Magentofullstackdev\HyperionCustomer\ViewModel\CustomerData;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The Sign in link of a fragment rendered for an htmx request must send the
 * customer back to the PAGE, never to the fragment URL (the header state
 * request used to end up as the login redirect target).
 */
class CustomerDataTest extends TestCase
{
    private function viewModel(bool $htmx, ?string $currentUrl, bool $toDashboard = false): CustomerData
    {
        $customerUrl = $this->createStub(CustomerUrl::class);
        $customerUrl->method('getLoginUrl')->willReturn('https://shop.test/customer/account/login/referer/CORE/');
        $context = $this->createStub(RequestContext::class);
        $context->method('isHtmx')->willReturn($htmx);
        $context->method('getCurrentUrl')->willReturn($currentUrl);
        $urlBuilder = $this->createStub(UrlInterface::class);
        $urlBuilder->method('getUrl')->willReturnCallback(
            static fn (string $route, array $params) => 'https://shop.test/' . $route
                . (isset($params['referer']) ? '/referer/' . $params['referer'] : '') . '/'
        );
        $encoder = $this->createStub(EncoderInterface::class);
        $encoder->method('encode')->willReturnCallback(static fn (string $url) => 'ENC(' . $url . ')');
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('isSetFlag')->willReturn($toDashboard);
        return new CustomerData(
            $this->createStub(CustomerSession::class),
            $this->createStub(WishlistHelper::class),
            $customerUrl,
            $this->createStub(LoggerInterface::class),
            $context,
            $urlBuilder,
            $encoder,
            $scopeConfig
        );
    }

    public function testPageRequestUsesCoreLoginUrl(): void
    {
        self::assertSame(
            'https://shop.test/customer/account/login/referer/CORE/',
            $this->viewModel(false, 'https://shop.test/women.html')->getLoginUrl()
        );
    }

    public function testFragmentRequestSendsTheCustomerBackToThePage(): void
    {
        self::assertSame(
            'https://shop.test/customer/account/login/referer/ENC(https://shop.test/women.html)/',
            $this->viewModel(true, 'https://shop.test/women.html')->getLoginUrl()
        );
    }

    public function testFragmentRequestWithoutAPageHasNoReferer(): void
    {
        self::assertSame('https://shop.test/customer/account/login/', $this->viewModel(true, null)->getLoginUrl());
    }

    public function testAccountPageKeepsItsOwnRefererInsteadOfWrappingItself(): void
    {
        self::assertSame(
            'https://shop.test/customer/account/login/referer/aHR0cHM6Ly9zaG9w/',
            $this->viewModel(true, 'https://shop.test/customer/account/login/referer/aHR0cHM6Ly9zaG9w/')->getLoginUrl(),
            'the login page passes its referer through'
        );
        self::assertSame(
            'https://shop.test/customer/account/login/',
            $this->viewModel(true, 'https://shop.test/customer/account/create/')->getLoginUrl(),
            'an account page without a referer sends none'
        );
        self::assertSame(
            'https://shop.test/customer/account/login/',
            $this->viewModel(true, 'https://shop.test/it/customer/account/loginPost/')->getLoginUrl(),
            'a store code prefix and the post action count as the account page too'
        );
    }

    public function testDashboardRedirectSettingWins(): void
    {
        self::assertSame(
            'https://shop.test/customer/account/login/',
            $this->viewModel(true, 'https://shop.test/women.html', true)->getLoginUrl()
        );
    }
}
