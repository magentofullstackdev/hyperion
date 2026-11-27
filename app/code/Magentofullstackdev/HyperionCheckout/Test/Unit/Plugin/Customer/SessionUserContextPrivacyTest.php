<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Plugin\Customer;

use Magento\Authorization\Model\CompositeUserContext;
use Magento\Authorization\Model\UserContextInterface;
use Magento\Customer\Model\Authorization\CustomerSessionUserContext;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\ObjectManager\Helper\Composite as CompositeHelper;
use Magentofullstackdev\HyperionCheckout\Plugin\Customer\SessionUserContextPrivacy;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * A session answers its customer id to the GraphQL user context only while
 * it is signed in: the id a persistent cookie emulates is not a user.
 *
 * @covers \Magentofullstackdev\HyperionCheckout\Plugin\Customer\SessionUserContextPrivacy
 */
class SessionUserContextPrivacyTest extends TestCase
{
    private function plugin(CustomerSession $session, ?LoggerInterface $logger = null): SessionUserContextPrivacy
    {
        return new SessionUserContextPrivacy($session, $logger ?? $this->createStub(LoggerInterface::class));
    }

    private function subject(): CustomerSessionUserContext
    {
        return $this->createStub(CustomerSessionUserContext::class);
    }

    /**
     * A session whose customer id is `$customerId`: signed in, or emulated
     * (the id is there, `isLoggedIn()` answers false).
     */
    private function session(int $customerId, bool $signedIn): CustomerSession
    {
        $session = $this->createStub(CustomerSession::class);
        $session->method('getId')->willReturn($customerId > 0 ? (string) $customerId : null);
        $session->method('isLoggedIn')->willReturn($signedIn);

        return $session;
    }

    public function testASignedInSessionKeepsItsCustomerId(): void
    {
        self::assertSame('7', $this->plugin($this->session(7, true))->afterGetUserId($this->subject(), '7'));
    }

    public function testAnEmulatedSessionAnswersNoCustomerId(): void
    {
        self::assertNull($this->plugin($this->session(7, false))->afterGetUserId($this->subject(), '7'));
    }

    public function testASessionWithoutACustomerAnswersNoIdWithoutReadingTheSignInState(): void
    {
        $session = $this->createMock(CustomerSession::class);
        $session->expects(self::never())->method('isLoggedIn');

        self::assertNull($this->plugin($session)->afterGetUserId($this->subject(), null));
        self::assertNull($this->plugin($session)->afterGetUserId($this->subject(), '0'));
    }

    public function testASessionThatCannotTellItsSignInStateAnswersNoIdAndLogs(): void
    {
        $session = $this->createStub(CustomerSession::class);
        $session->method('isLoggedIn')->willThrowException(new \RuntimeException('customer registry'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())
            ->method('error')
            ->with(self::stringContains('answered as a guest'), self::arrayHasKey('exception'));

        self::assertNull($this->plugin($session, $logger)->afterGetUserId($this->subject(), '7'));
    }

    /**
     * Core's composite user context takes the first context that answers an
     * id: once the session context answers none, the guest context is the
     * user, and a token context placed before it still wins.
     */
    public function testTheCompositeContextFallsBackToTheGuestAndKeepsTheToken(): void
    {
        $emulated = $this->guardedSessionContext($this->session(7, false));
        $guest = $this->context(0, UserContextInterface::USER_TYPE_GUEST);
        $noToken = $this->context(null, UserContextInterface::USER_TYPE_INTEGRATION);

        $composite = $this->composite([$noToken, $emulated, $guest]);
        self::assertSame(UserContextInterface::USER_TYPE_GUEST, $composite->getUserType());
        self::assertSame(0, $composite->getUserId());

        $token = $this->context(9, UserContextInterface::USER_TYPE_CUSTOMER);
        $composite = $this->composite([$token, $emulated, $guest]);
        self::assertSame(UserContextInterface::USER_TYPE_CUSTOMER, $composite->getUserType());
        self::assertSame(9, $composite->getUserId());

        $signedIn = $this->guardedSessionContext($this->session(7, true));
        $composite = $this->composite([$noToken, $signedIn, $guest]);
        self::assertSame(UserContextInterface::USER_TYPE_CUSTOMER, $composite->getUserType());
        self::assertSame(7, $composite->getUserId());
    }

    /**
     * Core's session user context with the plugin applied the way the
     * generated interceptor applies it.
     */
    private function guardedSessionContext(CustomerSession $session): CustomerSessionUserContext
    {
        $plugin = $this->plugin($session);

        return new class ($session, $plugin) extends CustomerSessionUserContext {
            public function __construct(CustomerSession $session, private readonly SessionUserContextPrivacy $plugin)
            {
                parent::__construct($session);
            }

            public function getUserId()
            {
                return $this->plugin->afterGetUserId($this, parent::getUserId());
            }
        };
    }

    private function context(?int $userId, int $userType): UserContextInterface
    {
        $context = $this->createStub(UserContextInterface::class);
        $context->method('getUserId')->willReturn($userId);
        $context->method('getUserType')->willReturn($userType);

        return $context;
    }

    /**
     * @param UserContextInterface[] $contexts in their sort order
     */
    private function composite(array $contexts): CompositeUserContext
    {
        $declared = [];
        foreach ($contexts as $index => $context) {
            $declared[] = ['type' => $context, 'sortOrder' => (string) (($index + 1) * 10)];
        }

        // Core documents the argument as a list of contexts; DI hands it the declared components.
        // @phpstan-ignore argument.type
        return new CompositeUserContext(new CompositeHelper(), $declared);
    }
}
