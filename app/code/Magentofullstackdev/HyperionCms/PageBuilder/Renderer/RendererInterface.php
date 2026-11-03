<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCms\PageBuilder\Renderer;

interface RendererInterface
{
    /**
     * @return string
     */
    public function getContentType(): string;

    /**
     * @param \DOMElement $element
     * @return string
     */
    public function render(\DOMElement $element): string;
}
