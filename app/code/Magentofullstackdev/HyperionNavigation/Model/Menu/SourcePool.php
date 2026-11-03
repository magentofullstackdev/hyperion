<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionNavigation\Model\Menu;

use Psr\Log\LoggerInterface;

/**
 * The navigation sources registered through di.xml (`sources` argument, in
 * priority order); empty out of the box. A source that throws is skipped
 * and logged: the category tree always remains.
 */
class SourcePool
{
    /**
     * @param SourceInterface[] $sources
     */
    public function __construct(
        private readonly LoggerInterface $logger,
        private readonly array $sources = []
    ) {
    }

    /**
     * The first source that applies to the device, or null for the category tree.
     */
    public function resolve(string $device): ?SourceInterface
    {
        foreach ($this->sources as $name => $source) {
            if (!$source instanceof SourceInterface) {
                continue;
            }
            try {
                if ($source->isApplicable($device)) {
                    return $source;
                }
            } catch (\Throwable $e) {
                $this->logger->error('Hyperion navigation source "' . $name . '" failed: ' . $e->getMessage());
            }
        }

        return null;
    }

    /**
     * The identities of every source, applicable or not (see SourceInterface::getIdentities()).
     *
     * @return string[]
     */
    public function getIdentities(string $device): array
    {
        $identities = [];
        foreach ($this->sources as $name => $source) {
            if (!$source instanceof SourceInterface) {
                continue;
            }
            try {
                $identities = array_merge($identities, $source->getIdentities($device));
            } catch (\Throwable $e) {
                $this->logger->error('Hyperion navigation source "' . $name . '" identities failed: ' . $e->getMessage());
            }
        }

        return array_values(array_unique($identities));
    }
}
