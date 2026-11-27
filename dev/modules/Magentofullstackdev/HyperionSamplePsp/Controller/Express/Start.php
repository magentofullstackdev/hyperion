<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSamplePsp\Controller\Express;

use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\App\Action\HttpPostActionInterface;
use Magento\Framework\Controller\Result\Json;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Framework\Controller\ResultInterface;
use Magento\Framework\UrlInterface;
use Magentofullstackdev\HyperionSamplePsp\Model\Config;
use Magentofullstackdev\HyperionSamplePsp\Model\ExpressSession;
use Psr\Log\LoggerInterface;

/**
 * POST /hyperionsample/express/start (form key checked by core): called by
 * the express button through `context.storefront()`. Answers `{ url }`, the
 * fake wallet page, or HTTP 400 with `{ message }`.
 */
class Start implements HttpPostActionInterface
{
    /**
     * @param Config $config
     * @param CheckoutSession $checkoutSession
     * @param ExpressSession $expressSession
     * @param JsonFactory $jsonFactory
     * @param UrlInterface $url
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly Config $config,
        private readonly CheckoutSession $checkoutSession,
        private readonly ExpressSession $expressSession,
        private readonly JsonFactory $jsonFactory,
        private readonly UrlInterface $url,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @inheritDoc
     */
    public function execute(): ResultInterface
    {
        $result = $this->jsonFactory->create();
        $result->setHeader('Cache-Control', 'no-store, private', true);
        if (!$this->config->isExpressEnabled()) {
            return $this->refuse($result, 404, (string) __('The sample express payment is not available.'));
        }
        try {
            $quote = $this->checkoutSession->getQuote();
            if (!$quote->getId() || !$quote->hasItems()) {
                return $this->refuse($result, 400, (string) __('Your cart is empty.'));
            }
        } catch (\Throwable $e) {
            $this->logger->error('Sample PSP: the express cart could not be read.', ['exception' => $e]);

            return $this->refuse($result, 400, (string) __('The sample express payment could not start.'));
        }

        return $result->setData([
            'url' => $this->url->getUrl('hyperionsample/express/page', [
                '_query' => ['token' => $this->expressSession->start()],
            ]),
        ]);
    }

    /**
     * An error answer the storefront client shows.
     *
     * @param Json $result
     * @param int $status
     * @param string $message
     * @return Json
     */
    private function refuse(Json $result, int $status, string $message): Json
    {
        $result->setHttpResponseCode($status);

        return $result->setData(['message' => $message]);
    }
}
