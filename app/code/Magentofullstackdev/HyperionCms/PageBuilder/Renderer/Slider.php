<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCms\PageBuilder\Renderer;

class Slider extends AbstractRenderer implements RendererInterface
{
    public function getContentType(): string
    {
        return 'slider';
    }

    /**
     * @param \DOMElement $element
     * @return string
     */
    public function render(\DOMElement $element): string
    {
        try {
            $attrs = $this->renderAttributes($this->preserveAttributes($element) + [
                'prev-label' => (string) __('Previous'),
                'next-label' => (string) __('Next'),
                'dot-label' => (string) __('Go to slide'),
            ]);
            $xpath = new \DOMXPath($element->ownerDocument);
            $slides = $xpath->query('.//*[@data-content-type="slide"]', $element);

            $inner = '';

            if ($slides !== false) {
                /** @var \DOMElement $slide */
                foreach ($slides as $slide) {
                    $slideAttrs = $this->renderAttributes($this->preserveAttributes($slide));
                    $slideInner = $this->renderInnerHtml($slide);
                    $inner .= '<hyperion-slide' . $slideAttrs . '>' . $slideInner . '</hyperion-slide>';
                }
            }

            return '<hyperion-slider' . $attrs . '>' . $inner . '</hyperion-slider>';
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion PageBuilder Slider renderer failed: ' . $e->getMessage());
            return $element->ownerDocument->saveHTML($element);
        }
    }
}
