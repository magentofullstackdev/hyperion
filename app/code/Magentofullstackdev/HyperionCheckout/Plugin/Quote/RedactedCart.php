<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Plugin\Quote;

use Magento\Customer\Api\Data\CustomerInterface;
use Magento\Quote\Api\Data\AddressInterface;
use Magento\Quote\Api\Data\CartExtensionInterface;
use Magento\Quote\Api\Data\CartInterface;
use Magento\Quote\Api\Data\CurrencyInterface;

/**
 * The answer of a guest cart read for a cart that belongs to a customer:
 * a detached copy of what a cart needs (ids, dates, state, items, counts,
 * currency, store), with an empty customer and an empty billing address,
 * no customer note and no extension attributes (they carry the shipping
 * address). Built by `GuestCartPrivacy`; the quote it was copied from is
 * never changed.
 *
 * @SuppressWarnings(PHPMD.TooManyPublicMethods)
 * @SuppressWarnings(PHPMD.ExcessivePublicCount)
 */
class RedactedCart implements CartInterface
{
    /**
     * @param array<string, mixed> $data
     * @param CustomerInterface $customer
     * @param AddressInterface|null $billingAddress
     */
    public function __construct(
        private array $data,
        private CustomerInterface $customer,
        private ?AddressInterface $billingAddress = null
    ) {
    }

    /**
     * @inheritdoc
     */
    public function getId()
    {
        return $this->data[self::KEY_ID] ?? null;
    }

    /**
     * @inheritdoc
     */
    public function setId($id)
    {
        $this->data[self::KEY_ID] = $id;
        return $this;
    }

    /**
     * @inheritdoc
     */
    public function getCreatedAt()
    {
        return $this->data[self::KEY_CREATED_AT] ?? null;
    }

    /**
     * @inheritdoc
     */
    public function setCreatedAt($createdAt)
    {
        $this->data[self::KEY_CREATED_AT] = $createdAt;
        return $this;
    }

    /**
     * @inheritdoc
     */
    public function getUpdatedAt()
    {
        return $this->data[self::KEY_UPDATED_AT] ?? null;
    }

    /**
     * @inheritdoc
     */
    public function setUpdatedAt($updatedAt)
    {
        $this->data[self::KEY_UPDATED_AT] = $updatedAt;
        return $this;
    }

    /**
     * @inheritdoc
     */
    public function getConvertedAt()
    {
        return $this->data[self::KEY_CONVERTED_AT] ?? null;
    }

    /**
     * @inheritdoc
     */
    public function setConvertedAt($convertedAt)
    {
        $this->data[self::KEY_CONVERTED_AT] = $convertedAt;
        return $this;
    }

    /**
     * @inheritdoc
     */
    public function getIsActive()
    {
        return $this->data[self::KEY_IS_ACTIVE] ?? null;
    }

    /**
     * @inheritdoc
     */
    public function setIsActive($isActive)
    {
        $this->data[self::KEY_IS_ACTIVE] = $isActive;
        return $this;
    }

    /**
     * @inheritdoc
     */
    public function getIsVirtual()
    {
        return $this->data[self::KEY_IS_VIRTUAL] ?? null;
    }

    /**
     * @inheritdoc
     */
    public function getItems()
    {
        return $this->data[self::KEY_ITEMS] ?? null;
    }

    /**
     * @inheritdoc
     */
    public function setItems(?array $items = null)
    {
        $this->data[self::KEY_ITEMS] = $items;
        return $this;
    }

    /**
     * @inheritdoc
     */
    public function getItemsCount()
    {
        return $this->data[self::KEY_ITEMS_COUNT] ?? null;
    }

    /**
     * @inheritdoc
     */
    public function setItemsCount($itemsCount)
    {
        $this->data[self::KEY_ITEMS_COUNT] = $itemsCount;
        return $this;
    }

    /**
     * @inheritdoc
     */
    public function getItemsQty()
    {
        return $this->data[self::KEY_ITEMS_QTY] ?? null;
    }

