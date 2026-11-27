<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Plugin\Customer;

use Magento\Customer\Model\Authorization\CustomerSessionUserContext;
use Magento\Customer\Model\Session as CustomerSession;
use Psr\Log\LoggerInterface;

/**
 * Keeps a customer the persistent cookie remembers, while the shopper is not
 * signed in, from being the user of a GraphQL request.
 *
 * With Persistent Shopping Cart on, core's persistent module writes the
 * remembered customer's id into the PHP session on every storefront request
 * (`Magento\Persistent\Observer\EmulateCustomerObserver`) and marks the
 * session as emulated: `Session::isLoggedIn()` answers false for it, while
 * `Session::getId()` answers the id. The GraphQL area resolves its user from
 * that session (`CustomerSessionUserContext` inside the composite user
 * context), and core's context builder
 * (`Magento\CustomerGraphQl\Model\Context\AddUserInfoToContext`) takes any id
 * with the customer type for a signed-in customer, without looking at the
 * emulation flag. Whoever uses the browser would then read the remembered
 * customer's account, addresses, orders and cart through `/graphql`. Core
 * refuses such a session for the web API (`Magento\Persistent\Model\Customer\Authorization`),
 * but that check is wired for the `webapi_rest` and `webapi_soap` areas only.
 *
 * Declared for the `graphql` area only (`etc/graphql/di.xml`). The session
 * context answers no id unless the session is signed in, so the composite
 * context moves on to the next context (the guest one) and the request is a
 * guest's. A client that sends a customer token (`Authorization` header) is
 * identified by the token context, which comes first and is not affected; a
 * customer signed in on the storefront keeps the session id. When the sign-in
 * state cannot be read, no id is answered (logged).
 */
class SessionUserContextPrivacy
{
    /**
     * @param CustomerSession $customerSession
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly CustomerSession $customerSession,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * The session customer id when the session is signed in, null otherwise.
     *
     * @param CustomerSessionUserContext $subject
     * @param int|string|null $result
     * @return int|string|null
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function afterGetUserId(CustomerSessionUserContext $subject, $result)
    {
        if ($result === null || (int) $result <= 0) {
            return null;
        }
        try {
            return $this->customerSession->isLoggedIn() ? $result : null;
        } catch (\Throwable $e) {
            $this->logger->error(
                'Hyperion checkout: the sign-in state of the session could not be read, '
                . 'the GraphQL request is answered as a guest',
                ['exception' => $e]
            );
            return null;
        }
    }
}
