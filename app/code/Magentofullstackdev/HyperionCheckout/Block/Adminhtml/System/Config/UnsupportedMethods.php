<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Block\Adminhtml\System\Config;

use Magentofullstackdev\HyperionCheckout\Model\Payment\UnsupportedMethodsReport;
use Magento\Backend\Block\Template\Context;
use Magento\Config\Block\System\Config\Form\Field;
use Magento\Framework\Data\Form\Element\AbstractElement;
use Magento\Framework\View\Helper\SecureHtmlRenderer;
use Magento\Store\Model\StoreManagerInterface;

/**
 * Read only configuration row: the stored report of active payment methods
 * the Hyperion checkout hides because no renderer serves them, one table row
 * per store view and method. No value is stored for the field (it renders
 * no input).
 */
class UnsupportedMethods extends Field
{
    /**
     * @param Context $context
     * @param UnsupportedMethodsReport $report
     * @param StoreManagerInterface $storeManager
     * @param array<string, mixed> $data
     * @param SecureHtmlRenderer|null $secureRenderer
     */
    public function __construct(
        Context $context,
        private readonly UnsupportedMethodsReport $report,
        private readonly StoreManagerInterface $storeManager,
        array $data = [],
        ?SecureHtmlRenderer $secureRenderer = null
    ) {
        parent::__construct($context, $data, $secureRenderer);
    }

    /**
     * The row without the scope switch and the "use default" checkbox.
     *
     * @param AbstractElement $element
     * @return string
     */
    public function render(AbstractElement $element)
    {
        $element->unsetData('scope');
        $element->unsetData('can_use_website_value');
        $element->unsetData('can_use_default_value');
        return parent::render($element);
    }

    /**
     * @param AbstractElement $element
     * @return string
     */
    protected function _getElementHtml(AbstractElement $element)
    {
        $rows = [];
        $checked = false;
        try {
            $stores = $this->storeManager->getStores(false);
            foreach ($this->report->getAll() as $storeId => $row) {
                $checked = true;
                $store = $stores[$storeId] ?? null;
                $storeName = $store !== null ? (string)$store->getName() : '#' . $storeId;
                foreach ($row['methods'] as $code => $title) {
                    $rows[] = [$storeName, (string)$code, $title, $row['checked_at']];
                }
            }
        } catch (\Throwable $e) {
            $this->_logger->error(
                'Hyperion checkout: the report of hidden payment methods cannot be shown: ' . $e->getMessage()
            );
        }

        $html = '';
        if (!$checked) {
            $html .= '<p>' . $this->escapeHtml((string) __('No check has run since the payment methods were last saved.'))
                . '</p>';
        } elseif ($rows === []) {
            $html .= '<p>' . $this->escapeHtml((string) __('No active payment method is hidden from shoppers.')) . '</p>';
        } else {
            $html .= '<table class="admin__table-secondary"><thead><tr>'
                . '<th>' . $this->escapeHtml((string) __('Store View')) . '</th>'
                . '<th>' . $this->escapeHtml((string) __('Code')) . '</th>'
                . '<th>' . $this->escapeHtml((string) __('Title')) . '</th>'
                . '<th>' . $this->escapeHtml((string) __('Checked at')) . '</th>'
                . '</tr></thead><tbody>';
            foreach ($rows as $cells) {
                $html .= '<tr>';
                foreach ($cells as $cell) {
                    $html .= '<td>' . $this->escapeHtml($cell) . '</td>';
                }
                $html .= '</tr>';
            }
            $html .= '</tbody></table>';
        }
        $html .= '<p class="note"><span>'
            . $this->escapeHtml((string) __('Run bin/magento hyperion:checkout:payments to refresh.'))
            . '</span></p>';
        return $html;
    }
}
