<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Controller\Header;

use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\DataObject;
use Magento\Framework\Escaper;
use Magento\Framework\Event\ManagerInterface as EventManagerInterface;
use Magentofullstackdev\HyperionCore\Controller\Header\State;
use Magentofullstackdev\HyperionCore\Model\Htmx\EventTransport;
use Magentofullstackdev\HyperionCore\Model\Htmx\FragmentRendererInterface;
use Magentofullstackdev\HyperionCore\Model\Htmx\HeaderStatePool;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The header state answer: every registered fragment out of band, then what
 * the observers of the render-after event add, never cached.
 *
 * @covers \Magentofullstackdev\HyperionCore\Controller\Header\State
 */
class StateTest extends TestCase
{
    /** @var array{contents: string|null, headers: array<string, string>} */
    private array $raw = ['contents' => null, 'headers' => []];

    private const FRAGMENTS = [
        'account' => ['handle' => 'hyperion_customer_account', 'block' => 'account.fragment', 'sort_order' => 10],
        'count' => [
            'handle' => 'hyperion_checkout_minicart_count',
            'block' => 'count.fragment',
            'target_id' => 'hyperion-mini-cart-count',
            'sort_order' => 20,
        ],
    ];

    public function testFragmentsRenderOutOfBandWithoutObservers(): void
    {
        $events = $this->createMock(EventManagerInterface::class);
        $events->expects(self::once())->method('dispatch')->with('hyperion_header_state_render_after', self::anything());

        $this->controller($events)->execute();

        self::assertSame(
            '<account.fragment oob>'
            . '<div id="hyperion-mini-cart-count" hx-swap-oob="innerHTML"><count.fragment oob></div>',
            $this->raw['contents']
        );
        self::assertSame('private, no-store', $this->raw['headers']['Cache-Control']);
        self::assertSame('header-state', $this->raw['headers']['X-Hyperion-Fragment']);
    }

    public function testTheEventCarriesThePoolListAndItsAdditionIsAppended(): void
    {
        $seen = [];
        $events = $this->createMock(EventManagerInterface::class);
        $events->expects(self::once())->method('dispatch')->willReturnCallback(
            static function (string $name, array $data) use (&$seen): void {
                $seen = $data;
                $data['transport']->setData('additional_html', '<span id="vendor-points" hx-swap-oob="true">120</span>');
            }
        );

        $this->controller($events)->execute();

        self::assertSame(
            [
                ['handle' => 'hyperion_customer_account', 'block' => 'account.fragment', 'target_id' => ''],
                [
                    'handle' => 'hyperion_checkout_minicart_count',
                    'block' => 'count.fragment',
                    'target_id' => 'hyperion-mini-cart-count',
                ],
            ],
            $seen['fragments']
        );
        self::assertInstanceOf(DataObject::class, $seen['transport']);
        self::assertStringEndsWith(
            "</div>\n<span id=\"vendor-points\" hx-swap-oob=\"true\">120</span>",
            (string) $this->raw['contents']
        );
    }

    public function testAThrowingObserverIsLoggedAndTheFragmentsStay(): void
    {
        $events = $this->createStub(EventManagerInterface::class);
        $events->method('dispatch')->willThrowException(new \RuntimeException('points service down'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(self::stringContains('points service down'));

        $this->controller($events, $logger)->execute();

        self::assertStringStartsWith('<account.fragment oob>', (string) $this->raw['contents']);
        self::assertStringEndsWith('<count.fragment oob></div>', (string) $this->raw['contents']);
    }

    private function controller(EventManagerInterface $events, ?LoggerInterface $logger = null): State
    {
        $logger ??= $this->createStub(LoggerInterface::class);
        $response = $this->createStub(Raw::class);
        $response->method('setContents')->willReturnCallback(function (string $contents) use ($response) {
            $this->raw['contents'] = $contents;
            return $response;
        });
        $response->method('setHeader')->willReturnCallback(function (string $name, string $value) use ($response) {
            $this->raw['headers'][$name] = $value;
            return $response;
        });
        $rawFactory = $this->createStub(RawFactory::class);
        $rawFactory->method('create')->willReturn($response);
        $renderer = $this->createStub(FragmentRendererInterface::class);
        $renderer->method('render')->willReturnCallback(
            static fn (string $handle, string $block, array $data): string => sprintf('<%s%s>', $block, empty($data['oob']) ? '' : ' oob')
        );

        $escaper = $this->createStub(Escaper::class);
        $escaper->method('escapeHtmlAttr')->willReturnCallback(static fn ($value): string => htmlspecialchars((string) $value));

        return new State(
            $rawFactory,
            new HeaderStatePool($this->createStub(LoggerInterface::class), self::FRAGMENTS),
            $renderer,
            $escaper,
            $events,
            new EventTransport($logger),
            $logger
        );
    }
}
