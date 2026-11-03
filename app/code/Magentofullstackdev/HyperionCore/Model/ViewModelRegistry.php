<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Model;

use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\ObjectManagerInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Psr\Log\LoggerInterface;

/**
 * Registry that resolves ViewModel instances on demand inside templates.
 *
 * A plugin on Magento's PHP template engine injects this as `$viewModels` into
 * every template. Templates then request the ViewModels they need without
 * those classes having to be wired via layout XML arguments:
 *
 *     $state = $viewModels->require(\Magentofullstackdev\HyperionCore\ViewModel\Checkout\State::class);
 *
 * This is the Hyvä pattern, adopted verbatim so the "one ViewModel per concern"
 * discipline works end-to-end without bloating layout XML.
 */
class ViewModelRegistry
{
    public function __construct(
        private readonly ObjectManagerInterface $objectManager,
        private readonly ModuleManager $moduleManager,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Fetch a ViewModel by its fully qualified class name.
     *
     * @template T of ArgumentInterface
     * @param class-string<T> $viewModelClass
     * @return T
     * @throws \RuntimeException if the class does not implement ArgumentInterface
     */
    public function require(string $viewModelClass): ArgumentInterface
    {
        $instance = $this->objectManager->get($viewModelClass);
        if (!$instance instanceof ArgumentInterface) {
            throw new \RuntimeException(sprintf(
                'ViewModel class "%s" must implement %s.',
                $viewModelClass,
                ArgumentInterface::class
            ));
        }
        return $instance;
    }

    /**
     * Like require(), but for view models of optional modules: a template
     * must degrade without them, e.g. HyperionImage's ImageConfig.
     *
     * Returns null silently when the module that owns the class (derived from
     * its namespace, `Vendor\Module\...` -> `Vendor_Module`) is not installed
     * or not enabled: that is the expected absence. Every other reason for a
     * null is a defect and is logged: the module is enabled but the class
     * does not exist, the object manager cannot build it, or the class is not
     * a view model.
     *
     * @template T of ArgumentInterface
     * @param class-string<T> $viewModelClass
     * @return T|null
     */
    public function optional(string $viewModelClass): ?ArgumentInterface
    {
        $module = $this->moduleNameOf($viewModelClass);
        $moduleEnabled = $module === null || $this->moduleManager->isEnabled($module);

        if (!class_exists($viewModelClass)) {
            if ($moduleEnabled && $module !== null) {
                $this->logger->error(sprintf(
                    'Hyperion ViewModelRegistry: module %s is enabled but view model "%s" does not exist.',
                    $module,
                    $viewModelClass
                ));
            }
            return null;
        }
        if (!$moduleEnabled) {
            return null;
        }

        try {
            $instance = $this->objectManager->get($viewModelClass);
        } catch (\Throwable $e) {
            $this->logger->error(sprintf(
                'Hyperion ViewModelRegistry: optional view model "%s" could not be built: %s',
                $viewModelClass,
                $e->getMessage()
            ), ['exception' => $e]);
            return null;
        }
        if (!$instance instanceof ArgumentInterface) {
            $this->logger->error(sprintf(
                'Hyperion ViewModelRegistry: optional view model "%s" must implement %s.',
                $viewModelClass,
                ArgumentInterface::class
            ));
            return null;
        }
        return $instance;
    }

    /**
     * `Vendor\Module\Rest\OfClass` -> `Vendor_Module`; null when the class name
     * does not follow the module layout.
     */
    private function moduleNameOf(string $class): ?string
    {
        $parts = explode('\\', ltrim($class, '\\'));
        return count($parts) >= 3 ? $parts[0] . '_' . $parts[1] : null;
    }
}
