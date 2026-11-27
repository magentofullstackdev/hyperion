<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Plugin\Quote;

use Magento\Customer\Api\Data\CustomerInterface;
use Magento\Customer\Api\Data\CustomerInterfaceFactory;
use Magento\Framework\Exception\NoSuchEntityException;
use Magento\Quote\Api\Data\AddressInterface;
use Magento\Quote\Api\Data\AddressInterfaceFactory;
use Magento\Quote\Api\Data\CartInterface;
use Magento\Quote\Api\Data\CartItemInterface;
use Magento\Quote\Api\Data\CurrencyInterface;
use Magento\Quote\Api\GuestCartRepositoryInterface;
use Magento\Quote\Model\Quote;
use Magentofullstackdev\HyperionCheckout\Plugin\Quote\GuestCartPrivacy;
use Magentofullstackdev\HyperionCheckout\Plugin\Quote\RedactedCart;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionCheckout\Plugin\Quote\GuestCartPrivacy
 * @covers \Magentofullstackdev\HyperionCheckout\Plugin\Quote\RedactedCart
 */
class GuestCartPrivacyTest extends TestCase
{
    private CustomerInterface $emptyCustomer;

    private AddressInterface $emptyAddress;

    private CurrencyInterface $currency;

    private CartItemInterface $item;

    protected function setUp(): void
    {
        $this->emptyCustomer = $this->createStub(CustomerInterface::class);
        $this->emptyAddress = $this->createStub(AddressInterface::class);
        $this->currency = $this->createStub(CurrencyInterface::class);
        $this->item = $this->createStub(CartItemInterface::class);
    }

