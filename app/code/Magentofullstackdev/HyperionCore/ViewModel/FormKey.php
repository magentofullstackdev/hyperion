<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\ViewModel;

use Magento\Framework\Data\Form\FormKey as FormKeyModel;
use Magento\Framework\View\Element\Block\ArgumentInterface;

/**
 * ViewModel providing the form key for CSRF-protected HTMX forms.
 */
class FormKey implements ArgumentInterface
{
    public function __construct(
        private readonly FormKeyModel $formKey
    ) {
    }

    public function getFormKey(): string
    {
        return $this->formKey->getFormKey();
    }
}
