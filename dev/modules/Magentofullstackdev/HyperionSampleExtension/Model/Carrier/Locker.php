<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleExtension\Model\Carrier;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Quote\Model\Quote\Address\RateRequest;
use Magento\Quote\Model\Quote\Address\RateResult\ErrorFactory;
use Magento\Quote\Model\Quote\Address\RateResult\MethodFactory;
use Magento\Shipping\Model\Carrier\AbstractCarrier;
use Magento\Shipping\Model\Carrier\CarrierInterface;
use Magento\Shipping\Model\Rate\Result;
use Magento\Shipping\Model\Rate\ResultFactory;
use Magentofullstackdev\HyperionSampleExtension\Model\Config;
use Psr\Log\LoggerInterface;

/**
 * The fake pickup locker carrier: one method, `hyperionlocker_locker`, at a
 * fixed price. The shopper picks the point in the checkout; the shipping
 * information plugin refuses the method without a known point.
 */
class Locker extends AbstractCarrier implements CarrierInterface
{
    public const CODE = 'hyperionlocker';
    public const METHOD = 'locker';

    /**
     * @var string
     */
    protected $_code = self::CODE;

    /**
     * @var bool
     */
    protected $_isFixed = true;

    /**
     * @param ScopeConfigInterface $scopeConfig
     * @param ErrorFactory $rateErrorFactory
     * @param LoggerInterface $logger
     * @param ResultFactory $rateResultFactory
     * @param MethodFactory $rateMethodFactory
     * @param Config $config
     * @param array<string, mixed> $data
     */
    public function __construct(
        ScopeConfigInterface $scopeConfig,
        ErrorFactory $rateErrorFactory,
        LoggerInterface $logger,
        private readonly ResultFactory $rateResultFactory,
        private readonly MethodFactory $rateMethodFactory,
        private readonly Config $config,
        array $data = []
    ) {
        parent::__construct($scopeConfig, $rateErrorFactory, $logger, $data);
    }

    /**
     * The locker rate, false while the carrier or the module is off.
     *
     * @param RateRequest $request
     * @return Result|bool
     */
    public function collectRates(RateRequest $request)
    {
        if (!$this->config->isEnabled($request->getStoreId()) || !$this->getConfigFlag('active')) {
            return false;
        }

        /** @var Result $result */
        $result = $this->rateResultFactory->create();
        $price = (float) $this->getConfigData('price');
        $method = $this->rateMethodFactory->create();
        $method->setData('carrier', self::CODE);
        $method->setData('carrier_title', (string) $this->getConfigData('title'));
        $method->setData('method', self::METHOD);
        $method->setData('method_title', (string) $this->getConfigData('name'));
        $method->setPrice($price);
        $method->setData('cost', $price);
        $result->append($method);

        return $result;
    }

    /**
     * @inheritDoc
     */
    public function getAllowedMethods()
    {
        return [self::METHOD => (string) $this->getConfigData('name')];
    }
}
