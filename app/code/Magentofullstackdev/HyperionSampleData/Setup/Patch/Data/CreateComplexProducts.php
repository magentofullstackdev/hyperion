<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleData\Setup\Patch\Data;

use Magento\Bundle\Api\Data\LinkInterfaceFactory;
use Magento\Bundle\Api\Data\OptionInterfaceFactory;
use Magento\Bundle\Model\Product\Price as BundlePrice;
use Magento\Bundle\Model\Product\Type as BundleType;
use Magento\Catalog\Api\CategoryLinkManagementInterface;
use Magento\Catalog\Model\Product;
use Magento\Catalog\Api\Data\ProductInterfaceFactory;
use Magento\Catalog\Api\ProductRepositoryInterface;
use Magento\Catalog\Model\Product\Attribute\Source\Status;
use Magento\Catalog\Model\Product\Type as ProductType;
use Magento\Catalog\Model\Product\Visibility;
use Magento\Framework\App\Area;
use Magento\Framework\App\State as AppState;
use Magento\Framework\Exception\NoSuchEntityException;
use Magento\Framework\Setup\ModuleDataSetupInterface;
use Magento\Framework\Setup\Patch\DataPatchInterface;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Creates one bundle product and one virtual product so complex product
 * types can be exercised on a store whose Luma sample data did not
 * install completely (its media-asset step aborts on many installs).
 *
 * Idempotent: a product whose SKU already exists is left untouched. The
 * bundle selections are Luma sample simples (bags and gear); when a
 * selection SKU is missing it is skipped, and an option without any
 * selection is dropped.
 */
class CreateComplexProducts implements DataPatchInterface
{
    public const VIRTUAL_SKU = 'HYP-VIRTUAL-GIFT-WRAP';
    public const BUNDLE_SKU = 'HYP-BUNDLE-TRAVEL-KIT';

    private const CATEGORY_IDS = [3, 4]; // Gear, Gear > Bags (Luma sample tree)
    private const DEFAULT_ATTRIBUTE_SET = 4;

    private const BUNDLE_OPTIONS = [
        ['title' => 'Bag', 'type' => 'radio', 'required' => true, 'skus' => ['24-MB01', '24-MB04', '24-MB03']],
        ['title' => 'Accessories', 'type' => 'checkbox', 'required' => false, 'skus' => ['24-UG01', '24-UG02']],
    ];

