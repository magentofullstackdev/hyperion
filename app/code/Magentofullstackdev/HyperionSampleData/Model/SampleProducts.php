<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleData\Model;

use Magento\Bundle\Api\Data\LinkInterfaceFactory;
use Magento\Bundle\Api\Data\OptionInterfaceFactory;
use Magento\Bundle\Model\Product\Price as BundlePrice;
use Magento\Bundle\Model\Product\Type as BundleType;
use Magento\Catalog\Api\CategoryLinkManagementInterface;
use Magento\Catalog\Api\Data\ProductCustomOptionInterfaceFactory;
use Magento\Catalog\Api\Data\ProductCustomOptionValuesInterfaceFactory;
use Magento\Catalog\Api\Data\ProductInterfaceFactory;
use Magento\Catalog\Api\ProductRepositoryInterface;
use Magento\Catalog\Model\Product;
use Magento\Catalog\Model\Product\Attribute\Source\Status;
use Magento\Catalog\Model\Product\Type as ProductType;
use Magento\Catalog\Model\Product\Visibility;
use Magento\Framework\App\Area;
use Magento\Framework\App\State as AppState;
use Magento\Framework\Exception\NoSuchEntityException;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Adds three products to a store that carries the Luma sample catalog, so
 * the product types the sample data lacks can be exercised: a virtual
 * product, a bundle built from Luma sample simples (a selection SKU that is
 * missing is skipped, an option without any selection is dropped) and a
 * simple product with every customizable option type (text field, text
 * area, drop-down with a percent price, checkboxes, date + time, file
 * upload).
 *
 * Nothing is created on a store without the sample catalog (recognized by
 * the SKU SAMPLE_CATALOG_SKU). Idempotent and order independent: a product
 * whose SKU exists is left untouched, and every run creates what is still
 * missing, so a run that came before the sample catalog is completed by a
 * later one. A failure is logged and never thrown: these products must not
 * abort a deployment.
 */
class SampleProducts
{
    public const SAMPLE_CATALOG_SKU = '24-MB01';
    public const VIRTUAL_SKU = 'HYP-VIRTUAL-GIFT-WRAP';
    public const BUNDLE_SKU = 'HYP-BUNDLE-TRAVEL-KIT';
    public const CUSTOM_OPTIONS_SKU = 'HYP-CUSTOM-ENGRAVED-BOTTLE';

    private const GEAR_CATEGORY_IDS = [3, 4]; // Gear, Gear > Bags (Luma sample tree)
    private const DEFAULT_ATTRIBUTE_SET = 4;

    private const BUNDLE_OPTIONS = [
        ['title' => 'Bag', 'type' => 'radio', 'required' => true, 'skus' => ['24-MB01', '24-MB04', '24-MB03']],
        ['title' => 'Accessories', 'type' => 'checkbox', 'required' => false, 'skus' => ['24-UG01', '24-UG02']],
    ];

    private const CUSTOM_OPTIONS = [
        ['title' => 'Engraving', 'type' => 'field', 'required' => true, 'price' => 5.0, 'max_characters' => 20],
        ['title' => 'Gift note', 'type' => 'area', 'required' => false, 'price' => 0.0, 'max_characters' => 200],
        ['title' => 'Finish', 'type' => 'drop_down', 'required' => true, 'values' => [
            ['title' => 'Brushed steel', 'price' => 0.0, 'price_type' => 'fixed'],
            ['title' => 'Matte black', 'price' => 3.0, 'price_type' => 'fixed'],
            ['title' => 'Gold plated', 'price' => 10.0, 'price_type' => 'percent'],
        ]],
        ['title' => 'Extras', 'type' => 'checkbox', 'required' => false, 'values' => [
            ['title' => 'Carabiner', 'price' => 2.0, 'price_type' => 'fixed'],
            ['title' => 'Neoprene sleeve', 'price' => 4.0, 'price_type' => 'fixed'],
        ]],
        ['title' => 'Preferred delivery', 'type' => 'date_time', 'required' => false, 'price' => 0.0],
        ['title' => 'Artwork', 'type' => 'file', 'required' => false, 'price' => 7.5,
            'file_extension' => 'png, jpg', 'image_size_x' => 2000, 'image_size_y' => 2000],
    ];

