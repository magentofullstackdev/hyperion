<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Plugin\Quote;

use Magento\Framework\Exception\NoSuchEntityException;
use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Api\Data\AddressInterface;
use Magento\Quote\Api\Data\AddressInterfaceFactory;
use Magento\Quote\Api\GuestBillingAddressManagementInterface;
use Magento\Quote\Model\MaskedQuoteIdToQuoteIdInterface;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address;
use Magentofullstackdev\HyperionCheckout\Plugin\Quote\GuestBillingAddressPrivacy;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionCheckout\Plugin\Quote\GuestBillingAddressPrivacy
 */
class GuestBillingAddressPrivacyTest extends TestCase
{
    private AddressInterface $emptyAddress;

    protected function setUp(): void
    {
        $this->emptyAddress = $this->createStub(AddressInterface::class);
    }

    private function quote(?int $customerId): Quote
    {
        $quote = $this->createStub(Quote::class);
        $quote->method('getData')->willReturnMap([['customer_id', null, $customerId]]);
        return $quote;
    }

    private function address(?Quote $quote): Address
    {
        $address = $this->createStub(Address::class);
        $address->method('getQuote')->willReturn($quote);
        return $address;
    }

    private function plugin(
        ?CartRepositoryInterface $repository = null,
        ?MaskedQuoteIdToQuoteIdInterface $masks = null,
        ?LoggerInterface $logger = null,
        bool $factoryFails = false
    ): GuestBillingAddressPrivacy {
        $factory = $this->createStub(AddressInterfaceFactory::class);
        if ($factoryFails) {
            $factory->method('create')->willThrowException(new \RuntimeException('factory'));
        } else {
            $factory->method('create')->willReturn($this->emptyAddress);
        }
        return new GuestBillingAddressPrivacy(
            $masks ?? $this->createStub(MaskedQuoteIdToQuoteIdInterface::class),
            $repository ?? $this->createStub(CartRepositoryInterface::class),
            $factory,
            $logger ?? $this->createStub(LoggerInterface::class)
        );
    }

    private function subject(): GuestBillingAddressManagementInterface
    {
        return $this->createStub(GuestBillingAddressManagementInterface::class);
    }

    public function testTheBillingAddressOfAGuestCartIsReturnedAsCoreLoadedIt(): void
    {
        $address = $this->address($this->quote(null));

        self::assertSame($address, $this->plugin()->afterGet($this->subject(), $address, 'masked'));
    }

    public function testTheBillingAddressOfACustomerCartIsReplacedByAnEmptyOne(): void
    {
        $address = $this->address($this->quote(7));

        self::assertSame($this->emptyAddress, $this->plugin()->afterGet($this->subject(), $address, 'masked'));
    }

    public function testAnAddressWithoutItsQuoteIsJudgedThroughTheMaskedId(): void
    {
        $masks = $this->createMock(MaskedQuoteIdToQuoteIdInterface::class);
        $masks->expects(self::once())->method('execute')->with('masked')->willReturn(144);
        $repository = $this->createMock(CartRepositoryInterface::class);
        $repository->expects(self::once())->method('get')->with(144)->willReturn($this->quote(7));

        $result = $this->plugin($repository, $masks)->afterGet($this->subject(), $this->address(null), 'masked');

        self::assertSame($this->emptyAddress, $result);
    }

    public function testAnUnknownOwnerWithholdsTheAddressAndLogs(): void
    {
        $masks = $this->createStub(MaskedQuoteIdToQuoteIdInterface::class);
        $masks->method('execute')->willThrowException(new NoSuchEntityException(__('missing')));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error');

        $result = $this->plugin(null, $masks, $logger)->afterGet($this->subject(), $this->address(null), 'masked');

        self::assertSame($this->emptyAddress, $result);
    }

    public function testACustomerAddressThatCannotBeReplacedIsRefusedAndLogged(): void
    {
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error');

        $this->expectException(NoSuchEntityException::class);
        $this->plugin(null, null, $logger, true)->afterGet($this->subject(), $this->address($this->quote(7)), 'masked');
    }
}