    /**
     * A quote that keeps its data in the real data object, as the repository caches it.
     *
     * @return Quote&MockObject
     */
    private function quote(?int $customerId): Quote
    {
        $quote = $this->getMockBuilder(Quote::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getId', 'getCurrency', 'getIsVirtual', 'getCustomer', 'getBillingAddress', 'getExtensionAttributes', 'save'])
            ->getMock();
        $quote->expects(self::never())->method('save');
        $quote->expects(self::never())->method('getCustomer');
        $quote->method('getId')->willReturn(144);
        $quote->method('getCurrency')->willReturn($this->currency);
        $quote->method('getIsVirtual')->willReturn(false);
        $quote->setData([
            'entity_id' => 144,
            'created_at' => '2026-01-02 10:00:00',
            'updated_at' => '2026-01-02 10:05:00',
            'is_active' => 1,
            'items' => [$this->item],
            'items_count' => 1,
            'items_qty' => 2.0,
            'reserved_order_id' => null,
            'orig_order_id' => 0,
            'customer_id' => $customerId,
            'customer_is_guest' => $customerId === null ? 1 : 0,
            'customer_email' => 'roni_cost@example.com',
            'customer_firstname' => 'Veronica',
            'customer_lastname' => 'Costello',
            'customer_dob' => '1973-12-15',
            'customer_note' => 'Leave it with the neighbor',
            'customer_note_notify' => 1,
            'customer_tax_class_id' => 3,
            'store_id' => 1,
        ]);
        return $quote;
    }

    private function plugin(?LoggerInterface $logger = null, bool $factoriesFail = false): GuestCartPrivacy
    {
        $customers = $this->createStub(CustomerInterfaceFactory::class);
        $addresses = $this->createStub(AddressInterfaceFactory::class);
        if ($factoriesFail) {
            $customers->method('create')->willThrowException(new \RuntimeException('factory'));
        } else {
            $customers->method('create')->willReturn($this->emptyCustomer);
        }
        $addresses->method('create')->willReturn($this->emptyAddress);
        return new GuestCartPrivacy($customers, $addresses, $logger ?? $this->createStub(LoggerInterface::class));
    }

    private function subject(): GuestCartRepositoryInterface
    {
        return $this->createStub(GuestCartRepositoryInterface::class);
    }

    public function testAGuestCartIsReturnedAsCoreLoadedIt(): void
    {
        $quote = $this->quote(null);

        self::assertSame($quote, $this->plugin()->afterGet($this->subject(), $quote, 'masked'));
    }

    public function testACustomerCartIsAnsweredWithoutTheCustomerData(): void
    {
        $result = $this->plugin()->afterGet($this->subject(), $this->quote(7), 'masked');

        self::assertInstanceOf(RedactedCart::class, $result);
        self::assertSame($this->emptyCustomer, $result->getCustomer());
        self::assertSame($this->emptyAddress, $result->getBillingAddress());
        self::assertNull($result->getCustomerNote());
        self::assertNull($result->getExtensionAttributes());
    }

    /**
     * @return array<string, array{0: string, 1: mixed}>
     */
    public static function keptFields(): array
    {
        return [
            'id' => ['getId', 144],
            'created at' => ['getCreatedAt', '2026-01-02 10:00:00'],
            'updated at' => ['getUpdatedAt', '2026-01-02 10:05:00'],
            'is active' => ['getIsActive', 1],
            'is virtual' => ['getIsVirtual', false],
            'items count' => ['getItemsCount', 1],
            'items qty' => ['getItemsQty', 2.0],
            'reserved order id' => ['getReservedOrderId', null],
            'customer is guest' => ['getCustomerIsGuest', 0],
            'note notify flag' => ['getCustomerNoteNotify', 1],
            'tax class' => ['getCustomerTaxClassId', 3],
            'store' => ['getStoreId', 1],
        ];
    }

    #[DataProvider('keptFields')]
    public function testACustomerCartKeepsWhatACartNeeds(string $getter, mixed $expected): void
    {
        $result = $this->plugin()->afterGet($this->subject(), $this->quote(7), 'masked');

        self::assertSame($expected, $result->$getter());
    }

    public function testACustomerCartKeepsItsItemsAndCurrency(): void
    {
        $result = $this->plugin()->afterGet($this->subject(), $this->quote(7), 'masked');

        self::assertSame([$this->item], $result->getItems());
        self::assertSame($this->currency, $result->getCurrency());
    }

    public function testTheQuoteHeldByTheRepositoryKeepsItsData(): void
    {
        $quote = $this->quote(7);
        $before = $quote->getData();

        $result = $this->plugin()->afterGet($this->subject(), $quote, 'masked');
        $result->setCustomerNote('changed')->setStoreId(9)->setItems([]);

        self::assertNotSame($quote, $result);
        self::assertSame($before, $quote->getData());
    }

    public function testACartOfAnotherImplementationIsJudgedByItsCustomer(): void
    {
        $customer = $this->createStub(CustomerInterface::class);
        $customer->method('getId')->willReturn(7);
        $cart = $this->createStub(CartInterface::class);
        $cart->method('getCustomer')->willReturn($customer);

        self::assertInstanceOf(RedactedCart::class, $this->plugin()->afterGet($this->subject(), $cart, 'masked'));
    }

    /**
     * The web API output, REST and SOAP alike, keeps a getter whose `@return`
     * has no `null` even when it answers null, and the WSDL marks it as
     * required: the copy answers a value for each of them.
     */
    public function testEveryFieldTheCartContractRequiresHasAValueInTheCopy(): void
    {
        $result = $this->plugin()->afterGet($this->subject(), $this->quote(7), 'masked');
        $required = [];
        foreach ((new \ReflectionClass(CartInterface::class))->getMethods() as $method) {
            if (!str_starts_with($method->getName(), 'get')
                || !preg_match('/@return\s+(\S+)/', (string) $method->getDocComment(), $match)
            ) {
                continue;
            }
            if (!in_array('null', explode('|', $match[1]), true)) {
                $required[] = $method->getName();
                self::assertNotNull($result->{$method->getName()}(), $method->getName());
            }
        }

        self::assertContains('getCustomer', $required, 'the docblocks were read');
        self::assertInstanceOf(CustomerInterface::class, $result->getCustomer());
    }

    public function testACustomerCartThatCannotBeCopiedIsRefusedAndLogged(): void
    {
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error');

        $this->expectException(NoSuchEntityException::class);
        $this->plugin($logger, true)->afterGet($this->subject(), $this->quote(7), 'masked');
    }
}
