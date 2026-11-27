<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSamplePsp\Controller\Express;

use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\App\Action\HttpPostActionInterface;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Controller\Result\RedirectFactory;
use Magento\Framework\Controller\ResultInterface;
use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\Exception\NotFoundException;
use Magento\Framework\Message\ManagerInterface;
use Magentofullstackdev\HyperionSamplePsp\Model\Config;
use Magentofullstackdev\HyperionSamplePsp\Model\ExpressOrder;
use Magentofullstackdev\HyperionSamplePsp\Model\ExpressSession;
use Magentofullstackdev\HyperionSamplePsp\Model\HostedPayment;
use Psr\Log\LoggerInterface;

/**
 * POST /hyperionsample/express/return (form key checked by core): Pay fills
 * the cart with the wallet's address and the cheapest rate, places the order
 * with hyperion_sample_redirect, registers the payment and goes to the
 * success page. Cancel goes back to the cart.
 */
class ReturnAction implements HttpPostActionInterface
{
    /**
     * @param Config $config
     * @param RequestInterface $request
     * @param CheckoutSession $checkoutSession
     * @param ExpressSession $expressSession
     * @param ExpressOrder $expressOrder
     * @param HostedPayment $hostedPayment
     * @param RedirectFactory $redirectFactory
     * @param ManagerInterface $messageManager
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly Config $config,
        private readonly RequestInterface $request,
        private readonly CheckoutSession $checkoutSession,
        private readonly ExpressSession $expressSession,
        private readonly ExpressOrder $expressOrder,
        private readonly HostedPayment $hostedPayment,
        private readonly RedirectFactory $redirectFactory,
        private readonly ManagerInterface $messageManager,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @inheritDoc
     *
     * @throws NotFoundException while the express button is off
     */
    public function execute(): ResultInterface
    {
        if (!$this->config->isExpressEnabled()) {
            throw new NotFoundException(__('Page not found.'));
        }
        $redirect = $this->redirectFactory->create();
        if (!$this->expressSession->isValid((string) $this->request->getParam('token'))) {
            return $redirect->setPath('checkout/cart');
        }
        if ($this->request->getParam('sample_action') !== 'pay') {
            $this->messageManager->addErrorMessage(__('The sample express payment was canceled.'));

            return $redirect->setPath('checkout/cart');
        }

        try {
            $order = $this->expressOrder->place($this->checkoutSession->getQuote());
            $this->hostedPayment->pay($order);

            return $redirect->setPath('checkout/onepage/success');
        } catch (LocalizedException $e) {
            $this->logger->warning('Sample PSP: the express order was refused.', ['exception' => $e]);
            $this->messageManager->addErrorMessage($e->getMessage());
        } catch (\Throwable $e) {
            $this->logger->error('Sample PSP: the express order failed.', ['exception' => $e]);
            $this->messageManager->addErrorMessage(__('The sample express payment could not be completed.'));
        }

        return $redirect->setPath('checkout/cart');
    }
}
