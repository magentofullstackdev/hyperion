<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Test\Unit\ViewModel;

use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\UrlInterface;
use Magentofullstackdev\HyperionCatalog\ViewModel\CartConfigure;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The product form switches to core's updateItemOptions only on the cart
 * configure request with an item id.
 */
class CartConfigureTest extends TestCase
{
    /**
     * @return array<string, array{string, mixed, int}>
     */
    public static function requestProvider(): array
    {
        return [
            'cart configure with an item' => ['checkout_cart_configure', '5', 5],
            'cart configure without an item' => ['checkout_cart_configure', null, 0],
            'cart configure with a bogus id' => ['checkout_cart_configure', '-3', 0],
            'plain product page' => ['catalog_product_view', '5', 0],
            'wish list item edit' => ['wishlist_index_configure', '5', 0],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('requestProvider')]
    public function testItemIdComesOnlyFromTheCartConfigureRequest(string $action, mixed $id, int $expected): void
    {
        $viewModel = new CartConfigure(
            $this->request($action, $id),
            $this->createStub(UrlInterface::class),
            $this->createStub(LoggerInterface::class)
        );

        self::assertSame($expected, $viewModel->getItemId());
        self::assertSame($expected > 0, $viewModel->isActive());
    }

    public function testSubmitUrlCarriesTheItemId(): void
    {
        $urlBuilder = $this->createMock(UrlInterface::class);
        $urlBuilder->expects(self::once())
            ->method('getUrl')
            ->with('checkout/cart/updateItemOptions', ['id' => 7])
            ->willReturn('https://shop.example/checkout/cart/updateItemOptions/id/7/');
        $viewModel = new CartConfigure(
            $this->request('checkout_cart_configure', '7'),
            $urlBuilder,
            $this->createStub(LoggerInterface::class)
        );

        self::assertSame('https://shop.example/checkout/cart/updateItemOptions/id/7/', $viewModel->getSubmitUrl());
    }

    public function testUrlFailuresAreLoggedAndAnswerAnEmptyString(): void
    {
        $urlBuilder = $this->createStub(UrlInterface::class);
        $urlBuilder->method('getUrl')->willThrowException(new \RuntimeException('no store'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::exactly(2))->method('error');
        $viewModel = new CartConfigure($this->request('checkout_cart_configure', '7'), $urlBuilder, $logger);

        self::assertSame('', $viewModel->getSubmitUrl());
        self::assertSame('', $viewModel->getCartUrl());
    }

    private function request(string $action, mixed $id): HttpRequest
    {
        $request = $this->createStub(HttpRequest::class);
        $request->method('getFullActionName')->willReturn($action);
        $request->method('getParam')->willReturnCallback(static fn (string $name) => $name === 'id' ? $id : null);

        return $request;
    }
}
