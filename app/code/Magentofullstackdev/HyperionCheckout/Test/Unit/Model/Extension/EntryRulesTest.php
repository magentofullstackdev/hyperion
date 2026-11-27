<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Extension;

use Magento\Framework\App\CacheInterface;
use Magento\Framework\ObjectManagerInterface;
use Magento\Framework\View\Asset\Repository as AssetRepository;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCheckout\Model\Extension\EntryRules;
use Magentofullstackdev\HyperionCheckout\Model\Extension\InvalidEntryException;
use Magentofullstackdev\HyperionCheckout\Model\Payment\LogOnce;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionCheckout\Model\Extension\EntryRules
 */
class EntryRulesTest extends TestCase
{
    /** @var string[] */
    private array $logged = [];

    private function rules(): EntryRules
    {
        $logger = $this->createStub(LoggerInterface::class);
        $logger->method('log')->willReturnCallback(function ($level, $message): void {
            $this->logged[] = $level . ': ' . $message;
        });
        $cache = $this->createStub(CacheInterface::class);
        $cache->method('load')->willReturn(false);
        return new EntryRules(
            $this->createStub(ObjectManagerInterface::class),
            $this->createStub(AssetRepository::class),
            $this->createStub(StoreManagerInterface::class),
            new LogOnce($logger, $cache)
        );
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function patternsBothEnginesRead(): array
    {
        return [
            'alternation' => ['^(checkmo|banktransfer|cashondelivery|free)$'],
            'class and quantifier' => ['[A-Z0-9]{7}'],
            'lazy quantifier' => ['a+?b'],
            'class holding quantifier characters' => ['[*+?]+'],
            'escaped plus twice' => ['\\+\\+'],
            'escaped backslash before a letter' => ['a\\\\Ab'],
            'lookahead and lookbehind' => ['(?=a)a(?<!b)'],
            'named group' => ['(?<code>[0-9]+)\\k<code>'],
            'hex escape' => ['\\x41'],
            'escaped backslash before x and a quantifier' => ['\\\\x{2}'],
            'branch reset look-alike in a class' => ['[(?|]+'],
            'word boundary and digits' => ['\\bIT\\d{11}\\b'],
        ];
    }

    #[DataProvider('patternsBothEnginesRead')]
    public function testAPatternBothEnginesReadIsValid(string $pattern): void
    {
        self::assertNull(EntryRules::jsIncompatibility($pattern));
        self::assertTrue($this->rules()->isValidPattern($pattern));
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function patternsOnlyPcreReads(): array
    {
        return [
            'possessive quantifier' => ['^[A-Z]++$', 'a possessive quantifier'],
            'possessive optional' => ['a?+', 'a possessive quantifier'],
            'possessive counted' => ['a{2}+', 'a possessive quantifier'],
            'atomic group' => ['(?>ab|a)c', 'an atomic group'],
            'start of subject' => ['\\Aabc', 'the escape \\A'],
            'end of subject' => ['abc\\z', 'the escape \\z'],
            'end before a final new line' => ['abc\\Z', 'the escape \\Z'],
            'inline flag' => ['(?i)abc', 'inline flags'],
            'inline flag group' => ['(?i:abc)', 'inline flags'],
            'python named group' => ['(?P<n>a)', 'a (?P...) named group'],
            'quoted named group' => ["(?'n'a)", "a (?'name') group"],
            'recursion' => ['a(?R)?b', 'a recursion or subroutine call'],
            'subroutine' => ['(a)(?1)', 'a recursion or subroutine call'],
            'conditional' => ['(a)?(?(1)b|c)', 'a conditional group'],
            'horizontal space' => ['a\\hb', 'the escape \\h'],
            'reset match start' => ['a\\Kb', 'the escape \\K'],
            'unicode property' => ['\\p{L}+', 'the escape \\p'],
            'posix class' => ['[[:alpha:]]+', 'a POSIX character class'],
            'comma quantifier' => ['a{,3}', 'a {,n} quantifier'],
            'control verb' => ['(*UTF)abc', 'a backtracking control verb or an alpha assertion'],
            'lower case alpha assertion' => ['(*pla:a)a', 'a backtracking control verb or an alpha assertion'],
            'branch reset group' => ['(?|(a)|(b))', 'a branch reset group'],
            'non-atomic lookahead' => ['(?*a)a', 'a non-atomic lookaround'],
            'braced hex escape' => ['\\x{41}', 'the escape \\x{...}'],
            'vertical space' => ['a\\vb', 'the escape \\v'],
            'not vertical space' => ['a\\Vb', 'the escape \\V'],
        ];
    }

    #[DataProvider('patternsOnlyPcreReads')]
    public function testAPatternOnlyPcreReadsIsRefused(string $pattern, string $reason): void
    {
        self::assertSame($reason, EntryRules::jsIncompatibility($pattern));
        self::assertFalse($this->rules()->isValidPattern($pattern));
    }

    /**
     * @return array<string, array{0: mixed, 1: bool}>
     */
    public static function booleanItems(): array
    {
        return [
            'boolean true' => [true, true],
            'boolean false' => [false, false],
            'string true' => ['true', true],
            'string one' => ['1', true],
            'integer one' => [1, true],
            'string false' => ['false', false],
            'string zero' => ['0', false],
            'string no' => ['no', false],
            'empty string' => ['', false],
            'anything else' => ['maybe', false],
            'null' => [null, false],
            'array' => [['true'], false],
        ];
    }

    #[DataProvider('booleanItems')]
    public function testABooleanItemIsReadTheSameWayEverywhere(mixed $value, bool $expected): void
    {
        self::assertSame($expected, EntryRules::isTrue($value));
    }

    /**
     * Every pattern the first-party entries and the sample modules declare
     * stays valid: the deny list must not narrow what they use.
     */
    public function testThePatternsOfTheShippedDiFilesAreAccepted(): void
    {
        $module = dirname(__DIR__, 4);
        $files = array_merge(glob($module . '/etc/di.xml') ?: [], glob($module . '/etc/*/di.xml') ?: []);
        $samples = dirname($module, 4) . '/dev/modules/Magentofullstackdev';
        if (is_dir($samples)) {
            $files = array_merge($files, glob($samples . '/*/etc/di.xml') ?: [], glob($samples . '/*/etc/*/di.xml') ?: []);
        }
        $rules = $this->rules();
        $checked = 0;
        foreach ($files as $file) {
            $xml = simplexml_load_file($file);
            self::assertNotFalse($xml, $file);
            foreach ($xml->xpath('//item[@name="pattern"]') ?: [] as $item) {
                self::assertTrue($rules->isValidPattern((string) $item), $file . ': ' . $item);
                $checked++;
            }
            foreach ($xml->xpath('//item[@name="match"]/item') ?: [] as $item) {
                $rule = (string) $item;
                if (strlen($rule) > 2 && $rule[0] === '/' && str_ends_with($rule, '/')) {
                    self::assertTrue($rules->isValidPattern(substr($rule, 1, -1)), $file . ': ' . $rule);
                    $checked++;
                }
            }
        }
        self::assertGreaterThan(0, $checked);
    }

    public function testAPatternThatDoesNotCompileIsRefused(): void
    {
        self::assertFalse($this->rules()->isValidPattern('^(vendor'));
        self::assertFalse($this->rules()->isValidPattern(''));
    }

    /**
     * @return array<string, array{0: string, 1: string, 2: bool}>
     */
    public static function wholeValues(): array
    {
        return [
            'a prefix does not match the whole code' => ['psp_', 'psp_card', false],
            'an expression for the whole code' => ['psp_.*', 'psp_card', true],
            'anchors written by the author still work' => ['^psp_card$', 'psp_card', true],
            'alternation is grouped before the anchors' => ['a|psp_card', 'psp_card', true],
            'no match before a final new line' => ['abc', "abc\n", false],
            'a pattern that does not compile' => ['(', 'x', false],
        ];
    }

    #[DataProvider('wholeValues')]
    public function testAPatternMatchesTheWholeValue(string $pattern, string $value, bool $matches): void
    {
        self::assertSame($matches, EntryRules::matchesWhole($pattern, $value));
    }

    /**
     * @return array<string, array{0: mixed, 1: string|null}>
     */
    public static function apiVersions(): array
    {
        return [
            'default' => [null, '1'],
            'major' => ['1', '1'],
            'integer' => [1, '1'],
            'minor' => ['1.2', '1.2'],
            'pre-release' => ['1-beta', '1-beta'],
            'the version the checkout announces' => ['1.0-beta', '1.0-beta'],
            'another major' => ['2', null],
            'another major with a minor' => ['2.0', null],
            'not a version' => ['beta', null],
        ];
    }

    #[DataProvider('apiVersions')]
    public function testOnlyMajorOneIsSupported(mixed $version, ?string $expected): void
    {
        $item = $version === null ? [] : ['api_version' => $version];
        if ($expected === null) {
            $this->expectException(InvalidEntryException::class);
        }

        self::assertSame($expected, $this->rules()->apiVersion($item));
    }

    public function testInternalIsHonoredForAHyperionModuleOrAFirstPartyBuiltinOnly(): void
    {
        $rules = $this->rules();
        $pool = EntryRules::POOL_CHECKOUT;

        self::assertTrue($rules->internal($pool, 'a', ['internal' => true], 'Magentofullstackdev_HyperionCheckout::js/a.js'));
        self::assertTrue($rules->internal($pool, 'b', ['internal' => true, 'builtin' => 'order-comment'], ''));
        self::assertFalse($rules->internal($pool, 'c', ['internal' => true, 'builtin' => 'vendor-chunk'], ''));
        self::assertFalse($rules->internal($pool, 'd', ['internal' => true], ''));
        self::assertFalse($rules->internal($pool, 'e', ['internal' => false, 'builtin' => 'order-comment'], ''));
        self::assertCount(0, $this->logged);

        self::assertFalse($rules->internal($pool, 'f', ['internal' => true], 'Vendor_Module::js/a.js'));
        self::assertCount(1, $this->logged);
        self::assertStringStartsWith('error: ', $this->logged[0]);
    }

    public function testAnUnknownKeyIsLoggedOnceAsANotice(): void
    {
        $rules = $this->rules();
        $rules->ignoreUnknownKeys(EntryRules::POOL_SHIPPING, 'lockers', ['tag' => 'x', 'kit_mode' => 1], ['tag']);
        $rules->ignoreUnknownKeys(EntryRules::POOL_SHIPPING, 'lockers', ['tag' => 'x', 'kit_mode' => 1], ['tag']);

        self::assertSame(
            ['notice: Hyperion checkout: shipping extension "lockers": the key "kit_mode" is not known and is ignored.'],
            $this->logged
        );
    }

    /**
     * The `builtin` lists equal the ids the checkout bundle registers. Runs
     * where the repository sources are present next to the module.
     */
    public function testTheBuiltinListsMatchTheBundleRegistrations(): void
    {
        $root = dirname(__DIR__, 8) . '/frontend/packages/module-checkout/src/components';
        $files = [
            EntryRules::POOL_PAYMENT => $root . '/payment-host/mount.ts',
            EntryRules::POOL_CHECKOUT => $root . '/extensions/builtins.ts',
        ];
        foreach ($files as $file) {
            if (!is_file($file)) {
                self::markTestSkipped('The checkout bundle sources are not next to the module.');
            }
        }
        // phpcs:ignore Magento2.Functions.DiscouragedFunction
        $mount = (string) file_get_contents($files[EntryRules::POOL_PAYMENT]);
        preg_match_all("/registerBuiltinModule\\('([a-z][a-z0-9-]*)'/", $mount, $payment);
        // phpcs:ignore Magento2.Functions.DiscouragedFunction
        $builtins = (string) file_get_contents($files[EntryRules::POOL_CHECKOUT]);
        preg_match_all("/_BUILTIN = '([a-z][a-z0-9-]*)'/", $builtins, $checkout);

        self::assertEqualsCanonicalizing($payment[1], EntryRules::BUILTINS[EntryRules::POOL_PAYMENT]);
        self::assertEqualsCanonicalizing($checkout[1], EntryRules::BUILTINS[EntryRules::POOL_CHECKOUT]);
    }
}
