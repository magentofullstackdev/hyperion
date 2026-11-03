<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Model\Htmx;

use Magento\Framework\View\Element\AbstractBlock;
use Magento\Framework\View\Result\PageFactory;
use Psr\Log\LoggerInterface;

/**
 * Renders a single block from a fragment-only layout handle, the same way
 * the `/hyperion/<x>/fragment` controllers do, so an action plugin can
 * ship the very same markup out-of-band (`hx-swap-oob`) in its response.
 *
 * Reusing the fragment templates instead of hand-writing the anchor
 * markup inside each plugin keeps the header counters byte-identical
 * whether they come from the initial `hx-trigger="load"` fetch or from an
 * add / remove action, and it means the state attributes the toggle
 * components read (`data-hyperion-wishlist-items`, `data-hyperion-
 * compare-ids`) are emitted from one place.
 */
class FragmentRenderer
{
    public function __construct(
        private readonly PageFactory $pageFactory,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @param string $handle Layout handle to load (no `default` merge).
     * @param string $blockName Block to render from that handle.
     * @param array<string, mixed> $data Extra block data, e.g. ['oob' => true].
     */
    public function render(string $handle, string $blockName, array $data = []): string
    {
        try {
            $page = $this->pageFactory->create(false, ['load_default' => false]);
            $page->addHandle($handle);
            $page->initLayout();

            $block = $page->getLayout()->getBlock($blockName);
            if (!$block instanceof AbstractBlock) {
                $this->logger->warning(sprintf(
                    'Hyperion FragmentRenderer: block "%s" not found in handle "%s".',
                    $blockName,
                    $handle
                ));
                return '';
            }

            if ($data !== []) {
                $block->addData($data);
            }

            return (string) $block->toHtml();
        } catch (\Throwable $e) {
            $this->logger->error(sprintf(
                'Hyperion FragmentRenderer: rendering "%s" from "%s" failed -- %s',
                $blockName,
                $handle,
                $e->getMessage()
            ));
            return '';
        }
    }
}
