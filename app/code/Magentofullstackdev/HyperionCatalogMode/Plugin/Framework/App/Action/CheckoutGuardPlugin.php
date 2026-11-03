<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalogMode\Plugin\Framework\App\Action;

use Magento\Customer\Model\Session as CustomerSession;
use Magento\Customer\Model\Url as CustomerUrl;
use Magento\Framework\App\ActionInterface;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\Message\ManagerInterface as MessageManager;
use Magento\Framework\UrlInterface;
use Magentofullstackdev\HyperionCore\Model\Purchase\Availability;
use Psr\Log\LoggerInterface;

/**
 * Keeps restricted visitors out of the cart and checkout routes.
 *
 * Hidden buttons are not a guard: a bookmarked cart URL, a reorder link
 * or a hand-made POST to checkout/cart/add would still work. This plugin
 * answers those requests with a redirect to the login page (guests) or
 * the account dashboard (customers of a group that may not buy) and an
 * error message. HTMX requests get the redirect as an HX-Redirect header
 * so the browser navigates instead of swapping the login page into a toast.
 *
 * Both answers are Raw results: the Hyperion fragment controllers declare
 * `execute(): Raw`, and an around plugin must honour the narrowest return
 * type of the actions it wraps (a Redirect result would be a TypeError).
 */
class CheckoutGuardPlugin
{
    private const HTMX_HEADER = 'HX-Request';

    /**
     * @param Availability $availability
     * @param HttpRequest $request
     * @param CustomerSession $customerSession
     * @param CustomerUrl $customerUrl
     * @param UrlInterface $urlBuilder
     * @param MessageManager $messageManager
     * @param RawFactory $rawFactory
     * @param LoggerInterface $logger
     * @param string[] $guardedRoutes full action name prefixes (route, route_controller or route_controller_action)
     */
    public function __construct(
        private readonly Availability $availability,
        private readonly HttpRequest $request,
        private readonly CustomerSession $customerSession,
        private readonly CustomerUrl $customerUrl,
        private readonly UrlInterface $urlBuilder,
        private readonly MessageManager $messageManager,
        private readonly RawFactory $rawFactory,
        private readonly LoggerInterface $logger,
        private readonly array $guardedRoutes = []
    ) {
    }

    /**
     * @param ActionInterface $subject
     * @param callable $proceed
     * @return mixed
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function aroundExecute(ActionInterface $subject, callable $proceed): mixed
    {
        // Only the policy is fail-open. The action itself runs outside the
        // try block: an exception thrown by the controller or by a later
        // plugin must propagate as it is, never trigger a second execution.
        $blocked = $this->blockedResponse();
        if ($blocked !== null) {
            return $blocked;
        }

        return $proceed();
    }

    /**
     * The redirect answer for a restricted visitor on a guarded route, null
     * when the request may proceed (not guarded, allowed, or the check failed).
     *
     * @return Raw|null
     */
    private function blockedResponse(): ?Raw
    {
        try {
            if (!$this->isGuardedRoute() || $this->availability->canPurchase()) {
                return null;
            }

            $this->messageManager->addErrorMessage($this->availability->getMessage());
            $target = $this->customerSession->isLoggedIn()
                ? $this->urlBuilder->getUrl('customer/account')
                : $this->customerUrl->getLoginUrl();

            /** @var Raw $result */
            $result = $this->rawFactory->create()->setContents('');
            if ($this->request->getHeader(self::HTMX_HEADER)) {
                return $result->setHttpResponseCode(403)->setHeader('HX-Redirect', $target, true);
            }

            return $result->setHttpResponseCode(302)->setHeader('Location', $target, true);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion catalog mode guard skipped: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * @return bool
     */
    private function isGuardedRoute(): bool
    {
        $fullAction = (string) $this->request->getFullActionName();
        if ($fullAction === '') {
            return false;
        }
        foreach ($this->guardedRoutes as $prefix) {
            $prefix = (string) $prefix;
            if ($prefix !== '' && ($fullAction === $prefix || str_starts_with($fullAction, $prefix . '_'))) {
                return true;
            }
        }

        return false;
    }
}
