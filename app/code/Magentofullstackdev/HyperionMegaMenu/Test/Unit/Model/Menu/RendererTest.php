<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Test\Unit\Model\Menu;

use Magento\Framework\Escaper;
use Magento\Framework\Translate\InlineInterface;
use Magentofullstackdev\HyperionMegaMenu\Model\Group;
use Magentofullstackdev\HyperionMegaMenu\Model\Menu\Renderer;
use Magentofullstackdev\HyperionMegaMenu\Model\Menu\Tree;
use Magentofullstackdev\HyperionNavigation\Model\Menu\SourceInterface;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionMegaMenu\Model\Menu\Renderer
 */
class RendererTest extends TestCase
{
    public function testDesktopMegaPanelColumnsBadgesAndEscaping(): void
    {
        $html = $this->renderer()->render($this->tree(Group::TYPE_MEGA_HORIZONTAL), SourceInterface::DEVICE_DESKTOP);

        self::assertStringContainsString('<ul class="flex flex-col lg:flex-row lg:items-center gap-0" data-hyperion-topmenu data-hyperion-megamenu="main_navigation">', $html);
        self::assertStringContainsString('data-hyperion-mega-item', $html);
        self::assertStringContainsString('<div class="hidden" data-hyperion-submenu data-hyperion-mega-panel><div class="container mx-auto px-4 py-6 grid grid-cols-12 gap-6">', $html);
        self::assertStringContainsString('<div class="col-span-3 min-w-0" data-hyperion-mega-column>', $html);
        self::assertStringContainsString('<div class="col-span-6 min-w-0" data-hyperion-mega-column data-hyperion-mega-block><p>Promo</p></div>', $html);
        self::assertStringContainsString('data-hyperion-badge>SALE</span>', $html);
        self::assertStringContainsString('bg-error text-on-error', $html);
        self::assertStringContainsString('Tops &amp; &lt;b&gt;', $html, 'titles are escaped');
        self::assertStringContainsString('target="_blank" rel="noopener nofollow"', $html);
        self::assertStringContainsString('<span class="flex-1 inline-flex items-center gap-1.5 px-4 py-3 lg:py-2 text-primary font-medium hover:text-accent focus:outline-none focus:ring-2 focus:ring-primary rounded" data-hyperion-menu-label>Account</span>', $html);
        self::assertStringContainsString('<ul class="hidden" data-hyperion-submenu><li class="">', $html, 'a simple dropdown is a flyout');
        self::assertStringContainsString('class="border-b border-subtle lg:border-0 promo-root"', $html, 'custom classes are added');
        self::assertStringNotContainsString('<script', $html);
    }

    public function testListGroupsNeverOpenMegaPanels(): void
    {
        $html = $this->renderer()->render($this->tree(Group::TYPE_H_LIST), SourceInterface::DEVICE_DESKTOP);

        self::assertStringNotContainsString('data-hyperion-mega-panel', $html);
        self::assertStringContainsString('<li class="px-4 py-2" data-hyperion-mega-block><p>Promo</p></li>', $html, 'a block inside a flyout prints its content');
    }

    public function testMobileAccordionNestsEveryLevelBehindToggles(): void
    {
        $html = $this->renderer()->render($this->tree(Group::TYPE_MEGA_HORIZONTAL), SourceInterface::DEVICE_MOBILE);

        self::assertStringContainsString('<ul class="flex flex-col gap-0" data-hyperion-topmenu', $html);
        self::assertStringNotContainsString('data-hyperion-mega-panel', $html);
        self::assertStringContainsString('<ul class="hidden pl-4" data-hyperion-submenu>', $html);
        self::assertSame(3, substr_count($html, 'data-hyperion-submenu-toggle'), 'Women, Tops and Account have children');
        self::assertStringContainsString('data-hyperion-badge>SALE</span>', $html);
    }

    public function testAnEmptyTreeRendersNothing(): void
    {
        $group = $this->createStub(Group::class);
        self::assertSame('', $this->renderer()->render(new Tree($group, [], []), SourceInterface::DEVICE_DESKTOP));
    }

    private function renderer(): Renderer
    {
        // escapeHtmlAttr() needs the Laminas escaper the framework otherwise resolves through the object manager.
        $escaper = new Escaper();
        $property = new \ReflectionProperty(Escaper::class, 'escaper');
        $property->setValue($escaper, new \Laminas\Escaper\Escaper());
        $inline = $this->createStub(InlineInterface::class);
        $inline->method('isAllowed')->willReturn(false);
        $property = new \ReflectionProperty(Escaper::class, 'translateInline');
        $property->setValue($escaper, $inline);

        return new Renderer($escaper);
    }

    private function tree(string $type): Tree
    {
        $group = $this->createStub(Group::class);
        $group->method('getMenuType')->willReturn($type);
        $group->method('getIdentifier')->willReturn('main_navigation');
        $node = static fn (string $id, string $title, ?string $url, array $extra = []): array => array_merge([
            'id' => $id, 'title' => $title, 'url' => $url, 'target' => '', 'type' => 'custom', 'link_target' => '_self',
            'nofollow' => false, 'class' => '', 'badge' => null, 'width' => 0, 'container' => true, 'html' => '',
            'level' => 0, 'children_depth' => 0, 'children' => [],
        ], $extra);
        $women = $node('i1', 'Women', '/women.html', ['width' => 12, 'class' => 'promo-root', 'children' => [
            $node('i2', 'Tops & <b>', '/tops.html', ['width' => 3, 'level' => 1, 'children' => [$node('i3', 'Jackets', '/jackets.html', ['level' => 2])]]),
            $node('i4', 'Promo', null, ['type' => 'cms_block', 'width' => 6, 'html' => '<p>Promo</p>', 'level' => 1]),
        ]]);
        $men = $node('i5', 'Men', '/men.html', ['badge' => ['text' => 'SALE', 'color' => 'danger']]);
        $docs = $node('i6', 'Docs', 'https://example.com/docs', ['link_target' => '_blank', 'nofollow' => true]);
        $account = $node('i7', 'Account', null, ['type' => 'empty', 'children' => [$node('i8', 'Sign In', '/customer/account/login/', ['level' => 1])]]);

        return new Tree($group, [$women, $men, $docs, $account], ['hyperion_megamenu']);
    }
}
