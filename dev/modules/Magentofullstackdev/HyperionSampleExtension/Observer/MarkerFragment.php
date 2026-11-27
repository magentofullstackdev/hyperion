<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleExtension\Observer;

use Magento\Framework\DataObject;
use Magento\Framework\Escaper;

/**
 * Appends an out of band marker to the `transport` of a Hyperion event
 * (`additional_html`). htmx inserts the children of the wrapper at the end
 * of the body; the markup carries no script (htmx drops scripts).
 */
class MarkerFragment
{
    /**
     * @param Escaper $escaper
     */
    public function __construct(
        private readonly Escaper $escaper
    ) {
    }

    /**
     * Add the marker to the transport.
     *
     * @param mixed $transport the event's transport object
     * @param string $name the marker name
     * @param array<string, string> $attributes extra data-* attributes
     * @return void
     */
    public function append(mixed $transport, string $name, array $attributes = []): void
    {
        if (!$transport instanceof DataObject) {
            return;
        }
        $extra = '';
        foreach ($attributes as $attribute => $value) {
            $extra .= sprintf(' data-%s="%s"', $this->escaper->escapeHtmlAttr($attribute), $this->escaper->escapeHtmlAttr($value));
        }
        $html = sprintf(
            '<div hx-swap-oob="beforeend:body"><span hidden class="hyperion-sample-marker" data-hyperion-sample-marker="%s"%s>%s</span></div>',
            $this->escaper->escapeHtmlAttr($name),
            $extra,
            $this->escaper->escapeHtml('Sample marker: ' . $name)
        );
        $transport->setData('additional_html', (string) $transport->getData('additional_html') . $html);
    }
}
