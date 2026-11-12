<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Model;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\State;
use Magento\Framework\View\Asset\Minification;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The `dev/js/minify_exclude` and `dev/css/minify_exclude` defaults of the module's
 * `etc/config.xml`, evaluated by core's own `Minification` class with minification on
 * in production mode: the Vite build output keeps its file names, everything else
 * still gets the ".min" sign.
 */
class MinifyExcludeTest extends TestCase
{
    private const CONFIG = __DIR__ . '/../../../etc/config.xml';
    private const THEME = 'frontend/Magentofullstackdev/hyperion/en_US/';
    private const CHECKOUT = self::THEME . 'Magentofullstackdev_HyperionCheckout/';

    private Minification $minification;

    protected function setUp(): void
    {
        $excludes = $this->readExcludes();
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('isSetFlag')->willReturn(true);
        $scopeConfig->method('getValue')->willReturnCallback(
            static fn (string $path) => match ($path) {
                'dev/js/minify_exclude' => $excludes['js'],
                'dev/css/minify_exclude' => $excludes['css'],
                default => null,
            }
        );
        $appState = $this->createStub(State::class);
        $appState->method('getMode')->willReturn(State::MODE_PRODUCTION);

        $this->minification = new Minification($scopeConfig, $appState);
    }

    public function testBothContentTypesShipOneExclude(): void
    {
        $excludes = $this->readExcludes();

        self::assertSame(['hyperion_build'], array_keys($excludes['js']));
        self::assertSame(['hyperion_build'], array_keys($excludes['css']));
    }

    #[DataProvider('buildOutput')]
    public function testBuildOutputKeepsItsFileName(string $path): void
    {
        self::assertTrue($this->minification->isExcluded($path));
        self::assertSame($path, $this->minification->addMinifiedSign($path));
    }

    /**
     * @return array<string, array{string}>
     */
    public static function buildOutput(): array
    {
        return [
            'theme entry script' => [self::THEME . 'assets/entry.DhvISVE-.js'],
            'theme entry stylesheet' => [self::THEME . 'assets/entry.CsVR0ppx.css'],
            'theme component chunk with hyphens in the hash' => [self::THEME . 'assets/hyperion-mini-cart.B-K3I-2j.js'],
            'theme chunk with a dotted name' => [self::THEME . 'assets/photoswipe-lightbox.esm.4VpeJUsy.js'],
            'htmx copy' => [self::THEME . 'assets/htmx.BniQBwbO.js'],
            'critical stylesheet' => [self::THEME . 'assets/critical-cms.DObtGpNS.css'],
            'theme assets of another locale' => ['frontend/Magentofullstackdev/hyperion/it_IT/assets/entry.DhvISVE-.js'],
            'child theme chunk' => ['frontend/Acme/storefront/en_US/assets/acme-banner.Ab3_xY-9.js'],
            'child theme chunk stylesheet' => ['frontend/Acme/storefront/en_US/assets/acme-banner.Ab3_xY-9.css'],
            'checkout entry script' => [self::CHECKOUT . 'assets/checkout-LkzN5NMc.js'],
            'checkout stylesheet' => [self::CHECKOUT . 'assets/checkout-BbXIsIxw.css'],
            'checkout chunk with an underscore and a hyphen in the hash' => [
                self::CHECKOUT . 'assets/payment-braintree-paypal-14d_-E8D.js',
            ],
            'checkout chunk whose hash ends with an underscore' => [
                self::CHECKOUT . 'assets/hosted-field-styles-DXtnWLJ_.js',
            ],
            'checkout module published under another theme' => [
                'frontend/Magento/luma/en_US/Magentofullstackdev_HyperionCheckout/assets/checkout-LkzN5NMc.js',
            ],
            'file id relative to the module, as the static content deploy names it' => [
                'Magentofullstackdev_HyperionCheckout/assets/checkout-app-DZpJlxgH.js',
            ],
        ];
    }

    #[DataProvider('otherFiles')]
    public function testOtherFilesAreStillMinified(string $path, string $minified): void
    {
        self::assertFalse($this->minification->isExcluded($path));
        self::assertSame($minified, $this->minification->addMinifiedSign($path));
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function otherFiles(): array
    {
        return [
            'core script' => [
                'frontend/Magento/luma/en_US/mage/cookies.js',
                'frontend/Magento/luma/en_US/mage/cookies.min.js',
            ],
            'core stylesheet' => [
                'frontend/Magento/luma/en_US/css/styles-m.css',
                'frontend/Magento/luma/en_US/css/styles-m.min.css',
            ],
            'email stylesheet of the theme' => [self::THEME . 'css/email.css', self::THEME . 'css/email.min.css'],
            'admin script of a module' => [
                'adminhtml/Magento/backend/en_US/Magentofullstackdev_HyperionMegaMenu/js/builder.js',
                'adminhtml/Magento/backend/en_US/Magentofullstackdev_HyperionMegaMenu/js/builder.min.js',
            ],
            'script without a hash in an assets directory' => [
                'frontend/Acme/storefront/en_US/assets/entry.js',
                'frontend/Acme/storefront/en_US/assets/entry.min.js',
            ],
            'hashed script outside an assets directory' => [
                'frontend/Acme/storefront/en_US/js/widget.Ab3_xY-9.js',
                'frontend/Acme/storefront/en_US/js/widget.Ab3_xY-9.min.js',
            ],
            'hashed script in a sub directory of assets' => [
                'frontend/Acme/storefront/en_US/assets/vendor/widget.Ab3_xY-9.js',
                'frontend/Acme/storefront/en_US/assets/vendor/widget.Ab3_xY-9.min.js',
            ],
        ];
    }

    #[DataProvider('filesMinificationNeverTouches')]
    public function testFilesOfOtherTypesAreNotMatched(string $path): void
    {
        self::assertFalse($this->minification->isExcluded($path));
        foreach ($this->readExcludes() as $patterns) {
            foreach ($patterns as $pattern) {
                self::assertSame(0, preg_match('/' . str_replace('/', '\/', $pattern) . '/', $path));
            }
        }
    }

    /**
     * @return array<string, array{string}>
     */
    public static function filesMinificationNeverTouches(): array
    {
        return [
            'image in an assets directory' => [self::THEME . 'assets/logo.svg'],
            'source map of a theme chunk' => [self::THEME . 'assets/entry.DhvISVE-.js.map'],
            'source map of a checkout chunk' => [self::CHECKOUT . 'assets/checkout-LkzN5NMc.js.map'],
            'build manifest' => [self::THEME . 'manifest.json'],
        ];
    }

    /**
     * @return array{js: array<string, string>, css: array<string, string>}
     */
    private function readExcludes(): array
    {
        $config = simplexml_load_file(self::CONFIG);
        self::assertNotFalse($config, 'etc/config.xml is readable');

        $excludes = [];
        foreach (['js', 'css'] as $type) {
            $excludes[$type] = [];
            foreach ($config->default->dev->{$type}->minify_exclude->children() as $name => $value) {
                $excludes[$type][(string) $name] = (string) $value;
            }
        }

        return $excludes;
    }
}
