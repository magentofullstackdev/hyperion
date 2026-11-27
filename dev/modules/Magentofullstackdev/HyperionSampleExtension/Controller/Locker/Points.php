<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleExtension\Controller\Locker;

use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Framework\Controller\ResultInterface;
use Magento\Store\Model\ScopeInterface;
use Magentofullstackdev\HyperionSampleExtension\Model\Config;
use Magentofullstackdev\HyperionSampleExtension\Model\LockerPoints;

/**
 * GET /hyperionsample/locker/points?q=<text>: the pickup points matching the
 * text, `{ points: [...] }`. Answers 404 while the carrier is off.
 */
class Points implements HttpGetActionInterface
{
    /**
     * @param RequestInterface $request
     * @param JsonFactory $jsonFactory
     * @param LockerPoints $lockerPoints
     * @param Config $config
     * @param ScopeConfigInterface $scopeConfig
     */
    public function __construct(
        private readonly RequestInterface $request,
        private readonly JsonFactory $jsonFactory,
        private readonly LockerPoints $lockerPoints,
        private readonly Config $config,
        private readonly ScopeConfigInterface $scopeConfig
    ) {
    }

    /**
     * @inheritDoc
     */
    public function execute(): ResultInterface
    {
        $result = $this->jsonFactory->create();
        $result->setHeader('Cache-Control', 'no-store, private', true);
        if (!$this->config->isEnabled()
            || !$this->scopeConfig->isSetFlag('carriers/hyperionlocker/active', ScopeInterface::SCOPE_STORE)
        ) {
            $result->setHttpResponseCode(404);

            return $result->setData(['message' => (string) __('The pickup points could not be loaded.')]);
        }
        $query = $this->request->getParam('q');

        return $result->setData([
            'points' => $this->lockerPoints->search(is_string($query) ? mb_substr($query, 0, 64) : ''),
        ]);
    }
}
