<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCms\Plugin\Cms;

use Magento\Cms\Model\Page;

/**
 * Coerce `cms_page.content` NULL values to an empty string.
 *
 * Why this plugin exists:
 *   Core rejects a NULL content:
 *   \Magento\Framework\Filter\Template::filter() throws on non-string
 *   values. The CMS Page block renders its body via
 *   `$filter->filter($page->getContent())` -- so when the admin leaves
 *   the "Content" field empty and delivers the page body through
 *   Content > Widgets instead (which is the intended setup for the
 *   Hyperion home page), getContent() returns NULL and Magento throws
 *   `InvalidArgumentException: Argument 'value' must be type of string,
 *   NULL given.`. Magento's Email\Template\Filter swallows the
 *   exception and substitutes its error text into the rendered page
 *   body, which is then visible to end users at the position of the
 *   CMS Page block (below the widget-delivered content).
 *
 * Fix:
 *   Intercept Page::getContent() and return '' when the underlying
 *   value is NULL. Widgets continue to render independently (they
 *   live in separate layout containers); the CMS block simply emits
 *   an empty string instead of the filter-error text.
 */
class PagePlugin
{
    /**
     * @param Page $subject
     * @param mixed $result
     * @return string
     */
    public function afterGetContent(Page $subject, $result): string
    {
        return $result === null ? '' : (string) $result;
    }
}
