<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Controller\Index;

use Magento\Checkout\Helper\Data as CheckoutHelper;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Checkout\Model\Type\Onepage;
use Magento\Customer\Api\AccountManagementInterface;
use Magento\Customer\Api\CustomerRepositoryInterface;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\App\Action\Context;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\Controller\Result\Redirect;
use Magento\Framework\Controller\Result\RedirectFactory;
use Magento\Framework\Data\Form\FormKey\Validator as FormKeyValidator;
use Magento\Framework\Message\ManagerInterface as MessageManagerInterface;
use Magento\Framework\ObjectManagerInterface;
use Magento\Framework\Registry;
use Magento\Framework\Translate\InlineInterface;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\LayoutFactory;
use Magento\Framework\View\Page\Config as PageConfig;
use Magento\Framework\View\Page\Title;
use Magento\Framework\View\Result\LayoutFactory as ResultLayoutFactory;
use Magento\Framework\View\Result\Page;
use Magento\Framework\View\Result\PageFactory;
use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Item;
use Magentofullstackdev\HyperionCheckout\Controller\Index\Index;
use Magentofullstackdev\HyperionCheckout\Model\Cart\CheckoutBlocker;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;

/**
 * The checkout entry point is core's controller with three additions: a
 * guest who may not check out goes to the login page with a notice that
 * names the reason, a quote core bounces to the cart gets its reason as a
 * notice, and the page core builds is returned as it is (the Lit checkout
 * handle is added by an observer before the layout loads, never here).
 *
 * @covers \Magentofullstackdev\HyperionCheckout\Controller\Index\Index
 */
class IndexTest extends TestCase
{
    private const SIGN_IN = 'Please sign in or create an account to continue.';

    /** @var MessageManagerInterface&MockObject */
    private MessageManagerInterface $messageManager;
    /** @var Redirect&MockObject */
    private Redirect $redirect;
    /** @var Page&MockObject */
    private Page $page;
    /** @var Onepage&MockObject */
    private Onepage $onepage;
    /** @var CheckoutBlocker&Stub */
    private CheckoutBlocker $checkoutBlocker;

    protected function setUp(): void
    {
        $this->messageManager = $this->createMock(MessageManagerInterface::class);
        $this->redirect = $this->createMock(Redirect::class);
        $this->page = $this->createMock(Page::class);
        $this->onepage = $this->createMock(Onepage::class);
        $this->checkoutBlocker = $this->createStub(CheckoutBlocker::class);
    }

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
    public function testAGuestWhoMayNotCheckOutGoesToTheLoginPageWithTheReason(
        bool $guestsAllowed,
        array $types,
        string $reason
    ): void {
        $this->messageManager->expects(self::once())
            ->method('addNoticeMessage')
            ->with($reason . ' ' . self::SIGN_IN);
        $this->messageManager->expects(self::never())->method('addErrorMessage');
        $this->redirect->expects(self::once())->method('setPath')->with('customer/account/login')->willReturnSelf();
        $this->page->expects(self::never())->method('addHandle');
        $this->onepage->expects(self::never())->method('initCheckout');

        $result = $this->controller($this->quote($types), false, false, $guestsAllowed, true)->execute();

        self::assertSame($this->redirect, $result);
    }

    /**
     * @return array<string, array{bool}>
     */
    public static function flagProvider(): array
    {
        return ['flag on' => [true], 'flag off' => [false]];
    }

    #[DataProvider('flagProvider')]
    public function testCoresPageIsReturnedUntouched(bool $flag): void
    {
        $this->messageManager->expects(self::never())->method('addNoticeMessage');
        $this->redirect->expects(self::never())->method('setPath');
        $this->onepage->expects(self::once())->method('initCheckout')->willReturnSelf();
        $this->page->expects(self::never())->method('addHandle');

        $result = $this->controller($this->quote(['simple']), true, true, true, $flag)->execute();

        self::assertSame($this->page, $result);
    }

    public function testARedirectOfCoreIsReturnedUntouched(): void
    {
        $this->messageManager->expects(self::never())->method('addNoticeMessage');
        $this->redirect->expects(self::once())->method('setPath')->with('checkout/cart')->willReturnSelf();
        $this->page->expects(self::never())->method('addHandle');
        $this->onepage->expects(self::never())->method('initCheckout');

        $result = $this->controller($this->quote([]), false, false, false, true)->execute();

        self::assertSame($this->redirect, $result, 'an empty cart goes to the cart, guest or not, without a notice');
    }