    public function __construct(
        private readonly ModuleDataSetupInterface $moduleDataSetup,
        private readonly ProductInterfaceFactory $productFactory,
        private readonly ProductRepositoryInterface $productRepository,
        private readonly OptionInterfaceFactory $optionFactory,
        private readonly LinkInterfaceFactory $linkFactory,
        private readonly CategoryLinkManagementInterface $categoryLinkManagement,
        private readonly StoreManagerInterface $storeManager,
        private readonly AppState $appState,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @inheritDoc
     */
    public function apply(): self
    {
        $this->moduleDataSetup->getConnection()->startSetup();
        try {
            $this->appState->emulateAreaCode(Area::AREA_ADMINHTML, function (): void {
                if (!$this->exists(self::VIRTUAL_SKU)) {
                    $this->createVirtual();
                }
                if (!$this->exists(self::BUNDLE_SKU)) {
                    $this->createBundle();
                }
            });
        } catch (\Throwable $e) {
            $this->logger->error('HyperionSampleData: CreateComplexProducts failed', ['exception' => $e]);
            throw $e;
        } finally {
            $this->moduleDataSetup->getConnection()->endSetup();
        }
        return $this;
    }

    /**
     * @inheritDoc
     */
    public static function getDependencies(): array
    {
        return [];
    }

    /**
     * @inheritDoc
     */
    public function getAliases(): array
    {
        return [];
    }

    private function createVirtual(): void
    {
        $product = $this->newProduct(self::VIRTUAL_SKU, 'Hyperion Gift Wrapping Service', ProductType::TYPE_VIRTUAL);
        $product->setPrice(9.99);
        $product->setData('url_key', 'hyperion-gift-wrapping-service');
        $product->setData(
            'description',
            '<p>Have your order wrapped in recycled paper with a hand-written note. '
            . 'Virtual sample product created by Magentofullstackdev_HyperionSampleData.</p>'
        );
        $product->setData('short_description', 'Gift wrapping for your whole order.');
        $product->setStockData(['use_config_manage_stock' => 1, 'qty' => 100, 'is_in_stock' => 1]);

        $saved = $this->productRepository->save($product);
        $this->assignToSampleCategories($saved->getSku());
        $this->logger->info('HyperionSampleData: created virtual product ' . self::VIRTUAL_SKU);
    }

    private function createBundle(): void
    {
        $options = [];
        $position = 0;
        foreach (self::BUNDLE_OPTIONS as $definition) {
            $links = [];
            foreach ($definition['skus'] as $index => $sku) {
                if (!$this->exists($sku)) {
                    $this->logger->warning('HyperionSampleData: bundle selection ' . $sku . ' not found, skipped');
                    continue;
                }
                $link = $this->linkFactory->create();
                $link->setSku($sku);
                $link->setQty(1);
                $link->setIsDefault($index === 0);
                $link->setPriceType(BundlePrice::PRICE_TYPE_FIXED);
                $link->setPrice(0.0);
                $link->setCanChangeQuantity(1);
                $link->setPosition($index);
                $links[] = $link;
            }
            if ($links === []) {
                continue;
            }
            $option = $this->optionFactory->create();
            $option->setTitle($definition['title']);
            $option->setType($definition['type']);
            $option->setRequired($definition['required']);
            $option->setPosition($position++);
            $option->setProductLinks($links);
            $options[] = $option;
        }
        if ($options === []) {
            $this->logger->warning('HyperionSampleData: no bundle selections available, bundle not created');
            return;
        }

        $product = $this->newProduct(self::BUNDLE_SKU, 'Hyperion Travel Kit', BundleType::TYPE_CODE);
        // Dynamic bundle: price, SKU and weight follow the chosen selections;
        // ship the parts together.
        $product->setData('price_type', BundlePrice::PRICE_TYPE_DYNAMIC);
        $product->setData('sku_type', 0);
        $product->setData('weight_type', 0);
        $product->setData('price_view', 0);
        $product->setData('shipment_type', 0);
        $product->setPrice(0.0);
        $product->setData('url_key', 'hyperion-travel-kit');
        $product->setData(
            'description',
            '<p>Pick a bag and add the accessories you need. '
            . 'Bundle sample product created by Magentofullstackdev_HyperionSampleData.</p>'
        );
        $product->setData('short_description', 'A bag plus the gear that goes with it.');
        $product->setStockData(['use_config_manage_stock' => 1, 'is_in_stock' => 1]);
        $extension = $product->getExtensionAttributes();
        if (!$extension instanceof \Magento\Catalog\Api\Data\ProductExtensionInterface) {
            throw new \RuntimeException('Product extension attributes are not available.');
        }
        $extension->setBundleProductOptions($options);
        $product->setExtensionAttributes($extension);

        $saved = $this->productRepository->save($product);
        $this->assignToSampleCategories($saved->getSku());
        $this->logger->info('HyperionSampleData: created bundle product ' . self::BUNDLE_SKU);
    }

    private function newProduct(string $sku, string $name, string $typeId): Product
    {
        $product = $this->productFactory->create();
        if (!$product instanceof Product) {
            throw new \RuntimeException('ProductInterfaceFactory did not return a catalog product model.');
        }
        $product->setSku($sku);
        $product->setName($name);
        $product->setTypeId($typeId);
        $product->setAttributeSetId(self::DEFAULT_ATTRIBUTE_SET);
        $product->setStatus(Status::STATUS_ENABLED);
        $product->setVisibility(Visibility::VISIBILITY_BOTH);
        $product->setWebsiteIds($this->getWebsiteIds());
        $product->setData('tax_class_id', 2);
        return $product;
    }

    /**
     * @return int[]
     */
    private function getWebsiteIds(): array
    {
        $ids = [];
        foreach ($this->storeManager->getWebsites() as $website) {
            $ids[] = (int) $website->getId();
        }
        return $ids;
    }

    private function exists(string $sku): bool
    {
        try {
            $this->productRepository->get($sku);
            return true;
        } catch (NoSuchEntityException $e) {
            return false;
        }
    }

    /**
     * Put the fixture into the Luma sample categories when they exist. A store
     * without the Luma sample data (or with another category tree) still gets
     * the product, reachable by its URL key; a missing category must never
     * abort setup:install, which runs this patch before any sample data when
     * the module is required up front.
     */
    private function assignToSampleCategories(string $sku): void
    {
        try {
            $this->categoryLinkManagement->assignProductToCategories($sku, self::CATEGORY_IDS);
        } catch (NoSuchEntityException $e) {
            $this->logger->warning(
                'HyperionSampleData: sample categories ' . implode(', ', self::CATEGORY_IDS)
                . ' not found, ' . $sku . ' created without category assignment'
            );
        }
    }
}
