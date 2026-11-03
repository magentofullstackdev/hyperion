<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Controller\Header;

use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\Escaper;
use Magentofullstackdev\HyperionCore\Model\Htmx\FragmentRenderer;
use Magentofullstackdev\HyperionCore\Model\Htmx\HeaderStatePool;

/**
 * `hyperion/header/state`: every session-bound header fragment in one
 * response, each as an HTMX out-of-band swap.
 *
 * Edge-cached pages carry empty placeholders; the header issues a single
 * `hx-get` with `hx-swap="none"` and HTMX distributes the fragments by id.
 * One PHP bootstrap and one session lock per page view instead of one per
 * fragment. Never cacheable.
 */
class State implements HttpGetActionInterface
{
    /**
     * @param RawFactory $rawFactory
     * @param HeaderStatePool $pool
     * @param FragmentRenderer $fragmentRenderer
     * @param Escaper $escaper
     */
    public function __construct(
        private readonly RawFactory $rawFactory,
        private readonly HeaderStatePool $pool,
        private readonly FragmentRenderer $fragmentRenderer,
        private readonly Escaper $escaper
    ) {
    }

    /**
     * Render the registered fragments as out-of-band swaps.
     *
     * @return Raw
     */
    public function execute(): Raw
    {
        $html = '';
        foreach ($this->pool->getFragments() as $fragment) {
            $fragmentHtml = $this->fragmentRenderer->render($fragment['handle'], $fragment['block'], ['oob' => true]);
            if ($fragment['target_id'] !== '') {
                $fragmentHtml = '<div id="' . $this->escaper->escapeHtmlAttr($fragment['target_id'])
                    . '" hx-swap-oob="innerHTML">' . $fragmentHtml . '</div>';
            }
            $html .= $fragmentHtml;
        }

        $response = $this->rawFactory->create();
        $response->setContents($html);
        $response->setHeader('Content-Type', 'text/html; charset=UTF-8', true);
        $response->setHeader('Cache-Control', 'private, no-store', true);
        $response->setHeader('Pragma', 'no-cache', true);
        $response->setHeader('X-Hyperion-Fragment', 'header-state', true);

        return $response;
    }
}
