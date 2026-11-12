<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Model\Http;

use Magentofullstackdev\HyperionCore\Model\Http\MarketingParameters;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionCore\Model\Http\MarketingParameters
 */
class MarketingParametersTest extends TestCase
{
    private const VCL = __DIR__ . '/../../../../etc/varnish/default.vcl';

    public function testTheListEqualsTheAlternationOfTheVclMatchInTheSameOrder(): void
    {
        $expected = array_merge(
            MarketingParameters::NAMES,
            array_map(static fn (string $prefix): string => $prefix . '[a-z]+', MarketingParameters::PREFIXES)
        );

        self::assertSame($expected, explode('|', $this->vclAlternations()['match']));
    }

    public function testTheVclStripsExactlyTheParametersItMatches(): void
    {
        $alternations = $this->vclAlternations();

        self::assertSame($alternations['match'], $alternations['strip']);
    }

    #[DataProvider('marketingNames')]
    public function testMarketingParametersAreRecognized(string $name): void
    {
        self::assertTrue((new MarketingParameters())->isMarketing($name));
    }

    /**
     * @return array<string, array{string}>
     */
    public static function marketingNames(): array
    {
        return [
            'Google click id' => ['gclid'],
            'Google Ads campaign id' => ['gad_campaignid'],
            'Meta click id' => ['fbclid'],
            'TikTok click id' => ['ttclid'],
            'LinkedIn click id' => ['li_fat_id'],
            'Klaviyo id' => ['_kx'],
            'UTM source' => ['utm_source'],
            'UTM id (letters only after the prefix)' => ['utm_id'],
            'Mailchimp campaign id' => ['mc_cid'],
            'Bronto' => ['_bta_tid'],
        ];
    }

    #[DataProvider('otherNames')]
    public function testOtherParametersAreNotMarketing(string $name): void
    {
        self::assertFalse((new MarketingParameters())->isMarketing($name));
    }

    /**
     * @return array<string, array{string}>
     */
    public static function otherNames(): array
    {
        return [
            'page' => ['p'],
            'search query' => ['q'],
            'filter attribute' => ['color'],
            'prefix without a suffix' => ['utm_'],
            'prefix with a digit' => ['utm_1'],
            'prefix with an uppercase letter' => ['utm_Source'],
            'prefix followed by a newline' => ["utm_source\n"],
            'uppercase exact name' => ['GCLID'],
            'exact name as a prefix' => ['gclid_extra'],
            'name that only ends like a marketing one' => ['my_gclid'],
            'empty' => [''],
        ];
    }

    /**
     * The alternation of the `req.url ~` condition and of the `regsuball()` that strips the
     * matched parameters.
     *
     * @return array{match: string, strip: string}
     */
    private function vclAlternations(): array
    {
        $vcl = file_get_contents(self::VCL);
        self::assertIsString($vcl, 'etc/varnish/default.vcl is readable');

        self::assertSame(
            1,
            preg_match('/req\.url ~ "\(\\\\\?\|&\)\(([^)"]+)\)="/', $vcl, $match),
            'the VCL carries one marketing parameter condition'
        );
        self::assertSame(
            1,
            preg_match('/set req\.url = regsuball\(req\.url, "\(([^)"]+)\)=\[/', $vcl, $strip),
            'the VCL carries one marketing parameter substitution'
        );

        return ['match' => $match[1], 'strip' => $strip[1]];
    }
}
