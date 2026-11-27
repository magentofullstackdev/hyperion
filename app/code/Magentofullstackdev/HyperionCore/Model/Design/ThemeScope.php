<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Model\Design;

use Magento\Framework\App\Area;
use Magento\Framework\App\State as AppState;
use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\ObjectManager\ResetAfterRequestInterface;
use Magento\Framework\View\Design\ThemeInterface;
use Magento\Framework\View\DesignInterface;
use Psr\Log\LoggerInterface;

/**
 * Answers one question: does the current storefront render with the Hyperion
 * theme, or with a theme that inherits from it?
 *
 * Code that changes markup or behavior only for the Hyperion theme asks this
 * service instead of comparing theme codes on its own, so a store view on
 * Luma, Hyvä or any other theme of the same installation keeps core behavior.
 * Both questions answer true only in the frontend area (an email rendered for
 * a storefront runs in the emulated frontend area and counts):
 *
 * - `isHyperionActive()`: the design theme, or one of its parents, is listed
 *   in the `themes` argument (theme paths `Vendor/theme`, default
 *   `Magentofullstackdev/hyperion`). It decides whether the `$viewModels`
 *   template variable is the Hyperion registry
 *   (`Plugin\Framework\View\TemplateEngine\PhpPlugin`).
 * - `matchesCurrentTheme()`: the same check against a list the caller passes;
 *   the `themes` argument plays no part. The PageBuilder content type rewrite
 *   (`Magentofullstackdev\HyperionCms\PageBuilder\Filter\TemplateFilterPlugin`)
 *   passes its own `enabledThemes` argument.
 *
 * A theme that is not a child of Hyperion but reuses its templates is added
 * with one item in `etc/frontend/di.xml` to keep `$viewModels`:
 *
 *   <type name="Magentofullstackdev\HyperionCore\Model\Design\ThemeScope">
 *       <arguments><argument name="themes" xsi:type="array">
 *           <item name="vendor_theme" xsi:type="string">Vendor/theme</item>
 *       </argument></arguments>
 *   </type>
 *
 * and to the `enabledThemes` argument of TemplateFilterPlugin, in the same
 * scope, to keep the PageBuilder rewrite.
 *
 * The answer of `isHyperionActive()` is memoized per design theme, so asking
 * it once per template costs one array lookup.
 *
 * @api
 * @since 0.9.0
 */
class ThemeScope implements ResetAfterRequestInterface
{
    public const HYPERION_THEME = 'Magentofullstackdev/hyperion';

    /** @var array<string, bool> design theme key => answer of isHyperionActive() */
    private array $answers = [];

    /**
     * @param DesignInterface $design
     * @param AppState $appState
     * @param LoggerInterface $logger
     * @param array<string|int, string> $themes theme paths (`Vendor/theme`) that count as Hyperion
     */
    public function __construct(
        private readonly DesignInterface $design,
        private readonly AppState $appState,
        private readonly LoggerInterface $logger,
        private readonly array $themes = ['hyperion' => self::HYPERION_THEME]
    ) {
    }

    /**
     * True when the frontend design theme, or one of its parents, is a Hyperion theme.
     *
     * @return bool
     */
    public function isHyperionActive(): bool
    {
        $theme = $this->frontendTheme();
        if ($theme === null) {
            return false;
        }

        $key = $this->keyOf($theme);
        if (!array_key_exists($key, $this->answers)) {
            $this->answers[$key] = $this->inherits($theme, array_values($this->themes));
        }

        return $this->answers[$key];
    }

    /**
     * True when the frontend design theme, or one of its parents, is one of the given themes.
     *
     * For callers that keep a theme list of their own; not memoized.
     *
     * @param array<string|int, string> $themePaths theme paths (`Vendor/theme`)
     * @return bool
     */
    public function matchesCurrentTheme(array $themePaths): bool
    {
        $theme = $this->frontendTheme();

        return $theme !== null && $this->inherits($theme, array_values($themePaths));
    }

    /**
     * @inheritDoc
     */
    public function _resetState(): void
    {
        $this->answers = [];
    }

    /**
     * The design theme of a frontend request, null in any other area.
     *
     * @return ThemeInterface|null
     */
    private function frontendTheme(): ?ThemeInterface
    {
        try {
            if ($this->appState->getAreaCode() !== Area::AREA_FRONTEND) {
                return null;
            }
        } catch (LocalizedException $e) {
            // No area yet (an early bootstrap step): nothing renders a theme.
            return null;
        }

        try {
            return $this->design->getDesignTheme();
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion ThemeScope: the design theme could not be read: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * @param ThemeInterface $theme
     * @param string[] $themePaths
     * @return bool
     */
    private function inherits(ThemeInterface $theme, array $themePaths): bool
    {
        if ($themePaths === []) {
            return false;
        }
        try {
            foreach ($theme->getInheritedThemes() as $inherited) {
                if (in_array((string) $inherited->getThemePath(), $themePaths, true)) {
                    return true;
                }
            }
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion ThemeScope: the theme chain could not be read: ' . $e->getMessage());
        }

        return false;
    }

    /**
     * @param ThemeInterface $theme
     * @return string
     */
    private function keyOf(ThemeInterface $theme): string
    {
        return (string) $theme->getId() . '|' . (string) $theme->getFullPath();
    }
}
