<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionNavigation\Test\Unit\Model;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Store\Api\Data\GroupInterface;
use Magento\Store\Api\Data\WebsiteInterface;
use Magento\Store\Model\ScopeInterface;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionNavigation\Model\StoreBrand;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionNavigation\Model\StoreBrand
 */
class StoreBrandTest extends TestCase
{
    /** @var string[] */
    private array $errors = [];

    /**
     * @return array<string, array{0: ?string, 1: string, 2: string, 3: string, 4: string}>
     */
    public static function nameSources(): array
    {
        return [
            'the configured store name wins' => ['Acme Outdoor', 'Main Website Store', 'Main Website', 'https://shop.example.com/', 'Acme Outdoor'],
            'surrounding blanks are not a name' => ['  Acme Outdoor ', 'Main Website Store', 'Main Website', 'https://shop.example.com/', 'Acme Outdoor'],
            'no store name: the store group' => [null, 'Acme Store', 'Main Website', 'https://shop.example.com/', 'Acme Store'],
            'a blank store name: the store group' => ['   ', 'Acme Store', 'Main Website', 'https://shop.example.com/', 'Acme Store'],
            'no group name: the website' => ['', '', 'Acme Website', 'https://shop.example.com/', 'Acme Website'],
            'no name at all: the host of the base URL' => ['', '', '', 'https://shop.example.com/it/', 'shop.example.com'],
            'nothing usable' => ['', '', '', '', ''],
        ];
    }

    #[DataProvider('nameSources')]
    public function testTheBrandNameFallsBackFromTheStoreNameToTheHost(
        ?string $configured,
        string $groupName,
        string $websiteName,
        string $baseUrl,
        string $expected
    ): void {
        $brand = $this->brand($configured, $groupName, $websiteName, $baseUrl);

        self::assertSame($expected, $brand->getName());
        self::assertSame([], $this->errors);
    }

    public function testTheStoreViewNameIsNeverTheBrand(): void
    {
        $brand = $this->brand('', '', '', '', 'Italiano');

        self::assertSame('', $brand->getName());
    }

    public function testAFailingSourceIsLoggedAndTheNextOneAnswers(): void
    {
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willThrowException(new \RuntimeException('Configuration is not loaded.'));
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getGroup')->willThrowException(new \RuntimeException('No store group.'));
        $website = $this->createStub(WebsiteInterface::class);
        $website->method('getName')->willReturn('Acme Website');
        $storeManager->method('getWebsite')->willReturn($website);

        $brand = new StoreBrand($storeManager, $scopeConfig, $this->logger());

        self::assertSame('Acme Website', $brand->getName());
        self::assertCount(2, $this->errors);
    }

    public function testEverySourceFailingGivesAnEmptyNameAndNeverThrows(): void
    {
        $failure = new \RuntimeException('The store is not available.');
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willThrowException($failure);
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getGroup')->willThrowException($failure);
        $storeManager->method('getWebsite')->willThrowException($failure);
        $storeManager->method('getStore')->willThrowException($failure);

        $brand = new StoreBrand($storeManager, $scopeConfig, $this->logger());

        self::assertSame('', $brand->getName());
        self::assertCount(4, $this->errors);
    }

    private function brand(
        ?string $configured,
        string $groupName,
        string $websiteName,
        string $baseUrl,
        string $storeViewName = 'English'
    ): StoreBrand {
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willReturnMap([
            [StoreBrand::XML_PATH_STORE_NAME, ScopeInterface::SCOPE_STORE, null, $configured],
        ]);
        $group = $this->createStub(GroupInterface::class);
        $group->method('getName')->willReturn($groupName);
        $website = $this->createStub(WebsiteInterface::class);
        $website->method('getName')->willReturn($websiteName);
        $store = $this->createStub(Store::class);
        $store->method('getName')->willReturn($storeViewName);
        $store->method('getBaseUrl')->willReturn($baseUrl);
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getGroup')->willReturn($group);
        $storeManager->method('getWebsite')->willReturn($website);
        $storeManager->method('getStore')->willReturn($store);

        return new StoreBrand($storeManager, $scopeConfig, $this->logger());
    }

    private function logger(): LoggerInterface
    {
        $logger = $this->createStub(LoggerInterface::class);
        $logger->method('error')->willReturnCallback(function ($message): void {
            $this->errors[] = (string) $message;
        });

        return $logger;
    }
}
