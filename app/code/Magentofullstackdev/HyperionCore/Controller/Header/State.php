<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Controller\Header;

use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\Escaper;
use Magento\Framework\Event\ManagerInterface as EventManagerInterface;
use Magentofullstackdev\HyperionCore\Model\Htmx\EventTransport;
use Magentofullstackdev\HyperionCore\Model\Htmx\FragmentRendererInterface;
use Magentofullstackdev\HyperionCore\Model\Htmx\HeaderStatePool;
use Psr\Log\LoggerInterface;

/**
 * `hyperion/header/state`: every session-bound header fragment in one
 * response, each as an HTMX out-of-band swap.
 *
 * Edge-cached pages carry empty placeholders; the header issues a single
 * `hx-get` with `hx-swap="none"` and HTMX distributes the fragments by id.
 * One PHP bootstrap and one session lock per page view instead of one per
 * fragment. Never cacheable.
 *
 * After the registered fragments it dispatches
 * `hyperion_header_state_render_after` with `fragments` (the pool's list,
 * read only) and `transport` (DataObject, `additional_html` empty by
 * default): what an observer puts in `additional_html` is appended to the
 * body, so a module adds an out of band fragment without a plugin. Observers
 * may read the session (the answer is private); one that throws is logged
 * and its markup dropped.
 *
 * @internal The route and the event are the public contract, not the class.
 */
class State implements HttpGetActionInterface
{
    public const EVENT_RENDER_AFTER = 'hyperion_header_state_render_after';

    /**
     * @param RawFactory $rawFactory
     * @param HeaderStatePool $pool
     * @param FragmentRendererInterface $fragmentRenderer
     * @param Escaper $escaper
     * @param EventManagerInterface $eventManager
     * @param EventTransport $eventTransport
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly RawFactory $rawFactory,
        private readonly HeaderStatePool $pool,
        private readonly FragmentRendererInterface $fragmentRenderer,
        private readonly Escaper $escaper,
        private readonly EventManagerInterface $eventManager,
        private readonly EventTransport $eventTransport,
        private readonly LoggerInterface $logger
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
        $fragments = $this->pool->getFragments();
        foreach ($fragments as $fragment) {
            $fragmentHtml = $this->fragmentRenderer->render($fragment['handle'], $fragment['block'], ['oob' => true]);
            if ($fragment['target_id'] !== '') {
                $fragmentHtml = '<div id="' . $this->escaper->escapeHtmlAttr($fragment['target_id'])
                    . '" hx-swap-oob="innerHTML">' . $fragmentHtml . '</div>';
            }
            $html .= $fragmentHtml;
        }
        $html .= $this->observerHtml($fragments);

        $response = $this->rawFactory->create();
        $response->setContents($html);
        $response->setHeader('Content-Type', 'text/html; charset=UTF-8', true);
        $response->setHeader('Cache-Control', 'private, no-store', true);
        $response->setHeader('Pragma', 'no-cache', true);
        $response->setHeader('X-Hyperion-Fragment', 'header-state', true);

        return $response;
    }

    /**
     * What the observers of the render-after event add to the body.
     *
     * @param array<int, array{handle: string, block: string, target_id: string}> $fragments
     * @return string
     */
    private function observerHtml(array $fragments): string
    {
        $transport = $this->eventTransport->create();
        try {
            $this->eventManager->dispatch(self::EVENT_RENDER_AFTER, [
                'fragments' => $fragments,
                'transport' => $transport,
            ]);
        } catch (\Throwable $e) {
            $this->logger->error(sprintf(
                'Hyperion header state: an observer of %s failed, its markup is dropped: %s',
                self::EVENT_RENDER_AFTER,
                $e->getMessage()
            ), ['exception' => $e]);

            return '';
        }

        return $this->eventTransport->additionalHtml($transport, self::EVENT_RENDER_AFTER);
    }
}
