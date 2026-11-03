<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Plugin\Catalog\Controller\Product\Compare;

use Magentofullstackdev\HyperionCore\Model\CacheHeaders;
use Magentofullstackdev\HyperionCore\Model\Htmx\FragmentRenderer;
use Magentofullstackdev\HyperionCore\Model\Htmx\MessageCollector;
use Magentofullstackdev\HyperionCore\Model\Htmx\NotificationRenderer;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Controller\Result\RawFactory;

/**
 * Shared body of the compare Add / Remove HTMX plugins.
 *
 * Response for an `HX-Request`:
 *   1. the `#hyperion-notification` toast (in-target swap). The core
 *      controllers queue complex messages ("You added product X to the
 *      comparison list.") whose text is empty until interpreted, which is
 *      why the toast never showed before MessageCollector existed.
 *   2. the header compare counter rendered from the `hyperion_catalog_
 *      compare` fragment handle, marked `hx-swap-oob`. It carries
 *      `data-hyperion-compare-ids`, the state the `<hyperion-list-toggle
 *      kind="compare">` buttons on the page react to.
 *
 * The previous per-tile button OOB swap was dropped: it targeted a
 * `[data-compare-form]` element no template renders (HTMX logged
 * `htmx:oobErrorNoTarget` on every click) and the toggle component now
 * owns the button state.
 */
abstract class AbstractHtmxPlugin
{
    private const HTMX_HEADER = 'HX-Request';
    private const FRAGMENT_HANDLE = 'hyperion_catalog_compare';
    private const FRAGMENT_BLOCK = 'hyperion.catalog.compare.fragment';

    public function __construct(
        private readonly HttpRequest $request,
        private readonly RawFactory $resultRawFactory,
        private readonly CacheHeaders $cacheHeaders,
        private readonly MessageCollector $messageCollector,
        private readonly NotificationRenderer $notificationRenderer,
        private readonly FragmentRenderer $fragmentRenderer
    ) {
    }

    /**
     * @param mixed $result
     * @return mixed
     */
    protected function transform($result)
    {
        if (!$this->request->getHeader(self::HTMX_HEADER)) {
            return $result;
        }

        $messages = $this->messageCollector->collect();
        $tone = $messages['has_error'] ? NotificationRenderer::TONE_ERROR : NotificationRenderer::TONE_SUCCESS;

        $response = $this->resultRawFactory->create();
        $response->setHeader('Content-Type', 'text/html; charset=UTF-8', true);
        $response->setContents(
            $this->notificationRenderer->render($messages['html'], $tone)
            . "\n"
            . $this->fragmentRenderer->render(self::FRAGMENT_HANDLE, self::FRAGMENT_BLOCK, ['oob' => true])
        );

        return $this->cacheHeaders->applyPrivate($response);
    }
}
