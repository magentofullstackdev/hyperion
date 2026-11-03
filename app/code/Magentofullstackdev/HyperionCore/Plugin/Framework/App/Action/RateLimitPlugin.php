<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Plugin\Framework\App\Action;

use Magento\Framework\App\ActionInterface;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magentofullstackdev\HyperionCore\Model\Security\RateLimiter;
use Magentofullstackdev\HyperionCore\Model\Security\TooManyRequests;
use Psr\Log\LoggerInterface;

/**
 * Applies the rate limiter to whole routes, before the layout, the search
 * engine or the database see the request. Modules map their full action
 * names to a route group through the `routes` argument (etc/frontend/di.xml);
 * routes whose budget depends on the request content (a category page with
 * filters) are counted by their own plugin.
 *
 * Same shape as the catalog mode guard: the check is fail-open and the
 * action runs exactly once, outside the try block.
 */
class RateLimitPlugin
{
    /**
     * @param RateLimiter $rateLimiter
     * @param TooManyRequests $tooManyRequests
     * @param HttpRequest $request
     * @param LoggerInterface $logger
     * @param array<string, string> $routes full action name => route group
     */
    public function __construct(
        private readonly RateLimiter $rateLimiter,
        private readonly TooManyRequests $tooManyRequests,
        private readonly HttpRequest $request,
        private readonly LoggerInterface $logger,
        private readonly array $routes = []
    ) {
    }

    /**
     * @param ActionInterface $subject
     * @param callable $proceed
     * @return mixed
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function aroundExecute(ActionInterface $subject, callable $proceed): mixed
    {
        if ($this->isOverBudget()) {
            return $this->tooManyRequests->create();
        }

        return $proceed();
    }

    private function isOverBudget(): bool
    {
        try {
            $group = $this->routes[(string) $this->request->getFullActionName()] ?? null;
            if ($group === null) {
                return false;
            }

            return !$this->rateLimiter->hit((string) $group);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion rate limiter skipped: ' . $e->getMessage());
            return false;
        }
    }
}
