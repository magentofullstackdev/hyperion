<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSamplePsp\Model\Ui;

use Magento\Framework\Serialize\Serializer\Json;
use Magento\Vault\Api\Data\PaymentTokenInterface;
use Magento\Vault\Model\Ui\TokenUiComponentInterface;
use Magento\Vault\Model\Ui\TokenUiComponentInterfaceFactory;
use Magento\Vault\Model\Ui\TokenUiComponentProviderInterface;
use Magentofullstackdev\HyperionSamplePsp\Model\Config;
use Psr\Log\LoggerInterface;

/**
 * A stored sample card in checkoutConfig.payment.vault: the vault method
 * code, the public hash and the card details the row label is built from.
 * The component name is core's field; the Hyperion checkout ignores it.
 */
class TokenUiComponentProvider implements TokenUiComponentProviderInterface
{
    /**
     * @param TokenUiComponentInterfaceFactory $componentFactory
     * @param Json $json
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly TokenUiComponentInterfaceFactory $componentFactory,
        private readonly Json $json,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @inheritDoc
     */
    public function getComponentForToken(PaymentTokenInterface $paymentToken): TokenUiComponentInterface
    {
        $details = [];
        try {
            $decoded = $this->json->unserialize($paymentToken->getTokenDetails() ?: '{}');
            $details = is_array($decoded) ? $decoded : [];
        } catch (\InvalidArgumentException $e) {
            $this->logger->warning('Sample PSP: unreadable stored card details.', ['exception' => $e]);
        }

        return $this->componentFactory->create([
            'config' => [
                'code' => Config::CARD_VAULT,
                TokenUiComponentProviderInterface::COMPONENT_DETAILS => $details,
                TokenUiComponentProviderInterface::COMPONENT_PUBLIC_HASH => $paymentToken->getPublicHash(),
            ],
            'name' => 'sample-psp-card',
        ]);
    }
}
