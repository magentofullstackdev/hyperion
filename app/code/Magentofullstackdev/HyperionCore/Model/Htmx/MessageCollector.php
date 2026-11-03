<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Model\Htmx;

use Magento\Framework\Escaper;
use Magento\Framework\Message\ManagerInterface as MessageManagerInterface;
use Magento\Framework\Message\MessageInterface;
use Magento\Framework\View\Element\Message\InterpretationStrategyInterface;
use Psr\Log\LoggerInterface;

/**
 * Drains Magento's message manager into a single HTML string for an HTMX
 * fragment response.
 *
 * Two things the naive `getText()` loop used to get wrong:
 *
 *   1. Complex messages (`addComplexSuccessMessage('addCartSuccessMessage'
 *      | 'addCompareSuccessMessage' | 'addProductSuccessMessage' | ...)`)
 *      carry an empty text and only produce output through the renderer
 *      configured in each module's frontend di.xml. Running them through
 *      the same InterpretationStrategy the core messages block uses gives
 *      the exact wording (and links) Luma would show, already escaped.
 *
 *   2. Magento reports "You need to choose options for your item." and the
 *      other cart validation failures as NOTICE messages, not errors. For
 *      a toast they are failures all the same, so anything that is not a
 *      success counts as an error here.
 */
class MessageCollector
{
    private const FAILURE_TYPES = [
        MessageInterface::TYPE_ERROR,
        MessageInterface::TYPE_WARNING,
        MessageInterface::TYPE_NOTICE,
    ];

    public function __construct(
        private readonly MessageManagerInterface $messageManager,
        private readonly InterpretationStrategyInterface $interpretationStrategy,
        private readonly Escaper $escaper,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Pull and clear every queued message.
     *
     * @return array{html: string, has_error: bool} `html` is safe to print
     *         unescaped (each message is escaped by its renderer).
     */
    public function collect(): array
    {
        $parts = [];
        $hasError = false;

        foreach ($this->messageManager->getMessages(true)->getItems() as $message) {
            if (in_array($message->getType(), self::FAILURE_TYPES, true)) {
                $hasError = true;
            }

            $html = trim($this->interpret($message));
            if ($html !== '') {
                $parts[] = $html;
            }
        }

        return ['html' => implode(' ', $parts), 'has_error' => $hasError];
    }

    private function interpret(MessageInterface $message): string
    {
        try {
            return (string) $this->interpretationStrategy->interpret($message);
        } catch (\Throwable $e) {
            $this->logger->warning(
                'Hyperion MessageCollector: could not interpret message "' . $message->getIdentifier()
                . '" -- ' . $e->getMessage()
            );
            return $this->escaper->escapeHtml((string) $message->getText());
        }
    }
}
