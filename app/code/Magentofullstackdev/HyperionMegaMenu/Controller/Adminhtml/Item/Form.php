<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Controller\Adminhtml\Item;

use Magento\Backend\App\Action;
use Magento\Backend\App\Action\Context;
use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\View\Result\PageFactory;
use Psr\Log\LoggerInterface;

/**
 * The inspector form of an item (or of a new item under `parent_id`) as an
 * HTML fragment the builder fetches into its right column.
 */
class Form extends Action implements HttpGetActionInterface
{
    public const ADMIN_RESOURCE = 'Magentofullstackdev_HyperionMegaMenu::group';

    private const HANDLE = 'hyperion_megamenu_item_form';
    private const BLOCK = 'hyperion.megamenu.item.form';

    public function __construct(
        Context $context,
        private readonly PageFactory $pageFactory,
        private readonly RawFactory $rawFactory,
        private readonly LoggerInterface $logger
    ) {
        parent::__construct($context);
    }

    public function execute(): Raw
    {
        $response = $this->rawFactory->create();
        $response->setHeader('Content-Type', 'text/html; charset=UTF-8', true);
        $response->setHeader('Cache-Control', 'private, no-store', true);
        try {
            $page = $this->pageFactory->create(false, ['load_default' => false]);
            $page->addHandle(self::HANDLE);
            $page->initLayout();
            $block = $page->getLayout()->getBlock(self::BLOCK);

            return $response->setContents($block ? (string) $block->toHtml() : '');
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion mega menu builder: form failed: ' . $e->getMessage(), ['exception' => $e]);

            return $response->setHttpResponseCode(500)->setContents('');
        }
    }
}
