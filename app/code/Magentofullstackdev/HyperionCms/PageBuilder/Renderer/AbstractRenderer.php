<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCms\PageBuilder\Renderer;

use Psr\Log\LoggerInterface;

abstract class AbstractRenderer
{
    /**
     * @param LoggerInterface $logger
     */
    public function __construct(
        protected readonly LoggerInterface $logger
    ) {
    }

    /**
     * Every `data-*` attribute stays, `data-content-type` and
     * `data-appearance` included: the generated PageBuilder styles, the
     * structural CSS and the components all select on them.
     *
     * @param \DOMElement $src
     * @return array<string, string>
     */
    protected function preserveAttributes(\DOMElement $src): array
    {
        $attrs = [];

        foreach (['style', 'class', 'id'] as $name) {
            if ($src->hasAttribute($name)) {
                $attrs[$name] = $src->getAttribute($name);
            }
        }

        /** @var \DOMAttr $attr */
        foreach ($src->attributes as $attr) {
            if (str_starts_with($attr->name, 'data-')) {
                $attrs[$attr->name] = $attr->value;
            }
        }

        return $attrs;
    }

    /**
     * @param array<string, string> $attrs
     * @return string
     */
    protected function renderAttributes(array $attrs): string
    {
        $parts = [];

        foreach ($attrs as $name => $value) {
            $parts[] = ' ' . $name . '="' . htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '"';
        }

        return implode('', $parts);
    }

    /**
     * @param \DOMElement $el
     * @return string
     */
    protected function renderInnerHtml(\DOMElement $el): string
    {
        $html = '';

        foreach ($el->childNodes as $child) {
            $html .= $el->ownerDocument->saveHTML($child);
        }

        return $html;
    }
}
