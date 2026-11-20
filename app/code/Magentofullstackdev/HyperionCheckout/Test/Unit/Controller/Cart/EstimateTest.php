<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Controller\Cart;

use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\Controller\Result\Redirect;
use Magento\Framework\Controller\Result\RedirectFactory;
use Magento\Framework\Data\Form\FormKey\Validator as FormKeyValidator;
use Magento\Framework\Message\ManagerInterface as MessageManagerInterface;
use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address;
use Magento\Quote\Model\Quote\Address\Rate;
use Magentofullstackdev\HyperionCheckout\Controller\Cart\Estimate;
use Magentofullstackdev\HyperionCheckout\Model\Cart\EstimateDestination;
use Magentofullstackdev\HyperionCore\Model\CacheHeaders;
use Magentofullstackdev\HyperionCore\Model\Htmx\FragmentRenderer;
use Magentofullstackdev\HyperionCore\Model\Htmx\MessageCollector;
use Magentofullstackdev\HyperionCore\Model\Htmx\NotificationRenderer;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * A rate the carrier answered with an error is never a shipping method of
 * the quote: posting its code is refused, and a quote that carries one
 * loses it at the next estimate.
 *
 * @covers \Magentofullstackdev\HyperionCheckout\Controller\Cart\Estimate
 */
class EstimateTest extends TestCase
{
    private const NOT_AVAILABLE = 'The selected shipping method is not available for this address.';

    /** @var MessageManagerInterface&MockObject */
    private MessageManagerInterface $messageManager;
    /** @var CartRepositoryInterface&MockObject */
    private CartRepositoryInterface $quoteRepository;
    private Address $address;
    private ?object $extensionAttributes = null;

    protected function setUp(): void
    {
        $this->messageManager = $this->createMock(MessageManagerInterface::class);
        $this->quoteRepository = $this->createMock(CartRepositoryInterface::class);
        $this->address = $this->address([
            $this->rate(['code' => 'flatrate_flatrate', 'method' => 'flatrate', 'price' => 5.0]),
            $this->rate(['code' => 'freeshipping_error', 'error_message' => 'Not available below 500.']),
        ]);
    }

    public function testPostingAnErrorRateIsRefusedAndTheMethodIsNotSet(): void
    {
        $this->messageManager->expects(self::once())->method('addErrorMessage')->with(self::NOT_AVAILABLE);
        $this->quoteRepository->expects(self::once())->method('save');

        $this->controller(['estimate_method' => 'freeshipping_error'])->execute();

        self::assertSame('', (string) $this->address->getShippingMethod());
        self::assertSame('US', $this->address->getCountryId(), 'the destination is still applied');
    }

    public function testAQuoteThatCarriesAnErrorRateLosesIt(): void
    {
        $this->address->setData('shipping_method', 'freeshipping_error');
        $this->messageManager->expects(self::never())->method('addErrorMessage');
        $this->quoteRepository->expects(self::once())->method('save');

        $this->controller([])->execute();

        self::assertSame('', (string) $this->address->getShippingMethod());
    }

    public function testAMethodThatIsNoLongerOfferedIsDroppedAndTheNewChoiceApplied(): void
    {
        $this->address->setData('shipping_method', 'tablerate_bestway');
        $this->messageManager->expects(self::never())->method('addErrorMessage');
        $this->quoteRepository->expects(self::once())->method('save');

        $this->controller(['estimate_method' => 'flatrate_flatrate'])->execute();

        self::assertSame('flatrate_flatrate', $this->address->getShippingMethod());
    }

    public function testAChangeOfMethodAlsoReachesTheShippingAssignmentTheSaveAppliesAgain(): void
    {
        $this->address = $this->address([
            $this->rate(['code' => 'flatrate_flatrate', 'method' => 'flatrate', 'price' => 5.0]),
            $this->rate(['code' => 'tablerate_bestway', 'method' => 'bestway', 'price' => 15.0]),
        ]);
        $this->address->setData('shipping_method', 'flatrate_flatrate');
        $shipping = new class {
            public string $method = 'flatrate_flatrate';

            public function setMethod(string $method): void
            {
                $this->method = $method;
            }
        };
        $assignment = new class ($shipping) {
            public function __construct(private readonly object $shipping)
            {
            }

            public function getShipping(): object
            {
                return $this->shipping;
            }
        };
        $this->extensionAttributes = new class ($assignment) {
            public function __construct(private readonly object $assignment)
            {
            }

            public function getShippingAssignments(): array
            {
                return [$this->assignment];
            }
        };
        $this->messageManager->expects(self::never())->method('addErrorMessage');
        $this->quoteRepository->expects(self::once())->method('save');

        $this->controller(['estimate_method' => 'tablerate_bestway'])->execute();

        self::assertSame('tablerate_bestway', $this->address->getShippingMethod());
        self::assertSame('tablerate_bestway', $shipping->method);
    }

