<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\Controller\Order;

use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\App\Action\HttpPostActionInterface;
use Magento\Framework\App\CsrfAwareActionInterface;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\App\Request\InvalidRequestException;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\Controller\Result\Redirect;
use Magento\Framework\Controller\Result\RedirectFactory;
use Magento\Framework\Controller\ResultInterface;
use Magento\Framework\Data\Form\FormKey\Validator as FormKeyValidator;
use Magento\Framework\Escaper;
use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\Message\ManagerInterface as MessageManager;
use Magento\Framework\UrlInterface;
use Magento\Sales\Api\OrderRepositoryInterface;
use Magento\Sales\Model\Order;
use Magentofullstackdev\HyperionCore\Model\CacheHeaders;
use Magentofullstackdev\HyperionCore\Model\Htmx\FragmentRenderer;
use Magentofullstackdev\HyperionCore\Model\Htmx\MessageCollector;
use Magentofullstackdev\HyperionCore\Model\Htmx\NotificationRenderer;
use Magentofullstackdev\HyperionCustomer\Model\OrderCancellation;
use Psr\Log\LoggerInterface;

/**
 * POST /hyperion/order/cancel: self-service cancellation of the signed-in
 * customer's own order (form key, `order_id`, `reason`, `context`).
 *
 * Replaces the RequireJS modal + GraphQL mutation of
 * Magento_OrderCancellationUi. Rules and wording come from
 * Magentofullstackdev\HyperionCustomer\Model\OrderCancellation, which
 * mirrors the `cancelOrder` mutation.
 *
 * HTMX request (`hx-swap="none"`, everything rides out-of-band):
 *   - `#hyperion-notification` toast (success or error),
 *   - `context=view`: the order status + actions row
 *     (`#hyperion-order-actions`, handle hyperion_customer_order_actions),
 *   - `context=list`: the row status text (`#hyperion-order-status-<id>`)
 *     and deletion of the row's cancel trigger (`#hyperion-order-cancel-<id>`).
 *   Only fragments the requesting page carries are emitted: an OOB
 *   element without a target makes HTMX log a console error.
 * Plain POST: messages through the message manager and a redirect to the
 * order view (order history when the order is not the customer's).
 */
class Cancel implements HttpPostActionInterface, CsrfAwareActionInterface
{
    private const HTMX_HEADER = 'HX-Request';
    private const ACTIONS_HANDLE = 'hyperion_customer_order_actions';
    private const ACTIONS_BLOCK = 'hyperion.customer.order.actions';
    private const CONTEXT_VIEW = 'view';
    private const CONTEXT_LIST = 'list';

