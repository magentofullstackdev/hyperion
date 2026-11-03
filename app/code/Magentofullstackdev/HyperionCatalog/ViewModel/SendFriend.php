<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\ViewModel;

use Magento\Catalog\Helper\Product as ProductHelper;
use Magento\Catalog\Model\Product;
use Magento\Customer\Model\Context as CustomerContext;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\Http\Context as HttpContext;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Store\Model\ScopeInterface;

/**
 * "Email a Friend" link of the product page.
 *
 * Core's `View::canEmailToFriend()` only tells whether the feature is on
 * (`sendfriend/email/enabled`, through the Magento_SendFriend plugin) and
 * shows the link to a guest who is then bounced to the login page when
 * `sendfriend/email/allow_guest` is off. This view model decides from the
 * same configuration plus the HTTP context login flag, which is part of the
 * page cache vary string, so the cached guest and customer variants of the
 * product page each get their own answer. Magento_SendFriend is reached by
 * name only: the module stays optional for the catalog module.
 */
class SendFriend implements ArgumentInterface
{
    public const MODULE_NAME = 'Magento_SendFriend';
    public const XML_PATH_ENABLED = 'sendfriend/email/enabled';
    public const XML_PATH_ALLOW_GUEST = 'sendfriend/email/allow_guest';

    /**
     * @param ModuleManager $moduleManager
     * @param ScopeConfigInterface $scopeConfig
     * @param HttpContext $httpContext
     * @param ProductHelper $productHelper
     */
    public function __construct(
        private readonly ModuleManager $moduleManager,
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly HttpContext $httpContext,
        private readonly ProductHelper $productHelper
    ) {
    }

    /**
     * Whether the current visitor may open the "Email a Friend" form.
     *
     * @return bool
     */
    public function canEmailToFriend(): bool
    {
        if (!$this->moduleManager->isEnabled(self::MODULE_NAME)
            || !$this->scopeConfig->isSetFlag(self::XML_PATH_ENABLED, ScopeInterface::SCOPE_STORE)
        ) {
            return false;
        }

        return $this->scopeConfig->isSetFlag(self::XML_PATH_ALLOW_GUEST, ScopeInterface::SCOPE_STORE)
            || (bool) $this->httpContext->getValue(CustomerContext::CONTEXT_AUTH);
    }

    /**
     * URL of the send form (`sendfriend/product/send`, with the current category when there is one).
     *
     * @param Product $product
     * @return string
     */
    public function getUrl(Product $product): string
    {
        return (string) $this->productHelper->getEmailToFriendUrl($product);
    }
}
