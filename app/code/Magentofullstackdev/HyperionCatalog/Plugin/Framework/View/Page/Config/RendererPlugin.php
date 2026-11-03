<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Plugin\Framework\View\Page\Config;

use Magento\Catalog\Model\Product;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Registry;
use Magento\Framework\View\Page\Config\Renderer;
use Magentofullstackdev\HyperionCatalog\Model\OpenGraph;
use Psr\Log\LoggerInterface;

/**
 * Appends the Open Graph tags to the `<head>` content of product pages.
 *
 * The head is rendered before the body blocks, from the page config, so a
 * template cannot add to it; core's own tags live in `head.additional`,
 * which the theme removes. The product comes from the registry entry the
 * catalog controller sets (`current_product`), the page from the request's
 * full action name.
 */
class RendererPlugin
{
    private const PRODUCT_ACTION = 'catalog_product_view';

    /**
     * @param OpenGraph $openGraph
     * @param Registry $registry
     * @param RequestInterface $request
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly OpenGraph $openGraph,
        private readonly Registry $registry,
        private readonly RequestInterface $request,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @param Renderer $subject
     * @param string $result
     * @return string
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function afterRenderHeadContent(Renderer $subject, string $result): string
    {
        try {
            if (!$this->request instanceof HttpRequest
                || $this->request->getFullActionName() !== self::PRODUCT_ACTION
            ) {
                return $result;
            }
            $product = $this->registry->registry('current_product');
            if (!$product instanceof Product || !$product->getId()) {
                return $result;
            }

            return $result . $this->openGraph->render($product);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion OpenGraph RendererPlugin -- ' . $e->getMessage());

            return $result;
        }
    }
}