    public function __construct(
        private readonly ProductInterfaceFactory $productFactory,
        private readonly ProductRepositoryInterface $productRepository,
        private readonly OptionInterfaceFactory $bundleOptionFactory,
        private readonly LinkInterfaceFactory $linkFactory,
        private readonly ProductCustomOptionInterfaceFactory $customOptionFactory,
        private readonly ProductCustomOptionValuesInterfaceFactory $customOptionValueFactory,
        private readonly CategoryLinkManagementInterface $categoryLinkManagement,
        private readonly StoreManagerInterface $storeManager,
        private readonly AppState $appState,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Creates the products that are missing. Never throws.
     */
    public function create(): void
    {
        try {
            $this->appState->emulateAreaCode(Area::AREA_ADMINHTML, function (): void {
                if (!$this->exists(self::SAMPLE_CATALOG_SKU)) {
                    return;
                }
                $creators = [
                    self::VIRTUAL_SKU => $this->createVirtual(...),
                    self::BUNDLE_SKU => $this->createBundle(...),
                    self::CUSTOM_OPTIONS_SKU => $this->createCustomOptionsProduct(...),
                ];
                foreach ($creators as $sku => $create) {
                    try {
                        if (!$this->exists($sku)) {
                            $create();
                        }
                    } catch (\Throwable $e) {
                        $this->logger->error(
                            'HyperionSampleData: sample product ' . $sku . ' not created -- ' . $e->getMessage(),
                            ['exception' => $e]
                        );
                    }
                }
            });
        } catch (\Throwable $e) {
            $this->logger->error(
                'HyperionSampleData: sample products not created -- ' . $e->getMessage(),
                ['exception' => $e]
            );
        }
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
        $this->assignToSampleCategories((string) $saved->getSku(), self::GEAR_CATEGORY_IDS);
        $this->logger->info('HyperionSampleData: created virtual product ' . self::VIRTUAL_SKU);
    }

    private function createBundle(): void
    {
        $options = [];
        $position = 0;
        foreach (self::BUNDLE_OPTIONS as $definition) {
            $links = [];
            foreach ($definition['skus'] as $index => $sku) {
                if (!$this->exists((string) $sku)) {
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
            $option = $this->bundleOptionFactory->create();
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
        $this->assignToSampleCategories((string) $saved->getSku(), self::GEAR_CATEGORY_IDS);
        $this->logger->info('HyperionSampleData: created bundle product ' . self::BUNDLE_SKU);
    }

    private function createCustomOptionsProduct(): void
    {
        $product = $this->newProduct(self::CUSTOM_OPTIONS_SKU, 'Hyperion Engraved Bottle', ProductType::TYPE_SIMPLE);
        $product->setPrice(25.0);
        $product->setData('weight', 0.4);
        $product->setData('url_key', 'hyperion-engraved-bottle');
        $product->setData(
            'description',
            '<p>Steel bottle personalized to order: engraving, finish, extras, delivery slot and your own artwork.</p>'
        );
        $product->setData('short_description', 'A bottle you configure with customizable options.');
        $product->setStockData(['use_config_manage_stock' => 1, 'qty' => 100, 'is_in_stock' => 1]);
        $product->setData('has_options', 1);
        $product->setData('can_save_custom_options', true);
        $product->setOptions($this->buildCustomOptions());

        $saved = $this->productRepository->save($product);
        $this->assignToSampleCategories((string) $saved->getSku(), [self::GEAR_CATEGORY_IDS[0]]);
        $this->logger->info('HyperionSampleData: created simple product ' . self::CUSTOM_OPTIONS_SKU);
    }

    /**
     * Option models from the CUSTOM_OPTIONS definition.
     *
     * @return \Magento\Catalog\Api\Data\ProductCustomOptionInterface[]
     */
    private function buildCustomOptions(): array
    {
        $options = [];
        foreach (self::CUSTOM_OPTIONS as $position => $definition) {
            $option = $this->customOptionFactory->create();
            $option->setProductSku(self::CUSTOM_OPTIONS_SKU);
            $option->setTitle($definition['title']);
            $option->setType($definition['type']);
            $option->setIsRequire($definition['required']);
            $option->setSortOrder($position + 1);

            if (isset($definition['values'])) {
                $values = [];
                foreach ($definition['values'] as $valuePosition => $valueDefinition) {
                    $value = $this->customOptionValueFactory->create();
                    $value->setTitle($valueDefinition['title']);
                    $value->setPrice($valueDefinition['price']);
                    $value->setPriceType($valueDefinition['price_type']);
                    $value->setSortOrder($valuePosition + 1);
                    $values[] = $value;
                }
                $option->setValues($values);
            } else {
                $option->setPrice($definition['price']);
                $option->setPriceType('fixed');
            }
            if (isset($definition['max_characters'])) {
                $option->setMaxCharacters($definition['max_characters']);
            }
            if (isset($definition['file_extension'])) {
                $option->setFileExtension($definition['file_extension']);
                $option->setImageSizeX($definition['image_size_x']);
                $option->setImageSizeY($definition['image_size_y']);
            }
            $options[] = $option;
        }
        return $options;
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
     * Put the product into the Luma sample categories when they exist; with
     * another category tree it stays reachable by its URL key.
     *
     * @param int[] $categoryIds
     */
    private function assignToSampleCategories(string $sku, array $categoryIds): void
    {
        try {
            $this->categoryLinkManagement->assignProductToCategories($sku, $categoryIds);
        } catch (NoSuchEntityException $e) {
            $this->logger->warning(
                'HyperionSampleData: sample categories ' . implode(', ', $categoryIds)
                . ' not found, ' . $sku . ' created without category assignment'
            );
        }
    }
}
