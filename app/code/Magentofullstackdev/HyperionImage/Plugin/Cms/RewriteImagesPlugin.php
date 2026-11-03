<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Plugin\Cms;

use Magento\Framework\View\Element\AbstractBlock;
use Magentofullstackdev\HyperionImage\Service\HtmlImageRewriter;

/**
 * After-plugin that rewrites `<img>` tags inside CMS-block and
 * CMS-page output to `<picture>` wrappers with WebP/AVIF sources.
 *
 * Targets these block types via di.xml:
 * - `Magento\Cms\Block\Block` -- static blocks rendered via layout XML.
 * - `Magento\Cms\Block\Widget\Block` -- static blocks dropped through the
 *   admin Widget UI.
 * - `Magento\Cms\Block\Page` -- full CMS pages.
 *
 * The rewrite runs against the FULL toHtml() output, not against
 * raw `getContent()`, so any directive substitutions
 * (`{{media url=...}}`, `{{store direct_url=...}}`) have already
 * resolved to absolute URLs by the time we see them.
 */
class RewriteImagesPlugin
{
    public function __construct(
        private readonly HtmlImageRewriter $rewriter
    ) {
    }

    /**
     * @param AbstractBlock $subject
     */
    public function afterToHtml(AbstractBlock $subject, string $result): string
    {
        return $this->rewriter->rewrite($result);
    }
}
