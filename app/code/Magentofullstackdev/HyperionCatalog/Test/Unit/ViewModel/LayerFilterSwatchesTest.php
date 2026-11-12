<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Test\Unit\ViewModel;

use Magento\Catalog\Model\Layer\Filter\AbstractFilter;
use Magento\Catalog\Model\Layer\Filter\Item;
use Magento\Catalog\Model\ResourceModel\Eav\Attribute;
use Magento\Framework\UrlInterface;
use Magento\Swatches\Helper\Data as SwatchHelper;
use Magento\Swatches\Helper\Media as SwatchMediaHelper;
use Magento\Swatches\Model\Swatch;
use Magento\Theme\Block\Html\Pager;
use Magentofullstackdev\HyperionCatalog\ViewModel\LayerFilterSwatches;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class LayerFilterSwatchesTest extends TestCase
{
    public function testFilterWithoutAttributeModelIsNotASwatchFilter(): void
    {
        $swatchHelper = $this->createMock(SwatchHelper::class);
        $swatchHelper->expects($this->never())->method('isSwatchAttribute');
        $viewModel = new LayerFilterSwatches($swatchHelper, $this->createStub(SwatchMediaHelper::class), $this->createStub(LoggerInterface::class));
        $filter = $this->filter(null, []);

        $this->assertFalse($viewModel->isSwatchFilter($filter), 'the category filter has no attribute model');
        $this->assertFalse($viewModel->isVisualSwatchFilter($filter));
        $this->assertSame('', $viewModel->getAttributeCode($filter));
    }

    public function testDropdownAttributeIsNotASwatchFilter(): void
    {
        $viewModel = $this->viewModel(false, false, []);
        $filter = $this->filter($this->attribute('style_general'), [$this->item(10, 'Casual', 3)]);

        $this->assertFalse($viewModel->isSwatchFilter($filter));
        $this->assertFalse($viewModel->isVisualSwatchFilter($filter));
        $this->assertSame('style_general', $viewModel->getAttributeCode($filter));
    }

    public function testVisualColourSwatchesCarryTheHexAndTheLightFlag(): void
    {
        $viewModel = $this->viewModel(true, true, [
            49 => ['option_id' => 49, 'type' => Swatch::SWATCH_TYPE_VISUAL_COLOR, 'value' => '#000000'],
            59 => ['option_id' => 59, 'type' => Swatch::SWATCH_TYPE_VISUAL_COLOR, 'value' => '#FFFFFF'],
            61 => ['option_id' => 61, 'type' => Swatch::SWATCH_TYPE_VISUAL_COLOR, 'value' => 'red'],
        ]);
        $filter = $this->filter($this->attribute('color'), [
            $this->item(49, 'Black', 12),
            $this->item(59, 'White', 4),
            $this->item(61, 'Red', 2),
            $this->item(62, 'No swatch', 1),
            $this->item(0, 'Broken', 9),
        ]);

        $this->assertTrue($viewModel->isSwatchFilter($filter));
        $this->assertTrue($viewModel->isVisualSwatchFilter($filter));
        $this->assertSame([
            49 => ['type' => 'color', 'value' => '#000000', 'label' => 'Black', 'count' => 12, 'light' => false],
            59 => ['type' => 'color', 'value' => '#ffffff', 'label' => 'White', 'count' => 4, 'light' => true],
            61 => ['type' => 'text', 'value' => 'Red', 'label' => 'Red', 'count' => 2, 'light' => false],
            62 => ['type' => 'text', 'value' => 'No swatch', 'label' => 'No swatch', 'count' => 1, 'light' => false],
        ], $viewModel->getSwatches($filter), 'an invalid colour and a missing swatch fall back to the label, option 0 is skipped');
    }

    public function testImageSwatchesResolveTheThumbnailUrl(): void
    {
        $mediaHelper = $this->createMock(SwatchMediaHelper::class);
        $mediaHelper->expects($this->exactly(2))->method('getSwatchAttributeImage')
            ->willReturnCallback(static fn (string $type, string $file): string => $type === 'swatch_thumb' && $file === '/p/a/pattern.png'
                ? 'https://shop.test/media/attribute/swatch/swatch_thumb/110x90/p/a/pattern.png'
                : '');
        $viewModel = $this->viewModel(true, true, [
            70 => ['option_id' => 70, 'type' => Swatch::SWATCH_TYPE_VISUAL_IMAGE, 'value' => '/p/a/pattern.png'],
            71 => ['option_id' => 71, 'type' => Swatch::SWATCH_TYPE_VISUAL_IMAGE, 'value' => '/m/i/missing.png'],
        ], $mediaHelper);
        $filter = $this->filter($this->attribute('pattern'), [$this->item(70, 'Dots', 5), $this->item(71, 'Stripes', 6)]);

        $swatches = $viewModel->getSwatches($filter);
        $this->assertSame('image', $swatches[70]['type']);
        $this->assertSame('https://shop.test/media/attribute/swatch/swatch_thumb/110x90/p/a/pattern.png', $swatches[70]['value']);
        $this->assertFalse($swatches[70]['light']);
        $this->assertSame(['type' => 'text', 'value' => 'Stripes', 'label' => 'Stripes', 'count' => 6, 'light' => false], $swatches[71], 'an unresolvable image falls back to the label');
    }

    public function testTextSwatchesShowTheSwatchTextOrTheLabel(): void
    {
        $viewModel = $this->viewModel(true, false, [
            166 => ['option_id' => 166, 'type' => Swatch::SWATCH_TYPE_TEXTUAL, 'value' => 'XS'],
            167 => ['option_id' => 167, 'type' => Swatch::SWATCH_TYPE_TEXTUAL, 'value' => ''],
        ]);
        $filter = $this->filter($this->attribute('size'), [$this->item(166, 'Extra Small', 7), $this->item(167, '<b>Small</b>', 8)]);

        $this->assertTrue($viewModel->isSwatchFilter($filter));
        $this->assertFalse($viewModel->isVisualSwatchFilter($filter));
        $this->assertSame([
            166 => ['type' => 'text', 'value' => 'XS', 'label' => 'Extra Small', 'count' => 7, 'light' => false],
            167 => ['type' => 'text', 'value' => 'Small', 'label' => 'Small', 'count' => 8, 'light' => false],
        ], $viewModel->getSwatches($filter));
    }

    public function testFilterWithoutItemsAsksNothing(): void
    {
        $swatchHelper = $this->createMock(SwatchHelper::class);
        $swatchHelper->expects($this->never())->method('getSwatchesByOptionsId');
        $viewModel = new LayerFilterSwatches($swatchHelper, $this->createStub(SwatchMediaHelper::class), $this->createStub(LoggerInterface::class));

        $this->assertSame([], $viewModel->getSwatches($this->filter($this->attribute('color'), [])));
    }

    public static function lightProvider(): array
    {
        return [
            'white' => ['#ffffff', true],
            'white short' => ['#FFF', true],
            'near white' => ['#f5f5f5', true],
            'yellow' => ['#ffd500', false],
            'gray' => ['#8f8f8f', false],
            'black' => ['#000000', false],
            'not a colour' => ['red', false],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('lightProvider')]
    public function testLightColourDetection(string $hex, bool $expected): void
    {
        $viewModel = $this->viewModel(true, true, []);

        $this->assertSame($expected, $viewModel->isLight($hex));
    }

    private function viewModel(bool $isSwatch, bool $isVisual, array $rows, ?SwatchMediaHelper $mediaHelper = null): LayerFilterSwatches
    {
        $swatchHelper = $this->createStub(SwatchHelper::class);
        $swatchHelper->method('isSwatchAttribute')->willReturn($isSwatch);
        $swatchHelper->method('isVisualSwatch')->willReturn($isVisual);
        $swatchHelper->method('getSwatchesByOptionsId')->willReturnCallback(
            static fn (array $optionIds): array => array_intersect_key($rows, array_flip($optionIds))
        );

        return new LayerFilterSwatches(
            $swatchHelper,
            $mediaHelper ?? $this->createStub(SwatchMediaHelper::class),
            $this->createStub(LoggerInterface::class)
        );
    }

    private function attribute(string $code): Attribute
    {
        $attribute = $this->createStub(Attribute::class);
        $attribute->method('getAttributeCode')->willReturn($code);

        return $attribute;
    }

    /**
     * @param Item[] $items
     */
    private function filter(?Attribute $attribute, array $items): AbstractFilter
    {
        $filter = $this->createStub(AbstractFilter::class);
        $filter->method('getData')->willReturnCallback(
            static fn (string $key = '') => $key === 'attribute_model' ? $attribute : null
        );
        $filter->method('getItems')->willReturn($items);

        return $filter;
    }

    private function item(int $value, string $label, int $count): Item
    {
        return new Item(
            $this->createStub(UrlInterface::class),
            $this->createStub(Pager::class),
            ['value' => $value, 'label' => $label, 'count' => $count]
        );
    }
}
