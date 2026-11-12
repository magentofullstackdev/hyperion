<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Model\Http;

/**
 * The marketing and click tracking query parameters that never change what a
 * page renders.
 *
 * Varnish strips them from the URL before the cache lookup, so PHP code that
 * classifies query parameters must treat them the same way. The list mirrors
 * the alternation of the two regular expressions in `etc/varnish/default.vcl`
 * (same names, same order); a unit test reads that file and enforces it, so
 * a change goes into both places.
 */
class MarketingParameters
{
    /** Exact parameter names. */
    public const NAMES = ['gad_source', 'gad_campaignid', 'gbraid', 'wbraid', '_gl', 'dclid', 'gclsrc', 'srsltid',
        'msclkid', 'gclid', 'ttclid', 'twclid', 'li_fat_id', 'igshid', 'epik', 'yclid', 'cx', '_kx', 'ie', 'cof',
        'siteurl', 'zanpid', 'origin', 'fbclid'];

    /** Name prefixes, each followed by one or more lowercase letters (`utm_source`, `mc_cid`). */
    public const PREFIXES = ['mc_', 'utm_', '_bta_'];

    /**
     * @param string $name query parameter name, compared case sensitively like the VCL does
     */
    public function isMarketing(string $name): bool
    {
        if (in_array($name, self::NAMES, true)) {
            return true;
        }
        foreach (self::PREFIXES as $prefix) {
            if (str_starts_with($name, $prefix) && preg_match('/^[a-z]+$/D', substr($name, strlen($prefix))) === 1) {
                return true;
            }
        }

        return false;
    }
}
