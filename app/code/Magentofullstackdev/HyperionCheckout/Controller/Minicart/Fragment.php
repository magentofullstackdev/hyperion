<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Controller\Minicart;

use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\View\Result\PageFactory;
use Psr\Log\LoggerInterface;

class Fragment implements HttpGetActionInterface
{
    /**
     * @param PageFactory $pageFactory
     * @param RawFactory $rawFactory
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly PageFactory $pageFactory,
        private readonly RawFactory $rawFactory,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @return Raw
     */
    public function execute(): Raw
    {
        try {
            $page = $this->pageFactory->create(false, ['load_default' => false]);
            $page->addHandle('hyperion_checkout_minicart');
            $page->initLayout();

            $layout = $page->getLayout();
            $block = $layout->getBlock('hyperion.minicart.fragment');

            $html = '';
            if ($block !== false && $block !== null) {
                $html = $block->toHtml();
            } else {
                $this->logger->warning('Fragment controller: block hyperion.minicart.fragment not found in layout');
            }

            $response = $this->rawFactory->create();
            $response->setHttpResponseCode(200);
            $response->setContents($html);
            $response->setHeader('Content-Type', 'text/html; charset=UTF-8', true);
            $response->setHeader('Cache-Control', 'private, no-store', true);
            $response->setHeader('Pragma', 'no-cache', true);
            $response->setHeader('X-Hyperion-Fragment', 'minicart', true);

            return $response;
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Fragment controller: unexpected failure -- ' . $e->getMessage());
            return $this->rawFactory->create()->setHttpResponseCode(500)->setContents('');
        }
    }
}
