<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Plugin\Checkout\Controller\Cart;

use Magentofullstackdev\HyperionCore\Model\CacheHeaders;
use Magentofullstackdev\HyperionCore\Model\Htmx\MessageCollector;
use Magento\Checkout\Controller\Cart\Add;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\View\Element\BlockFactory;
use Magento\Framework\View\Element\Template;
use Magentofullstackdev\HyperionCore\ViewModel\GoogleGtag;
use Psr\Log\LoggerInterface;

/**
 * HTMX response shaper for POST /checkout/cart/add.
 *
 * Intercepts the native cart-add controller on HX-Request POSTs and
 * returns the Hyperion notification fragment (and the OOB mini-cart
 * count) using the `Magentofullstackdev_HyperionCatalog::product/addtocart-response.phtml`
 * template -- rendered directly through a standalone Template block so
 * the response never depends on the full page layout tree. Loading the
 * "default" handle in a fragment response was causing a duplicate
 * `subscribe` child on `hyperion.footer` (the default handle declares it
 * and `<update handle="default"/>` re-registers it inside a different
 * layout context), which blew up the render and left HTMX following the
 * native 302 redirect -- reproducing the full PDP inside the notification
 * target.
 *
 * Only HTMX requests (HX-Request header present) are intercepted; standard
 * form POSTs fall through to Magento's native redirect behavior.
 *
 * Messages go through Magentofullstackdev\HyperionCore\Model\Htmx\MessageCollector:
 * it interprets the complex `addCartSuccessMessage` the same way the core
 * messages block does, and it treats NOTICE messages ("You need to choose
 * options for your item.", which Magento queues via `setUseNotice(true)`)
 * as failures, so a missing swatch selection yields a red toast and a 422
 * instead of a green "success".
 */
class AddPlugin
{
    private const HTMX_HEADER = 'HX-Request';
    private const RESPONSE_TEMPLATE = 'Magentofullstackdev_HyperionCatalog::product/addtocart-response.phtml';

    public function __construct(
        private readonly HttpRequest $request,
        private readonly RawFactory $resultRawFactory,
        private readonly BlockFactory $blockFactory,
        private readonly MessageCollector $messageCollector,
        private readonly CheckoutSession $checkoutSession,
        private readonly CacheHeaders $cacheHeaders,
        private readonly LoggerInterface $logger,
        private readonly GoogleGtag $gtag
    ) {
    }

    /**
     * @param Add $subject
     * @param mixed $result
     * @return mixed
     */
    public function afterExecute(Add $subject, $result)
    {
        if (!$this->request->getHeader(self::HTMX_HEADER)) {
            return $result;
        }

        try {
            $messages = $this->messageCollector->collect();
            $isError = $messages['has_error'];

            $html = $this->renderHandle($messages['html'], $isError);

            $response = $this->resultRawFactory->create();
            $response->setHttpResponseCode($isError ? 422 : 200);
            $response->setHeader('Content-Type', 'text/html; charset=UTF-8', true);
            $response->setContents($html);

            return $this->cacheHeaders->applyPrivate($response);
        } catch (\Throwable $e) {
            $this->logger->error(
                'Hyperion AddPlugin: failed to render add-to-cart response -- ' . $e->getMessage()
            );

            $response = $this->resultRawFactory->create();
            $response->setHttpResponseCode(500);
            $response->setHeader('Content-Type', 'text/html; charset=UTF-8', true);
            $response->setContents('');
            return $this->cacheHeaders->applyPrivate($response);
        }
    }

    /**
     * Render the addtocart-response template directly, bypassing the
     * full page layout tree. We only need a single Template block with
     * a handful of data fields, so there's no reason to spin up the
     * whole layout (which also makes this resilient to unrelated layout
     * errors -- e.g. duplicate `subscribe` children on `hyperion.footer`
     * when the response handle inherits `default`).
     */
    private function renderHandle(string $messageHtml, bool $isError): string
    {
        /** @var Template $block */
        $block = $this->blockFactory->createBlock(Template::class);
        $block->setTemplate(self::RESPONSE_TEMPLATE);
        $block->setData('message_html', $messageHtml);
        $block->setData('is_error', $isError);
        $block->setData('item_count', $this->resolveItemCount());
        $block->setData('gtag_event_json', $isError ? '' : $this->resolveGtagEvent());

        return (string) $block->toHtml();
    }

    /**
     * The GA4 `add_to_cart` payload for the product this request added
     * (`lastAddedProductId` of the checkout session, the request `qty`),
     * empty when tracking is off or the quote item cannot be found.
     */
    private function resolveGtagEvent(): string
    {
        if (!$this->gtag->isEnabled()) {
            return '';
        }
        try {
            $productId = (int) $this->checkoutSession->getData('last_added_product_id');
            foreach ($this->checkoutSession->getQuote()->getAllVisibleItems() as $item) {
                if ((int) $item->getData('product_id') === $productId) {
                    $qty = (float) $this->request->getParam('qty');

                    return $this->gtag->toJson($this->gtag->addToCart($item, $qty > 0 ? $qty : 1.0));
                }
            }
        } catch (\Throwable $e) {
            $this->logger->warning('Hyperion AddPlugin: could not build the gtag event -- ' . $e->getMessage());
        }

        return '';
    }

    /**
     * Read the live cart item count from the checkout session. Failure is
     * swallowed -- the mini-cart's own hx-trigger="load" reconciles on the
     * next paint and the Hyperion error handler in entry.js is silent on
     * private-fragment 404s.
     */
    private function resolveItemCount(): int
    {
        try {
            return (int) $this->checkoutSession->getQuote()->getItemsQty();
        } catch (\Throwable $e) {
            $this->logger->warning(
                'Hyperion AddPlugin: could not resolve cart item count -- ' . $e->getMessage()
            );
            return 0;
        }
    }

}
