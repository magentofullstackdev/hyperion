<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Extension;

use Magentofullstackdev\HyperionCheckout\Model\Checkout\ExtensionPool as CheckoutExtensionPool;
use Magentofullstackdev\HyperionCheckout\Model\Payment\ExpressButtonPool;
use Magentofullstackdev\HyperionCheckout\Model\Payment\RendererPool;
use Magentofullstackdev\HyperionCheckout\Model\Shipping\ExtensionPool as ShippingExtensionPool;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The object manager binds an `<argument name="...">` of a `di.xml` to the
 * constructor parameter of the same name, and silently ignores an argument
 * no parameter has. The pools' argument names are public contract: every
 * documented name must be a constructor parameter, and every argument a
 * `di.xml` declares for a pool must name one.
 *
 * @coversNothing
 */
class PoolArgumentNamesTest extends TestCase
{
    /**
     * @return array<string, array{0: class-string, 1: string}>
     */
    public static function documentedArguments(): array
    {
        return [
            'payment renderers' => [RendererPool::class, 'renderers'],
            'express buttons' => [ExpressButtonPool::class, 'buttons'],
            'shipping extensions' => [ShippingExtensionPool::class, 'extensions'],
            'checkout extensions' => [CheckoutExtensionPool::class, 'extensions'],
            'address fields' => [CheckoutExtensionPool::class, 'address_fields'],
        ];
    }

    /**
     * @param class-string $class
     */
    #[DataProvider('documentedArguments')]
    public function testADocumentedArgumentIsAConstructorParameter(string $class, string $argument): void
    {
        self::assertContains($argument, $this->parameters($class));
    }

    public function testEveryPoolArgumentDeclaredInADiFileNamesAConstructorParameter(): void
    {
        $pools = array_unique(array_column(self::documentedArguments(), 0));
        $files = $this->diFiles();
        self::assertNotEmpty($files);

        $checked = 0;
        foreach ($files as $file) {
            $xml = simplexml_load_file($file);
            self::assertNotFalse($xml, $file);
            foreach ($xml->xpath('/config/type') ?: [] as $type) {
                $class = ltrim((string) $type['name'], '\\');
                if (!in_array($class, $pools, true)) {
                    continue;
                }
                foreach ($type->xpath('arguments/argument') ?: [] as $argument) {
                    self::assertContains(
                        (string) $argument['name'],
                        $this->parameters($class),
                        sprintf('%s declares an argument %s has no parameter for', $file, $class)
                    );
                    $checked++;
                }
            }
        }
        self::assertGreaterThan(0, $checked, 'no pool argument found in the di.xml files');
    }

    /**
     * @param class-string $class
     * @return string[]
     */
    private function parameters(string $class): array
    {
        $constructor = (new \ReflectionClass($class))->getConstructor();
        self::assertNotNull($constructor);
        return array_map(static fn (\ReflectionParameter $p): string => $p->getName(), $constructor->getParameters());
    }

    /**
     * The `di.xml` files of this module and, where the repository sources are
     * present, of the sample modules.
     *
     * @return string[]
     */
    private function diFiles(): array
    {
        $module = dirname(__DIR__, 4);
        $files = array_merge(
            glob($module . '/etc/di.xml') ?: [],
            glob($module . '/etc/*/di.xml') ?: []
        );
        $samples = dirname($module, 4) . '/dev/modules/Magentofullstackdev';
        if (is_dir($samples)) {
            $files = array_merge(
                $files,
                glob($samples . '/*/etc/di.xml') ?: [],
                glob($samples . '/*/etc/*/di.xml') ?: []
            );
        }
        return $files;
    }
}
