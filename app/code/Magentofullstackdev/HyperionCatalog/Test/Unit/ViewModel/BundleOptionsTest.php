<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Test\Unit\ViewModel;

use Magento\Bundle\Model\Option;
use Magento\Catalog\Model\Product;
use Magento\Framework\DataObject;
use Magento\Framework\Locale\ResolverInterface as LocaleResolver;
use Magento\Framework\Pricing\PriceCurrencyInterface;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCatalog\ViewModel\BundleOptions;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The bundle option form preselects what the buy request of an edited item
 * chose (cart line "Edit"); without a buy request the admin defaults apply.
 */
class BundleOptionsTest extends TestCase
{
    private BundleOptions $viewModel;

    protected function setUp(): void
    {
        $this->viewModel = new BundleOptions(
            $this->createStub(PriceCurrencyInterface::class),
            $this->createStub(StoreManagerInterface::class),
            $this->createStub(LocaleResolver::class),
            $this->createStub(LoggerInterface::class)
        );
    }

    public function testNoBuyRequestMeansDefaults(): void
    {
        $bundle = $this->createStub(Product::class);
        $bundle->method('hasData')->willReturn(false);

        self::assertNull($this->viewModel->getPreselectedSelectionIds($bundle, $this->option(5)));
        self::assertNull($this->viewModel->getPreselectedQty($bundle, $this->option(5)));
    }

    /**
     * @return array<string, array{int, string[], float|null}>
     */
    public static function buyRequestProvider(): array
    {
        return [
            'radio with a quantity' => [5, ['12'], 2.0],
            'checkboxes' => [6, ['20', '21'], null],
            'option the shopper left out' => [7, [], null],
            'select answered with an empty value' => [8, [], null],
        ];
    }

    /**
     * @dataProvider buyRequestProvider
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('buyRequestProvider')]
    public function testTheBuyRequestDecidesSelectionsAndQuantities(int $optionId, array $ids, ?float $qty): void
    {
        $bundle = $this->createStub(Product::class);
        $bundle->method('hasData')->willReturnCallback(static fn (string $key): bool => $key === 'preconfigured_values');
        $bundle->method('getPreconfiguredValues')->willReturn(new DataObject([
            'bundle_option' => [5 => '12', 6 => ['20', '21'], 8 => ''],
            'bundle_option_qty' => [5 => '2', 6 => '0'],
        ]));

        self::assertSame($ids, $this->viewModel->getPreselectedSelectionIds($bundle, $this->option($optionId)));
        self::assertSame($qty, $this->viewModel->getPreselectedQty($bundle, $this->option($optionId)));
    }

    private function option(int $id): Option
    {
        $option = $this->createStub(Option::class);
        $option->method('getOptionId')->willReturn($id);

        return $option;
    }
}