    public function testAQuoteCoreBouncesToTheCartGetsItsReasonAsANotice(): void
    {
        $this->checkoutBlocker->method('forQuote')->willReturn([
            'reason' => CheckoutBlocker::REASON_MINIMUM_AMOUNT,
            'messages' => ['Minimum order amount is €50.00'],
        ]);
        $this->messageManager->expects(self::once())
            ->method('addNoticeMessage')
            ->with('Minimum order amount is €50.00');
        $this->redirect->expects(self::once())->method('setPath')->with('checkout/cart')->willReturnSelf();
        $this->page->expects(self::never())->method('addHandle');
        $this->onepage->expects(self::never())->method('initCheckout');

        $result = $this->controller($this->quote(['simple'], false), false, false, false, true)->execute();

        self::assertSame($this->redirect, $result, 'core redirects, the guest branch is not taken');
    }

    public function testOnePageCheckoutTurnedOffKeepsCoresAnswer(): void
    {
        $this->messageManager->expects(self::never())->method('addNoticeMessage');
        $this->messageManager->expects(self::once())->method('addErrorMessage');
        $this->redirect->expects(self::once())->method('setPath')->with('checkout/cart')->willReturnSelf();
        $this->page->expects(self::never())->method('addHandle');
        $this->onepage->expects(self::never())->method('initCheckout');

        $result = $this->controller($this->quote(['simple']), false, false, false, true, false)->execute();

        self::assertSame($this->redirect, $result);
    }

    /**
     * @param list<string> $types product types of the quote items, none for an empty cart
     */
    private function quote(array $types, bool $aboveMinimum = true): Quote&Stub
    {
        $items = [];
        foreach ($types as $type) {
            $item = $this->createStub(Item::class);
            $item->method('getProductType')->willReturn($type);
            $items[] = $item;
        }
        $quote = $this->createStub(Quote::class);
        $quote->method('hasItems')->willReturn($items !== []);
        $quote->method('validateMinimumAmount')->willReturn($aboveMinimum);
        $quote->method('getStoreId')->willReturn(2);
        $quote->method('getAllItems')->willReturn($items);

        return $quote;
    }

    private function controller(
        Quote $quote,
        bool $loggedIn,
        bool $guestMayCheckOut,
        bool $guestsAllowedByStore,
        bool $flag,
        bool $onepageEnabled = true
    ): Index {
        $this->onepage->method('getQuote')->willReturn($quote);

        $checkoutHelper = $this->createStub(CheckoutHelper::class);
        $checkoutHelper->method('canOnepageCheckout')->willReturn($onepageEnabled);
        $checkoutHelper->method('isAllowedGuestCheckout')->willReturn($guestMayCheckOut);

        $customerSession = $this->createStub(CustomerSession::class);
        $customerSession->method('isLoggedIn')->willReturn($loggedIn);

        // Core's controller reaches its collaborators through the object manager.
        $objectManager = $this->createStub(ObjectManagerInterface::class);
        $objectManager->method('get')->willReturnMap([
            [CheckoutHelper::class, $checkoutHelper],
            [Onepage::class, $this->onepage],
            [CheckoutSession::class, $this->createStub(CheckoutSession::class)],
        ]);

        $redirectFactory = $this->createStub(RedirectFactory::class);
        $redirectFactory->method('create')->willReturn($this->redirect);

        $context = $this->createStub(Context::class);
        $context->method('getObjectManager')->willReturn($objectManager);
        $context->method('getMessageManager')->willReturn($this->messageManager);
        $context->method('getResultRedirectFactory')->willReturn($redirectFactory);
        $context->method('getUrl')->willReturn($this->createStub(UrlInterface::class));
        $context->method('getRequest')->willReturn($this->createStub(HttpRequest::class));

        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('isSetFlag')->willReturnMap([
            [CheckoutHelper::XML_PATH_GUEST_CHECKOUT, 'store', 2, $guestsAllowedByStore],
            [Index::CONFIG_ENABLED, 'store', null, $flag],
        ]);

        $title = $this->createStub(Title::class);
        $pageConfig = $this->createStub(PageConfig::class);
        $pageConfig->method('getTitle')->willReturn($title);
        $this->page->method('getConfig')->willReturn($pageConfig);
        $pageFactory = $this->createStub(PageFactory::class);
        $pageFactory->method('create')->willReturn($this->page);

        return new Index(
            $context,
            $customerSession,
            $this->createStub(CustomerRepositoryInterface::class),
            $this->createStub(AccountManagementInterface::class),
            $this->createStub(Registry::class),
            $this->createStub(InlineInterface::class),
            $this->createStub(FormKeyValidator::class),
            $scopeConfig,
            $this->createStub(LayoutFactory::class),
            $this->createStub(CartRepositoryInterface::class),
            $pageFactory,
            $this->createStub(ResultLayoutFactory::class),
            $this->createStub(RawFactory::class),
            $this->createStub(JsonFactory::class),
            $checkoutHelper,
            $this->checkoutBlocker
        );
    }
}
