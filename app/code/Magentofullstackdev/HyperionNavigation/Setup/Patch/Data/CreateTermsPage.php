<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionNavigation\Setup\Patch\Data;

use Magento\Cms\Api\Data\PageInterface;
use Magento\Cms\Api\PageRepositoryInterface;
use Magento\Cms\Model\PageFactory;
use Magento\Framework\Api\SearchCriteriaBuilder;
use Magento\Framework\Setup\Patch\DataPatchInterface;
use Magento\Store\Model\Store;
use Psr\Log\LoggerInterface;

/**
 * Creates the CMS page the footer links as Terms and Conditions
 * (`hyperion/footer/terms_cms_identifier`, default `terms-and-conditions`).
 *
 * Magento ships a privacy page but no terms page, so on a fresh install the
 * footer link was silently omitted. The page is a visible placeholder that
 * tells the merchant to replace it; it is created only when no page with
 * that identifier exists in any store, and never touched again.
 */
class CreateTermsPage implements DataPatchInterface
{
    public const IDENTIFIER = 'terms-and-conditions';

    public function __construct(
        private readonly PageRepositoryInterface $pageRepository,
        private readonly PageFactory $pageFactory,
        private readonly SearchCriteriaBuilder $searchCriteriaBuilder,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @inheritDoc
     */
    public static function getDependencies(): array
    {
        return [];
    }

    /**
     * @inheritDoc
     */
    public function getAliases(): array
    {
        return [];
    }

    /**
     * @inheritDoc
     */
    public function apply(): self
    {
        try {
            if ($this->pageExists()) {
                return $this;
            }
            $page = $this->pageFactory->create();
            $page->setData([
                PageInterface::IDENTIFIER => self::IDENTIFIER,
                PageInterface::TITLE => 'Terms and Conditions',
                PageInterface::CONTENT_HEADING => 'Terms and Conditions',
                PageInterface::PAGE_LAYOUT => '1column',
                PageInterface::IS_ACTIVE => true,
                PageInterface::CONTENT => $this->getContent(),
                'store_id' => [Store::DEFAULT_STORE_ID],
            ]);
            $this->pageRepository->save($page);
        } catch (\Throwable $e) {
            // A missing placeholder page must never fail setup:upgrade.
            $this->logger->error('Hyperion: the Terms and Conditions page was not created: ' . $e->getMessage());
        }

        return $this;
    }

    /**
     * @return bool
     */
    private function pageExists(): bool
    {
        $criteria = $this->searchCriteriaBuilder
            ->addFilter(PageInterface::IDENTIFIER, self::IDENTIFIER)
            ->create();

        return $this->pageRepository->getList($criteria)->getTotalCount() > 0;
    }

    /**
     * @return string
     */
    private function getContent(): string
    {
        return '<p>This page was created by the Hyperion theme as the target of the Terms and Conditions link '
            . 'in the footer. Replace this text with your own terms (Content &gt; Pages &gt; Terms and Conditions), '
            . 'or point the footer to another page under Stores &gt; Configuration &gt; Hyperion Theme &gt; Footer.</p>'
            . '<h2>Use of this website</h2><p>Describe who may use the store and under which conditions.</p>'
            . '<h2>Orders and payment</h2><p>Describe how orders are placed, confirmed and paid.</p>'
            . '<h2>Shipping and returns</h2><p>Describe delivery times, costs and the return procedure.</p>'
            . '<h2>Contact</h2><p>State how customers can reach you about these terms.</p>';
    }
}
