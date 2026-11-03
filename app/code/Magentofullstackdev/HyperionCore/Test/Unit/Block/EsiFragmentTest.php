<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Block;

use Magentofullstackdev\HyperionCore\Block\EsiFragment;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Escaper;
use Magento\Framework\Event\ManagerInterface as EventManagerInterface;
use Magento\Framework\Filesystem;
use Magento\Framework\Filesystem\Directory\ReadInterface;
use Magento\Framework\ObjectManagerInterface;
use Magento\Framework\View\Element\BlockInterface;
use Magento\Framework\View\Element\Template\Context;
use Magento\Framework\View\Element\Template\File\Resolver;
use Magento\Framework\View\Element\Template\File\Validator;
use Magento\Framework\View\LayoutInterface;
use Magento\Framework\View\TemplateEngine\Php as PhpTemplateEngine;
use Magento\Framework\View\TemplateEnginePool;
use Magento\PageCache\Model\Config as PageCacheConfig;
use PHPUnit\Framework\TestCase;

/**
 * ESI fallback renders inline when no ESI-capable edge is in front.
 *
 * For any EsiFragment block instance, when supportsEsi() returns false, the
 * toHtml() method SHALL return a non-empty HTML string that does not contain
 * an <esi:include> tag: the inline child block renders in place.
 *
 * The real esi/fragment.phtml is rendered through the PHP template engine so
 * the three modes are exercised end to end.
 *
 * @group hyperion-theme
 * @covers \Magentofullstackdev\HyperionCore\Block\EsiFragment
 */
class EsiFragmentTest extends TestCase
{
    private const TEMPLATE = 'Magentofullstackdev_HyperionCore::esi/fragment.phtml';
    private const TEMPLATE_FILE = __DIR__ . '/../../../view/frontend/templates/esi/fragment.phtml';

    public function testFallbackRendersInlineWhenEsiDisabled(): void
    {
        $block = $this->makeBlock(
            surrogateCapability: '',
            esiUrl: '/hyperion/checkout/minicart/fragment',
            childHtml: '<div class="minicart-inline">Cart (0)</div>'
        );

        self::assertFalse($block->supportsEsi());

        $html = $block->toHtml();

        self::assertNotEmpty($html, 'Inline fallback must render non-empty HTML.');
        self::assertStringNotContainsString('<esi:include', $html, 'No <esi:include> tag when ESI is disabled.');
        self::assertStringContainsString('minicart-inline', $html, 'Child block HTML is rendered inline.');
    }

    public function testFallbackRendersInlineWhenEdgeLacksEsiCapability(): void
    {
        // A cache in front that does not advertise ESI/1.0 gets the inline markup.
        $block = $this->makeBlock(
            surrogateCapability: 'varnish="Surrogate/1.0"',
            esiUrl: '/hyperion/checkout/minicart/fragment',
            childHtml: '<span>cart</span>'
        );

        self::assertFalse($block->supportsEsi());
        self::assertStringNotContainsString('<esi:include', $block->toHtml());
    }

    public function testEsiIncludeEmittedWhenEdgeSupportsEsi(): void
    {
        $block = $this->makeBlock(
            surrogateCapability: 'varnish="ESI/1.0"',
            esiUrl: '/hyperion/checkout/minicart/fragment',
            childHtml: '<span>cart</span>'
        );

        self::assertTrue($block->supportsEsi());
        self::assertStringContainsString(
            '<esi:include src="/hyperion/checkout/minicart/fragment"',
            $block->toHtml()
        );
    }

    public function testClientHeaderIgnoredWhenPageCacheIsBuiltIn(): void
    {
        $block = $this->makeBlock(
            surrogateCapability: 'x=ESI/1.0',
            esiUrl: '/hyperion/navigation/menu',
            childHtml: '<nav>menu</nav>',
            cacheType: PageCacheConfig::BUILT_IN
        );

        self::assertFalse($block->supportsEsi());
        $html = $block->toHtml();
        self::assertStringNotContainsString('<esi:include', $html);
        self::assertStringContainsString('<nav>menu</nav>', $html);
    }

