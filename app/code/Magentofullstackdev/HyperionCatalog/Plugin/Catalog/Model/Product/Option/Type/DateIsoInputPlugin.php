<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Plugin\Catalog\Model\Product\Option\Type;

use Magento\Catalog\Model\Product\Option\Type\Date;

/**
 * Lets the date / time custom options be posted from native
 * `<input type="date">` and `<input type="time">` fields.
 *
 * Core expects either a locale formatted `date` (JS calendar) or separate
 * day / month / year / hour / minute / day_part fields. The Hyperion PDP
 * posts ISO values (`date` = YYYY-MM-DD, `time` = HH:MM); this plugin
 * turns them into the `date_internal` value core already accepts in both
 * of its modes, so no JavaScript is needed to submit the form.
 */
class DateIsoInputPlugin
{
    /**
     * Normalise ISO date / time input of this option before core validates it.
     *
     * @param Date $subject
     * @param array $values
     * @return array
     */
    public function beforeValidateUserValue(Date $subject, $values): array
    {
        $optionId = $subject->getOption()->getId();
        $value = $values[$optionId] ?? null;
        if (!is_array($value) || !empty($value['date_internal'])) {
            return [$values];
        }

        $date = $this->parse('Y-m-d', (string) ($value['date'] ?? ''));
        $time = $this->parse('H:i', (string) ($value['time'] ?? ''));
        if ($date === null && $time === null) {
            return [$values];
        }

        $moment = ($date ?? new \DateTimeImmutable('today'))->setTime(
            $time ? (int) $time->format('G') : 0,
            $time ? (int) $time->format('i') : 0
        );
        if ($time !== null) {
            $value['hour'] = (int) $time->format('G');
            $value['minute'] = (int) $time->format('i');
        }
        $value['date_internal'] = $moment->format('Y-m-d H:i:s');
        unset($value['time']);
        $values[$optionId] = $value;

        return [$values];
    }

    /**
     * Strict parse, null when the input is empty or not in the format.
     *
     * @param string $format
     * @param string $input
     * @return \DateTimeImmutable|null
     */
    private function parse(string $format, string $input): ?\DateTimeImmutable
    {
        if ($input === '') {
            return null;
        }
        $parsed = \DateTimeImmutable::createFromFormat('!' . $format, $input);

        return $parsed && $parsed->format($format) === $input ? $parsed : null;
    }
}
