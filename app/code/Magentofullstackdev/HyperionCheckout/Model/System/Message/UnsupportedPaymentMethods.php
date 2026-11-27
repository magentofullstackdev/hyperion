<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\System\Message;

use Magentofullstackdev\HyperionCheckout\Model\ConfigProvider;
use Magentofullstackdev\HyperionCheckout\Model\Payment\UnsupportedMethodsReport;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\AuthorizationInterface;
use Magento\Framework\Notification\MessageInterface;
use Magento\Store\Model\ScopeInterface;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Admin system message: active payment methods that the Hyperion checkout
 * hides from shoppers because no renderer serves them.
 *
 * Reads the stored report (`UnsupportedMethodsReport`), only for store
 * views where the Hyperion checkout is on, and only for admin users allowed
 * to see its configuration. The identity is a hash of the listed pairs, so
 * a changed list shows again after the message was dismissed.
 */
class UnsupportedPaymentMethods implements MessageInterface
{
    public const ACL_RESOURCE = 'Magentofullstackdev_HyperionCheckout::config';

    /** The pairs named in the text; the rest is counted. */
    public const MAX_LISTED = 10;

    /** @var list<array{code: string, store: string, store_id: int}>|null */
    private ?array $pairs = null;

    /**
     * @param UnsupportedMethodsReport $report
     * @param ScopeConfigInterface $scopeConfig
     * @param StoreManagerInterface $storeManager
     * @param AuthorizationInterface $authorization
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly UnsupportedMethodsReport $report,
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly StoreManagerInterface $storeManager,
        private readonly AuthorizationInterface $authorization,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @inheritdoc
     */
    public function getIdentity()
    {
        $key = [];
        foreach ($this->getPairs() as $pair) {
            $key[] = $pair['store_id'] . ':' . $pair['code'];
        }
        return 'hyperion_checkout_unsupported_payment_methods_' . sha1(implode(',', $key));
    }

    /**
     * @inheritdoc
     */
    public function isDisplayed()
    {
        return $this->authorization->isAllowed(self::ACL_RESOURCE) && $this->getPairs() !== [];
    }

    /**
     * @inheritdoc
     */
    public function getText()
    {
        $pairs = $this->getPairs();
        $codes = array_unique(array_column($pairs, 'code'));
        $listed = [];
        foreach (array_slice($pairs, 0, self::MAX_LISTED) as $pair) {
            $listed[] = sprintf('%s (%s)', $pair['code'], $pair['store']);
        }
        $list = implode(', ', $listed);
        $more = count($pairs) - count($listed);
        if ($more > 0) {
            $list .= ' ' . __('and %1 more', $more);
        }
        return (string)__(
            'Hyperion Checkout: %1 active payment method(s) have no checkout renderer and are hidden from'
            . ' shoppers: %2. Details: Stores > Configuration > Hyperion Theme > Checkout.',
            count($codes),
            $list
        );
    }

    /**
     * @inheritdoc
     */
    public function getSeverity()
    {
        return self::SEVERITY_MAJOR;
    }

    /**
     * Hidden method and store view pairs, store views with the Hyperion checkout on only.
     *
     * @return list<array{code: string, store: string, store_id: int}>
     */
    private function getPairs(): array
    {
        if ($this->pairs !== null) {
            return $this->pairs;
        }
        $pairs = [];
        try {
            $stores = $this->storeManager->getStores(false);
            foreach ($this->report->getAll() as $storeId => $row) {
                $store = $stores[$storeId] ?? null;
                if ($store === null || $row['methods'] === [] || !$this->scopeConfig->isSetFlag(
                    ConfigProvider::CONFIG_ENABLED,
                    ScopeInterface::SCOPE_STORE,
                    $storeId
                )) {
                    continue;
                }
                foreach (array_keys($row['methods']) as $code) {
                    $pairs[] = ['code' => (string)$code, 'store' => (string)$store->getName(), 'store_id' => $storeId];
                }
            }
        } catch (\Throwable $e) {
            $this->logger->error(
                'Hyperion checkout: the report of hidden payment methods cannot be read: ' . $e->getMessage()
            );
            $pairs = [];
        }
        return $this->pairs = $pairs;
    }
}
