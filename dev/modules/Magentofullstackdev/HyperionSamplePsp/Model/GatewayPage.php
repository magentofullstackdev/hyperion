<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSamplePsp\Model;

use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\Locale\ResolverInterface;
use Magento\Framework\View\Element\Template;
use Magento\Framework\View\LayoutInterface;

/**
 * Renders one page of the fake gateway: a standalone HTML document (no
 * storefront header, no theme bundle), never cached, the way a provider's
 * own hosted page would be.
 */
class GatewayPage
{
    /**
     * @param LayoutInterface $layout
     * @param RawFactory $rawFactory
     * @param ResolverInterface $localeResolver
     */
    public function __construct(
        private readonly LayoutInterface $layout,
        private readonly RawFactory $rawFactory,
        private readonly ResolverInterface $localeResolver
    ) {
    }

    /**
     * The page as a private, uncached HTML answer.
     *
     * @param string $template Module::path of the document template
     * @param array<string, mixed> $data block data the template reads
     * @return Raw
     */
    public function render(string $template, array $data = []): Raw
    {
        $block = $this->layout->createBlock(Template::class);
        if (!$block instanceof Template) {
            throw new \LogicException('The gateway page block could not be created.');
        }
        $block->setTemplate($template);
        $block->addData($data);
        $block->setData('lang', str_replace('_', '-', (string) $this->localeResolver->getLocale()));

        $result = $this->rawFactory->create();
        $result->setHeader('Content-Type', 'text/html; charset=UTF-8', true);
        $result->setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0', true);
        $result->setHeader('Pragma', 'no-cache', true);
        $result->setContents($block->toHtml());

        return $result;
    }
}