    public function testAnUnknownMethodIsRefused(): void
    {
        $this->messageManager->expects(self::once())->method('addErrorMessage')->with(self::NOT_AVAILABLE);
        $this->quoteRepository->expects(self::once())->method('save');

        $this->controller(['estimate_method' => 'ups_GND'])->execute();

        self::assertSame('', (string) $this->address->getShippingMethod());
    }

    /**
     * @param array<string, string> $post fields posted on top of the destination
     */
    private function controller(array $post): Estimate
    {
        $post += ['country_id' => 'US', 'region_id' => '33', 'postcode' => '48201'];
        $request = $this->createStub(HttpRequest::class);
        $request->method('getParam')->willReturnCallback(static fn (string $key) => $post[$key] ?? null);
        $request->method('getHeader')->willReturn(false);
        $request->method('isPost')->willReturn(true);
        $formKeyValidator = $this->createStub(FormKeyValidator::class);
        $formKeyValidator->method('validate')->willReturn(true);
        $quote = $this->createStub(Quote::class);
        $quote->method('getId')->willReturn(5);
        $quote->method('isVirtual')->willReturn(false);
        $quote->method('getShippingAddress')->willReturn($this->address);
        $quote->method('getExtensionAttributes')->willReturn($this->extensionAttributes);
        $checkoutSession = $this->createStub(CheckoutSession::class);
        $checkoutSession->method('getQuote')->willReturn($quote);
        $redirect = $this->createStub(Redirect::class);
        $redirect->method('setPath')->willReturnSelf();
        $redirectFactory = $this->createStub(RedirectFactory::class);
        $redirectFactory->method('create')->willReturn($redirect);

        return new Estimate(
            $request,
            $formKeyValidator,
            $checkoutSession,
            $this->quoteRepository,
            $this->messageManager,
            $redirectFactory,
            $this->createStub(RawFactory::class),
            $this->createStub(CacheHeaders::class),
            $this->createStub(MessageCollector::class),
            $this->createStub(NotificationRenderer::class),
            $this->createStub(FragmentRenderer::class),
            $this->createStub(LoggerInterface::class),
            $this->createStub(EstimateDestination::class)
        );
    }

    /**
     * The panel's own request (GET, HTMX, `prefill`): the rates of the
     * customer's default address are collected on the quote address, the
     * estimate block alone is answered, and nothing is validated or saved.
     */
    public function testThePrefillRequestCollectsInMemoryAndAnswersThePanelAlone(): void
    {
        $this->messageManager->expects(self::never())->method('addErrorMessage');
        $this->quoteRepository->expects(self::never())->method('save');
        $destination = $this->createMock(EstimateDestination::class);
        $destination->expects(self::once())->method('prefill')->with($this->address)->willReturn(true);
        $fragments = $this->createMock(FragmentRenderer::class);
        $fragments->expects(self::once())
            ->method('render')
            ->with('hyperion_checkout_cart_fragment', 'hyperion.cart.estimate', ['prefilled' => true])
            ->willReturn('<details>panel</details>');
        $raw = $this->createMock(Raw::class);
        $raw->expects(self::once())->method('setContents')->with('<details>panel</details>')->willReturnSelf();
        $cacheHeaders = $this->createMock(CacheHeaders::class);
        $cacheHeaders->expects(self::once())->method('applyPrivate')->with($raw)->willReturn($raw);

        $result = $this->prefillController(true, '1', false, $destination, $fragments, $raw, $cacheHeaders)->execute();

        self::assertSame($raw, $result);
    }

