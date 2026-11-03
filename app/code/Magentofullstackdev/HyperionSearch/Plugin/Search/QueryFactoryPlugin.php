<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\Plugin\Search;

use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Search\Model\QueryFactory;
use Magentofullstackdev\HyperionSearch\Model\QueryText;
use Psr\Log\LoggerInterface;

/**
 * Removes the configured stop words from the `q` parameter before the search
 * term model is built from it, so the engine query, the recorded search term,
 * the autocomplete and the results heading all agree on the same text.
 * Rewriting the request (instead of the loaded term) keeps the search term
 * table consistent: the term that is saved is the term that was searched.
 */
class QueryFactoryPlugin
{
    private bool $applied = false;

    public function __construct(
        private readonly HttpRequest $request,
        private readonly QueryText $queryText,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @param QueryFactory $subject
     * @return void
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function beforeGet(QueryFactory $subject): void
    {
        if ($this->applied) {
            return;
        }
        $this->applied = true;
        try {
            $raw = $this->request->getParam(QueryFactory::QUERY_VAR_NAME);
            if (!is_string($raw) || trim($raw) === '') {
                return;
            }
            $stripped = $this->queryText->stripStopWords($raw);
            if ($stripped !== $raw) {
                $this->request->setParam(QueryFactory::QUERY_VAR_NAME, $stripped);
            }
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion search: stop words not applied: ' . $e->getMessage());
        }
    }
}
