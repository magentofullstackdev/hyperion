<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCms\PageBuilder;

use Magentofullstackdev\HyperionCms\PageBuilder\Renderer\RendererInterface;
use Psr\Log\LoggerInterface;

class ContentTypePool
{
    /** @var array<string, RendererInterface> */
    private array $renderers = [];

    /**
     * @param LoggerInterface $logger
     * @param RendererInterface[] $renderers
     */
    public function __construct(
        private readonly LoggerInterface $logger,
        array $renderers = []
    ) {
        foreach ($renderers as $renderer) {
            $this->register($renderer);
        }
    }

    /**
     * @param RendererInterface $renderer
     * @return void
     */
    public function register(RendererInterface $renderer): void
    {
        $this->renderers[$renderer->getContentType()] = $renderer;
    }

    /**
     * @param string $contentType
     * @return bool
     */
    public function has(string $contentType): bool
    {
        return isset($this->renderers[$contentType]);
    }

    /**
     * @param string $contentType
     * @param \DOMElement $element
     * @return string
     */
    public function render(string $contentType, \DOMElement $element): string
    {
        if (!isset($this->renderers[$contentType])) {
            return $element->ownerDocument->saveHTML($element);
        }

        try {
            return $this->renderers[$contentType]->render($element);
        } catch (\Throwable $e) {
            $this->logger->error(
                'Hyperion PageBuilder: renderer ' . $contentType . ' failed -- ' . $e->getMessage()
            );
            return $element->ownerDocument->saveHTML($element);
        }
    }
}
