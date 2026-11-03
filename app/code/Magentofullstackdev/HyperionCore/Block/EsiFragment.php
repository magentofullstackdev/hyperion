<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Block;

use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\View\Element\Template;
use Magento\Framework\View\Element\Template\Context;
use Magento\PageCache\Model\Config as PageCacheConfig;

/**
 * Edge-composed fragment placeholder (template: esi/fragment.phtml).
 *
 * Three rendering modes, chosen at render time:
 *
 *   1. ESI: the page cache is enabled with Varnish as its application and
 *      the request carries `Surrogate-Capability: ...ESI/1.0` (set by the
 *      Hyperion VCL in vcl_recv), so the block emits
 *      `<esi:include src="<path>"/>` and Varnish assembles the fragment,
 *      cached on its own TTL, into the cached page.
 *   2. Inline: no ESI-capable edge, but a child block aliased `inline` was
 *      declared in layout XML; it is rendered in place, so the markup is
 *      complete without JavaScript (the page itself is still cacheable).
 *   3. HTMX: no ESI and no inline child: an `hx-get` placeholder fetches
 *      the fragment endpoint after parse.
 *
 * Layout arguments:
 *   fragment_route  Magento route path, e.g. `hyperion/navigation/menu`
 *                   (preferred: resolves store codes and base paths)
 *   fragment_url    literal URL or path, used when fragment_route is absent
 *   element_id      id of the wrapper span
 *   placeholder     HTML shown until HTMX swaps (mode 3 only)
 *   hx_trigger      HTMX trigger for mode 3 (default `load`)
 */
class EsiFragment extends Template
{
    public function __construct(
        Context $context,
        private readonly HttpRequest $httpRequest,
        private readonly PageCacheConfig $pageCacheConfig,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    /**
     * Path (not an absolute URL): Varnish resolves <esi:include> against the
     * origin of the parent request, and HTMX against the page origin.
     */
    public function getFragmentUrl(): string
    {
        $route = trim((string) $this->getData('fragment_route'));
        if ($route !== '') {
            $url = $this->getUrl($route);
            $path = (string) (parse_url($url, PHP_URL_PATH) ?? '');
            $query = (string) (parse_url($url, PHP_URL_QUERY) ?? '');
            return $path !== '' ? $path . ($query !== '' ? '?' . $query : '') : $url;
        }
        return (string) $this->getData('fragment_url');
    }

    public function getPlaceholder(): string
    {
        $value = (string) $this->getData('placeholder');
        return $value !== '' ? $value : '&nbsp;';
    }

    public function getElementId(): string
    {
        $value = (string) $this->getData('element_id');
        return $value !== '' ? $value : 'hyperion-fragment-' . spl_object_id($this);
    }

    public function getHxTrigger(): string
    {
        $value = (string) $this->getData('hx_trigger');
        return $value !== '' ? $value : 'load';
    }

    /**
     * The header alone proves nothing: without Varnish in front it comes
     * from the client, and an include nobody resolves would be stored in
     * the built-in page cache for every visitor.
     */
    public function supportsEsi(): bool
    {
        if (!$this->pageCacheConfig->isEnabled()
            || (int) $this->pageCacheConfig->getType() !== PageCacheConfig::VARNISH
        ) {
            return false;
        }
        $cap = $this->httpRequest->getHeader('Surrogate-Capability');
        return is_string($cap) && str_contains($cap, 'ESI/1.0');
    }

    public function hasInline(): bool
    {
        return $this->getChildBlock('inline') !== false;
    }

    public function getInlineHtml(): string
    {
        return $this->hasInline() ? (string) $this->getChildHtml('inline') : '';
    }
}
