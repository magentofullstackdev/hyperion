<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSamplePsp\Controller\Redirect;

use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\Controller\Result\RedirectFactory;
use Magento\Framework\Controller\ResultInterface;
use Magento\Framework\Data\Form\FormKey;
use Magento\Framework\Exception\NotFoundException;
use Magento\Sales\Model\Order;
use Magentofullstackdev\HyperionSamplePsp\Model\Config;
use Magentofullstackdev\HyperionSamplePsp\Model\GatewayPage;

/**
 * GET /hyperionsample/redirect/start: the fake hosted payment page the
 * checkout sends the shopper to after placing an order with
 * hyperion_sample_redirect (the pool entry's redirect_route). It reads the
 * order the session just placed; anything else goes back to the cart.
 */
class Start implements HttpGetActionInterface
{
    /**
     * @param Config $config
     * @param GatewayPage $gatewayPage
     * @param CheckoutSession $checkoutSession
     * @param RedirectFactory $redirectFactory
     * @param FormKey $formKey
     */
    public function __construct(
        private readonly Config $config,
        private readonly GatewayPage $gatewayPage,
        private readonly CheckoutSession $checkoutSession,
        private readonly RedirectFactory $redirectFactory,
        private readonly FormKey $formKey
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
        $order = $this->checkoutSession->getLastRealOrder();
        if (!$order->getId()
            || $order->getPayment()?->getMethod() !== Config::REDIRECT
            || $order->getState() !== Order::STATE_NEW
        ) {
            return $this->redirectFactory->create()->setPath('checkout/cart');
        }

        return $this->gatewayPage->render('Magentofullstackdev_HyperionSamplePsp::gateway/page.phtml', [
            'heading' => (string) __('Sample hosted payment page'),
            'order_number' => (string) $order->getIncrementId(),
            'amount' => (string) $order->formatPriceTxt((float) $order->getGrandTotal()),
            'action_path' => 'hyperionsample/redirect/return',
            'form_key' => $this->formKey->getFormKey(),
            'fields' => ['order' => (string) $order->getIncrementId()],
        ]);
    }
}
