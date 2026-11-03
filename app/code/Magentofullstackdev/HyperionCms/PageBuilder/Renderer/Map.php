<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCms\PageBuilder\Renderer;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Store\Model\ScopeInterface;
use Psr\Log\LoggerInterface;

/**
 * PageBuilder "Map" content type.
 *
 * Core loads the Google Maps library on every page through RequireJS and
 * hands the API key and the map style to its widget via the widget
 * initializer. Hyperion has neither: the map element itself carries what the
 * storefront script (lib/pagebuilder.js) needs, so the library is requested
 * only on pages that contain a map, and only once the map scrolls into view.
 */
class Map extends AbstractRenderer implements RendererInterface
{
    private const XML_PATH_API_KEY = 'cms/pagebuilder/google_maps_api_key';
    private const XML_PATH_STYLE = 'cms/pagebuilder/google_maps_style';

    /**
     * @param LoggerInterface $logger
     * @param ScopeConfigInterface $scopeConfig
     */
    public function __construct(
        LoggerInterface $logger,
        private readonly ScopeConfigInterface $scopeConfig
    ) {
        parent::__construct($logger);
    }

    /**
     * @return string
     */
    public function getContentType(): string
    {
        return 'map';
    }

    /**
     * @param \DOMElement $element
     * @return string
     */
    public function render(\DOMElement $element): string
    {
        $apiKey = (string) $this->scopeConfig->getValue(self::XML_PATH_API_KEY, ScopeInterface::SCOPE_STORE);
        $style = (string) $this->scopeConfig->getValue(self::XML_PATH_STYLE, ScopeInterface::SCOPE_STORE);

        if ($apiKey !== '') {
            $element->setAttribute('data-hyperion-maps-key', $apiKey);
        }
        if ($style !== '') {
            $element->setAttribute('data-hyperion-maps-style', $style);
        }

        return (string) $element->ownerDocument->saveHTML($element);
    }
}
