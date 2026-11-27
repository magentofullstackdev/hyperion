<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit;

use PHPUnit\Framework\TestCase;

/**
 * The public PHP surface of the Hyperion modules: every listed type keeps the
 * `@api` tag in its class docblock and every listed method in its own, so the
 * surface cannot shrink by accident. Types and methods are read through
 * reflection; the file is never executed beyond loading the class.
 *
 * @coversNothing
 */
class ApiSurfaceTest extends TestCase
{
    private const API_TYPES = [
        \Magentofullstackdev\HyperionCore\Model\Purchase\RestrictionInterface::class,
        \Magentofullstackdev\HyperionCore\Model\Purchase\Availability::class,
        \Magentofullstackdev\HyperionCore\Model\Htmx\HeaderStatePool::class,
        \Magentofullstackdev\HyperionCore\Model\PublicRouteRegistry::class,
        \Magentofullstackdev\HyperionCore\Model\Security\RateLimiter::class,
        \Magentofullstackdev\HyperionCore\Model\CacheHeaders::class,
        \Magentofullstackdev\HyperionCore\Model\CacheHeadersInterface::class,
        \Magentofullstackdev\HyperionCore\Model\Htmx\MessageCollector::class,
        \Magentofullstackdev\HyperionCore\Model\Htmx\NotificationRenderer::class,
        \Magentofullstackdev\HyperionCore\Model\Htmx\NotificationRendererInterface::class,
        \Magentofullstackdev\HyperionCore\Model\Htmx\FragmentRenderer::class,
        \Magentofullstackdev\HyperionCore\Model\Htmx\FragmentRendererInterface::class,
        \Magentofullstackdev\HyperionCore\Model\Htmx\RequestContext::class,
        \Magentofullstackdev\HyperionCore\Model\Htmx\ActionResponse::class,
        \Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse::class,
        \Magentofullstackdev\HyperionCore\Model\Cache\ContainerIdentities::class,
        \Magentofullstackdev\HyperionCore\Model\Design\ThemeScope::class,
        \Magentofullstackdev\HyperionCore\Model\ViewModelRegistry::class,
        \Magentofullstackdev\HyperionCore\ViewModel\Purchase::class,
        \Magentofullstackdev\HyperionCore\ViewModel\TemplateLogger::class,
        \Magentofullstackdev\HyperionCore\Block\EsiFragment::class,
        \Magentofullstackdev\HyperionNavigation\Model\Menu\SourceInterface::class,
        \Magentofullstackdev\HyperionNavigation\Model\Menu\SourcePool::class,
        \Magentofullstackdev\HyperionCheckout\Model\Cart\TotalRowPool::class,
        \Magentofullstackdev\HyperionCheckout\Api\Cart\TotalRowRendererInterface::class,
    ];

    private const API_METHODS = [
        [\Magentofullstackdev\HyperionCore\Block\AssetManifest::class, 'getAssetUrl'],
        [\Magentofullstackdev\HyperionCore\Block\AssetManifest::class, 'getEntryCssUrls'],
        [\Magentofullstackdev\HyperionCore\Block\AssetManifest::class, 'getCriticalCss'],
        [\Magentofullstackdev\HyperionCore\Plugin\Framework\App\Action\RateLimitPlugin::class, '__construct'],
    ];

    /**
     * Concrete classes whose public contract is their interface.
     */
    private const PREFERRED_INTERFACES = [
        \Magentofullstackdev\HyperionCore\Model\Htmx\FragmentRenderer::class
            => \Magentofullstackdev\HyperionCore\Model\Htmx\FragmentRendererInterface::class,
        \Magentofullstackdev\HyperionCore\Model\Htmx\NotificationRenderer::class
            => \Magentofullstackdev\HyperionCore\Model\Htmx\NotificationRendererInterface::class,
        \Magentofullstackdev\HyperionCore\Model\CacheHeaders::class
            => \Magentofullstackdev\HyperionCore\Model\CacheHeadersInterface::class,
    ];

    public function testEveryPublicTypeCarriesTheApiTag(): void
    {
        $missing = [];
        foreach (self::API_TYPES as $type) {
            $doc = (string) (new \ReflectionClass($type))->getDocComment();
            if (!preg_match('/^\s*\*\s*@api\b/m', $doc)) {
                $missing[] = $type;
            }
        }

        self::assertSame([], $missing, 'Types without @api in their class docblock.');
    }

    public function testEveryPublicMethodCarriesTheApiTag(): void
    {
        $missing = [];
        foreach (self::API_METHODS as [$type, $method]) {
            $doc = (string) (new \ReflectionMethod($type, $method))->getDocComment();
            if (!preg_match('/^\s*\*\s*@api\b/m', $doc)) {
                $missing[] = $type . '::' . $method;
            }
        }

        self::assertSame([], $missing, 'Methods without @api in their docblock.');
    }

    public function testTheConcreteRenderersImplementTheirPublicInterface(): void
    {
        foreach (self::PREFERRED_INTERFACES as $class => $interface) {
            self::assertTrue(is_subclass_of($class, $interface), $class . ' must implement ' . $interface);
        }
    }

    public function testTheInterfacesArePreferredInTheGlobalDiConfiguration(): void
    {
        $xml = simplexml_load_file(dirname(__DIR__, 2) . '/etc/di.xml');
        self::assertNotFalse($xml);
        $preferences = [];
        foreach ($xml->preference as $preference) {
            $preferences[(string) $preference['for']] = (string) $preference['type'];
        }

        foreach (self::PREFERRED_INTERFACES as $class => $interface) {
            self::assertSame($class, $preferences[$interface] ?? null, 'No preference for ' . $interface);
        }
    }
}
