<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleData\Setup\Patch\Data;

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
use Magento\Framework\Setup\ModuleDataSetupInterface;
use Magento\Framework\Setup\Patch\DataPatchInterface;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Creates one simple product that carries every customizable option
 * type (text field, text area, drop-down with a percent price,
 * checkboxes, date + time, file upload) so the PDP option renderers can
 * be exercised. Luma sample data ships no product with custom options.
 *
 * Idempotent: when the SKU already exists nothing is changed.
 */
class CreateCustomOptionsProduct implements DataPatchInterface
{
    public const SKU = 'HYP-CUSTOM-ENGRAVED-BOTTLE';

    private const CATEGORY_IDS = [3]; // Gear (Luma sample tree)
    private const DEFAULT_ATTRIBUTE_SET = 4;

    private const OPTIONS = [
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

    /**
     * @param ModuleDataSetupInterface $moduleDataSetup
     * @param ProductInterfaceFactory $productFactory
     * @param ProductRepositoryInterface $productRepository
     * @param ProductCustomOptionInterfaceFactory $optionFactory
     * @param ProductCustomOptionValuesInterfaceFactory $optionValueFactory
     * @param CategoryLinkManagementInterface $categoryLinkManagement
     * @param StoreManagerInterface $storeManager
     * @param AppState $appState
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly ModuleDataSetupInterface $moduleDataSetup,
        private readonly ProductInterfaceFactory $productFactory,
        private readonly ProductRepositoryInterface $productRepository,
        private readonly ProductCustomOptionInterfaceFactory $optionFactory,
        private readonly ProductCustomOptionValuesInterfaceFactory $optionValueFactory,
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
                if (!$this->exists()) {
                    $this->createProduct();
                }
            });
        } catch (\Throwable $e) {
            $this->logger->error('HyperionSampleData: CreateCustomOptionsProduct failed', ['exception' => $e]);
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

    /**
     * Build and save the product with its options.
     *
     * @return void
     */
    private function createProduct(): void
    {
        $product = $this->productFactory->create();
        if (!$product instanceof Product) {
            throw new \RuntimeException('ProductInterfaceFactory did not return a catalog product model.');
        }
        $product->setSku(self::SKU);
        $product->setName('Hyperion Engraved Bottle');
        $product->setTypeId(ProductType::TYPE_SIMPLE);
        $product->setAttributeSetId(self::DEFAULT_ATTRIBUTE_SET);
        $product->setStatus(Status::STATUS_ENABLED);
        $product->setVisibility(Visibility::VISIBILITY_BOTH);
        $product->setWebsiteIds($this->getWebsiteIds());
        $product->setPrice(25.0);
        $product->setData('weight', 0.4);
        $product->setData('tax_class_id', 2);
        $product->setData('url_key', 'hyperion-engraved-bottle');
        $product->setData(
            'description',
            '<p>Steel bottle personalised to order: engraving, finish, extras, delivery slot and your own artwork.</p>'
        );
        $product->setData('short_description', 'A bottle you configure with customizable options.');
        $product->setStockData(['use_config_manage_stock' => 1, 'qty' => 100, 'is_in_stock' => 1]);
        $product->setData('has_options', 1);
        $product->setData('can_save_custom_options', true);
        $product->setOptions($this->buildOptions());

        $saved = $this->productRepository->save($product);
        $this->assignToSampleCategories($saved->getSku());
    }

    /**
     * Option models from the OPTIONS definition.
     *
     * @return \Magento\Catalog\Api\Data\ProductCustomOptionInterface[]
     */
    private function buildOptions(): array
    {
        $options = [];
        foreach (self::OPTIONS as $position => $definition) {
            $option = $this->optionFactory->create();
            $option->setProductSku(self::SKU);
            $option->setTitle($definition['title']);
            $option->setType($definition['type']);
            $option->setIsRequire($definition['required']);
            $option->setSortOrder($position + 1);

            if (isset($definition['values'])) {
                $values = [];
                foreach ($definition['values'] as $valuePosition => $valueDefinition) {
                    $value = $this->optionValueFactory->create();
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

    /**
     * Ids of every website, so the product is visible on all of them.
     *
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

    /**
     * Whether the sample product is already there.
     *
     * @return bool
     */
    private function exists(): bool
    {
        try {
            $this->productRepository->get(self::SKU);
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
