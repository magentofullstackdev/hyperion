<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleData\Setup\Patch\Data;

use Magento\Cms\Api\BlockRepositoryInterface;
use Magento\Cms\Model\BlockFactory;
use Magento\Cms\Model\ResourceModel\Block\CollectionFactory as BlockCollectionFactory;
use Magento\Framework\Setup\Patch\DataPatchInterface;
use Magento\Store\Model\Store;
use Psr\Log\LoggerInterface;

/**
 * Creates the CMS block the theme prints under the footer logo
 * (`hyperion-footer-about`) with a sample sentence. The sentence is a
 * `trans` directive, so each store view shows the translation this module
 * ships in `i18n/`. A store that already has a block with that identifier
 * keeps it, and the patch runs once: a block edited or deleted later is
 * never written again.
 */
class CreateFooterAboutBlock implements DataPatchInterface
{
    public const IDENTIFIER = 'hyperion-footer-about';
    public const SENTENCE = 'Stateless, edge-cacheable commerce -- built for speed on Magento.';

    public function __construct(
        private readonly BlockCollectionFactory $blockCollectionFactory,
        private readonly BlockFactory $blockFactory,
        private readonly BlockRepositoryInterface $blockRepository,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @inheritDoc
     */
    public function apply(): self
    {
        try {
            $existing = $this->blockCollectionFactory->create()
                ->addFieldToFilter('identifier', self::IDENTIFIER);
            if ($existing->getSize() > 0) {
                return $this;
            }

            $block = $this->blockFactory->create();
            $block->setData([
                'identifier' => self::IDENTIFIER,
                'title' => 'Footer: about the store',
                'content' => '<p>{{trans "' . self::SENTENCE . '"}}</p>',
                'is_active' => 1,
                'stores' => [Store::DEFAULT_STORE_ID],
            ]);
            $this->blockRepository->save($block);
        } catch (\Throwable $e) {
            $this->logger->error('HyperionSampleData: the footer about block was not created: ' . $e->getMessage());
        }

        return $this;
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
}
