<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\Test\Unit\Controller\Order;

use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\Controller\Result\Redirect;
use Magento\Framework\Controller\Result\RedirectFactory;
use Magento\Framework\Data\Form\FormKey\Validator as FormKeyValidator;
use Magento\Framework\Escaper;
use Magento\Framework\Message\ManagerInterface as MessageManager;
use Magento\Framework\Phrase;
use Magento\Framework\UrlInterface;
use Magento\Sales\Api\OrderRepositoryInterface;
use Magento\Sales\Model\Order;
use Magentofullstackdev\HyperionCore\Model\CacheHeaders;
use Magentofullstackdev\HyperionCore\Model\Htmx\FragmentRenderer;
use Magentofullstackdev\HyperionCore\Model\Htmx\MessageCollector;
use Magentofullstackdev\HyperionCore\Model\Htmx\NotificationRenderer;
use Magentofullstackdev\HyperionCustomer\Controller\Order\Cancel;
use Magentofullstackdev\HyperionCustomer\Model\OrderCancellation;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * Authorisation decisions of the cancel endpoint.
 *
 * @covers \Magentofullstackdev\HyperionCustomer\Controller\Order\Cancel
 */
class CancelTest extends TestCase
{
    /** @var HttpRequest&Stub */
    private HttpRequest $request;

    /** @var CustomerSession&Stub */
    private CustomerSession $customerSession;

    /** @var OrderRepositoryInterface&Stub */
    private OrderRepositoryInterface $orderRepository;

    /** @var OrderCancellation&Stub */
    private OrderCancellation $orderCancellation;

    /** @var MessageCollector&Stub */
    private MessageCollector $messageCollector;

    /** @var array<string, string> */
    private array $params = [];

    /** @var array<int, string> */
    private array $errors = [];

    protected function setUp(): void
    {
        $this->request = $this->createStub(HttpRequest::class);
        $this->request->method('getParam')->willReturnCallback(
            fn (string $name) => $this->params[$name] ?? null
        );
        $this->request->method('getHeader')->willReturn(false);
        $this->customerSession = $this->createStub(CustomerSession::class);
        $this->orderRepository = $this->createStub(OrderRepositoryInterface::class);
        $this->orderCancellation = $this->createStub(OrderCancellation::class);
        $this->messageCollector = $this->createStub(MessageCollector::class);
    }

    /**
     * Every dependency is a stub unless the test hands in a mock whose calls
     * it verifies.
     */
    private function controller(
        ?HttpRequest $request = null,
        ?Redirect $redirect = null,
        ?Raw $raw = null,
        ?OrderRepositoryInterface $orderRepository = null,
        ?OrderCancellation $orderCancellation = null,
        ?MessageManager $messageManager = null,
        ?FragmentRenderer $fragmentRenderer = null
    ): Cancel {
        if ($redirect === null) {
            $redirect = $this->createStub(Redirect::class);
            $redirect->method('setPath')->willReturnSelf();
        }
        $redirectFactory = $this->createStub(RedirectFactory::class);
        $redirectFactory->method('create')->willReturn($redirect);
        $rawFactory = $this->createStub(RawFactory::class);
        $rawFactory->method('create')->willReturn($raw ?? $this->createStub(Raw::class));
        if ($messageManager === null) {
            $messageManager = $this->createStub(MessageManager::class);
            $this->recordErrors($messageManager);
        }
        $notificationRenderer = $this->createStub(NotificationRenderer::class);
        $notificationRenderer->method('render')->willReturn(
            '<hyperion-notification id="hyperion-notification" hx-swap-oob="outerHTML"></hyperion-notification>'
        );
        $cacheHeaders = $this->createStub(CacheHeaders::class);
        $cacheHeaders->method('applyPrivate')->willReturnArgument(0);

        return new Cancel(
            $request ?? $this->request,
            $redirectFactory,
            $rawFactory,
            $this->createStub(FormKeyValidator::class),
            $this->customerSession,
            $orderRepository ?? $this->orderRepository,
            $orderCancellation ?? $this->orderCancellation,
            $messageManager,
            $this->messageCollector,
            $notificationRenderer,
            $fragmentRenderer ?? $this->createStub(FragmentRenderer::class),
            $cacheHeaders,
            $this->createStub(UrlInterface::class),
            new Escaper(),
            $this->createStub(LoggerInterface::class)
        );
    }

    /**
     * Collects the error messages the controller adds into `$this->errors`.
     *
     * @param MessageManager&Stub $messageManager
     */
    private function recordErrors(MessageManager $messageManager): void
    {
        $messageManager->method('addErrorMessage')->willReturnCallback(
            function ($message) use ($messageManager): MessageManager {
                $this->errors[] = (string) $message;
                return $messageManager;
            }
        );
    }

    /**
     * A redirect that must be sent to exactly one path.
     *
     * @param array<string, mixed> $params
     * @return Redirect&MockObject
     */
    private function redirectTo(string $path, array $params = []): Redirect
    {
        $redirect = $this->createMock(Redirect::class);
        $redirect->expects(self::once())->method('setPath')->with($path, $params)->willReturnSelf();

        return $redirect;
    }

    public function testGuestIsSentToLoginWithoutTouchingOrders(): void
    {
        $this->customerSession->method('isLoggedIn')->willReturn(false);
        $orderRepository = $this->createMock(OrderRepositoryInterface::class);
        $orderRepository->expects(self::never())->method('get');
        $orderCancellation = $this->createMock(OrderCancellation::class);
        $orderCancellation->expects(self::never())->method('cancel');
        $redirect = $this->redirectTo('customer/account/login');

        self::assertSame($redirect, $this->controller(null, $redirect, null, $orderRepository, $orderCancellation)->execute());
    }