    public function testAVirtualQuoteIsNotPrefilled(): void
    {
        $this->messageManager->expects(self::never())->method('addErrorMessage');
        $this->quoteRepository->expects(self::never())->method('save');
        $destination = $this->createMock(EstimateDestination::class);
        $destination->expects(self::never())->method('prefill');
        $raw = $this->createStub(Raw::class);
        $cacheHeaders = $this->createStub(CacheHeaders::class);
        $cacheHeaders->method('applyPrivate')->willReturn($raw);

        $result = $this->prefillController(
            true,
            '1',
            true,
            $destination,
            $this->createStub(FragmentRenderer::class),
            $raw,
            $cacheHeaders
        )->execute();

        self::assertSame($raw, $result);
    }

    /**
     * @return array<string, array{bool, string|null}>
     */
    public static function foreignGets(): array
    {
        return [
            'a browser navigation' => [false, '1'],
            'an HTMX request without the parameter' => [true, null],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('foreignGets')]
    public function testAGetThatIsNotThePanelsGoesToTheCartAndCollectsNothing(bool $htmx, ?string $prefill): void
    {
        $this->messageManager->expects(self::never())->method('addErrorMessage');
        $this->quoteRepository->expects(self::never())->method('save');
        $destination = $this->createMock(EstimateDestination::class);
        $destination->expects(self::never())->method('prefill');
        $fragments = $this->createMock(FragmentRenderer::class);
        $fragments->expects(self::never())->method('render');

        $result = $this->prefillController(
            $htmx,
            $prefill,
            false,
            $destination,
            $fragments,
            $this->createStub(Raw::class),
            $this->createStub(CacheHeaders::class)
        )->execute();

        self::assertInstanceOf(Redirect::class, $result);
    }

    private function prefillController(
        bool $htmx,
        ?string $prefill,
        bool $virtual,
        EstimateDestination $destination,
        FragmentRenderer $fragments,
        Raw $raw,
        CacheHeaders $cacheHeaders
    ): Estimate {
        $request = $this->createStub(HttpRequest::class);
        $request->method('isPost')->willReturn(false);
        $request->method('getHeader')->willReturn($htmx ? 'true' : false);
        $request->method('getParam')->willReturnCallback(
            static fn (string $key) => $key === Estimate::PARAM_PREFILL ? $prefill : null
        );
        $quote = $this->createStub(Quote::class);
        $quote->method('getId')->willReturn(5);
        $quote->method('isVirtual')->willReturn($virtual);
        $quote->method('getShippingAddress')->willReturn($this->address);
        $checkoutSession = $this->createStub(CheckoutSession::class);
        $checkoutSession->method('getQuote')->willReturn($quote);
        $redirect = $this->createStub(Redirect::class);
        $redirect->method('setPath')->willReturnSelf();
        $redirectFactory = $this->createStub(RedirectFactory::class);
        $redirectFactory->method('create')->willReturn($redirect);
        $rawFactory = $this->createStub(RawFactory::class);
        $rawFactory->method('create')->willReturn($raw);

        return new Estimate(
            $request,
            $this->createStub(FormKeyValidator::class),
            $checkoutSession,
            $this->quoteRepository,
            $this->messageManager,
            $redirectFactory,
            $rawFactory,
            $cacheHeaders,
            $this->createStub(MessageCollector::class),
            $this->createStub(NotificationRenderer::class),
            $fragments,
            $this->createStub(LoggerInterface::class),
            $destination
        );
    }

    /**
     * A quote address that keeps its data like the real one (the magic
     * accessors of the model) and answers the given rates.
     *
     * @param Rate[] $rates
     */
    private function address(array $rates): Address
    {
        return new class ($rates) extends Address {
            /**
             * @param Rate[] $rates
             */
            public function __construct(private readonly array $rates)
            {
            }

            public function getGroupedAllShippingRates()
            {
                return ['carrier' => $this->rates];
            }
        };
    }

    /**
     * @param array<string, mixed> $data code, method, price, error_message
     */
    private function rate(array $data): Rate
    {
        return new class ($data) extends Rate {
            /**
             * @param array<string, mixed> $data
             */
            public function __construct(array $data)
            {
                $this->_data = $data;
            }
        };
    }
}
