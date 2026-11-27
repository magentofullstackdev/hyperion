<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Plugin\Checkout\Controller\Cart;

use Magento\Checkout\Controller\Cart\Add;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\BlockFactory;
use Magento\Framework\View\Element\Template;
use Magento\Store\Model\ScopeInterface;
use Magentofullstackdev\HyperionCore\Model\CacheHeadersInterface;
use Magentofullstackdev\HyperionCore\Model\Htmx\ActionResponse;
use Magentofullstackdev\HyperionCore\Model\Htmx\MessageCollector;
use Magentofullstackdev\HyperionCore\Plugin\Checkout\Controller\Cart\AddPlugin;
use Magentofullstackdev\HyperionCore\ViewModel\GoogleGtag;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\MockObject\Rule\InvocationOrder;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The htmx answer of the cart add action: the toast and the mini-cart count,
 * or an `HX-Redirect` to the cart after a successful add when the store sends
 * the shopper to the cart, except for an add an express button made.
 */
class AddPluginTest extends TestCase
{
    private const CART_URL = 'https://shop.test/checkout/cart/';
    private const TOAST = '<div id="hyperion-notification">Added</div>';

    public function testAStandardFormPostKeepsTheNativeResult(): void
    {
        $result = new \stdClass();
        $factory = $this->createMock(RawFactory::class);
        $factory->expects(self::never())->method('create');

        $plugin = $this->plugin(
            $factory,
            $this->createStub(MessageCollector::class),
            false,
            $this->createStub(BlockFactory::class),
            false
        );

        self::assertSame($result, $plugin->afterExecute($this->createStub(Add::class), $result));
    }

    public function testWithoutTheRedirectSettingASuccessAnswersTheToast(): void
    {
        $collector = $this->createMock(MessageCollector::class);
        $collector->expects(self::never())->method('hasOnlySuccess');
        $collector->expects(self::once())->method('collect')->willReturn(['html' => 'Added', 'has_error' => false]);

        $raw = $this->createMock(Raw::class);
        $raw->expects(self::once())->method('setHttpResponseCode')->with(200)->willReturnSelf();
        $raw->expects(self::once())
            ->method('setHeader')
            ->with('Content-Type', 'text/html; charset=UTF-8', true)
            ->willReturnSelf();
        $raw->expects(self::once())->method('setContents')->with(self::TOAST)->willReturnSelf();

        $plugin = $this->plugin($this->rawFactory($raw), $collector, false, $this->toastBlockFactory(self::once()));

        self::assertSame($raw, $plugin->afterExecute($this->createStub(Add::class), null));
    }

