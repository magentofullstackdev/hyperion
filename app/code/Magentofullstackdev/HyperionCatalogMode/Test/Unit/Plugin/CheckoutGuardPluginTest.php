<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalogMode\Test\Unit\Plugin;

use Magento\Customer\Model\Session as CustomerSession;
use Magento\Customer\Model\Url as CustomerUrl;
use Magento\Framework\App\ActionInterface;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\Message\ManagerInterface as MessageManager;
use Magento\Framework\UrlInterface;
use Magentofullstackdev\HyperionCatalogMode\Plugin\Framework\App\Action\CheckoutGuardPlugin;
use Magentofullstackdev\HyperionCore\Model\Purchase\Availability;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionCatalogMode\Plugin\Framework\App\Action\CheckoutGuardPlugin
 */
class CheckoutGuardPluginTest extends TestCase
{
    private const LOGIN_URL = 'https://shop.test/customer/account/login/';
    private const ACCOUNT_URL = 'https://shop.test/customer/account/';

    /** @var Availability&Stub */
    private Availability $availability;
    /** @var HttpRequest&Stub */
    private HttpRequest $request;
    /** @var CustomerSession&Stub */
    private CustomerSession $session;
    /** @var RawFactory&Stub */
    private RawFactory $rawFactory;
    /** @var ActionInterface&Stub */
    private ActionInterface $action;
    private CheckoutGuardPlugin $plugin;

    protected function setUp(): void
    {
        $this->availability = $this->createStub(Availability::class);
        $this->request = $this->createStub(HttpRequest::class);
        $this->session = $this->createStub(CustomerSession::class);
        $this->rawFactory = $this->createStub(RawFactory::class);
        $this->action = $this->createStub(ActionInterface::class);
        $this->plugin = $this->buildPlugin($this->createStub(MessageManager::class));
    }

    /**
     * The message manager is the one dependency a test may want to verify:
     * it is a stub by default and a mock when the test hands one in.
     */
    private function buildPlugin(MessageManager $messageManager): CheckoutGuardPlugin
    {
        $customerUrl = $this->createStub(CustomerUrl::class);
        $customerUrl->method('getLoginUrl')->willReturn(self::LOGIN_URL);
        $urlBuilder = $this->createStub(UrlInterface::class);
        $urlBuilder->method('getUrl')->willReturn(self::ACCOUNT_URL);

        return new CheckoutGuardPlugin(
            $this->availability,
            $this->request,
            $this->session,
            $customerUrl,
            $urlBuilder,
            $messageManager,
            $this->rawFactory,
            $this->createStub(LoggerInterface::class),
            ['checkout', 'paypal_express', 'hyperion_minicart', 'wishlist_index_cart', 'wishlist_index_allcart', 'sales_order_reorder']
        );
    }

