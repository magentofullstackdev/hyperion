<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel;

use Magento\Framework\Model\AbstractModel;
use Magento\Framework\Model\ResourceModel\Db\AbstractDb;

class Group extends AbstractDb
{
    public const TABLE = 'hyperion_megamenu_group';

    protected function _construct(): void
    {
        $this->_init(self::TABLE, 'group_id');
    }

    /**
     * Website ids arrive as an array from the admin form: stored comma separated.
     * "All Websites" (0) is the form's preselected default, so when specific
     * websites are chosen next to it the explicit selection wins.
     *
     * @param AbstractModel $object
     * @return $this
     */
    protected function _beforeSave(AbstractModel $object)
    {
        $websites = $object->getData('website_ids');
        if (is_array($websites)) {
            $websites = array_values(array_unique(array_filter(array_map('intval', $websites), static fn (int $id): bool => $id > 0)));
            if ($websites === []) {
                $websites = [0];
            }
            $object->setData('website_ids', implode(',', $websites));
        }
        $identifier = strtolower(trim((string) $object->getData('identifier')));
        $identifier = (string) preg_replace('/[^a-z0-9_\-]+/', '_', $identifier);
        $object->setData('identifier', trim($identifier, '_') ?: 'menu_' . uniqid());

        return parent::_beforeSave($object);
    }
}
