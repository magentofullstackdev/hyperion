<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCms\PageBuilder\Filter;

use Magentofullstackdev\HyperionCms\PageBuilder\ContentTypePool;
use Magento\Framework\App\Area;
use Magento\Framework\App\State as AppState;
use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\Filter\Template as FrameworkTemplateFilter;
use Magento\Framework\View\DesignInterface;
use Psr\Log\LoggerInterface;

/**
 * Rewrites PageBuilder content types to Hyperion elements after the template
 * filter ran. It only acts on storefront requests rendered by one of the
 * enabled themes (the Hyperion theme and its children by default): any other
 * theme, the admin, emails rendered outside the storefront and the web API
 * keep PageBuilder's own markup.
 */
class TemplateFilterPlugin
{
    /**
     * Content types whose children must not be processed independently.
     */
    private const CONTAINER_TYPES = ['slider', 'accordion'];

    /**
     * @param ContentTypePool $pool
     * @param LoggerInterface $logger
     * @param DesignInterface $design
     * @param AppState $appState
     * @param string[] $enabledThemes theme paths (Vendor/theme) whose rendering may be rewritten
     */
    public function __construct(
        private readonly ContentTypePool $pool,
        private readonly LoggerInterface $logger,
        private readonly DesignInterface $design,
        private readonly AppState $appState,
        private readonly array $enabledThemes = ['Magentofullstackdev/hyperion']
    ) {
    }

    /**
     * @param FrameworkTemplateFilter $subject
     * @param string $result
     * @return string
     */
    public function afterFilter(FrameworkTemplateFilter $subject, $result): string
    {
        $result = (string) $result;

        if ($result === '' || !str_contains($result, 'data-content-type=')) {
            return $result;
        }

        try {
            if (!$this->isEnabledForCurrentDesign()) {
                return $result;
            }
            return $this->processHtml($result);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion PageBuilder TemplateFilterPlugin failed: ' . $e->getMessage());
            return $result;
        }
    }

    /**
     * True on a frontend request whose active theme, or one of its parents,
     * is in the enabled list.
     *
     * @return bool
     */
    private function isEnabledForCurrentDesign(): bool
    {
        try {
            if ($this->appState->getAreaCode() !== Area::AREA_FRONTEND) {
                return false;
            }
        } catch (LocalizedException $e) {
            return false;
        }

        $theme = $this->design->getDesignTheme();
        foreach ($theme->getInheritedThemes() as $inherited) {
            if (in_array((string) $inherited->getThemePath(), $this->enabledThemes, true)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param string $html
     * @return string
     */
    private function processHtml(string $html): string
    {
        $doc = new \DOMDocument('1.0', 'UTF-8');

        // DOMDocument::loadHTML assumes ISO-8859-1 unless told otherwise.
        // The historical workaround was mb_convert_encoding($html,
        // 'HTML-ENTITIES', 'UTF-8'), but PHP 8.2+ has deprecated that form.
        // Prefixing the document with an XML encoding declaration is the
        // recommended replacement and produces the same parse result
        // without touching the payload itself. LIBXML_HTML_NOIMPLIED keeps
        // the parser from wrapping the output in <html><body> which would
        // break the round-trip for CMS content fragments.
        $loaded = $this->withLibxmlErrorsCollected(
            static fn (): bool => $doc->loadHTML(
                '<?xml encoding="UTF-8">' . $html,
                LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NOERROR | LIBXML_NOWARNING
            )
        );

        if (!$loaded) {
            return $html;
        }

        $xpath = new \DOMXPath($doc);
        $elements = $xpath->query('//*[@data-content-type]');

        if ($elements === false || $elements->length === 0) {
            return $html;
        }

        $toReplace = [];

        /** @var \DOMElement $element */
        foreach ($elements as $element) {
            $poolKey = $element->getAttribute('data-content-type');

            if ($poolKey === '' || !$this->pool->has($poolKey)) {
                continue;
            }

            if ($this->isNestedInsideContainer($element)) {
                continue;
            }

            $toReplace[] = [$element, $poolKey];
        }

        if ($toReplace === []) {
            return $html;
        }

        foreach ($toReplace as [$element, $poolKey]) {
            $rendered = $this->pool->render($poolKey, $element);
            $this->replaceNode($doc, $element, $rendered);
        }

        $output = $doc->saveHTML();
        if ($output === false) {
            return $html;
        }
        // Strip the XML encoding declaration we prepended above -- it has
        // done its job of telling libxml the payload is UTF-8 and must
        // not leak back into the rendered CMS content.
        return preg_replace('/^<\?xml[^>]+>\s*/', '', $output) ?? $output;
    }

    /**
     * Returns true when the element is a child/descendant of a container we
     * already handle at top level -- prevents double-processing nested items
     * such as a slide inside a slider.
     *
     * @param \DOMElement $element
     * @return bool
     */
    private function isNestedInsideContainer(\DOMElement $element): bool
    {
        $parent = $element->parentNode;

        while ($parent !== null && $parent instanceof \DOMElement) {
            if ($parent->hasAttribute('data-content-type')) {
                if (in_array($parent->getAttribute('data-content-type'), self::CONTAINER_TYPES, true)) {
                    return true;
                }
            }

            $parent = $parent->parentNode;
        }

        return false;
    }

    /**
     * Replace a DOM node with rendered HTML.
     *
     * The HTML goes through the HTML parser, not appendXML(): slide content is
     * free-form markup (void elements such as <img> or <br>, named entities)
     * that is not well-formed XML.
     *
     * @param \DOMDocument $doc
     * @param \DOMElement $node
     * @param string $html
     * @return void
     */
    private function replaceNode(\DOMDocument $doc, \DOMElement $node, string $html): void
    {
        $parent = $node->parentNode;

        if ($parent === null) {
            return;
        }

        $rendered = new \DOMDocument('1.0', 'UTF-8');
        $loaded = $this->withLibxmlErrorsCollected(
            static fn (): bool => $rendered->loadHTML(
                '<?xml encoding="UTF-8"><div>' . $html . '</div>',
                LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NOERROR | LIBXML_NOWARNING
            )
        );
        $wrapper = $loaded ? $rendered->getElementsByTagName('div')->item(0) : null;

        if ($wrapper === null) {
            return;
        }

        $fragment = $doc->createDocumentFragment();
        foreach (iterator_to_array($wrapper->childNodes) as $child) {
            $fragment->appendChild($doc->importNode($child, true));
        }

        if (!$fragment->hasChildNodes()) {
            return;
        }

        $parent->replaceChild($fragment, $node);
    }

    /**
     * Run a libxml-backed DOM operation with parser diagnostics routed to
     * libxml's internal error buffer instead of PHP warnings, so malformed
     * CMS markup degrades to the unprocessed HTML instead of raising.
     *
     * @param callable(): bool $operation
     * @return bool
     */
    private function withLibxmlErrorsCollected(callable $operation): bool
    {
        $previous = libxml_use_internal_errors(true);
        try {
            return $operation();
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
    }
}
