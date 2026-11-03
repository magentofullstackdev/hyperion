<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Plugin\Checkout\Controller\Cart;

use Magento\Checkout\Controller\Cart\CouponPost;
use Magento\Framework\App\ActionFlag;
use Magento\Framework\App\ActionInterface;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\App\Response\Http as HttpResponse;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\Controller\Result\Redirect;
use Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse;
use Magentofullstackdev\HyperionCore\Model\CacheHeaders;
use Magentofullstackdev\HyperionCore\Model\Htmx\FragmentRenderer;
use Magentofullstackdev\HyperionCore\Model\Htmx\MessageCollector;
use Magentofullstackdev\HyperionCore\Model\Htmx\NotificationRenderer;
use Magentofullstackdev\HyperionCore\Plugin\Checkout\Controller\Cart\CouponPostPlugin;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionCore\Plugin\Checkout\Controller\Cart\CouponPostPlugin
 */
class CouponPostPluginTest extends TestCase
{
    /** @var HttpRequest&Stub */
    private HttpRequest $request;
    /** @var ActionFlag&Stub */
    private ActionFlag $actionFlag;
    /** @var Raw&Stub */
    private Raw $raw;
    /** @var array<string, mixed> */
    private array $rawState;

    protected function setUp(): void
    {
        $this->request = $this->createStub(HttpRequest::class);
        $this->actionFlag = $this->createStub(ActionFlag::class);
        $this->rawState = ['headers' => [], 'contents' => null];
        $this->raw = $this->createStub(Raw::class);
        $this->raw->method('setHeader')->willReturnCallback(
            function (string $name, string $value) {
                $this->rawState['headers'][$name] = $value;
                return $this->raw;
            }
        );
        $this->raw->method('setContents')->willReturnCallback(
            function (string $contents) {
                $this->rawState['contents'] = $contents;
                return $this->raw;
            }
        );
    }

    private function plugin(bool $hasError): CouponPostPlugin
    {
        $rawFactory = $this->createStub(RawFactory::class);
        $rawFactory->method('create')->willReturn($this->raw);

        $messages = $this->createStub(MessageCollector::class);
        $messages->method('collect')->willReturn(['html' => 'Message text', 'has_error' => $hasError]);

        $notification = $this->createStub(NotificationRenderer::class);
        $notification->method('render')->willReturnCallback(
            static fn (string $html, string $tone, bool $oob): string => sprintf('<toast tone="%s" oob="%d">%s</toast>', $tone, (int) $oob, $html)
        );

        $fragments = $this->createStub(FragmentRenderer::class);
        $fragments->method('render')->willReturnCallback(
            static fn (string $handle, string $block, array $data = []): string => sprintf('<%s handle="%s" oob="%d">', $block, $handle, (int) ($data['oob'] ?? false))
        );

        return new CouponPostPlugin(
            $this->request,
            $rawFactory,
            new CacheHeaders(new DegradedResponse()),
            $messages,
            $notification,
            $fragments,
            $this->actionFlag
        );
    }

    private function htmx(bool $on): void
    {
        $this->request->method('getHeader')->willReturnCallback(
            static fn (string $name) => $name === 'HX-Request' && $on ? 'true' : false
        );
    }

    public function testAPlainRequestKeepsTheRedirectOfTheAction(): void
    {
        $this->htmx(false);
        $redirect = $this->createStub(Redirect::class);

        self::assertSame($redirect, $this->plugin(false)->afterExecute($this->createStub(CouponPost::class), $redirect));
        self::assertNull($this->rawState['contents']);
    }

    public function testAnHtmxRequestGetsTheCouponFormTheTotalsAndTheToast(): void
    {
        $this->htmx(true);

        $result = $this->plugin(false)->afterExecute($this->createStub(CouponPost::class), $this->createStub(Redirect::class));

        self::assertSame($this->raw, $result);
        self::assertSame(
            '<hyperion.cart.coupon handle="hyperion_checkout_cart_fragment" oob="0">' . "\n"
            . '<hyperion.cart.totals handle="hyperion_checkout_cart_fragment" oob="1">' . "\n"
            . '<toast tone="success" oob="1">Message text</toast>',
            $this->rawState['contents']
        );
        self::assertSame('text/html; charset=UTF-8', $this->rawState['headers']['Content-Type']);
        self::assertStringContainsString('no-store', $this->rawState['headers']['Cache-Control']);
    }

    public function testAnErrorMessageTurnsTheToastRed(): void
    {
        $this->htmx(true);

        $this->plugin(true)->afterExecute($this->createStub(CouponPost::class), $this->createStub(Redirect::class));

        self::assertStringContainsString('<toast tone="error"', (string) $this->rawState['contents']);
    }

    public function testAfterDispatchLeavesAnActionThatRanAlone(): void
    {
        $this->htmx(true);
        $this->actionFlag->method('get')->willReturn(false);
        $response = $this->createMock(HttpResponse::class);
        $response->expects(self::never())->method('clearHeader');
        $subject = $this->createStub(CouponPost::class);
        $subject->method('getResponse')->willReturn($response);
        $redirect = $this->createStub(Redirect::class);

        self::assertSame($redirect, $this->plugin(false)->afterDispatch($subject, $redirect));
        self::assertNull($this->rawState['contents']);
    }

    public function testAfterDispatchLeavesAPlainRequestStoppedByAnObserverAlone(): void
    {
        $this->htmx(false);
        $this->actionFlag->method('get')->willReturn(true);
        $response = $this->createMock(HttpResponse::class);
        $response->expects(self::never())->method('clearHeader');
        $subject = $this->createStub(CouponPost::class);
        $subject->method('getResponse')->willReturn($response);

        self::assertSame($response, $this->plugin(true)->afterDispatch($subject, $response));
        self::assertNull($this->rawState['contents']);
    }

    public function testAnHtmxRequestStoppedBeforeExecuteGetsTheFragmentInsteadOfTheRedirect(): void
    {
        $this->htmx(true);
        $this->actionFlag->method('get')->willReturnCallback(
            static fn (string $action, string $flag): bool => $flag === ActionInterface::FLAG_NO_DISPATCH
        );
        $response = $this->createMock(HttpResponse::class);
        $response->expects(self::once())->method('clearHeader')->with('Location')->willReturnSelf();
        $response->expects(self::once())->method('setHttpResponseCode')->with(200)->willReturnSelf();
        $subject = $this->createStub(CouponPost::class);
        $subject->method('getResponse')->willReturn($response);

        $result = $this->plugin(true)->afterDispatch($subject, $response);

        self::assertSame($this->raw, $result);
        self::assertStringContainsString('<hyperion.cart.coupon handle="hyperion_checkout_cart_fragment"', (string) $this->rawState['contents']);
        self::assertStringContainsString('<toast tone="error" oob="1">Message text</toast>', (string) $this->rawState['contents']);
    }
}