    public function testWithTheRedirectSettingASuccessAnswersARedirectToTheCartWithoutABody(): void
    {
        $collector = $this->createMock(MessageCollector::class);
        $collector->expects(self::once())->method('hasOnlySuccess')->willReturn(true);
        $collector->expects(self::never())->method('collect');

        $raw = $this->createMock(Raw::class);
        $raw->expects(self::once())->method('setHttpResponseCode')->with(200)->willReturnSelf();
        $raw->expects(self::once())->method('setHeader')->with('HX-Redirect', self::CART_URL, true)->willReturnSelf();
        $raw->expects(self::once())->method('setContents')->with('')->willReturnSelf();

        $plugin = $this->plugin($this->rawFactory($raw), $collector, true, $this->toastBlockFactory(self::never()));

        self::assertSame($raw, $plugin->afterExecute($this->createStub(Add::class), null));
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function expressHeaderValues(): array
    {
        return [
            'the value the express context sends' => ['1'],
            'any other non-empty value' => ['true'],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('expressHeaderValues')]
    public function testWithTheRedirectSettingAnExpressAddAnswersTheToastOfAnOrdinaryAdd(string $express): void
    {
        $collector = $this->createMock(MessageCollector::class);
        $collector->expects(self::never())->method('hasOnlySuccess');
        $collector->expects(self::once())->method('collect')->willReturn(['html' => 'Added', 'has_error' => false]);

        $raw = $this->createMock(Raw::class);
        $raw->expects(self::once())->method('setHttpResponseCode')->with(200)->willReturnSelf();
        $raw->expects(self::once())
            ->method('setHeader')
            ->with('Content-Type', 'text/html; charset=UTF-8', true)
            ->willReturnSelf();
        $raw->expects(self::once())->method('setContents')->with(self::TOAST)->willReturnSelf();

        $plugin = $this->plugin(
            $this->rawFactory($raw),
            $collector,
            true,
            $this->toastBlockFactory(self::once()),
            true,
            $express
        );

        self::assertSame($raw, $plugin->afterExecute($this->createStub(Add::class), null));
    }

    public function testWithTheRedirectSettingAnEmptyExpressHeaderStillRedirectsToTheCart(): void
    {
        $collector = $this->createMock(MessageCollector::class);
        $collector->expects(self::once())->method('hasOnlySuccess')->willReturn(true);
        $collector->expects(self::never())->method('collect');

        $raw = $this->createMock(Raw::class);
        $raw->expects(self::once())->method('setHttpResponseCode')->with(200)->willReturnSelf();
        $raw->expects(self::once())->method('setHeader')->with('HX-Redirect', self::CART_URL, true)->willReturnSelf();
        $raw->expects(self::once())->method('setContents')->with('')->willReturnSelf();

        $plugin = $this->plugin(
            $this->rawFactory($raw),
            $collector,
            true,
            $this->toastBlockFactory(self::never()),
            true,
            ''
        );

        self::assertSame($raw, $plugin->afterExecute($this->createStub(Add::class), null));
    }

    public function testWithTheRedirectSettingARefusedAddStillAnswersTheToast(): void
    {
        $collector = $this->createMock(MessageCollector::class);
        $collector->expects(self::once())->method('hasOnlySuccess')->willReturn(false);
        $collector->expects(self::once())
            ->method('collect')
            ->willReturn(['html' => 'You need to choose options for your item.', 'has_error' => true]);

        $raw = $this->createMock(Raw::class);
        $raw->expects(self::once())->method('setHttpResponseCode')->with(422)->willReturnSelf();
        $raw->expects(self::once())
            ->method('setHeader')
            ->with('Content-Type', 'text/html; charset=UTF-8', true)
            ->willReturnSelf();
        $raw->expects(self::once())->method('setContents')->with(self::TOAST)->willReturnSelf();

        $plugin = $this->plugin($this->rawFactory($raw), $collector, true, $this->toastBlockFactory(self::once()));

        self::assertSame($raw, $plugin->afterExecute($this->createStub(Add::class), null));
    }

    /**
     * @param RawFactory $rawFactory
     * @param MessageCollector $collector
     * @param bool $redirectToCart the `checkout/cart/redirect_to_cart` flag of the store
     * @param BlockFactory $blockFactory
     * @param bool $htmx whether the request carries `HX-Request`
     * @param string|null $express the `X-Hyperion-Express` value, null when the header is absent
     */
    private function plugin(
        RawFactory $rawFactory,
        MessageCollector $collector,
        bool $redirectToCart,
        BlockFactory $blockFactory,
        bool $htmx = true,
        ?string $express = null
    ): AddPlugin {
        $request = $this->createStub(HttpRequest::class);
        $request->method('getHeader')->willReturnCallback(
            static fn (string $name): string|false => match ($name) {
                'HX-Request' => $htmx ? 'true' : false,
                'X-Hyperion-Express' => $express ?? false,
                default => false,
            }
        );

        $cacheHeaders = $this->createStub(CacheHeadersInterface::class);
        $cacheHeaders->method('applyPrivate')->willReturnArgument(0);

        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('isSetFlag')->willReturnCallback(
            static fn (string $path, string $scope = 'default'): bool => $redirectToCart
                && $path === 'checkout/cart/redirect_to_cart'
                && $scope === ScopeInterface::SCOPE_STORE
        );

        $urlBuilder = $this->createStub(UrlInterface::class);
        $urlBuilder->method('getUrl')->willReturnCallback(
            static fn (?string $route = null): string => $route === 'checkout/cart' ? self::CART_URL : ''
        );

        $actionResponse = $this->createStub(ActionResponse::class);
        $actionResponse->method('build')->willReturnArgument(2);

        return new AddPlugin(
            $request,
            $rawFactory,
            $blockFactory,
            $collector,
            $this->createStub(CheckoutSession::class),
            $cacheHeaders,
            $this->createStub(LoggerInterface::class),
            $this->createStub(GoogleGtag::class),
            $actionResponse,
            $scopeConfig,
            $urlBuilder
        );
    }

    private function rawFactory(Raw $raw): RawFactory
    {
        $factory = $this->createStub(RawFactory::class);
        $factory->method('create')->willReturn($raw);

        return $factory;
    }

    /**
     * A block factory that renders the toast template, asked as often as `$count` says.
     *
     * @param InvocationOrder $count
     */
    private function toastBlockFactory(InvocationOrder $count): BlockFactory&MockObject
    {
        $block = $this->createStub(Template::class);
        $block->method('toHtml')->willReturn(self::TOAST);

        $factory = $this->createMock(BlockFactory::class);
        $factory->expects($count)->method('createBlock')->with(Template::class)->willReturn($block);

        return $factory;
    }
}
