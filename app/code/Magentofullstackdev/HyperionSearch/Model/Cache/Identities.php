<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\Model\Cache;

use Magento\Framework\DataObject;
use Magento\Framework\DataObject\IdentityInterface;

/**
 * The tag carrier of the `clean_cache_by_tags` event: core's observers
 * (`Magento_PageCache` for the built-in page cache, `Magento_CacheInvalidate`
 * for the Varnish BAN) read the tags of any `IdentityInterface` object.
 */
class Identities extends DataObject implements IdentityInterface
{
    /**
     * @param string[] $tags
     */
    public function __construct(private readonly array $tags)
    {
        parent::__construct();
    }

    /**
     * @return string[]
     */
    public function getIdentities()
    {
        return $this->tags;
    }
}
