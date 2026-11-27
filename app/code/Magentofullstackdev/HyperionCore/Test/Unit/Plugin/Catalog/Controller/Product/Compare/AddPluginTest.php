<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Plugin\Catalog\Controller\Product\Compare;

use Magento\Catalog\Controller\Product\Compare\Add;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\Event\ManagerInterface as EventManagerInterface;
use Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse;
use Magentofullstackdev\HyperionCore\Model\CacheHeaders;
use Magentofullstackdev\HyperionCore\Model\Htmx\ActionResponse;
use Magentofullstackdev\HyperionCore\Model\Htmx\EventTransport;
use Magentofullstackdev\HyperionCore\Model\Htmx\FragmentRendererInterface;
use Magentofullstackdev\HyperionCore\Model\Htmx\MessageCollector;
use Magentofullstackdev\HyperionCore\Model\Htmx\NotificationRendererInterface;
use Magentofullstackdev\HyperionCore\Plugin\Catalog\Controller\Product\Compare\AddPlugin;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The HTMX answer of the compare add: the toast and the header counter, then
 * what the observers of `hyperion_htmx_action_response` add.
 *
 * @covers \Magentofullstackdev\HyperionCore\Plugin\Catalog\Controller\Product\Compare\AbstractHtmxPlugin
 * @covers \Magentofullstackdev\HyperionCore\Plugin\Catalog\Controller\Product\Compare\AddPlugin
 */
class AddPluginTest extends TestCase
{
    private ?string $contents = null;

    public function testTheBodyIsTheToastAndTheCounterWithoutObservers(): void
    {
        $events = $this->createMock(EventManagerInterface::class);
        $events->expects(self::once())->method('dispatch')->with(
            'hyperion_htmx_action_response',
            self::callback(static fn (array $data): bool => $data['action'] === 'compare_add'
                && $data['messages'] === ['html' => 'Added.', 'has_error' => false])
        );

        $this->plugin($events, true)->afterExecute($this->createStub(Add::class), 'redirect');

        self::assertSame("<toast success>Added.</toast>\n<compare oob>", $this->contents);
    }

    public function testAnObserverAddsOutOfBandMarkup(): void
    {
        $events = $this->createMock(EventManagerInterface::class);
        $events->expects(self::once())->method('dispatch')->willReturnCallback(
            static function (string $name, array $data): void {
                $data['transport']->setData('additional_html', '<div id="vendor" hx-swap-oob="true"></div>');
            }
        );

        $this->plugin($events, true)->afterExecute($this->createStub(Add::class), 'redirect');

        self::assertSame(
            "<toast success>Added.</toast>\n<compare oob>\n<div id=\"vendor\" hx-swap-oob=\"true\"></div>",
            $this->contents
        );
    }

    public function testAPlainRequestDispatchesNothing(): void
    {
        $events = $this->createMock(EventManagerInterface::class);
        $events->expects(self::never())->method('dispatch');

        self::assertSame('redirect', $this->plugin($events, false)->afterExecute($this->createStub(Add::class), 'redirect'));
        self::assertNull($this->contents);
    }

    private function plugin(EventManagerInterface $events, bool $htmx): AddPlugin
    {
        $request = $this->createStub(HttpRequest::class);
        $request->method('getHeader')->willReturn($htmx ? 'true' : false);
        $raw = $this->createStub(Raw::class);
        $raw->method('setHeader')->willReturnSelf();
        $raw->method('setContents')->willReturnCallback(function (string $contents) use ($raw) {
            $this->contents = $contents;
            return $raw;
        });
        $rawFactory = $this->createStub(RawFactory::class);
        $rawFactory->method('create')->willReturn($raw);
        $messages = $this->createStub(MessageCollector::class);
        $messages->method('collect')->willReturn(['html' => 'Added.', 'has_error' => false]);
        $toast = $this->createStub(NotificationRendererInterface::class);
        $toast->method('render')->willReturnCallback(static fn (string $html, string $tone): string => "<toast {$tone}>{$html}</toast>");
        $fragments = $this->createStub(FragmentRendererInterface::class);
        $fragments->method('render')->willReturn('<compare oob>');
        $logger = $this->createStub(LoggerInterface::class);

        return new AddPlugin(
            $request,
            $rawFactory,
            new CacheHeaders(new DegradedResponse()),
            $messages,
            $toast,
            $fragments,
            new ActionResponse($events, new EventTransport($logger), $logger)
        );
    }
}
