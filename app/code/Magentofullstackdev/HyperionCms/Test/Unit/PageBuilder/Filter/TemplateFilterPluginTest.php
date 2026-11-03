<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCms\Test\Unit\PageBuilder\Filter;

use Magento\Framework\App\Area;
use Magento\Framework\App\State as AppState;
use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\Filter\Template as FrameworkTemplateFilter;
use Magento\Framework\View\Design\ThemeInterface;
use Magento\Framework\View\DesignInterface;
use Magentofullstackdev\HyperionCms\PageBuilder\ContentTypePool;
use Magentofullstackdev\HyperionCms\PageBuilder\Filter\TemplateFilterPlugin;
use Magentofullstackdev\HyperionCms\PageBuilder\Renderer\Slider;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class TemplateFilterPluginTest extends TestCase
{
    private const SLIDER_HTML = '<div data-content-type="row" data-appearance="contained" data-element="main">'
        . '<div class="pagebuilder-slider" data-content-type="slider" data-appearance="default"'
        . ' data-autoplay="true" data-autoplay-speed="3000" data-fade="false" data-infinite-loop="true"'
        . ' data-show-arrows="true" data-show-dots="false" data-element="main" data-pb-style="S1">'
        . '<div data-content-type="slide" data-slide-name="One" data-appearance="collage-left"'
        . ' data-show-button="hover" data-show-overlay="hover" data-element="main">'
        . '<div class="pagebuilder-slide-wrapper" data-element="wrapper" data-pb-style="W1">'
        . '<p>Caf&eacute;&nbsp;<br><img src="a.jpg" alt="A"></p></div></div>'
        . '</div></div>';

    private FrameworkTemplateFilter $filter;

    /** @var DesignInterface&Stub */
    private DesignInterface $design;

    /** @var AppState&Stub */
    private AppState $appState;

    protected function setUp(): void
    {
        $this->filter = $this->createStub(FrameworkTemplateFilter::class);
        $this->design = $this->createStub(DesignInterface::class);
        $this->appState = $this->createStub(AppState::class);
    }

    private function plugin(): TemplateFilterPlugin
    {
        $logger = $this->createStub(LoggerInterface::class);
        return new TemplateFilterPlugin(
            new ContentTypePool($logger, [new Slider($logger)]),
            $logger,
            $this->design,
            $this->appState,
            ['Magentofullstackdev/hyperion']
        );
    }

    /**
     * @param string[] $chain theme paths from the active theme up to the root
     */
    private function activeDesign(string $area, array $chain): void
    {
        if ($area === '') {
            $this->appState->method('getAreaCode')
                ->willThrowException(new LocalizedException(__('Area code is not set')));
        } else {
            $this->appState->method('getAreaCode')->willReturn($area);
        }
        $themes = [];
        foreach ($chain as $path) {
            $theme = $this->createStub(ThemeInterface::class);
            $theme->method('getThemePath')->willReturn($path);
            $themes[] = $theme;
        }
        $active = $this->createStub(ThemeInterface::class);
        $active->method('getInheritedThemes')->willReturn($themes);
        $this->design->method('getDesignTheme')->willReturn($active);
    }

    public function testContentWithoutHandledTypesIsReturnedUntouched(): void
    {
        $this->activeDesign(Area::AREA_FRONTEND, ['Magentofullstackdev/hyperion']);
        $html = '<style>#html-body [data-pb-style=A1]{display:flex}</style>'
            . '<div data-content-type="row" data-appearance="contained" data-element="main">'
            . '<div data-element="inner" data-pb-style="A1"><img src="a.jpg" alt="">caf&eacute;&nbsp;</div></div>';

        $this->assertSame($html, $this->plugin()->afterFilter($this->filter, $html));
    }

    public function testSliderBecomesComponentAndKeepsEverySetting(): void
    {
        $this->activeDesign(Area::AREA_FRONTEND, ['Magentofullstackdev/hyperion']);

        $result = $this->plugin()->afterFilter($this->filter, self::SLIDER_HTML);

        $this->assertStringContainsString('<hyperion-slider class="pagebuilder-slider"', $result);
        $this->assertStringNotContainsString('<div class="pagebuilder-slider"', $result);
        foreach (['data-autoplay="true"', 'data-autoplay-speed="3000"', 'data-show-dots="false"',
            'data-pb-style="S1"', 'data-content-type="slider"', 'prev-label="Previous"'] as $attribute) {
            $this->assertStringContainsString($attribute, $result);
        }
        $this->assertMatchesRegularExpression(
            '/<hyperion-slide [^>]*data-appearance="collage-left"[^>]*data-show-overlay="hover"/',
            $result
        );
        // Free-form slide markup (void elements, entities) survives the rewrite.
        $this->assertStringContainsString('<img src="a.jpg" alt="A">', $result);
        $this->assertStringContainsString('data-pb-style="W1"', $result);
        $this->assertStringContainsString('Café', html_entity_decode($result));
    }

    public function testChildThemeOfHyperionIsRewritten(): void
    {
        $this->activeDesign(Area::AREA_FRONTEND, ['Acme/storefront', 'Magentofullstackdev/hyperion']);

        $result = $this->plugin()->afterFilter($this->filter, self::SLIDER_HTML);

        $this->assertStringContainsString('<hyperion-slider', $result);
    }

    public function testOtherThemesKeepPageBuilderMarkup(): void
    {
        $this->activeDesign(Area::AREA_FRONTEND, ['Magento/luma', 'Magento/blank']);

        $this->assertSame(self::SLIDER_HTML, $this->plugin()->afterFilter($this->filter, self::SLIDER_HTML));
    }

    public function testAdminAreaIsLeftAlone(): void
    {
        $this->activeDesign(Area::AREA_ADMINHTML, ['Magentofullstackdev/hyperion']);

        $this->assertSame(self::SLIDER_HTML, $this->plugin()->afterFilter($this->filter, self::SLIDER_HTML));
    }

    public function testUnsetAreaIsLeftAlone(): void
    {
        $this->activeDesign('', ['Magentofullstackdev/hyperion']);

        $this->assertSame(self::SLIDER_HTML, $this->plugin()->afterFilter($this->filter, self::SLIDER_HTML));
    }
}
