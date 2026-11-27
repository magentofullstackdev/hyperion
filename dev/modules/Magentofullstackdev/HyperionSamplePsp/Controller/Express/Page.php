<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSamplePsp\Controller\Express;

use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Controller\Result\RedirectFactory;
use Magento\Framework\Controller\ResultInterface;
use Magento\Framework\Data\Form\FormKey;
use Magento\Framework\Exception\NotFoundException;
use Magento\Framework\Pricing\PriceCurrencyInterface;
use Magentofullstackdev\HyperionSamplePsp\Model\Config;
use Magentofullstackdev\HyperionSamplePsp\Model\ExpressSession;
use Magentofullstackdev\HyperionSamplePsp\Model\GatewayPage;

/**
 * GET /hyperionsample/express/page?token=...: the fake wallet page with Pay
 * and Cancel. A token that is not the session's goes back to the cart.
 */
class Page implements HttpGetActionInterface
{
    /**
     * @param Config $config
     * @param RequestInterface $request
     * @param CheckoutSession $checkoutSession
     * @param ExpressSession $expressSession
     * @param GatewayPage $gatewayPage
     * @param RedirectFactory $redirectFactory
     * @param FormKey $formKey
     * @param PriceCurrencyInterface $priceCurrency
     */
    public function __construct(
        private readonly Config $config,
        private readonly RequestInterface $request,
        private readonly CheckoutSession $checkoutSession,
        private readonly ExpressSession $expressSession,
        private readonly GatewayPage $gatewayPage,
        private readonly RedirectFactory $redirectFactory,
        private readonly FormKey $formKey,
        private readonly PriceCurrencyInterface $priceCurrency
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
        $token = (string) $this->request->getParam('token');
        $quote = $this->checkoutSession->getQuote();
        if (!$this->expressSession->isValid($token) || !$quote->hasItems()) {
            return $this->redirectFactory->create()->setPath('checkout/cart');
        }

        return $this->gatewayPage->render('Magentofullstackdev_HyperionSamplePsp::gateway/page.phtml', [
            'heading' => (string) __('Sample express checkout'),
            'order_number' => '',
            // Quote amounts are already in the display currency: format without converting.
            'amount' => (string) $this->priceCurrency->format(
                (float) $quote->getGrandTotal(),
                false,
                PriceCurrencyInterface::DEFAULT_PRECISION,
                $quote->getStore(),
                $quote->getQuoteCurrencyCode() ?: null
            ),
            'action_path' => 'hyperionsample/express/return',
            'form_key' => $this->formKey->getFormKey(),
            'fields' => ['token' => $token],
        ]);
    }
}
