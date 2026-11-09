<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Plugin\Framework\View\Page\Config;

use Magento\Framework\View\Element\AbstractBlock;
use Magento\Framework\View\LayoutInterface;
use Magento\Framework\View\Page\Config\Renderer;
use Magentofullstackdev\HyperionCore\Block\AssetManifest;
use Psr\Log\LoggerInterface;

/**
 * Holds the first paint of a page that paints its fold from an inline
 * critical sheet until the parser has reached the footer.
 *
 * Such a page (`critical_css_type` on the `hyperion.head.scripts` block,
 * see head/scripts.phtml) loads the theme stylesheet without blocking, so
 * nothing keeps the browser from painting the document while it is still
 * streaming in: a frame with half a header (the centred top menu and the
 * action bar moved as their siblings arrived) or half a grid counts as a
 * layout shift. `<link rel="expect" href="#<marker>" blocking="render">`
 * tells the browser to wait for that element before the first paint. The
 * marker is the footer, the element the theme renders last, so the whole
 * document is parsed before the first paint. A layout may name an earlier
 * element through `critical_css_marker` on the block (the paint then waits
 * for that element only and the content after it streams in progressively:
 * a tile whose bottom anchored price block was still arriving registered
 * as a shift when the product grid was the marker, so the theme does not).
 * A browser without `rel=expect` paints progressively, a page without the
 * marker element is unblocked when parsing ends.
 *
 * Appended to the head content from here because the link is honoured in
 * `<head>` only and the head scripts block renders at the top of the body.
 */
class RenderBlockingMarkerPlugin
{
    public const MARKER_ID = 'hyperion-footer';
    private const HEAD_SCRIPTS_BLOCK = 'hyperion.head.scripts';

    public function __construct(
        private readonly LayoutInterface $layout,
        private readonly AssetManifest $assetManifest,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function afterRenderHeadContent(Renderer $subject, string $result): string
    {
        try {
            $block = $this->layout->getBlock(self::HEAD_SCRIPTS_BLOCK);
            if (!$block instanceof AbstractBlock) {
                return $result;
            }
            $type = (string) $block->getData('critical_css_type');
            if ($type === '' || $this->assetManifest->getCriticalCss($type) === '') {
                return $result;
            }
            $marker = (string) $block->getData('critical_css_marker');
            if (!preg_match('/^[A-Za-z][\w-]*$/', $marker)) {
                $marker = self::MARKER_ID;
            }

            return $result . '<link rel="expect" href="#' . $marker . '" blocking="render">' . "\n";
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion render blocking marker failed: ' . $e->getMessage());

            return $result;
        }
    }
}
