<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Plugin\Checkout\Controller\Cart;

use Magento\Checkout\Controller\Cart\UpdatePost;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\Controller\Result\Redirect;
use Magento\Framework\Escaper;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Item;
use Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse;
use Magentofullstackdev\HyperionCore\Model\CacheHeaders;
use Magentofullstackdev\HyperionCore\Model\Htmx\FragmentRenderer;
use Magentofullstackdev\HyperionCore\Model\Htmx\MessageCollector;
use Magentofullstackdev\HyperionCore\Model\Htmx\NotificationRenderer;
use Magentofullstackdev\HyperionCore\Plugin\Checkout\Controller\Cart\UpdatePostPlugin;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The HTMX answer of checkout/cart/updatePost: the cart page's "Update Cart"
 * the mini-cart quantity stepper rely on it (the cart body, the header
 * badge out of band, the toast). A quantity the stock refuses is saved by
 * core without a message: the toast comes from
 * the error the quote item of the request carries.
 *
 * @covers \Magentofullstackdev\HyperionCore\Plugin\Checkout\Controller\Cart\UpdatePostPlugin
 * @covers \Magentofullstackdev\HyperionCore\Plugin\Checkout\Controller\Cart\AbstractCartMutationPlugin
 */
class UpdatePostPluginTest extends TestCase
{
    /** @var HttpRequest&Stub */
    private HttpRequest $request;
    /** @var Raw&Stub */
    private Raw $raw;
    /** @var array<string, mixed> */
    private array $rawState;
    /** @var CheckoutSession&Stub */
    private CheckoutSession $checkoutSession;
    /** @var array<int|string, mixed>|null The `cart` parameter of the request. */
    private ?array $cartParam = null;

