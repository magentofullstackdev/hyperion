<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleExtension\Test\Unit\Plugin;

use Magento\Checkout\Api\Data\ShippingInformationInterface;
use Magento\Checkout\Model\ShippingInformationManagement;
use Magento\Framework\Exception\InputException;
use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address;
use Magento\Quote\Model\ResourceModel\Quote\Address as AddressResource;
use Magentofullstackdev\HyperionSampleExtension\Model\Config;
use Magentofullstackdev\HyperionSampleExtension\Model\LockerIdReader;
use Magentofullstackdev\HyperionSampleExtension\Model\LockerPoints;
use Magentofullstackdev\HyperionSampleExtension\Plugin\ShippingInformationManagementPlugin;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class ShippingInformationManagementPluginTest extends TestCase
{
    /**
     * @var AddressResource&MockObject
     */
    private AddressResource&MockObject $addressResource;

    /**
     * @var Address&MockObject
     */
    private Address&MockObject $address;

    private ShippingInformationManagement $subject;

    protected function setUp(): void
    {
        $this->addressResource = $this->createMock(AddressResource::class);
        $this->address = $this->getMockBuilder(Address::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getData', 'setData'])
            ->getMock();
        $this->subject = $this->createStub(ShippingInformationManagement::class);
    }

    /**
     * @return array<string, array{string}>
     */
    public static function refusedPoints(): array
    {
        return [
            'no point' => [''],
            'unknown point' => ['HL-999'],
            'id of another shape' => ['hl-001'],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('refusedPoints')]
    public function testRefusesTheLockerMethodWithoutAKnownPoint(string $lockerId): void
    {
        $this->addressResource->expects($this->never())->method('save');
        $this->address->expects($this->never())->method('setData');

        $this->expectException(InputException::class);
        $this->expectExceptionMessage('The selected pickup point is not available.');

        $this->plugin($lockerId)->beforeSaveAddressInformation($this->subject, 12, $this->information('hyperionlocker'));
    }

    public function testAcceptsTheLockerMethodWithAKnownPoint(): void
    {
        $this->addressResource->expects($this->never())->method('save');
        $this->address->expects($this->never())->method('setData');

        self::assertNull(
            $this->plugin('HL-002')->beforeSaveAddressInformation($this->subject, 12, $this->information('hyperionlocker'))
        );
    }

    public function testIgnoresThePointOfAnotherCarrier(): void
    {
        $this->addressResource->expects($this->never())->method('save');
        $this->address->expects($this->never())->method('setData');

        self::assertNull(
            $this->plugin('HL-999')->beforeSaveAddressInformation($this->subject, 12, $this->information('flatrate'))
        );
    }

    public function testStoresThePointOfTheLockerMethodOnTheShippingAddress(): void
    {
        $this->address->expects($this->once())->method('getData')
            ->with(ShippingInformationManagementPlugin::COLUMN)->willReturn(null);
        $this->address->expects($this->once())->method('setData')
            ->with(ShippingInformationManagementPlugin::COLUMN, 'HL-001');
        $this->addressResource->expects($this->once())->method('save')->with($this->address);

        $result = $this->plugin('HL-001', $this->address)
            ->afterSaveAddressInformation($this->subject, 'saved', 12, $this->information('hyperionlocker'));

        self::assertSame('saved', $result);
    }

    public function testClearsTheStoredPointWhenAnotherMethodIsSaved(): void
    {
        $this->address->expects($this->once())->method('getData')
            ->with(ShippingInformationManagementPlugin::COLUMN)->willReturn('HL-001');
        $this->address->expects($this->once())->method('setData')
            ->with(ShippingInformationManagementPlugin::COLUMN, null);
        $this->addressResource->expects($this->once())->method('save')->with($this->address);

        $this->plugin('HL-001', $this->address)
            ->afterSaveAddressInformation($this->subject, 'saved', '12', $this->information('flatrate'));
    }

    public function testWritesNothingWhenThePointDidNotChange(): void
    {
        $this->address->expects($this->once())->method('getData')
            ->with(ShippingInformationManagementPlugin::COLUMN)->willReturn('HL-003');
        $this->address->expects($this->never())->method('setData');
        $this->addressResource->expects($this->never())->method('save');

        $this->plugin('HL-003', $this->address)
            ->afterSaveAddressInformation($this->subject, 'saved', 12, $this->information('hyperionlocker'));
    }

    public function testDoesNothingWhileTheModuleIsSwitchedOff(): void
    {
        $this->address->expects($this->never())->method('getData');
        $this->address->expects($this->never())->method('setData');
        $this->addressResource->expects($this->never())->method('save');
        $plugin = $this->plugin('HL-999', $this->address, false);
        $information = $this->information('hyperionlocker');

        self::assertNull($plugin->beforeSaveAddressInformation($this->subject, 12, $information));
        self::assertSame('saved', $plugin->afterSaveAddressInformation($this->subject, 'saved', 12, $information));
    }

    /**
     * The plugin with a reader that answers the given id and a cart holding the address.
     *
     * @param string $lockerId
     * @param Address|null $address
     * @param bool $enabled the module's switch
     * @return ShippingInformationManagementPlugin
     */
    private function plugin(
        string $lockerId,
        ?Address $address = null,
        bool $enabled = true
    ): ShippingInformationManagementPlugin {
        $config = $this->createStub(Config::class);
        $config->method('isEnabled')->willReturn($enabled);

        $reader = $this->createStub(LockerIdReader::class);
        $reader->method('read')->willReturn($lockerId);

        $quote = $this->createStub(Quote::class);
        $quote->method('getShippingAddress')->willReturn($address ?? $this->address);
        $cartRepository = $this->createStub(CartRepositoryInterface::class);
        $cartRepository->method('getActive')->willReturn($quote);

        return new ShippingInformationManagementPlugin(
            new LockerPoints(),
            $reader,
            $cartRepository,
            $this->addressResource,
            $config
        );
    }

    /**
     * @param string $carrierCode
     * @return ShippingInformationInterface
     */
    private function information(string $carrierCode): ShippingInformationInterface
    {
        $information = $this->createStub(ShippingInformationInterface::class);
        $information->method('getShippingCarrierCode')->willReturn($carrierCode);

        return $information;
    }
}