    public function testClientHeaderIgnoredWhenPageCacheIsDisabled(): void
    {
        $block = $this->makeBlock(
            surrogateCapability: 'varnish=ESI/1.0',
            esiUrl: '/hyperion/navigation/menu',
            childHtml: '<nav>menu</nav>',
            cacheEnabled: false
        );

        self::assertFalse($block->supportsEsi());
        self::assertStringNotContainsString('<esi:include', $block->toHtml());
    }

    public function testHtmxPlaceholderRenderedWhenNoEsiAndNoInlineChild(): void
    {
        $block = $this->makeBlock(
            surrogateCapability: '',
            esiUrl: '/hyperion/checkout/minicart/fragment',
            childHtml: null
        );

        $html = $block->toHtml();

        self::assertStringNotContainsString('<esi:include', $html);
        self::assertStringContainsString('hx-get="/hyperion/checkout/minicart/fragment"', $html);
        self::assertStringContainsString('hx-trigger="load"', $html);
    }

    /**
     * @param string|null $childHtml Output of the `inline` child, null when no child is declared.
     */
    private function makeBlock(
        string $surrogateCapability,
        string $esiUrl,
        ?string $childHtml,
        int $cacheType = PageCacheConfig::VARNISH,
        bool $cacheEnabled = true
    ): EsiFragment {
        $pageCacheConfig = $this->createStub(PageCacheConfig::class);
        $pageCacheConfig->method('getType')->willReturn($cacheType);
        $pageCacheConfig->method('isEnabled')->willReturn($cacheEnabled);

        $httpRequest = $this->createStub(HttpRequest::class);
        $httpRequest->method('getHeader')
            ->willReturn($surrogateCapability === '' ? false : $surrogateCapability);

        $escaper = $this->createStub(Escaper::class);
        $escaper->method('escapeUrl')
            ->willReturnCallback(static fn (string $url): string => htmlspecialchars($url, ENT_QUOTES, 'UTF-8'));
        $escaper->method('escapeHtmlAttr')
            ->willReturnCallback(static fn (string $value): string => htmlspecialchars($value, ENT_QUOTES, 'UTF-8'));

        $eventManager = $this->createStub(EventManagerInterface::class);

        $layout = $this->createStub(LayoutInterface::class);
        if ($childHtml !== null) {
            $layout->method('getChildName')->willReturn('test.esi.inline');
            $layout->method('getBlock')->willReturn($this->createStub(BlockInterface::class));
            $layout->method('renderElement')->willReturn($childHtml);
        } else {
            $layout->method('getChildName')->willReturn(false);
        }

        $rootDirectory = $this->createStub(ReadInterface::class);
        $rootDirectory->method('getRelativePath')->willReturnArgument(0);
        $filesystem = $this->createStub(Filesystem::class);
        $filesystem->method('getDirectoryRead')->willReturn($rootDirectory);

        $resolver = $this->createStub(Resolver::class);
        $resolver->method('getTemplateFileName')->willReturn(realpath(self::TEMPLATE_FILE));

        $validator = $this->createStub(Validator::class);
        $validator->method('isValid')->willReturn(true);

        $enginePool = $this->createStub(TemplateEnginePool::class);
        $enginePool->method('get')
            ->willReturn(new PhpTemplateEngine(
                $this->createStub(ObjectManagerInterface::class),
                // Templates escape through the engine-provided $escaper, as they do at runtime.
                ['escaper' => $escaper]
            ));

        $context = $this->templateContext([
            'escaper' => $escaper,
            'eventManager' => $eventManager,
            'layout' => $layout,
            'filesystem' => $filesystem,
            'resolver' => $resolver,
            'validator' => $validator,
            'enginePool' => $enginePool,
        ]);

        return new EsiFragment($context, $httpRequest, $pageCacheConfig, [
            'template' => self::TEMPLATE,
            'fragment_url' => $esiUrl,
            'element_id' => 'test-esi-fragment',
        ]);
    }

    /**
     * The block context with the given dependencies and a stub for every
     * other constructor argument (the unit test helper's ObjectManager would
     * hand out mocks, which PHPUnit expects to carry expectations).
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
