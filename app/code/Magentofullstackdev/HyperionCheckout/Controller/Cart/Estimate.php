<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Controller\Cart;

use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\App\Action\HttpPostActionInterface;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\Controller\Result\RedirectFactory;
use Magento\Framework\Controller\ResultInterface;
use Magento\Framework\Data\Form\FormKey\Validator as FormKeyValidator;
use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\Message\ManagerInterface as MessageManagerInterface;
use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address;
use Magentofullstackdev\HyperionCore\Model\CacheHeaders;
use Magentofullstackdev\HyperionCore\Model\Htmx\FragmentRenderer;
use Magentofullstackdev\HyperionCore\Model\Htmx\MessageCollector;
use Magentofullstackdev\HyperionCore\Model\Htmx\NotificationRenderer;
use Psr\Log\LoggerInterface;

/**
 * Cart page "Estimate Shipping and Tax": POST hyperion/cart/estimate.
 *
 * Fields: country_id, region_id or region, postcode, and optionally
 * estimate_method (`carrier_method`, one of the rates collected for that
 * address). What core's EstimatePost + EstimateUpdatePost do in two
 * requests happens here in one: the address goes on the quote's shipping
 * address, the rates are collected, the chosen method (when it is one of
 * them) is applied, the totals are recollected and the quote saved, so the
 * summary card shows the shipping cost and the taxes of that destination.
 * A rate the carrier answered with an error is never a choice: posting its
 * code is refused, and a quote that still carries one loses it.
 *
 * HTMX requests get the cart fragment (`hyperion_checkout_cart_fragment`)
 * plus the toast out of band, like every other cart mutation; a plain POST
 * redirects back to the cart.
 */
class Estimate implements HttpPostActionInterface
{
    private const HTMX_HEADER = 'HX-Request';
    private const CART_HANDLE = 'hyperion_checkout_cart_fragment';
    private const CART_BLOCK = 'hyperion.cart.items';

    public function __construct(
        private readonly HttpRequest $request,
        private readonly FormKeyValidator $formKeyValidator,
        private readonly CheckoutSession $checkoutSession,
        private readonly CartRepositoryInterface $quoteRepository,
        private readonly MessageManagerInterface $messageManager,
        private readonly RedirectFactory $redirectFactory,
        private readonly RawFactory $rawFactory,
        private readonly CacheHeaders $cacheHeaders,
        private readonly MessageCollector $messageCollector,
        private readonly NotificationRenderer $notificationRenderer,
        private readonly FragmentRenderer $fragmentRenderer,
        private readonly LoggerInterface $logger
    ) {
    }

    public function execute(): ResultInterface
    {
        if (!$this->formKeyValidator->validate($this->request)) {
            $this->messageManager->addErrorMessage((string) __('Invalid Form Key. Please refresh the page.'));
            return $this->respond();
        }

        $country = $this->text('country_id', 3);
        $regionId = $this->text('region_id', 10);
        $region = $this->text('region', 255);
        $postcode = $this->text('postcode', 20);
        $method = $this->text('estimate_method', 100);

        try {
            $quote = $this->checkoutSession->getQuote();
            if (!$quote->getId() || $quote->isVirtual()) {
                return $this->respond();
            }
            if ($country === '') {
                $this->messageManager->addErrorMessage((string) __('Please select a country.'));
                return $this->respond();
            }

            $address = $quote->getShippingAddress();
            $address->setCountryId($country)
                ->setRegionId($regionId !== '' ? (int) $regionId : null)
                ->setRegion($region !== '' ? $region : null)
                ->setPostcode($postcode !== '' ? $postcode : null)
                ->setCollectShippingRates(true);
            $this->recollect($quote);

            $current = (string) $address->getShippingMethod();
            if ($current !== '' && !$this->isOffered($address->getGroupedAllShippingRates(), $current)) {
                $this->applyMethod($quote, $address, '');
                $this->recollect($quote);
            }

            if ($method !== '' && $method !== (string) $address->getShippingMethod()) {
                if (!$this->isOffered($address->getGroupedAllShippingRates(), $method)) {
                    $this->messageManager->addErrorMessage(
                        (string) __('The selected shipping method is not available for this address.')
                    );
                } else {
                    $this->applyMethod($quote, $address, $method);
                    $this->recollect($quote);
                }
            }

            $this->quoteRepository->save($quote);
        } catch (LocalizedException $e) {
            $this->logger->warning('Hyperion cart estimate: rejected -- ' . $e->getMessage());
            $this->messageManager->addErrorMessage($e->getMessage());
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion cart estimate: failed', ['exception' => $e]);
            $this->messageManager->addErrorMessage((string) __("We can't estimate the shipping right now. Please try again."));
        }

        return $this->respond();
    }

    /**
     * Set the shipping method on the address and on the quote's shipping
     * assignments: the repository save applies the assignment's method to
     * the address again, so an assignment left on the previous method
     * would bring that method back while the totals stay the new ones.
     */
    private function applyMethod(Quote $quote, Address $address, string $method): void
    {
        $address->setShippingMethod($method)->setCollectShippingRates(true);
        foreach ((array) $quote->getExtensionAttributes()?->getShippingAssignments() as $assignment) {
            $assignment->getShipping()->setMethod($method);
        }
    }

    /**
     * Collect the totals again even when this request already did: the
     * quote remembers a collection with `totals_collected_flag` and
     * `collectTotals()` returns early on the second call.
     */
    private function recollect(Quote $quote): void
    {
        $quote->setData('totals_collected_flag', false);
        $quote->collectTotals();
    }

    /**
     * Whether the method is one of the collected rates the shopper can
     * choose: an error rate (a message instead of a method) is not.
     *
     * @param array<string, array<int, \Magento\Quote\Model\Quote\Address\Rate>> $groupedRates
     */
    private function isOffered(array $groupedRates, string $method): bool
    {
        foreach ($groupedRates as $rates) {
            foreach ($rates as $rate) {
                if ((string) $rate->getCode() !== $method) {
                    continue;
                }
                return (string) $rate->getErrorMessage() === '' && (string) $rate->getMethod() !== '';
            }
        }
        return false;
    }

    private function text(string $param, int $maxLength): string
    {
        $value = $this->request->getParam($param);
        $value = is_string($value) ? trim($value) : '';
        return mb_substr($value, 0, $maxLength);
    }

    private function respond(): ResultInterface
    {
        if (!$this->request->getHeader(self::HTMX_HEADER)) {
            return $this->redirectFactory->create()->setPath('checkout/cart');
        }

        $messages = $this->messageCollector->collect();
        $tone = $messages['has_error'] ? NotificationRenderer::TONE_ERROR : NotificationRenderer::TONE_SUCCESS;

        $response = $this->rawFactory->create();
        $response->setHeader('Content-Type', 'text/html; charset=UTF-8', true);
        $response->setContents(
            $this->fragmentRenderer->render(self::CART_HANDLE, self::CART_BLOCK)
            . "\n"
            . $this->notificationRenderer->render($messages['html'], $tone, true)
        );

        return $this->cacheHeaders->applyPrivate($response);
    }
}
