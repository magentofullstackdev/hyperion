<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Controller\Index;

use Magento\Checkout\Helper\Data as CheckoutHelper;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\App\Action\Context;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Controller\Result\Redirect;
use Magento\Framework\Controller\Result\RedirectFactory;
use Magento\Framework\Message\ManagerInterface as MessageManagerInterface;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Result\PageFactory;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Item;
use Magentofullstackdev\HyperionCheckout\Controller\Index\Index;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * A guest who may not check out is sent to the login page with a notice that
 * names the reason: the downloadable products of the cart when the store
 * allows guests, the store setting otherwise.
 *
 * @covers \Magentofullstackdev\HyperionCheckout\Controller\Index\Index
 */
class IndexTest extends TestCase
{
    private const SIGN_IN = 'Please sign in or create an account to continue.';

    /**
     * @return array<string, array{bool, list<string>, string}>
     */
    public static function refusalProvider(): array
    {
        return [
            'downloadable item, guests allowed' => [
                true,
                ['simple', 'downloadable'],
                'Your cart contains downloadable products, which require a customer account.',
            ],
            'guests not allowed, downloadable item' => [
                false,
                ['downloadable'],
                'Guest checkout is disabled.',
            ],
            'guests not allowed, no downloadable item' => [
                false,
                ['simple'],
                'Guest checkout is disabled.',
            ],
        ];
    }

    /**
     * @param list<string> $types
     */
    #[DataProvider('refusalProvider')]
    public function testGuestRefusalNamesTheReason(bool $guestsAllowed, array $types, string $reason): void
    {
        $items = [];
        foreach ($types as $type) {
            $item = $this->createStub(Item::class);
            $item->method('getProductType')->willReturn($type);
            $items[] = $item;
        }
        $quote = $this->createStub(Quote::class);
        $quote->method('hasItems')->willReturn(true);
        $quote->method('validateMinimumAmount')->willReturn(true);
        $quote->method('getStoreId')->willReturn(2);
        $quote->method('getAllItems')->willReturn($items);

        $messageManager = $this->createMock(MessageManagerInterface::class);
        $messageManager->expects(self::once())
            ->method('addNoticeMessage')
            ->with($reason . ' ' . self::SIGN_IN);

        $redirect = $this->createMock(Redirect::class);
        $redirect->expects(self::once())->method('setPath')->with('customer/account/login')->willReturnSelf();

        $result = $this->buildController($quote, $guestsAllowed, $messageManager, $redirect)->execute();

        self::assertSame($redirect, $result);
    }

    private function buildController(
        Quote $quote,
        bool $guestsAllowed,
        MessageManagerInterface $messageManager,
        Redirect $redirect
    ): Index {
        $redirectFactory = $this->createStub(RedirectFactory::class);
        $redirectFactory->method('create')->willReturn($redirect);

        $context = $this->createStub(Context::class);
        $context->method('getMessageManager')->willReturn($messageManager);
        $context->method('getResultRedirectFactory')->willReturn($redirectFactory);
        $context->method('getUrl')->willReturn($this->createStub(UrlInterface::class));

        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('isSetFlag')->willReturnMap([
            [CheckoutHelper::XML_PATH_GUEST_CHECKOUT, 'store', 2, $guestsAllowed],
        ]);

        $checkoutSession = $this->createStub(CheckoutSession::class);
        $checkoutSession->method('getQuote')->willReturn($quote);

        $customerSession = $this->createStub(CustomerSession::class);
        $customerSession->method('isLoggedIn')->willReturn(false);

        $checkoutHelper = $this->createStub(CheckoutHelper::class);
        $checkoutHelper->method('canOnepageCheckout')->willReturn(true);
        $checkoutHelper->method('isAllowedGuestCheckout')->willReturn(false);

        return new Index(
            $context,
            $this->createStub(PageFactory::class),
            $scopeConfig,
            $checkoutSession,
            $customerSession,
            $checkoutHelper
        );
    }
}