    protected function setUp(): void
    {
        $this->request = $this->createStub(HttpRequest::class);
        $this->request->method('getParam')->willReturnCallback(
            fn (string $name) => $name === 'cart' ? $this->cartParam : null
        );
        $this->checkoutSession = $this->createStub(CheckoutSession::class);
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

    private function plugin(bool $hasError, string $html = 'Message text'): UpdatePostPlugin
    {
        $rawFactory = $this->createStub(RawFactory::class);
        $rawFactory->method('create')->willReturn($this->raw);

        $messages = $this->createStub(MessageCollector::class);
        $messages->method('collect')->willReturn(['html' => $html, 'has_error' => $hasError]);

        $notification = $this->createStub(NotificationRenderer::class);
        $notification->method('render')->willReturnCallback(
            static fn (string $html, string $tone, bool $oob): string => sprintf('<toast tone="%s" oob="%d">%s</toast>', $tone, (int) $oob, $html)
        );

        $fragments = $this->createStub(FragmentRenderer::class);
        $fragments->method('render')->willReturnCallback(
            static fn (string $handle, string $block, array $data = []): string => sprintf('<%s handle="%s" oob="%d">', $block, $handle, (int) ($data['oob'] ?? false))
        );

        return new UpdatePostPlugin(
            $this->request,
            $rawFactory,
            new CacheHeaders(new DegradedResponse()),
            $messages,
            $notification,
            $fragments,
            $this->checkoutSession,
            new Escaper(),
            $this->createStub(LoggerInterface::class)
        );
    }

    /** The action under plugin: its request is the one the test configured. */
    private function action(): UpdatePost
    {
        $subject = $this->createStub(UpdatePost::class);
        $subject->method('getRequest')->willReturn($this->request);

        return $subject;
    }

    /**
     * A quote line as core leaves it after `Cart::updateItems()`: the error
     * flag and the validator's text when the quantity was refused.
     *
     * @param string[] $messages
     */
    private function item(int $id, bool $hasError, array $messages): Item
    {
        $item = $this->createStub(Item::class);
        $item->method('getId')->willReturn($id);
        $item->method('getData')->willReturnMap([['has_error', null, $hasError]]);
        $item->method('getMessage')->willReturnCallback(
            static fn (bool $string = true) => $string ? implode("\n", $messages) : $messages
        );

        return $item;
    }

    /**
     * @param Item[] $items
     */
    private function quoteWith(array $items): void
    {
        $quote = $this->createStub(Quote::class);
        $quote->method('getAllVisibleItems')->willReturn($items);
        $this->checkoutSession->method('getQuote')->willReturn($quote);
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

        self::assertSame($redirect, $this->plugin(false)->afterExecute($this->action(), $redirect));
        self::assertNull($this->rawState['contents']);
    }

    public function testAnHtmxRequestGetsTheCartBodyTheBadgeAndTheToast(): void
    {
        $this->htmx(true);

        $result = $this->plugin(false)->afterExecute($this->action(), $this->createStub(Redirect::class));

        self::assertSame($this->raw, $result);
        self::assertSame(
            '<hyperion.cart.items handle="hyperion_checkout_cart_fragment" oob="0">' . "\n"
            . '<hyperion.minicart.count handle="hyperion_checkout_minicart_count" oob="1">' . "\n"
            . '<toast tone="success" oob="1">Message text</toast>',
            $this->rawState['contents']
        );
        self::assertSame('text/html; charset=UTF-8', $this->rawState['headers']['Content-Type']);
        self::assertStringContainsString('no-store', $this->rawState['headers']['Cache-Control']);
    }

    public function testARejectedQuantityTurnsTheToastRed(): void
    {
        $this->htmx(true);

        $this->plugin(true)->afterExecute($this->action(), $this->createStub(Redirect::class));

        self::assertStringContainsString('<toast tone="error"', (string) $this->rawState['contents']);
    }

    public function testTheErrorOfTheRequestedLineIsTheToastWhenCoreAddedNoMessage(): void
    {
        $this->htmx(true);
        $this->cartParam = ['7' => ['qty' => '999']];
        $this->quoteWith([
            $this->item(7, true, ['The requested qty is not available', 'Only 100 <left> & counting']),
            // Another line out of stock: its message stays under its line, not in this answer.
            $this->item(9, true, ['This product is out of stock.']),
            $this->item(11, false, []),
        ]);

        $this->plugin(false, '')->afterExecute($this->action(), $this->createStub(Redirect::class));

        $contents = (string) $this->rawState['contents'];
        self::assertStringContainsString(
            '<toast tone="error" oob="1">The requested qty is not available Only 100 &lt;left&gt; &amp; counting</toast>',
            $contents
        );
        self::assertStringNotContainsString('out of stock', $contents);
    }

    public function testItemErrorsFollowTheCollectedMessagesAndTurnTheToastRed(): void
    {
        $this->htmx(true);
        $this->cartParam = [7 => ['qty' => 5]];
        $this->quoteWith([$this->item(7, true, ['Not enough items for sale'])]);

        $this->plugin(false)->afterExecute($this->action(), $this->createStub(Redirect::class));

        self::assertStringContainsString(
            '<toast tone="error" oob="1">Message text Not enough items for sale</toast>',
            (string) $this->rawState['contents']
        );
    }

    public function testALineWithoutAnErrorKeepsTheSuccessToast(): void
    {
        $this->htmx(true);
        $this->cartParam = [7 => ['qty' => 2]];
        $this->quoteWith([$this->item(7, false, []), $this->item(9, true, ['This product is out of stock.'])]);

        $this->plugin(false)->afterExecute($this->action(), $this->createStub(Redirect::class));

        self::assertStringContainsString('<toast tone="success" oob="1">Message text</toast>', (string) $this->rawState['contents']);
    }

    public function testARequestWithoutACartParameterReadsNoQuote(): void
    {
        $this->htmx(true);
        $this->cartParam = null;
        $this->checkoutSession->method('getQuote')->willThrowException(new \RuntimeException('must not be read'));

        $this->plugin(false)->afterExecute($this->action(), $this->createStub(Redirect::class));

        self::assertStringContainsString('<toast tone="success" oob="1">Message text</toast>', (string) $this->rawState['contents']);
    }

    public function testAQuoteThatCannotBeReadIsLoggedAndLeavesTheToastAlone(): void
    {
        $this->htmx(true);
        $this->cartParam = [7 => ['qty' => 2]];
        $this->checkoutSession->method('getQuote')->willThrowException(new \RuntimeException('quote gone'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(self::stringContains('quote gone'));

        $rawFactory = $this->createStub(RawFactory::class);
        $rawFactory->method('create')->willReturn($this->raw);
        $messages = $this->createStub(MessageCollector::class);
        $messages->method('collect')->willReturn(['html' => 'Message text', 'has_error' => false]);
        $notification = $this->createStub(NotificationRenderer::class);
        $notification->method('render')->willReturnCallback(
            static fn (string $html, string $tone, bool $oob): string => sprintf('<toast tone="%s">%s</toast>', $tone, $html)
        );
        $fragments = $this->createStub(FragmentRenderer::class);
        $fragments->method('render')->willReturn('<fragment>');
        $plugin = new UpdatePostPlugin(
            $this->request,
            $rawFactory,
            new CacheHeaders(new DegradedResponse()),
            $messages,
            $notification,
            $fragments,
            $this->checkoutSession,
            new Escaper(),
            $logger
        );

        $plugin->afterExecute($this->action(), $this->createStub(Redirect::class));

        self::assertStringContainsString('<toast tone="success">Message text</toast>', (string) $this->rawState['contents']);
    }
}
