<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Payment;

use Magento\Framework\App\CacheInterface;
use Magento\Framework\ObjectManagerInterface;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Asset\Repository as AssetRepository;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCheckout\Model\Extension\EntryRules;
use Magentofullstackdev\HyperionCheckout\Model\Payment\LogOnce;
use Magentofullstackdev\HyperionCheckout\Model\Payment\RendererPool;
use PHPUnit\Framework\TestCase;
use Psr\Log\AbstractLogger;

/**
 * Shared doubles of the renderer pool tests: a store on `https://shop.test`
 * with its static files on `https://cdn.test`, asset ids resolved below the
 * static URL, and a logger that keeps its lines.
 */
abstract class RendererPoolTestCase extends TestCase
{
    /**
     * The first-party entries as `etc/frontend/di.xml` declares them.
     */
    public const FIRST_PARTY = [
        'offline' => [
            'pattern' => '^(checkmo|banktransfer|cashondelivery|free)$',
            'type' => 'element',
            'builtin' => 'offline',
            'internal' => true,
            'sort_order' => '10',
        ],
        'purchaseorder' => [
            'method' => 'purchaseorder',
            'type' => 'form',
            'internal' => true,
            'sort_order' => '20',
            'fields' => [
                'po_number' => [
                    'label' => 'Purchase Order Number',
                    'type' => 'text',
                    'required' => true,
                    'target' => 'po_number',
                ],
            ],
        ],
        'braintree_card' => [
            'method' => 'braintree',
            'type' => 'element',
            'builtin' => 'braintree-card',
            'internal' => true,
            'eager' => true,
            'awaits_ready' => true,
            'sort_order' => '30',
        ],
        'braintree_paypal' => [
            'method' => 'braintree_paypal',
            'type' => 'element',
            'builtin' => 'braintree-paypal',
            'internal' => true,
            'eager' => true,
            'sort_order' => '40',
        ],
        'braintree_googlepay' => [
            'method' => 'braintree_googlepay',
            'type' => 'element',
            'builtin' => 'braintree-googlepay',
            'internal' => true,
            'eager' => true,
            'owns_place_order' => true,
            'sort_order' => '50',
        ],
        'braintree_vault' => [
            'pattern' => '^braintree_(cc|googlepay|paypal)_vault$',
            'type' => 'element',
            'builtin' => 'braintree-vault',
            'internal' => true,
            'eager' => true,
            'sort_order' => '60',
        ],
        'paypal_express' => [
            'pattern' => '^(paypal_express|payflow_express)$',
            'type' => 'element',
            'builtin' => 'paypal-express',
            'internal' => true,
            'eager' => true,
            'sort_order' => '70',
        ],
    ];

    /** @var list<array{level: string, message: string}> */
    protected array $logged = [];

    /**
     * @param array<string, mixed> $renderers
     */
    protected function pool(array $renderers, ?ObjectManagerInterface $objectManager = null): RendererPool
    {
        $assets = $this->createStub(AssetRepository::class);
        $assets->method('getUrlWithParams')->willReturnCallback(
            static function (string $fileId): string {
                [$module, $path] = explode('::', $fileId, 2);
                $host = str_starts_with($module, 'Foreign_') ? 'https://evil.test' : 'https://cdn.test';
                return $host . '/static/frontend/Vendor/theme/en_US/' . $module . '/' . $path;
            }
        );
        $store = $this->createStub(Store::class);
        $store->method('isCurrentlySecure')->willReturn(true);
        $store->method('getBaseUrl')->willReturnCallback(
            static fn(string $type = UrlInterface::URL_TYPE_LINK): string => $type === UrlInterface::URL_TYPE_STATIC
                ? 'https://cdn.test/static/'
                : 'https://shop.test/'
        );
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getStore')->willReturn($store);
        $url = $this->createStub(UrlInterface::class);
        $url->method('getUrl')->willReturnCallback(
            static fn(string $route = ''): string => 'https://shop.test/' . $route . '/'
        );
        $log = $this->logOnce();

        return new RendererPool(
            new EntryRules(
                $objectManager ?? $this->createStub(ObjectManagerInterface::class),
                $assets,
                $storeManager,
                $log
            ),
            $url,
            $log,
            $renderers
        );
    }

    protected function logOnce(): LogOnce
    {
        $cache = $this->createStub(CacheInterface::class);
        $cache->method('load')->willReturn(false);
        $sink = function (string $level, string $message): void {
            $this->logged[] = ['level' => $level, 'message' => $message];
        };
        $logger = new class ($sink) extends AbstractLogger {
            /**
             * @param \Closure(string, string): void $sink
             */
            public function __construct(private readonly \Closure $sink)
            {
            }

            public function log($level, \Stringable|string $message, array $context = []): void
            {
                ($this->sink)((string)$level, (string)$message);
            }
        };
        return new LogOnce($logger, $cache);
    }

    /**
     * @return list<string>
     */
    protected function loggedAt(string $level): array
    {
        return array_values(array_map(
            static fn(array $line): string => $line['message'],
            array_filter($this->logged, static fn(array $line): bool => $line['level'] === $level)
        ));
    }
}
