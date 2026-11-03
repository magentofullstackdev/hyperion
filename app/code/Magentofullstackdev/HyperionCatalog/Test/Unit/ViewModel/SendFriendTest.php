<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Test\Unit\ViewModel;

use Magento\Catalog\Helper\Product as ProductHelper;
use Magento\Catalog\Model\Product;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\Http\Context as HttpContext;
use Magento\Framework\Module\Manager as ModuleManager;
use Magentofullstackdev\HyperionCatalog\ViewModel\SendFriend;
use PHPUnit\Framework\TestCase;

class SendFriendTest extends TestCase
{
    private bool $moduleEnabled = true;
    /** @var array<string, bool> */
    private array $flags = [];
    private bool $loggedIn = false;
    private SendFriend $viewModel;

    protected function setUp(): void
    {
        $moduleManager = $this->createStub(ModuleManager::class);
        $moduleManager->method('isEnabled')->willReturnCallback(fn () => $this->moduleEnabled);
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('isSetFlag')->willReturnCallback(fn (string $path) => $this->flags[$path] ?? false);
        $httpContext = $this->createStub(HttpContext::class);
        $httpContext->method('getValue')->willReturnCallback(fn () => $this->loggedIn ? 1 : 0);
        $helper = $this->createStub(ProductHelper::class);
        $helper->method('getEmailToFriendUrl')->willReturnCallback(
            fn (Product $product) => 'https://shop.test/sendfriend/product/send/id/' . $product->getId() . '/'
        );
        $this->viewModel = new SendFriend($moduleManager, $scopeConfig, $httpContext, $helper);
    }

    public function testDisabledFeatureHidesTheLinkForEveryone(): void
    {
        $this->flags = [SendFriend::XML_PATH_ALLOW_GUEST => true];
        $this->assertFalse($this->viewModel->canEmailToFriend(), 'guest');
        $this->loggedIn = true;
        $this->assertFalse($this->viewModel->canEmailToFriend(), 'customer');
    }

    public function testGuestsNeedTheAllowGuestFlag(): void
    {
        $this->flags = [SendFriend::XML_PATH_ENABLED => true];
        $this->assertFalse($this->viewModel->canEmailToFriend(), 'guest without allow_guest');
        $this->flags[SendFriend::XML_PATH_ALLOW_GUEST] = true;
        $this->assertTrue($this->viewModel->canEmailToFriend(), 'guest with allow_guest');
    }

    public function testCustomersOnlyNeedTheFeature(): void
    {
        $this->flags = [SendFriend::XML_PATH_ENABLED => true];
        $this->loggedIn = true;
        $this->assertTrue($this->viewModel->canEmailToFriend());
    }

    public function testAMissingModuleHidesTheLink(): void
    {
        $this->flags = [SendFriend::XML_PATH_ENABLED => true, SendFriend::XML_PATH_ALLOW_GUEST => true];
        $this->moduleEnabled = false;
        $this->assertFalse($this->viewModel->canEmailToFriend());
    }

    public function testUrlComesFromTheCatalogHelper(): void
    {
        $product = $this->createStub(Product::class);
        $product->method('getId')->willReturn(42);
        $this->assertSame('https://shop.test/sendfriend/product/send/id/42/', $this->viewModel->getUrl($product));
    }
}