    /**
     * @return array<string, array{string, bool}>
     */
    public static function routeProvider(): array
    {
        return [
            'cart page' => ['checkout_cart_index', true],
            'cart add' => ['checkout_cart_add', true],
            'checkout' => ['checkout_index_index', true],
            'paypal start' => ['paypal_express_start', true],
            'mini-cart fragment' => ['hyperion_minicart_fragment', true],
            'wishlist item to cart' => ['wishlist_index_cart', true],
            'whole wishlist to cart' => ['wishlist_index_allcart', true],
            'reorder' => ['sales_order_reorder', true],
            'wishlist page itself is not guarded' => ['wishlist_index_index', false],
            'order view is not guarded' => ['sales_order_view', false],
            'paypal ipn is not a checkout route' => ['paypal_ipn_index', false],
            'product page' => ['catalog_product_view', false],
            'header state' => ['hyperion_header_state', false],
            'prefix must match a whole segment' => ['checkoutx_index_index', false],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('routeProvider')]
    public function testOnlyGuardedRoutesAreBlocked(string $fullAction, bool $guarded): void
    {
        $this->request->method('getFullActionName')->willReturn($fullAction);
        $this->availability->method('canPurchase')->willReturn(false);
        $this->availability->method('getMessage')->willReturn('Please log in to purchase items.');
        $this->request->method('getHeader')->willReturn(false);
        $raw = $this->createStub(Raw::class);
        $raw->method('setContents')->willReturnSelf();
        $raw->method('setHttpResponseCode')->willReturnSelf();
        $raw->method('setHeader')->willReturnSelf();
        $this->rawFactory->method('create')->willReturn($raw);

        $result = $this->plugin->aroundExecute($this->action, static fn () => 'proceeded');

        self::assertSame($guarded ? $raw : 'proceeded', $result);
    }

    public function testAllowedVisitorsProceed(): void
    {
        $this->request->method('getFullActionName')->willReturn('checkout_cart_index');
        $this->availability->method('canPurchase')->willReturn(true);
        $messageManager = $this->createMock(MessageManager::class);
        $messageManager->expects(self::never())->method('addErrorMessage');

        self::assertSame('ok', $this->buildPlugin($messageManager)->aroundExecute($this->action, static fn () => 'ok'));
    }

    public function testGuestIsSentToTheLoginPageWithTheMessage(): void
    {
        $this->request->method('getFullActionName')->willReturn('checkout_cart_index');
        $this->request->method('getHeader')->willReturn(false);
        $this->availability->method('canPurchase')->willReturn(false);
        $this->availability->method('getMessage')->willReturn('Please log in to purchase items.');
        $this->session->method('isLoggedIn')->willReturn(false);
        $messageManager = $this->createMock(MessageManager::class);
        $messageManager->expects(self::once())->method('addErrorMessage')
            ->with('Please log in to purchase items.');
        $raw = $this->rawResult();
        $raw->expects(self::once())->method('setHttpResponseCode')->with(302)->willReturnSelf();
        $raw->expects(self::once())->method('setHeader')->with('Location', self::LOGIN_URL, true)->willReturnSelf();
        $this->rawFactory->method('create')->willReturn($raw);

        self::assertSame($raw, $this->buildPlugin($messageManager)->aroundExecute($this->action, static fn () => 'never'));
    }

    public function testRestrictedCustomerIsSentToTheAccountPage(): void
    {
        $this->request->method('getFullActionName')->willReturn('checkout_index_index');
        $this->request->method('getHeader')->willReturn(false);
        $this->availability->method('canPurchase')->willReturn(false);
        $this->availability->method('getMessage')->willReturn('Your account is not allowed to purchase items.');
        $this->session->method('isLoggedIn')->willReturn(true);
        $raw = $this->rawResult();
        $raw->expects(self::once())->method('setHttpResponseCode')->with(302)->willReturnSelf();
        $raw->expects(self::once())->method('setHeader')->with('Location', self::ACCOUNT_URL, true)->willReturnSelf();
        $this->rawFactory->method('create')->willReturn($raw);

        self::assertSame($raw, $this->plugin->aroundExecute($this->action, static fn () => 'never'));
    }

    public function testHtmxRequestsGetAnHxRedirectHeader(): void
    {
        $this->request->method('getFullActionName')->willReturn('checkout_cart_add');
        $this->request->method('getHeader')->willReturn('true');
        $this->availability->method('canPurchase')->willReturn(false);
        $this->availability->method('getMessage')->willReturn('Please log in to purchase items.');
        $this->session->method('isLoggedIn')->willReturn(false);
        $raw = $this->rawResult();
        $raw->expects(self::once())->method('setHttpResponseCode')->with(403)->willReturnSelf();
        $raw->expects(self::once())->method('setHeader')->with('HX-Redirect', self::LOGIN_URL, true)->willReturnSelf();
        $this->rawFactory->method('create')->willReturn($raw);

        self::assertSame($raw, $this->plugin->aroundExecute($this->action, static fn () => 'never'));
    }

    /**
     * A Raw result whose redirect calls the test verifies.
     *
     * @return Raw&MockObject
     */
    private function rawResult(): Raw
    {
        $raw = $this->createMock(Raw::class);
        $raw->expects(self::once())->method('setContents')->with('')->willReturnSelf();

        return $raw;
    }

    public function testAFailingCheckLetsTheRequestThrough(): void
    {
        $this->request->method('getFullActionName')->willReturn('checkout_cart_index');
        $this->availability->method('canPurchase')->willThrowException(new \RuntimeException('db gone'));

        self::assertSame('ok', $this->plugin->aroundExecute($this->action, static fn () => 'ok'));
    }

    /**
     * An exception thrown by the action (or a later plugin) is not a guard
     * failure: it must propagate untouched and the action must not run twice.
     */
    public function testAnExceptionOfTheActionPropagatesAndTheActionRunsOnce(): void
    {
        $this->request->method('getFullActionName')->willReturn('checkout_cart_add');
        $this->availability->method('canPurchase')->willReturn(true);
        $calls = 0;
        $proceed = static function () use (&$calls): string {
            $calls++;
            throw new \RuntimeException('add to cart failed');
        };

        try {
            $this->plugin->aroundExecute($this->action, $proceed);
            self::fail('The exception of the action must propagate.');
        } catch (\RuntimeException $e) {
            self::assertSame('add to cart failed', $e->getMessage());
        }
        self::assertSame(1, $calls);
    }

    public function testUnguardedRoutesRunTheActionExactlyOnce(): void
    {
        $this->request->method('getFullActionName')->willReturn('catalog_product_view');
        $calls = 0;
        $proceed = static function () use (&$calls): string {
            $calls++;
            return 'page';
        };

        self::assertSame('page', $this->plugin->aroundExecute($this->action, $proceed));
        self::assertSame(1, $calls);
    }
}
