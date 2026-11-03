<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\Test\Unit\Model;

use Magentofullstackdev\HyperionSearch\Model\Config;
use Magentofullstackdev\HyperionSearch\Model\QueryText;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionSearch\Model\QueryText
 */
class QueryTextTest extends TestCase
{
    public function testNormalizeLowersTrimsCollapsesAndCaps(): void
    {
        $text = $this->queryText([]);

        self::assertSame('joust duffle bag', $text->normalize("  Joust \t DUFFLE\n bag "));
        self::assertSame(QueryText::MAX_LENGTH, mb_strlen($text->normalize(str_repeat('ab', 100))));
        self::assertSame('ünïcode', $text->normalize('ÜNÏCODE'));
    }

    public function testStopWordsAreRemovedButNeverEverything(): void
    {
        $text = $this->queryText(['the', 'for', 'shop']);

        self::assertSame('bag men', $text->stripStopWords('the bag for men'));
        self::assertSame('Bag', $text->stripStopWords('The Bag'), 'the kept words keep their case');
        self::assertSame('the shop', $text->stripStopWords('the shop'), 'only stop words: the query is left alone');
        self::assertSame('   ', $text->stripStopWords('   '));
        self::assertSame('the bag', $this->queryText([])->stripStopWords('the bag'));
    }

    public function testWordsAreDistinctLongestFirstWithoutStopWords(): void
    {
        self::assertSame(['duffle', 'joust', 'bag'], $this->queryText(['the'])->words('the Joust duffle BAG bag'));
        self::assertSame([], $this->queryText([])->words('   '));
    }

    /**
     * @param string[] $stopWords
     */
    private function queryText(array $stopWords): QueryText
    {
        $config = $this->createStub(Config::class);
        $config->method('getStopWords')->willReturn($stopWords);

        return new QueryText($config);
    }
}