    public function testAnotherCustomersOrderIsRefused(): void
    {
        $this->signIn(7);
        $this->params = ['order_id' => '3', 'reason' => 'Other'];
        $this->orderRepository->method('get')->willReturn($this->order(3, 9));
        $orderCancellation = $this->createMock(OrderCancellation::class);
        $orderCancellation->expects(self::never())->method('cancel');
        $redirect = $this->redirectTo('sales/order/history');

        $this->controller(null, $redirect, null, null, $orderCancellation)->execute();

        self::assertSame(['This order could not be found.'], $this->errors);
    }

    public function testBlockedOrderIsNotCancelled(): void
    {
        $this->signIn(7);
        $this->params = ['order_id' => '3', 'reason' => 'Other'];
        $order = $this->order(3, 7);
        $this->orderRepository->method('get')->willReturn($order);
        $orderCancellation = $this->createMock(OrderCancellation::class);
        $orderCancellation->method('getBlocker')->with($order)
            ->willReturn(new Phrase('Order with one or more items shipped cannot be cancelled'));
        $orderCancellation->expects(self::never())->method('cancel');
        $redirect = $this->redirectTo('sales/order/view', ['order_id' => 3]);

        $this->controller(null, $redirect, null, null, $orderCancellation)->execute();

        self::assertSame(['Order with one or more items shipped cannot be cancelled'], $this->errors);
    }

    public function testUnknownReasonIsRefused(): void
    {
        $this->signIn(7);
        $this->params = ['order_id' => '3', 'reason' => 'Because'];
        $order = $this->order(3, 7);
        $this->orderRepository->method('get')->willReturn($order);
        $orderCancellation = $this->createMock(OrderCancellation::class);
        $orderCancellation->method('getBlocker')->willReturn(null);
        $orderCancellation->method('getReasons')->willReturn(['Other']);
        $orderCancellation->expects(self::never())->method('cancel');

        $this->controller(null, null, null, null, $orderCancellation)->execute();

        self::assertSame(['Please select a cancellation reason.'], $this->errors);
    }

    public function testOwnCancellableOrderIsCancelledWithTheReason(): void
    {
        $this->signIn(7);
        $this->params = ['order_id' => '3', 'reason' => 'Other'];
        $order = $this->order(3, 7);
        $this->orderRepository->method('get')->willReturn($order);
        $orderCancellation = $this->createMock(OrderCancellation::class);
        $orderCancellation->method('getBlocker')->willReturn(null);
        $orderCancellation->method('getReasons')->willReturn(['No longer needed', 'Other']);
        $orderCancellation->expects(self::once())->method('cancel')->with($order, 'Other')->willReturn($order);
        $messageManager = $this->createMock(MessageManager::class);
        $this->recordErrors($messageManager);
        $messageManager->expects(self::once())->method('addSuccessMessage');
        $redirect = $this->redirectTo('sales/order/view', ['order_id' => 3]);

        $this->controller(null, $redirect, null, null, $orderCancellation, $messageManager)->execute();

        self::assertSame([], $this->errors);
    }

    public function testHtmxRequestGetsToastAndOrderFragment(): void
    {
        $request = $this->createStub(HttpRequest::class);
        $request->method('getParam')->willReturnCallback(
            fn (string $name) => ['order_id' => '3', 'reason' => 'Other', 'context' => 'view'][$name] ?? null
        );
        $request->method('getHeader')->willReturnCallback(fn (string $name) => $name === 'HX-Request' ? 'true' : false);
        $raw = $this->createMock(Raw::class);
        $raw->expects(self::once())->method('setContents')->with(self::callback(
            static fn (string $html): bool => str_contains($html, 'hyperion-notification')
                && str_contains($html, 'ACTIONS-FRAGMENT')
        ));

        $this->signIn(7);
        $order = $this->order(3, 7);
        $this->orderRepository->method('get')->willReturn($order);
        $this->orderCancellation->method('getBlocker')->willReturn(null);
        $this->orderCancellation->method('getReasons')->willReturn(['Other']);
        $this->orderCancellation->method('cancel')->willReturn($order);
        $this->messageCollector->method('collect')->willReturn(['html' => 'Order cancelled', 'has_error' => false]);
        $fragmentRenderer = $this->createMock(FragmentRenderer::class);
        $fragmentRenderer->expects(self::once())->method('render')
            ->with('hyperion_customer_order_actions', 'hyperion.customer.order.actions', self::anything())
            ->willReturn('<div id="hyperion-order-actions" hx-swap-oob="outerHTML">ACTIONS-FRAGMENT</div>');

        $controller = $this->controller($request, null, $raw, null, null, null, $fragmentRenderer);

        self::assertSame($raw, $controller->execute());
    }

    /**
     * @param int $customerId
     */
    private function signIn(int $customerId): void
    {
        $this->customerSession->method('isLoggedIn')->willReturn(true);
        $this->customerSession->method('getCustomerId')->willReturn($customerId);
    }

    /**
     * @param int $id
     * @param int $customerId
     * @return Order
     */
    private function order(int $id, int $customerId): Order
    {
        $order = $this->createStub(Order::class);
        $order->method('getId')->willReturn($id);
        $order->method('getCustomerId')->willReturn($customerId);
        $order->method('getRealOrderId')->willReturn(sprintf('%09d', $id));
        $order->method('getStatusLabel')->willReturn('Pending');

        return $order;
    }
}
