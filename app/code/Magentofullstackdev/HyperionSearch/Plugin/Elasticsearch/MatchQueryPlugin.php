<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\Plugin\Elasticsearch;

use Magento\Elasticsearch\Model\Adapter\FieldMapper\Product\AttributeProvider;
use Magento\Elasticsearch\Model\Adapter\FieldMapper\Product\FieldProvider\FieldType\ConverterInterface;
use Magento\Elasticsearch\Model\Adapter\FieldMapper\Product\FieldProvider\FieldType\ResolverInterface as TypeResolver;
use Magento\Elasticsearch\SearchAdapter\Query\Builder\MatchQuery;
use Magento\Framework\Search\Request\Query\MatchQuery as RequestMatchQuery;
use Magento\Framework\Search\Request\QueryInterface as RequestQueryInterface;
use Magentofullstackdev\HyperionSearch\Model\Config;
use Psr\Log\LoggerInterface;

/**
 * Typo tolerance and SKU weight on the clauses the engine's match query
 * builder emits (one `match` / `match_phrase_prefix` per searchable field).
 *
 * The builder appends its clauses to the `bool` conditions it receives, so
 * the new clauses are the ones past the length of the input array: only
 * those are touched. `fuzziness` goes on the `match` clauses of text fields
 * (the engine rejects it on dates and numbers, phrase queries ignore it)
 * when the query is long enough; the SKU field's boost is multiplied by the
 * configured weight whatever the clause type.
 */
class MatchQueryPlugin
{
    private const SKU_FIELD = 'sku';
    private const FUZZY_CLAUSE = 'match';

    public function __construct(
        private readonly Config $config,
        private readonly AttributeProvider $attributeProvider,
        private readonly TypeResolver $fieldTypeResolver,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @param MatchQuery $subject
     * @param array<string, mixed> $result the select query with the new clauses
     * @param array<string, mixed> $selectQuery the select query the builder received
     * @param RequestQueryInterface $requestQuery
     * @param string $conditionType
     * @return array<string, mixed>
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function afterBuild(
        MatchQuery $subject,
        array $result,
        array $selectQuery,
        RequestQueryInterface $requestQuery,
        $conditionType
    ): array {
        try {
            $value = $requestQuery instanceof RequestMatchQuery ? (string) $requestQuery->getValue() : '';
            $fuzziness = $this->fuzzinessFor($value);
            $skuBoost = $this->config->getSkuBoost();
            if ($fuzziness === null && $skuBoost === 1.0) {
                return $result;
            }
            foreach ($result['bool'] ?? [] as $condition => $clauses) {
                if (!is_array($clauses)) {
                    continue;
                }
                $first = count($selectQuery['bool'][$condition] ?? []);
                for ($i = $first, $n = count($clauses); $i < $n; $i++) {
                    $result['bool'][$condition][$i] = $this->decorate($clauses[$i], $fuzziness, $skuBoost);
                }
            }
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion search: match query decoration skipped: ' . $e->getMessage());
        }

        return $result;
    }

    /**
     * @param mixed $clause `[type => [field => params]]`
     * @return mixed
     */
    private function decorate(mixed $clause, ?string $fuzziness, float $skuBoost): mixed
    {
        if (!is_array($clause)) {
            return $clause;
        }
        foreach ($clause as $type => $fields) {
            if (!is_array($fields)) {
                continue;
            }
            foreach ($fields as $field => $params) {
                if (!is_array($params)) {
                    continue;
                }
                if ((string) $field === self::SKU_FIELD && $skuBoost !== 1.0) {
                    $params['boost'] = round((float) ($params['boost'] ?? 1) * $skuBoost, 4);
                }
                if ($fuzziness !== null && $type === self::FUZZY_CLAUSE && $this->isTextField((string) $field)) {
                    $params['fuzziness'] = $fuzziness;
                    $params['prefix_length'] = 1;
                }
                $clause[$type][$field] = $params;
            }
        }

        return $clause;
    }

    private function fuzzinessFor(string $value): ?string
    {
        $fuzziness = $this->config->getFuzziness();
        if ($fuzziness === null) {
            return null;
        }
        // A quoted phrase is an exact match by intent.
        $value = trim($value);
        if ($value === '' || ($value[0] === '"' && str_ends_with($value, '"'))) {
            return null;
        }

        return mb_strlen($value) >= $this->config->getFuzzyMinQueryLength() ? $fuzziness : null;
    }

    private function isTextField(string $field): bool
    {
        if ($field === self::SKU_FIELD) {
            return false;
        }
        try {
            $type = $this->fieldTypeResolver->getFieldType($this->attributeProvider->getByAttributeCode($field));
        } catch (\Throwable $e) {
            return false;
        }

        return $type === null || $type === ConverterInterface::INTERNAL_DATA_TYPE_STRING;
    }
}
