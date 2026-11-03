<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Model\Htmx;

use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Url\HostChecker;
use Magentofullstackdev\HyperionCore\Model\Htmx\RequestContext;
use PHPUnit\Framework\TestCase;

class RequestContextTest extends TestCase
{
    private function context(array $headers, bool $ownOrigin = true): RequestContext
    {
        $request = $this->createStub(HttpRequest::class);
        $request->method('getHeader')->willReturnCallback(
            static fn (string $name) => $headers[$name] ?? false
        );
        $hostChecker = $this->createStub(HostChecker::class);
        $hostChecker->method('isOwnOrigin')->willReturn($ownOrigin);
        return new RequestContext($request, $hostChecker);
    }

    public function testPlainRequestIsNotHtmxAndHasNoCurrentUrl(): void
    {
        $context = $this->context([]);
        self::assertFalse($context->isHtmx());
        self::assertNull($context->getCurrentUrl());
    }

    public function testHtmxRequestReportsItsOwnOriginPage(): void
    {
        $context = $this->context(['HX-Request' => 'true', 'HX-Current-URL' => 'https://shop.test/women.html']);
        self::assertTrue($context->isHtmx());
        self::assertSame('https://shop.test/women.html', $context->getCurrentUrl());
    }

    public function testForeignOrMalformedCurrentUrlIsDropped(): void
    {
        self::assertNull($this->context(['HX-Request' => 'true', 'HX-Current-URL' => 'https://evil.test/'], false)->getCurrentUrl());
        self::assertNull($this->context(['HX-Request' => 'true', 'HX-Current-URL' => 'javascript:alert(1)'])->getCurrentUrl());
        self::assertNull($this->context(['HX-Request' => 'true', 'HX-Current-URL' => '/women.html'])->getCurrentUrl());
    }
}
