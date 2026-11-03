<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Plugin\Wishlist\Controller\Index;

use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\App\Response\Http as HttpResponse;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\Url\EncoderInterface;
use Magento\Framework\UrlInterface;
use Magento\Wishlist\Controller\Index\Add;
use Magentofullstackdev\HyperionCore\Model\CacheHeaders;
use Magentofullstackdev\HyperionCore\Model\Htmx\FragmentRenderer;
use Magentofullstackdev\HyperionCore\Model\Htmx\MessageCollector;
use Magentofullstackdev\HyperionCore\Model\Htmx\NotificationRenderer;
use Magentofullstackdev\HyperionCore\Model\Htmx\RequestContext;
use Magentofullstackdev\HyperionCore\Plugin\Wishlist\Controller\Index\AddPlugin;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;

/**
 * The HTMX answer of the wish list add: a guest is sent to the login page
 * (HX-Redirect, core replays the add after the login), a customer gets the
 * toast and the header fragment, a plain request keeps core's result.
 *
 * @covers \Magentofullstackdev\HyperionCore\Plugin\Wishlist\Controller\Index\AbstractHtmxPlugin
 * @covers \Magentofullstackdev\HyperionCore\Plugin\Wishlist\Controller\Index\AddPlugin
 */
class AddPluginTest extends TestCase
{
    private const LOGIN_URL = 'https://shop.test/customer/account/login/referer/aHR0cHM6Ly9zaG9wLnRlc3Qvam91c3QuaHRtbA,,/';

    /** @var Raw&MockObject */
    private Raw $raw;
    /** @var HttpResponse&MockObject */
    private HttpResponse $response;
    /** @var MessageCollector&MockObject */
    private MessageCollector $messages;
    /** @var UrlInterface&Stub */
    private UrlInterface $urlBuilder;

    public function testAGuestIsSentToTheLoginPageWithThePageAsReferer(): void
    {
        $this->response->expects(self::once())->method('setHttpResponseCode')->with(200);
        $this->response->expects(self::once())->method('clearHeader')->with('Location');
        $this->messages->expects(self::never())->method('collect');
        $urlBuilder = $this->createMock(UrlInterface::class);
        $urlBuilder->expects(self::once())->method('getUrl')
            ->with('customer/account/login', ['referer' => 'aHR0cHM6Ly9zaG9wLnRlc3Qvam91c3QuaHRtbA,,'])
            ->willReturn(self::LOGIN_URL);
        $this->urlBuilder = $urlBuilder;
        $headers = [];
        $this->raw->expects(self::atLeastOnce())->method('setHeader')->willReturnCallback(
            function (string $name, string $value) use (&$headers): Raw {
                $headers[$name] = $value;
                return $this->raw;
            }
        );
        $this->raw->expects(self::once())->method('setContents')->with('')->willReturnSelf();

        $result = $this->plugin(false)->afterDispatch($this->createStub(Add::class), null, $this->htmxRequest());

        self::assertSame($this->raw, $result);
        self::assertSame(self::LOGIN_URL, $headers['HX-Redirect']);
    }

    public function testACustomerGetsTheToastAndTheHeaderFragment(): void
    {
        $this->messages->expects(self::once())->method('collect')->willReturn(['html' => 'Added.', 'has_error' => false]);
        $this->response->expects(self::never())->method('setHttpResponseCode');
        $this->raw->method('setHeader')->willReturnSelf();
        $this->raw->expects(self::once())->method('setContents')
            ->with("<toast success>Added.</toast>\n<fragment>")
            ->willReturnSelf();

        self::assertSame($this->raw, $this->plugin(true)->afterDispatch($this->createStub(Add::class), null, $this->htmxRequest()));
    }

    public function testAPlainRequestKeepsCoresResult(): void
    {
        $request = $this->createStub(HttpRequest::class);
        $request->method('getHeader')->willReturn(false);
        $this->messages->expects(self::never())->method('collect');
        $this->response->expects(self::never())->method('setHttpResponseCode');
        $this->raw->expects(self::never())->method('setContents');

        self::assertSame('redirect', $this->plugin(false)->afterDispatch($this->createStub(Add::class), 'redirect', $request));
    }

    protected function setUp(): void
    {
        $this->raw = $this->createMock(Raw::class);
        $this->response = $this->createMock(HttpResponse::class);
        $this->messages = $this->createMock(MessageCollector::class);
        $this->urlBuilder = $this->createStub(UrlInterface::class);
    }

    private function plugin(bool $loggedIn): AddPlugin
    {
        $rawFactory = $this->createStub(RawFactory::class);
        $rawFactory->method('create')->willReturn($this->raw);
        $session = $this->createStub(CustomerSession::class);
        $session->method('isLoggedIn')->willReturn($loggedIn);
        $cacheHeaders = $this->createStub(CacheHeaders::class);
        $cacheHeaders->method('applyPrivate')->willReturnArgument(0);
        $notifications = $this->createStub(NotificationRenderer::class);
        $notifications->method('render')->willReturnCallback(
            static fn (string $html, string $tone): string => "<toast {$tone}>{$html}</toast>"
        );
        $fragments = $this->createStub(FragmentRenderer::class);
        $fragments->method('render')->willReturn('<fragment>');
        $encoder = $this->createStub(EncoderInterface::class);
        $encoder->method('encode')->willReturn('aHR0cHM6Ly9zaG9wLnRlc3Qvam91c3QuaHRtbA,,');
        $context = $this->createStub(RequestContext::class);
        $context->method('getCurrentUrl')->willReturn('https://shop.test/joust.html');
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('isSetFlag')->willReturn(false);

        return new AddPlugin(
            $rawFactory,
            $session,
            $cacheHeaders,
            $this->response,
            $this->messages,
            $notifications,
            $fragments,
            $this->urlBuilder,
            $encoder,
            $context,
            $scopeConfig
        );
    }

    private function htmxRequest(): HttpRequest
    {
        $request = $this->createStub(HttpRequest::class);
        $request->method('getHeader')->willReturnCallback(
            static fn (string $name) => $name === 'HX-Request' ? 'true' : false
        );

        return $request;
    }
}
