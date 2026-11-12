<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Model;

use Magento\Catalog\Helper\Image as ImageHelper;
use Magento\Catalog\Model\Product;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Escaper;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Store\Model\ScopeInterface;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCore\ViewModel\Catalog\ProductSummary;
use Psr\Log\LoggerInterface;

/**
 * Open Graph and product meta tags of a product page.
 *
 * Core emits a smaller set from the `opengraph.general` block of
 * `head.additional`, which the theme removes by name. The tags are appended
 * to the rendered head content by
 * Plugin\Framework\View\Page\Config\RendererPlugin on product pages, so
 * they work on every Magento version the theme supports. One source per
 * page: when an SEO module emits the product tags itself, Hyperion emits
 * none (see isOwnedExternally()).
 */
class OpenGraph
{
    /**
     * The Mage-OS SEO module, by name only: it is optional and never a dependency.
     */
    private const SEO_MODULE = 'MageOS_Seo';

    /**
     * The module's "Enable OG Tags" option (store scope, on by default).
     */
    private const XML_PATH_SEO_MODULE_OPEN_GRAPH = 'mageos_seo_general/og_tags/enabled';

    /**
     * @param ImageHelper $imageHelper
     * @param ProductSummary $productSummary
     * @param StoreManagerInterface $storeManager
     * @param Escaper $escaper
     * @param LoggerInterface $logger
     * @param ModuleManager $moduleManager
     * @param ScopeConfigInterface $scopeConfig
     */
    public function __construct(
        private readonly ImageHelper $imageHelper,
        private readonly ProductSummary $productSummary,
        private readonly StoreManagerInterface $storeManager,
        private readonly Escaper $escaper,
        private readonly LoggerInterface $logger,
        private readonly ModuleManager $moduleManager,
        private readonly ScopeConfigInterface $scopeConfig
    ) {
    }

    /**
     * Whether another module emits the product Open Graph tags of the current store.
     *
     * True when MageOS_Seo is enabled and its Open Graph option is on: its head block then
     * prints the same properties (plus the locale and the X card), and a second set would hand
     * a crawler two values of each. With the option off the merchant switched off the module's
     * output, not Open Graph as such, so Hyperion's tags stay.
     *
     * @return bool
     */
    public function isOwnedExternally(): bool
    {
        return $this->moduleManager->isEnabled(self::SEO_MODULE)
            && $this->scopeConfig->isSetFlag(self::XML_PATH_SEO_MODULE_OPEN_GRAPH, ScopeInterface::SCOPE_STORE);
    }

    /**
     * `property => content` pairs, in output order.
     *
     * @param Product $product
     * @return array<string, string>
     */
    public function getTags(Product $product): array
    {
        $tags = [
            'og:type' => 'product',
            'og:title' => $this->text((string) $product->getName()),
            'og:url' => (string) $product->getProductUrl(),
        ];
        $description = $this->text((string) ($product->getData('short_description') ?: $product->getData('description')));
        if ($description !== '') {
            $tags['og:description'] = mb_substr($description, 0, 300);
        }
        $image = $this->getImageUrl($product);
        if ($image !== '') {
            $tags['og:image'] = $image;
        }
        try {
            $store = $this->storeManager->getStore();
            if ($store instanceof \Magento\Store\Model\Store) {
                $tags['og:site_name'] = (string) $store->getFrontendName();
            }
        } catch (\Throwable $e) {
            $this->logger->error('OpenGraph::getTags site name -- ' . $e->getMessage());
        }
        $price = $this->productSummary->getFinalPrice($product);
        if ($price > 0) {
            $tags['product:price:amount'] = number_format($price, 2, '.', '');
            $tags['product:price:currency'] = $this->productSummary->getCurrencyCode();
        }
        $tags['product:availability'] = $product->isAvailable() ? 'instock' : 'oos';

        return array_filter($tags, static fn (string $value): bool => $value !== '');
    }

    /**
     * The `<meta property="..." content="...">` lines. Text goes through
     * escapeHtml (entities for `& < > " '`, spaces and colons untouched, which
     * is what the scrapers expect), URLs through escapeUrl.
     *
     * @param Product $product
     * @return string
     */
    public function render(Product $product): string
    {
        $html = '';
        foreach ($this->getTags($product) as $property => $content) {
            $value = in_array($property, ['og:url', 'og:image'], true)
                ? $this->escaper->escapeUrl($content)
                : $this->escaper->escapeHtml($content);
            $html .= '<meta property="' . $this->escaper->escapeHtml($property) . '" content="' . $value . '"/>' . "\n";
        }

        return $html;
    }

    /**
     * @param string $value
     * @return string
     */
    private function text(string $value): string
    {
        return trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags($value), ENT_QUOTES | ENT_HTML5, 'UTF-8')) ?? '');
    }

    /**
     * @param Product $product
     * @return string
     */
    private function getImageUrl(Product $product): string
    {
        try {
            if (!$product->getImage() || $product->getImage() === 'no_selection') {
                return '';
            }

            return (string) $this->imageHelper->init($product, 'product_base_image')->getUrl();
        } catch (\Throwable $e) {
            $this->logger->error('OpenGraph::getImageUrl -- ' . $e->getMessage());

            return '';
        }
    }
}
