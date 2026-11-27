<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Model\Htmx;

use Magento\Framework\DataObject;
use Magento\Framework\Event\ManagerInterface as EventManagerInterface;
use Magentofullstackdev\HyperionCore\Model\Htmx\ActionResponse;
use Magentofullstackdev\HyperionCore\Model\Htmx\EventTransport;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The final body of an htmx action: the event carries the action, the
 * messages and a transport; what observers add is appended, a failing
 * observer never costs the response.
 *
 * @covers \Magentofullstackdev\HyperionCore\Model\Htmx\ActionResponse
 * @covers \Magentofullstackdev\HyperionCore\Model\Htmx\EventTransport
 */
class ActionResponseTest extends TestCase
{
    private const MESSAGES = ['html' => 'Added.', 'has_error' => false];

    public function testTheEventCarriesTheActionTheMessagesAndAnEmptyTransport(): void
    {
        $seen = [];
        $events = $this->createMock(EventManagerInterface::class);
        $events->expects(self::once())->method('dispatch')
            ->with('hyperion_htmx_action_response', self::anything())
            ->willReturnCallback(static function (string $name, array $data) use (&$seen): void {
                $seen = $data;
            });

        $body = $this->builder($events)->build(ActionResponse::ACTION_CART_ADD, self::MESSAGES, '<toast>');

        self::assertSame('<toast>', $body);
        self::assertSame('cart_add', $seen['action']);
        self::assertSame(self::MESSAGES, $seen['messages']);
        self::assertInstanceOf(DataObject::class, $seen['transport']);
        self::assertSame('', $seen['transport']->getData('additional_html'));
    }

    public function testTheMarkupAnObserverAddsIsAppendedToTheBody(): void
    {
        $events = $this->createMock(EventManagerInterface::class);
        $events->expects(self::once())->method('dispatch')->willReturnCallback(
            static function (string $name, array $data): void {
                $data['transport']->setData('additional_html', '<div id="vendor-badge" hx-swap-oob="true">3</div>');
            }
        );

        self::assertSame(
            "<toast>\n<div id=\"vendor-badge\" hx-swap-oob=\"true\">3</div>",
            $this->builder($events)->build(ActionResponse::ACTION_COMPARE_ADD, self::MESSAGES, '<toast>')
        );
    }

    /**
     * @param mixed $additional
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('nothingToAdd')]
    public function testABlankOrInvalidAdditionLeavesTheBodyUnchanged($additional): void
    {
        $events = $this->createMock(EventManagerInterface::class);
        $events->expects(self::once())->method('dispatch')->willReturnCallback(
            static function (string $name, array $data) use ($additional): void {
                $data['transport']->setData('additional_html', $additional);
            }
        );

        self::assertSame('<toast>', $this->builder($events)->build(ActionResponse::ACTION_COUPON, self::MESSAGES, '<toast>'));
    }

    /**
     * @return array<string, array{0: mixed}>
     */
    public static function nothingToAdd(): array
    {
        return [
            'null' => [null],
            'empty' => [''],
            'blank' => ["  \n "],
            'array' => [['<div>']],
        ];
    }

    public function testAThrowingObserverIsLoggedAndTheResponseIsKept(): void
    {
        $events = $this->createStub(EventManagerInterface::class);
        $events->method('dispatch')->willThrowException(new \RuntimeException('observer broke'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(self::stringContains('observer broke'));

        $builder = new ActionResponse($events, new EventTransport($logger), $logger);

        self::assertSame('<toast>', $builder->build(ActionResponse::ACTION_WISHLIST_ADD, self::MESSAGES, '<toast>'));
    }

    private function builder(EventManagerInterface $events): ActionResponse
    {
        $logger = $this->createStub(LoggerInterface::class);

        return new ActionResponse($events, new EventTransport($logger), $logger);
    }
}
