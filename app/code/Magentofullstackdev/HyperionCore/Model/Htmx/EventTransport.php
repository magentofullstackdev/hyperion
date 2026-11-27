<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Model\Htmx;

use Magento\Framework\DataObject;
use Psr\Log\LoggerInterface;

/**
 * The `transport` object of the Hyperion htmx events (`additional_html`) and
 * the reading of what observers left in it.
 *
 * @internal
 */
class EventTransport
{
    /**
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * A fresh transport, `additional_html` empty.
     *
     * @return DataObject
     */
    public function create(): DataObject
    {
        return new DataObject(['additional_html' => '']);
    }

    /**
     * The `additional_html` observers left, prefixed with a line break; empty
     * when there is none or it is not a string.
     *
     * @param DataObject $transport
     * @param string $eventName
     * @return string
     */
    public function additionalHtml(DataObject $transport, string $eventName): string
    {
        $additional = $transport->getData('additional_html');
        if ($additional === null || $additional === '') {
            return '';
        }
        if (!is_string($additional)) {
            $this->logger->warning(sprintf(
                'Hyperion: the additional_html of %s must be a string, %s ignored.',
                $eventName,
                get_debug_type($additional)
            ));
            return '';
        }

        return trim($additional) === '' ? '' : "\n" . $additional;
    }
}
