<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCms\PageBuilder\Renderer;

class Accordion extends AbstractRenderer implements RendererInterface
{
    public function getContentType(): string
    {
        return 'accordion';
    }

    /**
     * @param \DOMElement $element
     * @return string
     */
    public function render(\DOMElement $element): string
    {
        try {
            $attrs = $this->renderAttributes($this->preserveAttributes($element));
            $allowMultiple = $element->getAttribute('data-allow-multiple-open') === 'true' ? ' allow-multiple' : '';

            $xpath = new \DOMXPath($element->ownerDocument);
            $items = $xpath->query('.//*[@data-content-type="accordion-item"]', $element);

            $inner = '';

            if ($items !== false) {
                /** @var \DOMElement $item */
                foreach ($items as $item) {
                    [$label, $content] = $this->resolveItemParts($item, $xpath);
                    $labelAttr = htmlspecialchars($label, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                    $inner .= '<hyperion-accordion-item label="' . $labelAttr . '">' . $content . '</hyperion-accordion-item>';
                }
            }

            return '<hyperion-accordion' . $attrs . $allowMultiple . '>' . $inner . '</hyperion-accordion>';
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion PageBuilder Accordion renderer failed: ' . $e->getMessage());
            return $element->ownerDocument->saveHTML($element);
        }
    }

    /**
     * Returns [label, contentHtml] for one accordion-item element.
     *
     * @param \DOMElement $item
     * @param \DOMXPath $xpath
     * @return array{0: string, 1: string}
     */
    private function resolveItemParts(\DOMElement $item, \DOMXPath $xpath): array
    {
        $titleNode = null;
        $label = '';

        $byRole = $xpath->query('.//*[@data-role="accordion-title"]', $item);

        if ($byRole !== false && $byRole->length > 0) {
            $titleNode = $byRole->item(0);
            $label = trim($titleNode->textContent);
        }

        if ($label === '') {
            $headings = $xpath->query('.//h1|.//h2|.//h3|.//h4|.//h5|.//h6', $item);

            if ($headings !== false && $headings->length > 0) {
                $titleNode = $headings->item(0);
                $label = trim($titleNode->textContent);
            }
        }

        if ($label === '') {
            $label = (string) __('Item');
        }

        $content = $this->buildContentWithoutTitle($item, $titleNode);

        return [$label, $content];
    }

    /**
     * @param \DOMElement $item
     * @param \DOMNode|null $titleNode
     * @return string
     */
    private function buildContentWithoutTitle(\DOMElement $item, ?\DOMNode $titleNode): string
    {
        if ($titleNode === null) {
            return $this->renderInnerHtml($item);
        }

        $html = '';

        foreach ($item->childNodes as $child) {
            if ($child->isSameNode($titleNode)) {
                continue;
            }

            $html .= $item->ownerDocument->saveHTML($child);
        }

        return $html;
    }
}
