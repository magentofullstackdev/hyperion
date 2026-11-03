<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Model\Purchase;

use Psr\Log\LoggerInterface;

/**
 * Pool of purchase restrictions, evaluated once per request.
 *
 * The first rule that restricts wins and provides the notice. A rule
 * that throws is logged and ignored (the store keeps selling), so a
 * broken optional module never hides every Add to Cart button.
 */
class Availability
{
    /** @var RestrictionInterface[] */
    private readonly array $restrictions;

    private ?RestrictionInterface $active = null;

    private bool $resolved = false;

    /**
     * @param LoggerInterface $logger
     * @param RestrictionInterface[] $restrictions
     */
    public function __construct(
        private readonly LoggerInterface $logger,
        array $restrictions = []
    ) {
        foreach ($restrictions as $name => $restriction) {
            if (!$restriction instanceof RestrictionInterface) {
                throw new \InvalidArgumentException(sprintf(
                    'Purchase restriction "%s" must implement %s',
                    (string) $name,
                    RestrictionInterface::class
                ));
            }
        }
        $this->restrictions = $restrictions;
    }

    /**
     * @return bool
     */
    public function canPurchase(): bool
    {
        return $this->activeRestriction() === null;
    }

    /**
     * Notice of the active restriction, empty when purchasing is allowed.
     *
     * @return string
     */
    public function getMessage(): string
    {
        return (string) ($this->activeRestriction()?->getMessage() ?? '');
    }

    /**
     * @return RestrictionInterface|null
     */
    private function activeRestriction(): ?RestrictionInterface
    {
        if ($this->resolved) {
            return $this->active;
        }
        $this->resolved = true;
        foreach ($this->restrictions as $name => $restriction) {
            try {
                if ($restriction->isRestricted()) {
                    $this->active = $restriction;
                    break;
                }
            } catch (\Throwable $e) {
                $this->logger->error(sprintf(
                    'Hyperion purchase restriction "%s" failed and was ignored: %s',
                    (string) $name,
                    $e->getMessage()
                ));
            }
        }

        return $this->active;
    }
}
