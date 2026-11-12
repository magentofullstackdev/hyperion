<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleData\Test\Unit\Model;

use Magento\Bundle\Api\Data\LinkInterface;
use Magento\Bundle\Api\Data\LinkInterfaceFactory;
use Magento\Bundle\Api\Data\OptionInterface;
use Magento\Bundle\Api\Data\OptionInterfaceFactory;
use Magento\Catalog\Api\CategoryLinkManagementInterface;
use Magento\Catalog\Api\Data\ProductCustomOptionInterface;
use Magento\Catalog\Api\Data\ProductCustomOptionInterfaceFactory;
use Magento\Catalog\Api\Data\ProductCustomOptionValuesInterface;
use Magento\Catalog\Api\Data\ProductCustomOptionValuesInterfaceFactory;
use Magento\Catalog\Api\Data\ProductInterface;
use Magento\Catalog\Api\Data\ProductInterfaceFactory;
use Magento\Catalog\Api\ProductRepositoryInterface;
use Magento\Catalog\Model\Product;
use Magento\Framework\App\State as AppState;
use Magento\Framework\Exception\NoSuchEntityException;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionSampleData\Model\SampleProducts;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionSampleData\Model\SampleProducts
 */
class SampleProductsTest extends TestCase
{
    /** @var string[] the SKUs the catalog holds */
    private array $catalog = [];

    /** @var string[] every SKU looked up in the repository */
    private array $lookups = [];

    private int $saveCalls = 0;
    private int $productsBuilt = 0;
    private ?\Throwable $saveFailure = null;

    /** @var string[] */
    private array $errors = [];

    public function testNothingIsCreatedWithoutTheSampleCatalog(): void
    {
        $this->catalog = [];

        $this->sampleProducts()->create();

        self::assertSame([SampleProducts::SAMPLE_CATALOG_SKU], $this->lookups, 'only the sample catalog probe ran');
        self::assertSame(0, $this->productsBuilt);
        self::assertSame(0, $this->saveCalls);
        self::assertSame([], $this->errors);
    }

    public function testAnExistingSkuIsSkipped(): void
    {
        $this->catalog = [
            SampleProducts::SAMPLE_CATALOG_SKU,
            SampleProducts::BUNDLE_SKU,
            SampleProducts::CUSTOM_OPTIONS_SKU,
        ];

        $this->sampleProducts()->create();

        self::assertSame(1, $this->productsBuilt, 'only the missing virtual product is built');
        self::assertSame(1, $this->saveCalls);
        self::assertSame([], $this->errors);
    }

    public function testNothingIsSavedWhenEverySampleProductExists(): void
    {
        $this->catalog = [
            SampleProducts::SAMPLE_CATALOG_SKU,
            SampleProducts::VIRTUAL_SKU,
            SampleProducts::BUNDLE_SKU,
            SampleProducts::CUSTOM_OPTIONS_SKU,
        ];

        $this->sampleProducts()->create();

        self::assertSame(0, $this->productsBuilt);
        self::assertSame(0, $this->saveCalls);
    }

    public function testASaveFailureIsLoggedPerProductAndNeverThrown(): void
    {
        $this->catalog = [SampleProducts::SAMPLE_CATALOG_SKU, SampleProducts::BUNDLE_SKU];
        $this->saveFailure = new \RuntimeException('URL key already exists.');

        $this->sampleProducts()->create();

        self::assertSame(2, $this->saveCalls, 'the second product is still attempted after the first failure');
        self::assertCount(2, $this->errors);
        self::assertStringContainsString(SampleProducts::VIRTUAL_SKU, $this->errors[0]);
        self::assertStringContainsString('URL key already exists.', $this->errors[0]);
        self::assertStringContainsString(SampleProducts::CUSTOM_OPTIONS_SKU, $this->errors[1]);
    }

    public function testAFailureOfTheAreaEmulationIsLoggedAndNotThrown(): void
    {
        $appState = $this->createStub(AppState::class);
        $appState->method('emulateAreaCode')->willThrowException(new \RuntimeException('Area code is not set.'));

        $this->sampleProducts($appState)->create();

        self::assertCount(1, $this->errors);
        self::assertStringContainsString('Area code is not set.', $this->errors[0]);
    }

    private function sampleProducts(?AppState $appState = null): SampleProducts
    {
        $repository = $this->createStub(ProductRepositoryInterface::class);
        $repository->method('get')->willReturnCallback(function ($sku): ProductInterface {
            $this->lookups[] = (string) $sku;
            if (!in_array($sku, $this->catalog, true)) {
                throw new NoSuchEntityException();
            }

            return $this->createStub(ProductInterface::class);
        });
        $repository->method('save')->willReturnCallback(function (): ProductInterface {
            $this->saveCalls++;
            if ($this->saveFailure !== null) {
                throw $this->saveFailure;
            }
            $saved = $this->createStub(ProductInterface::class);
            $saved->method('getSku')->willReturn('SAVED-SKU');

            return $saved;
        });

        $productFactory = $this->createStub(ProductInterfaceFactory::class);
        $productFactory->method('create')->willReturnCallback(function (): Product {
            $this->productsBuilt++;

            return $this->createStub(Product::class);
        });
        $bundleOptionFactory = $this->createStub(OptionInterfaceFactory::class);
        $bundleOptionFactory->method('create')->willReturnCallback(fn () => $this->createStub(OptionInterface::class));
        $linkFactory = $this->createStub(LinkInterfaceFactory::class);
        $linkFactory->method('create')->willReturnCallback(fn () => $this->createStub(LinkInterface::class));
        $customOptionFactory = $this->createStub(ProductCustomOptionInterfaceFactory::class);
        $customOptionFactory->method('create')
            ->willReturnCallback(fn () => $this->createStub(ProductCustomOptionInterface::class));
        $customOptionValueFactory = $this->createStub(ProductCustomOptionValuesInterfaceFactory::class);
        $customOptionValueFactory->method('create')
            ->willReturnCallback(fn () => $this->createStub(ProductCustomOptionValuesInterface::class));

        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getWebsites')->willReturn([]);

        if ($appState === null) {
            $appState = $this->createStub(AppState::class);
            $appState->method('emulateAreaCode')
                ->willReturnCallback(static fn ($areaCode, callable $callback) => $callback());
        }

        $logger = $this->createStub(LoggerInterface::class);
        $logger->method('error')->willReturnCallback(function ($message): void {
            $this->errors[] = (string) $message;
        });

        return new SampleProducts(
            $productFactory,
            $repository,
            $bundleOptionFactory,
            $linkFactory,
            $customOptionFactory,
            $customOptionValueFactory,
            $this->createStub(CategoryLinkManagementInterface::class),
            $storeManager,
            $appState,
            $logger
        );
    }
}
