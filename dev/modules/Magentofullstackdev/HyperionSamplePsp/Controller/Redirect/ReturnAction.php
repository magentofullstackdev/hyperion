<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSamplePsp\Controller\Redirect;

use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\App\Action\HttpPostActionInterface;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Controller\Result\RedirectFactory;
use Magento\Framework\Controller\ResultInterface;
use Magento\Framework\Exception\NotFoundException;
use Magento\Framework\Message\ManagerInterface;
use Magento\Sales\Model\Order;
use Magentofullstackdev\HyperionSamplePsp\Model\Config;
use Magentofullstackdev\HyperionSamplePsp\Model\HostedPayment;
use Psr\Log\LoggerInterface;

/**
 * POST /hyperionsample/redirect/return (form key checked by core): the
 * answer of the fake hosted page. Pay registers the payment and goes to the
 * success page; Cancel cancels the order, restores the cart and goes back
 * to it with a message.
 */
class ReturnAction implements HttpPostActionInterface
{
    /**
     * @param Config $config
     * @param RequestInterface $request
     * @param CheckoutSession $checkoutSession
     * @param HostedPayment $hostedPayment
     * @param RedirectFactory $redirectFactory
     * @param ManagerInterface $messageManager
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly Config $config,
        private readonly RequestInterface $request,
        private readonly CheckoutSession $checkoutSession,
        private readonly HostedPayment $hostedPayment,
        private readonly RedirectFactory $redirectFactory,
        private readonly ManagerInterface $messageManager,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @inheritDoc
     *
     * @throws NotFoundException while the method is off
     */
    public function execute(): ResultInterface
    {
        if (!$this->config->isMethodActive(Config::REDIRECT)) {
            throw new NotFoundException(__('Page not found.'));
        }
        $redirect = $this->redirectFactory->create();
        $order = $this->checkoutSession->getLastRealOrder();
        $posted = (string) $this->request->getParam('order');
        if (!$order->getId()
            || $posted === ''
            || $posted !== (string) $order->getIncrementId()
            || $order->getPayment()?->getMethod() !== Config::REDIRECT
            || $order->getState() !== Order::STATE_NEW
        ) {
            return $redirect->setPath('checkout/cart');
        }

        try {
            if ($this->request->getParam('sample_action') === 'pay') {
                $this->hostedPayment->pay($order);

                return $redirect->setPath('checkout/onepage/success');
            }
            $this->hostedPayment->cancel($order);
            $this->checkoutSession->restoreQuote();
            $this->messageManager->addErrorMessage(__('The sample payment was canceled. Your cart was restored.'));
        } catch (\Throwable $e) {
            $this->logger->error('Sample PSP: the hosted payment answer failed.', ['exception' => $e]);
            $this->messageManager->addErrorMessage(__('The sample payment could not be completed.'));
        }

        return $redirect->setPath('checkout/cart');
    }
}