    /**
     * @inheritdoc
     */
    public function setItemsQty($itemQty)
    {
        $this->data[self::KEY_ITEMS_QTY] = $itemQty;
        return $this;
    }

    /**
     * @inheritdoc
     */
    public function getCustomer()
    {
        return $this->customer;
    }

    /**
     * @inheritdoc
     */
    public function setCustomer(?CustomerInterface $customer = null)
    {
        if ($customer !== null) {
            $this->customer = $customer;
        }
        return $this;
    }

    /**
     * @inheritdoc
     */
    public function getBillingAddress()
    {
        return $this->billingAddress;
    }

    /**
     * @inheritdoc
     */
    public function setBillingAddress(?AddressInterface $billingAddress = null)
    {
        $this->billingAddress = $billingAddress;
        return $this;
    }

    /**
     * @inheritdoc
     */
    public function getReservedOrderId()
    {
        return $this->data[self::KEY_RESERVED_ORDER_ID] ?? null;
    }

    /**
     * @inheritdoc
     */
    public function setReservedOrderId($reservedOrderId)
    {
        $this->data[self::KEY_RESERVED_ORDER_ID] = $reservedOrderId;
        return $this;
    }

    /**
     * @inheritdoc
     */
    public function getOrigOrderId()
    {
        return $this->data[self::KEY_ORIG_ORDER_ID] ?? null;
    }

    /**
     * @inheritdoc
     */
    public function setOrigOrderId($origOrderId)
    {
        $this->data[self::KEY_ORIG_ORDER_ID] = $origOrderId;
        return $this;
    }

    /**
     * @inheritdoc
     */
    public function getCurrency()
    {
        return $this->data[self::KEY_CURRENCY] ?? null;
    }

    /**
     * @inheritdoc
     */
    public function setCurrency(?CurrencyInterface $currency = null)
    {
        $this->data[self::KEY_CURRENCY] = $currency;
        return $this;
    }

    /**
     * @inheritdoc
     */
    public function getCustomerIsGuest()
    {
        return $this->data[self::KEY_CUSTOMER_IS_GUEST] ?? null;
    }

    /**
     * @inheritdoc
     */
    public function setCustomerIsGuest($customerIsGuest)
    {
        $this->data[self::KEY_CUSTOMER_IS_GUEST] = $customerIsGuest;
        return $this;
    }

    /**
     * @inheritdoc
     */
    public function getCustomerNote()
    {
        return null;
    }

    /**
     * @inheritdoc
     */
    public function setCustomerNote($customerNote)
    {
        return $this;
    }

    /**
     * @inheritdoc
     */
    public function getCustomerNoteNotify()
    {
        return $this->data[self::KEY_CUSTOMER_NOTE_NOTIFY] ?? null;
    }

    /**
     * @inheritdoc
     */
    public function setCustomerNoteNotify($customerNoteNotify)
    {
        $this->data[self::KEY_CUSTOMER_NOTE_NOTIFY] = $customerNoteNotify;
        return $this;
    }

    /**
     * @inheritdoc
     */
    public function getCustomerTaxClassId()
    {
        return $this->data[self::KEY_CUSTOMER_TAX_CLASS_ID] ?? null;
    }

    /**
     * @inheritdoc
     */
    public function setCustomerTaxClassId($customerTaxClassId)
    {
        $this->data[self::KEY_CUSTOMER_TAX_CLASS_ID] = $customerTaxClassId;
        return $this;
    }

    /**
     * @inheritdoc
     */
    public function getStoreId()
    {
        return $this->data[self::KEY_STORE_ID] ?? null;
    }

    /**
     * @inheritdoc
     */
    public function setStoreId($storeId)
    {
        $this->data[self::KEY_STORE_ID] = $storeId;
        return $this;
    }

    /**
     * @inheritdoc
     */
    public function getExtensionAttributes()
    {
        return null;
    }

    /**
     * @inheritdoc
     */
    public function setExtensionAttributes(CartExtensionInterface $extensionAttributes)
    {
        return $this;
    }
}