    /**
     * @param HttpRequest $request
     * @param RedirectFactory $redirectFactory
     * @param RawFactory $rawFactory
     * @param FormKeyValidator $formKeyValidator
     * @param CustomerSession $customerSession
     * @param OrderRepositoryInterface $orderRepository
     * @param OrderCancellation $orderCancellation
     * @param MessageManager $messageManager
     * @param MessageCollector $messageCollector
     * @param NotificationRenderer $notificationRenderer
     * @param FragmentRenderer $fragmentRenderer
     * @param CacheHeaders $cacheHeaders
     * @param UrlInterface $urlBuilder
     * @param Escaper $escaper
     * @param LoggerInterface $logger
     * @SuppressWarnings(PHPMD.ExcessiveParameterList)
     */
    public function __construct(
        private readonly HttpRequest $request,
        private readonly RedirectFactory $redirectFactory,
        private readonly RawFactory $rawFactory,
        private readonly FormKeyValidator $formKeyValidator,
        private readonly CustomerSession $customerSession,
        private readonly OrderRepositoryInterface $orderRepository,
        private readonly OrderCancellation $orderCancellation,
        private readonly MessageManager $messageManager,
        private readonly MessageCollector $messageCollector,
        private readonly NotificationRenderer $notificationRenderer,
        private readonly FragmentRenderer $fragmentRenderer,
        private readonly CacheHeaders $cacheHeaders,
        private readonly UrlInterface $urlBuilder,
        private readonly Escaper $escaper,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @inheritdoc
     */
    public function createCsrfValidationException(RequestInterface $request): ?InvalidRequestException
    {
        $this->messageManager->addErrorMessage((string) __('Invalid Form Key. Please refresh the page.'));

        return new InvalidRequestException($this->redirect('sales/order/history'));
    }

    /**
     * @inheritdoc
     */
    public function validateForCsrf(RequestInterface $request): ?bool
    {
        return $this->formKeyValidator->validate($request);
    }

    /**
     * @return ResultInterface
     */
    public function execute(): ResultInterface
    {
        if (!$this->customerSession->isLoggedIn()) {
            return $this->redirect('customer/account/login');
        }

        $order = $this->loadOwnOrder((int) $this->request->getParam('order_id'));
        if ($order === null) {
            $this->messageManager->addErrorMessage((string) __('This order could not be found.'));
            return $this->respond(null);
        }

        $blocker = $this->orderCancellation->getBlocker($order);
        if ($blocker !== null) {
            $this->messageManager->addErrorMessage((string) $blocker);
            return $this->respond($order);
        }

        $reason = trim((string) $this->request->getParam('reason'));
        if ($reason === '' || !in_array($reason, $this->orderCancellation->getReasons($order), true)) {
            $this->messageManager->addErrorMessage((string) __('Please select a cancellation reason.'));
            return $this->respond($order);
        }

        try {
            $order = $this->orderCancellation->cancel($order, $reason);
            $this->messageManager->addSuccessMessage(
                (string) __('Order %1 has been cancelled.', $order->getRealOrderId())
            );
        } catch (LocalizedException $e) {
            $this->logger->warning('Hyperion order cancel: ' . $e->getMessage());
            $this->messageManager->addErrorMessage($e->getMessage());
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion order cancel: ' . $e->getMessage());
            $this->messageManager->addErrorMessage((string) __('The order could not be cancelled. Please try again.'));
        }

        return $this->respond($order);
    }

    /**
     * The order, only when it belongs to the signed-in customer.
     *
     * @param int $orderId
     * @return Order|null
     */
    private function loadOwnOrder(int $orderId): ?Order
    {
        if ($orderId <= 0) {
            return null;
        }

        try {
            $order = $this->orderRepository->get($orderId);
        } catch (\Throwable $e) {
            $this->logger->notice('Hyperion order cancel: order ' . $orderId . ' not loaded -- ' . $e->getMessage());
            return null;
        }

        if (!$order instanceof Order
            || (int) $order->getCustomerId() !== (int) $this->customerSession->getCustomerId()
        ) {
            return null;
        }

        return $order;
    }

    /**
     * HTMX fragments or a redirect, depending on the request.
     *
     * @param Order|null $order
     * @return ResultInterface
     */
    private function respond(?Order $order): ResultInterface
    {
        if (!$this->request->getHeader(self::HTMX_HEADER)) {
            return $order === null
                ? $this->redirect('sales/order/history')
                : $this->redirect('sales/order/view', ['order_id' => $order->getId()]);
        }

        $messages = $this->messageCollector->collect();
        $tone = $messages['has_error'] ? NotificationRenderer::TONE_ERROR : NotificationRenderer::TONE_SUCCESS;
        $html = $this->notificationRenderer->render($messages['html'], $tone, true);

        if ($order !== null) {
            $html .= "\n" . $this->renderOrderFragments($order, (string) $this->request->getParam('context'));
        }

        $response = $this->rawFactory->create();
        $response->setHeader('Content-Type', 'text/html; charset=UTF-8', true);
        $response->setContents($html);

        return $this->cacheHeaders->applyPrivate($response);
    }

    /**
     * Out-of-band updates for the page that issued the request.
     *
     * @param Order $order
     * @param string $context
     * @return string
     */
    private function renderOrderFragments(Order $order, string $context): string
    {
        if ($context === self::CONTEXT_VIEW) {
            return $this->fragmentRenderer->render(
                self::ACTIONS_HANDLE,
                self::ACTIONS_BLOCK,
                ['oob' => true, 'order' => $order, 'show_actions' => true]
            );
        }

        if ($context === self::CONTEXT_LIST) {
            $id = (int) $order->getId();
            $status = '<span id="hyperion-order-status-' . $id . '" hx-swap-oob="innerHTML">'
                . $this->escaper->escapeHtml((string) $order->getStatusLabel()) . '</span>';
            if (!$this->orderCancellation->canCancel($order)) {
                $status .= '<span id="hyperion-order-cancel-' . $id . '" hx-swap-oob="delete"></span>';
            }
            return $status;
        }

        return '';
    }

    /**
     * Redirect, or `HX-Redirect` for an HTMX caller.
     *
     * @param string $path
     * @param array $params
     * @return ResultInterface
     */
    private function redirect(string $path, array $params = []): ResultInterface
    {
        if ($this->request->getHeader(self::HTMX_HEADER)) {
            /** @var Raw $raw */
            $raw = $this->rawFactory->create();
            $raw->setHeader('HX-Redirect', $this->urlBuilder->getUrl($path, $params), true);
            $raw->setContents('');
            return $this->cacheHeaders->applyPrivate($raw);
        }

        /** @var Redirect $redirect */
        $redirect = $this->redirectFactory->create();
        return $redirect->setPath($path, $params);
    }
}
