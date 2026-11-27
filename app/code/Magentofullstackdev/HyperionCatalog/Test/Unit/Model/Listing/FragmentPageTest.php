<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Test\Unit\Model\Listing;

use Magento\Framework\App\ViewInterface;
use Magento\Framework\View\Result\Page;
use Magento\Framework\View\Result\PageFactory;
use Magentofullstackdev\HyperionCatalog\Model\Listing\FragmentPage;
use PHPUnit\Framework\TestCase;

/**
 * The fragment page holds only the fragment handle and is initialized once.
 */
class FragmentPageTest extends TestCase
{
    public function testThePageCarriesOnlyTheFragmentHandle(): void
    {
        $page = $this->createMock(Page::class);
        $page->expects(self::once())->method('addHandle')->with('hyperion_catalog_category_filter')->willReturnSelf();
        $page->expects(self::once())->method('initLayout')->willReturnSelf();
        $factory = $this->createMock(PageFactory::class);
        $factory->expects(self::once())
            ->method('create')
            ->with(false, ['load_default' => false])
            ->willReturn($page);

        $fragmentPage = new FragmentPage($factory, $this->createStub(ViewInterface::class));

        self::assertSame($page, $fragmentPage->create('hyperion_catalog_category_filter'));
    }

    /**
     * The dependency on App\View is the point of the class: the object manager creates it
     * (and the page it binds) before the fragment page.
     */
    public function testTheConstructorTakesTheApplicationView(): void
    {
        $types = array_map(
            static fn (\ReflectionParameter $parameter): string => (string) $parameter->getType(),
            (new \ReflectionMethod(FragmentPage::class, '__construct'))->getParameters()
        );

        self::assertContains(ViewInterface::class, $types);
    }
}
