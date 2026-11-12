<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionNavigation\Test\Unit\Block;

use Magentofullstackdev\HyperionNavigation\Block\Footer;
use Magentofullstackdev\HyperionNavigation\Model\LogoResolver;
use Magentofullstackdev\HyperionNavigation\Model\StoreBrand;
use Magento\Catalog\Helper\Category as CategoryHelper;
use Magento\Catalog\Model\ResourceModel\Category\CollectionFactory;
use Magento\Cms\Api\Data\BlockInterface as CmsBlockInterface;
use Magento\Cms\Api\GetBlockByIdentifierInterface;
use Magento\Cms\Helper\Page as CmsPageHelper;
use Magento\Cms\Model\Template\Filter as CmsFilter;
use Magento\Cms\Model\Template\FilterProvider;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Exception\NoSuchEntityException;
use Magento\Framework\Phrase;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\Html\Link\Current as CurrentLink;
use Magento\Framework\View\Element\Template;
use Magento\Framework\View\Element\Template\Context;
use Magento\Framework\View\LayoutInterface;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The footer lists the links modules add to core's `footer_links` block, prints the
 * merchant's brand and renders the optional about block.
 *
 * @covers \Magentofullstackdev\HyperionNavigation\Block\Footer
 */
class FooterTest extends TestCase
{
    private const BASE_URL = 'https://shop.test/';

    public function testServiceLinksAreCollectedFromTheCoreFooterLinksBlock(): void
    {
        $footer = $this->makeFooter(children: [
            'search-term-popular-link' => $this->link('Search Terms', 'search/term/popular'),
            'catalog-search-advanced-link' => $this->link('Advanced Search', 'catalogsearch/advanced'),
        ]);

        self::assertSame(
            [
                ['label' => 'Search Terms', 'url' => self::BASE_URL . 'search/term/popular/'],
                ['label' => 'Advanced Search', 'url' => self::BASE_URL . 'catalogsearch/advanced/'],
            ],
            $footer->getServiceLinks()
        );
    }

    public function testLinkToAPageTheFooterAlreadyListsIsDropped(): void
    {
        $footer = $this->makeFooter(children: [
            'contact-us-link' => $this->link('Contact Us', 'contact'),
            'sales-guest-form-link' => $this->link('Orders and Returns', 'sales/guest/form'),
            // Core builds this one with a trailing slash, the CMS helper without it.
            'privacy-policy-link' => $this->link('Privacy and Cookie Policy', 'privacy-policy'),
            'catalog-search-advanced-link' => $this->link('Advanced Search', 'catalogsearch/advanced'),
        ]);

        self::assertSame(
            [['label' => 'Advanced Search', 'url' => self::BASE_URL . 'catalogsearch/advanced/']],
            $footer->getServiceLinks()
        );
    }

    public function testLinkAddedTwiceIsListedOnce(): void
    {
        $footer = $this->makeFooter(children: [
            'first' => $this->link('Advanced Search', 'catalogsearch/advanced'),
            'second' => $this->link('Find products', 'catalogsearch/advanced/index'),
        ]);

        self::assertSame(
            [['label' => 'Advanced Search', 'url' => self::BASE_URL . 'catalogsearch/advanced/']],
            $footer->getServiceLinks()
        );
    }

    public function testChildWithoutAnHrefIsSkipped(): void
    {
        $plainBlock = $this->createStub(Template::class);
        $plainBlock->method('getData')->willReturn('Not a link');

        $footer = $this->makeFooter(children: [
            'plain' => $plainBlock,
            'rss-link' => $this->link('RSS', 'rss'),
        ]);

        self::assertSame(
            [['label' => 'RSS', 'url' => self::BASE_URL . 'rss/']],
            $footer->getServiceLinks()
        );
    }

    public function testLinkWithoutALabelIsSkipped(): void
    {
        $footer = $this->makeFooter(children: ['empty' => $this->link('', 'rss')]);

        self::assertSame([], $footer->getServiceLinks());
    }

    public function testLayoutFailureIsLoggedAndGivesNoLinks(): void
    {
        $layout = $this->createStub(LayoutInterface::class);
        $layout->method('getChildBlocks')->willThrowException(new \RuntimeException('broken layout'));

        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())
            ->method('error')
            ->with(self::stringContains('broken layout'));

        $footer = $this->makeFooter(layout: $layout, logger: $logger);

