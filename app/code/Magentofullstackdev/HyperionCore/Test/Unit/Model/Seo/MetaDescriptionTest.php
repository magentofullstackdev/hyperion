<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Model\Seo;

use Magentofullstackdev\HyperionCore\Model\Seo\MetaDescription;
use PHPUnit\Framework\TestCase;

class MetaDescriptionTest extends TestCase
{
    private MetaDescription $generator;

    protected function setUp(): void
    {
        $this->generator = new MetaDescription();
    }

    public function testTagsDirectivesScriptsAndEntitiesAreRemovedAndWhitespaceCollapsed(): void
    {
        $html = "<style>.x{color:red}</style><p>Tops &amp; tanks\n for  <b>women</b>.</p>"
            . '{{widget type="Magento\Cms\Block\Widget\Block" template="widget/static_block/default.phtml"}}'
            . '<script type="text/javascript">alert(1)</script><div data-content-type="row">Light, breathable.</div>';

        self::assertSame('Tops & tanks for women. Light, breathable.', $this->generator->fromHtml($html));
    }

    public function testALongTextIsCutAtAWordBoundaryWithinTheLimit(): void
    {
        $words = implode(' ', array_fill(0, 60, 'word'));
        $result = $this->generator->fromHtml($words);

        self::assertLessThanOrEqual(160, mb_strlen($result));
        self::assertStringEndsWith('word', $result);
        self::assertSame(0, substr_count($result, 'wor '), 'no word is split');
    }

    public function testAWordLongerThanHalfTheLimitIsCutHard(): void
    {
        $result = $this->generator->fromHtml(str_repeat('a', 400), 100);

        self::assertSame(100, mb_strlen($result));
    }

    public function testTrailingPunctuationIsDropped(): void
    {
        self::assertSame(
            'Jackets, hoodies',
            $this->generator->fromHtml('Jackets, hoodies, ' . str_repeat('x', 200), 18)
        );
        self::assertSame('', $this->generator->fromHtml('<p>  </p>{{block id="x"}}'));
    }

    public function testMultibyteTextKeepsItsCharacters(): void
    {
        self::assertSame('Caffè, tè e perché', $this->generator->fromHtml('<p>Caff&egrave;, t&egrave; e perch&eacute;</p>'));
    }
}