        self::assertSame([], $footer->getServiceLinks());
    }

    public function testStoreNameIsTheBrandName(): void
    {
        self::assertSame('Acme Outdoor', $this->makeFooter()->getStoreName());
    }

    public function testAboutParagraphIsEmptyWhenTheStoreHasNoAboutBlock(): void
    {
        $footer = $this->makeFooter();

        self::assertSame('', $footer->getAboutHtml());
        self::assertSame(['cms_b_hyperion-footer-about'], $footer->getIdentities());
    }

    public function testAboutParagraphIsTheFilteredContentOfTheActiveBlock(): void
    {
        $footer = $this->makeFooter(aboutBlock: $this->cmsBlock(active: true));

        self::assertSame('[filtered]<p>About {{config path="x"}}</p>', $footer->getAboutHtml());
        self::assertSame(['cms_b_hyperion-footer-about', 'cms_b_7'], $footer->getIdentities());
    }

    public function testInactiveAboutBlockIsIgnored(): void
    {
        $footer = $this->makeFooter(aboutBlock: $this->cmsBlock(active: false));

        self::assertSame('', $footer->getAboutHtml());
        self::assertSame(['cms_b_hyperion-footer-about'], $footer->getIdentities());
    }

    /**
     * A core footer link: the label is block data, the URL comes from the path.
     */
    private function link(string $label, string $path): CurrentLink
    {
        $link = $this->createStub(CurrentLink::class);
        $link->method('getData')
            ->willReturnCallback(static fn (string $key = ''): ?string => $key === 'label' ? $label : null);
        $link->method('getHref')->willReturn(self::BASE_URL . $path . '/');

        return $link;
    }

    private function cmsBlock(bool $active): CmsBlockInterface
    {
        $block = $this->createStub(CmsBlockInterface::class);
        $block->method('isActive')->willReturn($active);
        $block->method('getId')->willReturn(7);
        $block->method('getContent')->willReturn('<p>About {{config path="x"}}</p>');

        return $block;
    }

    /**
     * @param array<string, object> $children child blocks of core's `footer_links`
     */
    private function makeFooter(
        array $children = [],
        ?LayoutInterface $layout = null,
        ?LoggerInterface $logger = null,
        ?CmsBlockInterface $aboutBlock = null
    ): Footer {
        if ($layout === null) {
            $layout = $this->createStub(LayoutInterface::class);
            $layout->method('getChildBlocks')
                ->willReturnCallback(static fn (string $parent): array => $parent === 'footer_links' ? $children : []);
        }

        $urlBuilder = $this->createStub(UrlInterface::class);
        $urlBuilder->method('getUrl')
            ->willReturnCallback(static fn (?string $route = null): string => self::BASE_URL . $route . '/');

        $store = $this->createStub(Store::class);
        $store->method('getId')->willReturn(1);
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getStore')->willReturn($store);

        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')
            ->willReturnCallback(static fn (string $path): ?string => match ($path) {
                'hyperion/footer/privacy_cms_identifier' => 'privacy-policy',
                default => null,
            });

        $cmsPageHelper = $this->createStub(CmsPageHelper::class);
        $cmsPageHelper->method('getPageUrl')
            ->willReturnCallback(static fn (?string $identifier = null): string => self::BASE_URL . $identifier);

        $storeBrand = $this->createStub(StoreBrand::class);
        $storeBrand->method('getName')->willReturn('Acme Outdoor');

        $getBlockByIdentifier = $this->createStub(GetBlockByIdentifierInterface::class);
        if ($aboutBlock === null) {
            $getBlockByIdentifier->method('execute')
                ->willThrowException(new NoSuchEntityException(new Phrase('No such block.')));
        } else {
            $getBlockByIdentifier->method('execute')->willReturn($aboutBlock);
        }

        $filter = $this->createStub(CmsFilter::class);
        $filter->method('filter')
            ->willReturnCallback(static fn (string $content): string => '[filtered]' . $content);
        $filterProvider = $this->createStub(FilterProvider::class);
        $filterProvider->method('getBlockFilter')->willReturn($filter);

        return new Footer(
            $this->templateContext(['layout' => $layout, 'urlBuilder' => $urlBuilder]),
            $storeManager,
            $scopeConfig,
            $cmsPageHelper,
            $this->createStub(CollectionFactory::class),
            $this->createStub(CategoryHelper::class),
            $this->createStub(LogoResolver::class),
            $logger ?? $this->createStub(LoggerInterface::class),
            $storeBrand,
            $getBlockByIdentifier,
            $filterProvider
        );
    }

    /**
     * The block context with the given dependencies and a stub for every other constructor
     * argument (the unit test helper's ObjectManager would hand out mocks, which PHPUnit
     * expects to carry expectations).
     *
     * @param array<string, object> $dependencies keyed by constructor parameter name
     */
    private function templateContext(array $dependencies): Context
    {
        $arguments = [];
        foreach ((new \ReflectionClass(Context::class))->getConstructor()?->getParameters() ?? [] as $parameter) {
            $name = $parameter->getName();
            if (isset($dependencies[$name])) {
                $arguments[$name] = $dependencies[$name];
                continue;
            }
            $type = $parameter->getType();
            if ($type instanceof \ReflectionNamedType && !$type->isBuiltin()) {
                // Also for the optional ones: a null makes the context ask the global object manager.
                /** @var class-string $class */
                $class = $type->getName();
                $arguments[$name] = $this->createStub($class);
            } elseif ($parameter->isDefaultValueAvailable()) {
                $arguments[$name] = $parameter->getDefaultValue();
            } else {
                self::fail(sprintf('No stub for the context argument $%s.', $name));
            }
        }

        return new Context(...$arguments);
    }
}
